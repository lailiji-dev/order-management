"""Shared food-factory API. Python 3.6+, SQLite, standard library only."""
import argparse
import copy
from contextlib import contextmanager
import datetime
import hashlib
import hmac
import json
import os
import re
import secrets
import sqlite3
import threading
import time
from http.cookies import SimpleCookie
from http.server import BaseHTTPRequestHandler, HTTPServer
from socketserver import ThreadingMixIn
from urllib.parse import urlsplit

PUBLIC_FIELDS = ('id', 'orderNo', 'legacyOrderNo', 'orderDate', 'status', 'cancelled',
                 'deposit', 'orderAmount', 'remainingAmount', 'note', 'customerName',
                 'phone', 'earlyPickup', 'createdAt', 'updatedAt', 'items')
COLLECTIONS = ('categories', 'products', 'orders')


def now():
    return datetime.datetime.now(datetime.timezone.utc).replace(microsecond=0).isoformat().replace('+00:00', 'Z')


def password_hash(password, salt=None):
    salt = salt or secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac('sha256', password.encode('utf-8'), bytes.fromhex(salt), 300000)
    return salt + ':' + digest.hex()


def password_ok(password, stored):
    return hmac.compare_digest(password_hash(password, stored.split(':')[0]), stored)


class ApiError(Exception):
    def __init__(self, status, message):
        self.status, self.message = status, message


def text(value, limit=200):
    if not isinstance(value, str) or len(value) > limit:
        raise ApiError(400, '文本格式或长度不正确')
    return value.strip()


def integer(value, minimum=0):
    if isinstance(value, bool) or not isinstance(value, int) or not minimum <= value <= 9007199254740991:
        raise ApiError(400, '数量或金额必须为有效整数')
    return value


def normalize_order(order, migrated=False, allow_overpayment=False):
    if not isinstance(order, dict):
        raise ApiError(400, '订单格式不正确')
    result = {k: copy.deepcopy(order[k]) for k in PUBLIC_FIELDS if k in order}
    result['id'] = text(order.get('id', ''), 100)
    if not result['id']:
        raise ApiError(400, '订单缺少标识')
    date = text(order.get('orderDate', ''), 10)
    try:
        if datetime.datetime.strptime(date, '%Y-%m-%d').strftime('%Y-%m-%d') != date:
            raise ValueError()
    except ValueError:
        raise ApiError(400, '订单日期不正确')
    result['orderDate'] = date
    result['customerName'] = text(order.get('customerName', ''), 100)
    result['phone'] = text(order.get('phone', ''), 40)
    result['note'] = text(order.get('note', ''), 4000)
    result['status'] = order.get('status', 'unpicked')
    if result['status'] not in ('picked', 'unpicked'):
        raise ApiError(400, '取货状态不正确')
    result['cancelled'] = bool(order.get('cancelled', False))
    result['earlyPickup'] = bool(order.get('earlyPickup', False))
    items = order.get('items')
    if not isinstance(items, list) or not 1 <= len(items) <= 500:
        raise ApiError(400, '请至少填写一种产品')
    clean_items, seen, total = [], set(), 0
    for item in items:
        if not isinstance(item, dict):
            raise ApiError(400, '产品明细格式不正确')
        pid = text(item.get('productId', ''), 100)
        if not pid or pid in seen:
            raise ApiError(400, '产品标识无效或重复')
        seen.add(pid)
        qty = integer(item.get('quantity'), 1)
        price = integer(item.get('unitPrice', 0))
        subtotal = integer(qty * price)
        total += subtotal
        clean_items.append({'productId': pid, 'productName': text(item.get('productName', '')),
                            'quantity': qty, 'unitPrice': price, 'subtotal': subtotal})
    result['items'] = clean_items
    result['orderAmount'] = integer(total)
    deposit = integer(order.get('deposit', 0))
    if migrated:
        deposit = ((deposit + 50) // 100) * 100
    if deposit % 100:
        raise ApiError(400, '定金只能填写整数元')
    if deposit > total and not migrated and not allow_overpayment:
        raise ApiError(400, '定金不能大于订单金额')
    result['deposit'] = deposit
    result['remainingAmount'] = total - deposit
    return result


class Store:
    def __init__(self, path, seed, admin_password=None):
        self.path = path
        self.seed = copy.deepcopy(seed)
        os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
        with self.connect() as db:
            db.executescript('''
                CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY, username TEXT UNIQUE NOT NULL,
                  display_name TEXT NOT NULL, password TEXT NOT NULL, role TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 1);
                CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY, user_id INTEGER NOT NULL,
                  csrf TEXT NOT NULL, expires REAL NOT NULL);
                CREATE TABLE IF NOT EXISTS app_state(id INTEGER PRIMARY KEY CHECK(id=1), body TEXT NOT NULL,
                  revision INTEGER NOT NULL DEFAULT 0, next_number INTEGER NOT NULL DEFAULT 1, initialized INTEGER NOT NULL DEFAULT 0);
                CREATE TABLE IF NOT EXISTS order_meta(order_id TEXT PRIMARY KEY, number INTEGER UNIQUE NOT NULL,
                  created_by INTEGER NOT NULL, imported INTEGER NOT NULL DEFAULT 0);
                CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL,
                  username TEXT NOT NULL, action TEXT NOT NULL, order_id TEXT, order_no TEXT, occurred_at TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS migrations(digest TEXT PRIMARY KEY, user_id INTEGER NOT NULL, occurred_at TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS login_attempts(identity TEXT PRIMARY KEY, attempts INTEGER NOT NULL, since REAL NOT NULL);
            ''')
            db.execute('INSERT OR IGNORE INTO app_state(id,body) VALUES(1,?)', (json.dumps(seed, ensure_ascii=False),))
            if not db.execute('SELECT 1 FROM users WHERE username=?', ('root',)).fetchone():
                if not admin_password:
                    raise RuntimeError('PEILIAO_ADMIN_PASSWORD is required for first initialization')
                db.execute('INSERT INTO users(username,display_name,password,role) VALUES(?,?,?,?)',
                           ('root', '管理员', password_hash(admin_password), 'admin'))
        os.chmod(path, 0o600)

    @contextmanager
    def connect(self):
        db = sqlite3.connect(self.path, timeout=20)
        db.row_factory = sqlite3.Row
        db.execute('PRAGMA journal_mode=WAL')
        try:
            yield db
            db.commit()
        except Exception:
            db.rollback()
            raise
        finally:
            db.close()

    @staticmethod
    def user_public(row):
        return {'id': row['id'], 'username': row['username'], 'displayName': row['display_name'],
                'role': row['role'], 'enabled': bool(row['enabled'])}

    def auth(self, token):
        with self.connect() as db:
            row = db.execute('''SELECT u.*,s.csrf FROM sessions s JOIN users u ON s.user_id=u.id
                              WHERE s.token=? AND s.expires>? AND u.enabled=1''', (token, time.time())).fetchone()
            if not row:
                raise ApiError(401, '请登录后使用')
            return dict(row)

    def login(self, username, password, identity):
        with self.connect() as db:
            attempt = db.execute('SELECT * FROM login_attempts WHERE identity=?', (identity,)).fetchone()
            if attempt and time.time() - attempt['since'] < 900 and attempt['attempts'] >= 15:
                raise ApiError(429, '尝试次数过多，请稍后再试')
            row = db.execute('SELECT * FROM users WHERE username=?', (username,)).fetchone()
            if not row or not row['enabled'] or not password_ok(password, row['password']):
                since = attempt['since'] if attempt and time.time() - attempt['since'] < 900 else time.time()
                count = attempt['attempts'] + 1 if attempt and since == attempt['since'] else 1
                db.execute('INSERT OR REPLACE INTO login_attempts VALUES(?,?,?)', (identity, count, since))
                # Commit the rate-limit record before raising.
                db.commit()
                raise ApiError(401, '账号或密码不正确')
            db.execute('DELETE FROM login_attempts WHERE identity=?', (identity,))
            db.execute('DELETE FROM sessions WHERE expires<=?', (time.time(),))
            token, csrf = secrets.token_urlsafe(32), secrets.token_urlsafe(24)
            db.execute('INSERT INTO sessions VALUES(?,?,?,?)', (token, row['id'], csrf, time.time() + 43200))
            return token, csrf, self.user_public(row)

    def read(self):
        with self.connect() as db:
            row = db.execute('SELECT * FROM app_state WHERE id=1').fetchone()
            return {'state': json.loads(row['body']), 'revision': row['revision'], 'initialized': bool(row['initialized'])}

    @staticmethod
    def audit(db, user, action, order=None):
        db.execute('INSERT INTO audit(user_id,username,action,order_id,order_no,occurred_at) VALUES(?,?,?,?,?,?)',
                   (user['id'], user['username'], action, order.get('id') if order else None,
                    order.get('orderNo') if order else None, now()))

    def sync(self, changes, user):
        if not isinstance(changes, list) or len(changes) > 1000:
            raise ApiError(400, '保存内容过多或格式不正确')
        with self.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            row = db.execute('SELECT * FROM app_state WHERE id=1').fetchone()
            state, sequence = json.loads(row['body']), row['next_number']
            seen = set()
            for change in changes:
                if not isinstance(change, dict): raise ApiError(400, '保存记录格式不正确')
                collection, eid = change.get('collection'), change.get('id')
                if collection not in COLLECTIONS or not isinstance(eid, str) or not eid or (collection, eid) in seen:
                    raise ApiError(400, '保存记录不正确或重复')
                seen.add((collection, eid))
                before, after = change.get('before'), change.get('after')
                records = state[collection]
                current = next((x for x in records if x['id'] == eid), None)
                if before != current:
                    # A replay after a dropped response must not create a second order.
                    if before is None and current is not None and after is not None:
                        clean_current = {k:v for k,v in current.items() if k not in ('orderNo','createdAt','updatedAt')}
                        candidate = normalize_order(after) if collection == 'orders' else after
                        clean_after = {k:v for k,v in candidate.items() if k not in ('orderNo','createdAt','updatedAt')}
                        if clean_current == clean_after:
                            continue
                    raise ApiError(409, '该记录已被另一台设备修改，请刷新后重新操作')
                if after is None:
                    if current:
                        records.remove(current)
                        if collection == 'orders': self.audit(db, user, '删除订单', current)
                    continue
                if not isinstance(after, dict) or after.get('id') != eid:
                    raise ApiError(400, '记录标识不匹配')
                after = copy.deepcopy(after)
                if collection == 'orders':
                    historical_rounding = bool(current and current['deposit'] > current['orderAmount']
                        and after.get('deposit') == current['deposit'])
                    after = normalize_order(after, allow_overpayment=historical_rounding)
                    if historical_rounding and after['deposit'] > after['orderAmount'] and after['orderAmount'] < current['orderAmount']:
                        raise ApiError(400, '减少订单金额时，请重新核对定金')
                    if current is None:
                        if db.execute('SELECT 1 FROM order_meta WHERE order_id=?', (eid,)).fetchone():
                            raise ApiError(409, '该订单已删除，请重新新增')
                        after['orderNo'] = str(sequence).zfill(6)
                        after['createdAt'] = now()
                        db.execute('INSERT INTO order_meta VALUES(?,?,?,0)', (eid, sequence, user['id']))
                        sequence += 1
                        self.audit(db, user, '新增订单', after)
                    else:
                        after['orderNo'] = current['orderNo']
                        after['createdAt'] = current.get('createdAt', now())
                        if current.get('legacyOrderNo'): after['legacyOrderNo'] = current['legacyOrderNo']
                        self.audit(db, user, '修改订单', after)
                    after['updatedAt'] = now()
                else:
                    self.validate_entity(collection, after)
                if current is not None: records.remove(current)
                records.append(after)
            revision = row['revision'] + (1 if changes else 0)
            db.execute('UPDATE app_state SET body=?,revision=?,next_number=?,initialized=1 WHERE id=1',
                       (json.dumps(state, ensure_ascii=False), revision, sequence))
            return {'state': state, 'revision': revision, 'initialized': True}

    @staticmethod
    def validate_entity(collection, item):
        text(item.get('id', ''), 100)
        text(item.get('name', ''), 200)
        if collection == 'products':
            integer(item.get('price', 0))
            if not isinstance(item.get('recipe', []), list) or len(item.get('recipe', [])) > 500:
                raise ApiError(400, '配方格式不正确')

    def migrate(self, incoming, user):
        if user['role'] != 'admin':
            raise ApiError(403, '旧设备数据请由管理员登录后合并')
        if not isinstance(incoming, dict) or not isinstance(incoming.get('orders', []), list):
            raise ApiError(400, '备份数据格式不正确')
        digest = hashlib.sha256(json.dumps(incoming, sort_keys=True, ensure_ascii=False).encode('utf-8')).hexdigest()
        with self.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            row = db.execute('SELECT * FROM app_state WHERE id=1').fetchone()
            state, sequence = json.loads(row['body']), row['next_number']
            if db.execute('SELECT 1 FROM migrations WHERE digest=?', (digest,)).fetchone():
                return {'state':state, 'revision':row['revision'], 'initialized':bool(row['initialized']), 'imported':0}
            for name in ('categories','products'):
                if name not in incoming: continue
                if not isinstance(incoming[name], list): raise ApiError(400, '产品数据格式不正确')
                for entity in incoming[name]: self.validate_entity(name, entity)
                # The original device may arrive after other employees first sign in.
                # An untouched seed catalogue can safely inherit its real prices/recipes.
                if not row['initialized'] or state[name] == self.seed.get(name, []):
                    state[name] = copy.deepcopy(incoming[name])
                else:
                    ids = {x['id'] for x in state[name]}
                    for entity in incoming[name]:
                        if entity['id'] not in ids:
                            state[name].append(copy.deepcopy(entity)); ids.add(entity['id'])
            if not row['initialized']:
                state['productionPlans'] = copy.deepcopy(incoming.get('productionPlans', {}))
            existing = {x['order_id'] for x in db.execute('SELECT order_id FROM order_meta')}
            imported = 0
            for order in sorted(incoming.get('orders', []), key=lambda o:(o.get('createdAt',''),o.get('id',''))):
                if order.get('id') in existing: continue
                clean = normalize_order(order, migrated=True)
                clean['legacyOrderNo'] = str(order.get('orderNo',''))
                clean['orderNo'] = str(sequence).zfill(6)
                clean.setdefault('createdAt', now()); clean['updatedAt'] = now()
                db.execute('INSERT INTO order_meta VALUES(?,?,?,1)', (clean['id'],sequence,user['id']))
                sequence += 1; imported += 1; existing.add(clean['id'])
                state['orders'].append(clean)
                self.audit(db,user,'合并历史订单',clean)
            revision = row['revision'] + 1
            db.execute('UPDATE app_state SET body=?,revision=?,next_number=?,initialized=1 WHERE id=1',
                       (json.dumps(state,ensure_ascii=False),revision,sequence))
            db.execute('INSERT INTO migrations VALUES(?,?,?)',(digest,user['id'],now()))
            return {'state':state,'revision':revision,'initialized':True,'imported':imported}


class Handler(BaseHTTPRequestHandler):
    server_version = 'FoodFactory'

    def log_message(self, fmt, *args):
        # Do not log passwords, request bodies, cookies or customer data.
        pass

    def reply(self, status, data, cookie=None):
        body = json.dumps(data, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type','application/json; charset=utf-8')
        self.send_header('Content-Length',str(len(body)))
        self.send_header('Cache-Control','no-store')
        self.send_header('X-Content-Type-Options','nosniff')
        if cookie: self.send_header('Set-Cookie',cookie)
        self.end_headers(); self.wfile.write(body)

    def body(self):
        try: length = int(self.headers.get('Content-Length','0'))
        except ValueError: raise ApiError(400,'请求长度不正确')
        if not 0 < length <= 4000000: raise ApiError(413,'请求内容过大或为空')
        if not self.headers.get('Content-Type','').startswith('application/json'):
            raise ApiError(415,'请使用 JSON 请求')
        try: data=json.loads(self.rfile.read(length).decode('utf-8'))
        except (ValueError,UnicodeError): raise ApiError(400,'请求数据不正确')
        if not isinstance(data,dict): raise ApiError(400,'请求数据不正确')
        return data

    def cookie(self):
        cookie=SimpleCookie()
        try: cookie.load(self.headers.get('Cookie',''))
        except Exception: return ''
        return cookie['peiliao_session'].value if 'peiliao_session' in cookie else ''

    def do_GET(self): self.dispatch('GET')
    def do_POST(self): self.dispatch('POST')

    def dispatch(self, method):
        try:
            store=self.server.store
            path=urlsplit(self.path).path
            origin=self.headers.get('Origin')
            if method=='POST' and origin and origin!=self.server.origin:
                raise ApiError(403,'请求来源不正确')
            if path=='/api/health' and method=='GET': return self.reply(200,{'ok':True,'version':2})
            if path=='/api/auth/login' and method=='POST':
                data=self.body()
                username=text(data.get('username',''),50)
                password=data.get('password','')
                if not isinstance(password,str) or len(password)>200: raise ApiError(400,'密码格式不正确')
                address=self.headers.get('X-Real-IP',self.client_address[0])
                token,csrf,user=store.login(username,password,address+':'+username)
                cookie='peiliao_session='+token+'; Path=/; HttpOnly; SameSite=Lax; Max-Age=43200'
                if self.server.secure_cookies: cookie+='; Secure'
                return self.reply(200,{'user':user,'csrf':csrf},cookie)
            user=store.auth(self.cookie())
            if method=='POST' and not hmac.compare_digest(self.headers.get('X-CSRF-Token',''),user['csrf']):
                raise ApiError(403,'登录验证已失效，请重新登录')
            if path=='/api/auth/me' and method=='GET':
                return self.reply(200,{'user':store.user_public(user),'csrf':user['csrf']})
            if path=='/api/auth/logout' and method=='POST':
                with store.connect() as db: db.execute('DELETE FROM sessions WHERE token=?',(self.cookie(),))
                return self.reply(200,{'ok':True},'peiliao_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Secure')
            if path=='/api/state' and method=='GET': return self.reply(200,store.read())
            if path=='/api/sync' and method=='POST': return self.reply(200,store.sync(self.body().get('changes'),user))
            if path=='/api/migrate' and method=='POST': return self.reply(200,store.migrate(self.body().get('state'),user))
            if path=='/api/auth/password' and method=='POST':
                data=self.body(); old=data.get('currentPassword',''); new=data.get('newPassword','')
                if not isinstance(old,str) or not password_ok(old,user['password']): raise ApiError(400,'当前密码不正确')
                if not isinstance(new,str) or not 7<=len(new)<=200: raise ApiError(400,'新密码至少需要 7 位')
                with store.connect() as db:
                    db.execute('UPDATE users SET password=? WHERE id=?',(password_hash(new),user['id']))
                    db.execute('DELETE FROM sessions WHERE user_id=? AND token<>?',(user['id'],self.cookie()))
                return self.reply(200,{'ok':True})
            if path.startswith('/api/admin/'):
                if user['role']!='admin': raise ApiError(403,'需要管理员权限')
                if path=='/api/admin/users' and method=='GET':
                    with store.connect() as db: users=[store.user_public(r) for r in db.execute('SELECT * FROM users ORDER BY id')]
                    return self.reply(200,{'users':users})
                if path=='/api/admin/users' and method=='POST':
                    data=self.body(); username=text(data.get('username',''),50)
                    name=text(data.get('displayName',''),100) or username; password=data.get('password','')
                    if not re.match(r'^[A-Za-z0-9_.-]{2,50}$',username): raise ApiError(400,'账号使用 2～50 位字母、数字或 ._-')
                    if not isinstance(password,str) or not 7<=len(password)<=200: raise ApiError(400,'初始密码至少 7 位')
                    with store.connect() as db:
                        try: db.execute('INSERT INTO users(username,display_name,password,role) VALUES(?,?,?,?)',(username,name,password_hash(password),'employee'))
                        except sqlite3.IntegrityError: raise ApiError(400,'该账号已存在')
                        store.audit(db,user,'创建员工账号：'+username)
                    return self.reply(201,{'ok':True})
                if path=='/api/admin/users/update' and method=='POST':
                    data=self.body(); uid=integer(data.get('id'),1)
                    with store.connect() as db:
                        target=db.execute('SELECT * FROM users WHERE id=?',(uid,)).fetchone()
                        if not target: raise ApiError(404,'账号不存在')
                        if target['username']=='root': raise ApiError(400,'管理员账号不能停用')
                        enabled=1 if data.get('enabled',True) else 0
                        db.execute('UPDATE users SET enabled=? WHERE id=?',(enabled,uid))
                        if data.get('password'):
                            pwd=data['password']
                            if not isinstance(pwd,str) or not 7<=len(pwd)<=200: raise ApiError(400,'密码至少 7 位')
                            db.execute('UPDATE users SET password=? WHERE id=?',(password_hash(pwd),uid))
                            db.execute('DELETE FROM sessions WHERE user_id=?',(uid,))
                        if not enabled: db.execute('DELETE FROM sessions WHERE user_id=?',(uid,))
                        store.audit(db,user,'更新员工账号：'+target['username'])
                    return self.reply(200,{'ok':True})
                if path=='/api/admin/orders' and method=='GET':
                    with store.connect() as db:
                        row=db.execute('SELECT body FROM app_state WHERE id=1').fetchone()
                        metadata={r['order_id']:dict(r) for r in db.execute('''SELECT m.order_id,m.imported,u.username,u.display_name
                                     FROM order_meta m JOIN users u ON m.created_by=u.id''')}
                        orders=[]
                        for order in json.loads(row['body'])['orders']:
                            meta=metadata.get(order['id'],{})
                            orders.append(dict(order,creator=meta.get('display_name','未知'),creatorUsername=meta.get('username',''),imported=bool(meta.get('imported'))))
                    return self.reply(200,{'orders':orders})
                if path=='/api/admin/audit' and method=='GET':
                    with store.connect() as db: logs=[dict(r) for r in db.execute('SELECT * FROM audit ORDER BY id DESC LIMIT 300')]
                    return self.reply(200,{'audit':logs})
            raise ApiError(404,'接口不存在')
        except ApiError as error: self.reply(error.status,{'error':error.message})
        except Exception as error:
            print('API failure: '+type(error).__name__,flush=True)
            self.reply(500,{'error':'服务器暂时无法处理请求，请稍后再试'})


class Server(ThreadingMixIn,HTTPServer):
    daemon_threads=True


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--data',default=os.environ.get('PEILIAO_DB','data/peiliao.sqlite3'))
    parser.add_argument('--seed',default=os.path.join(os.path.dirname(__file__),'seed.json'))
    parser.add_argument('--port',type=int,default=4188)
    parser.add_argument('--init-only',action='store_true')
    parser.add_argument('--insecure-local-test',action='store_true')
    args=parser.parse_args()
    with open(args.seed,encoding='utf-8') as file: seed=json.load(file)
    store=Store(args.data,seed,os.environ.get('PEILIAO_ADMIN_PASSWORD'))
    if args.init_only: return
    server=Server(('127.0.0.1',args.port),Handler)
    server.store=store
    server.origin=os.environ.get('PEILIAO_ORIGIN','https://YOUR_APP_DOMAIN')
    server.secure_cookies=not args.insecure_local_test
    print('Food factory API listening on loopback port '+str(args.port),flush=True)
    server.serve_forever()


if __name__=='__main__': main()
