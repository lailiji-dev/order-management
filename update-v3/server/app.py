"""Shared food-factory API. Python 3.6+, SQLite, standard library only.

Entity writes use compare-and-swap inside short SQLite transactions. Read snapshots
are encoded once per revision; conditional polls never assemble a JSON snapshot.
"""
import argparse
import copy
from contextlib import contextmanager
import datetime
import hashlib
import hmac
import json
import math
import os
import re
import secrets
import sqlite3
import threading
import time
from http.cookies import SimpleCookie
from http.server import BaseHTTPRequestHandler, HTTPServer
from socketserver import ThreadingMixIn
from urllib.parse import parse_qs, urlsplit

PUBLIC_FIELDS = ('id', 'orderNo', 'legacyOrderNo', 'orderDate', 'status', 'cancelled',
                 'deposit', 'orderAmount', 'remainingAmount', 'note', 'customerName',
                 'phone', 'earlyPickup', 'createdAt', 'updatedAt', 'items')
COLLECTIONS = ('categories', 'products', 'orders')
SCHEMA_VERSION = 3


def now():
    return datetime.datetime.now(datetime.timezone.utc).replace(microsecond=0).isoformat().replace('+00:00', 'Z')


def encode(value):
    return json.dumps(value, ensure_ascii=False, separators=(',', ':'), allow_nan=False)


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


def entity_id(value):
    # IDs are opaque strings; preserve custom IDs accepted by earlier versions.
    # SQL parameters and the frontend's HTML escaping are the security boundaries.
    if not isinstance(value, str) or not value or len(value) > 100:
        raise ApiError(400, '记录标识格式不正确')
    return value


def integer(value, minimum=0):
    if isinstance(value, bool) or not isinstance(value, int) or not minimum <= value <= 9007199254740991:
        raise ApiError(400, '数量或金额必须为有效整数')
    return value


def valid_date(value):
    date = text(value, 10)
    try:
        if datetime.datetime.strptime(date, '%Y-%m-%d').strftime('%Y-%m-%d') != date:
            raise ValueError()
    except ValueError:
        raise ApiError(400, '订单日期不正确')
    return date


def finite_number(value):
    return (not isinstance(value, bool) and isinstance(value, (int, float))
            and 0 <= value <= 9007199254740991 and math.isfinite(value))


def normalize_order(order, migrated=False, allow_overpayment=False):
    if not isinstance(order, dict):
        raise ApiError(400, '订单格式不正确')
    result = {key: copy.deepcopy(order[key]) for key in PUBLIC_FIELDS if key in order}
    result['id'] = entity_id(order.get('id'))
    result['orderDate'] = valid_date(order.get('orderDate', ''))
    result['customerName'] = text(order.get('customerName', ''), 100)
    result['phone'] = text(order.get('phone', ''), 40)
    result['note'] = text(order.get('note', ''), 4000)
    result['status'] = order.get('status', 'unpicked')
    if result['status'] not in ('picked', 'unpicked'):
        raise ApiError(400, '取货状态不正确')
    for field in ('cancelled', 'earlyPickup'):
        if not isinstance(order.get(field, False), bool):
            raise ApiError(400, '订单标记格式不正确')
        result[field] = order.get(field, False)
    items = order.get('items')
    if not isinstance(items, list) or not 1 <= len(items) <= 500:
        raise ApiError(400, '请至少填写一种产品')
    clean_items, seen, total = [], set(), 0
    for item in items:
        if not isinstance(item, dict):
            raise ApiError(400, '产品明细格式不正确')
        pid = entity_id(item.get('productId'))
        if pid in seen:
            raise ApiError(400, '产品标识重复')
        seen.add(pid)
        quantity, price = integer(item.get('quantity'), 1), integer(item.get('unitPrice', 0))
        subtotal = integer(quantity * price)
        total = integer(total + subtotal)
        clean_items.append({'productId': pid, 'productName': text(item.get('productName', '')),
                            'quantity': quantity, 'unitPrice': price, 'subtotal': subtotal})
    result['items'], result['orderAmount'] = clean_items, total
    deposit = integer(order.get('deposit', 0))
    if migrated:
        deposit = integer(((deposit + 50) // 100) * 100)
    if deposit % 100:
        raise ApiError(400, '定金只能填写整数元')
    if deposit > total and not migrated and not allow_overpayment:
        raise ApiError(400, '定金不能大于订单金额')
    result['deposit'], result['remainingAmount'] = deposit, total - deposit
    return result


class Store:
    def __init__(self, path, seed, admin_password=None):
        self.path, self.seed = path, copy.deepcopy(seed)
        self._snapshot_lock = threading.Lock()
        self._snapshot_revision, self._snapshot_bytes = None, None
        os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
        with self.connect() as db:
            db.execute('PRAGMA journal_mode=WAL')  # Persistent; do not repeat per request.
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
                CREATE TABLE IF NOT EXISTS entities(collection TEXT NOT NULL, id TEXT NOT NULL, body TEXT NOT NULL,
                  position INTEGER NOT NULL, order_date TEXT, status TEXT, cancelled INTEGER,
                  order_number INTEGER, search_text TEXT, PRIMARY KEY(collection,id));
                CREATE INDEX IF NOT EXISTS entities_position ON entities(collection,position);
                CREATE INDEX IF NOT EXISTS entities_order_number ON entities(collection,order_number DESC);
                CREATE INDEX IF NOT EXISTS entities_date ON entities(collection,order_date,order_number DESC);
                CREATE INDEX IF NOT EXISTS entities_status ON entities(collection,status,order_number DESC);
                CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires);
                CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
                CREATE INDEX IF NOT EXISTS login_attempts_since ON login_attempts(since);
            ''')
            db.execute('BEGIN IMMEDIATE')
            version = db.execute('PRAGMA user_version').fetchone()[0]
            if version > SCHEMA_VERSION:
                raise RuntimeError('Database schema is newer than this application')
            db.execute('INSERT OR IGNORE INTO app_state(id,body) VALUES(1,?)', (encode(seed),))
            if version < SCHEMA_VERSION:
                self._upgrade_entities(db)
                db.execute('PRAGMA user_version=3')
            if not db.execute('SELECT 1 FROM users WHERE username=?', ('root',)).fetchone():
                if not admin_password:
                    raise RuntimeError('PEILIAO_ADMIN_PASSWORD is required for first initialization')
                db.execute('INSERT INTO users(username,display_name,password,role) VALUES(?,?,?,?)',
                           ('root', '管理员', password_hash(admin_password), 'admin'))
        os.chmod(path, 0o600)

    @contextmanager
    def connect(self):
        db = sqlite3.connect(self.path, timeout=10)
        db.row_factory = sqlite3.Row
        try:
            yield db
            db.commit()
        except Exception:
            db.rollback()
            raise
        finally:
            db.close()

    def _upgrade_entities(self, db):
        """Atomically split v2's document without altering counters or tombstones."""
        state = json.loads(db.execute('SELECT body FROM app_state WHERE id=1').fetchone()['body'])
        for collection in COLLECTIONS:
            seen = set()
            for position, item in enumerate(state.pop(collection, [])):
                if not isinstance(item, dict) or not isinstance(item.get('id'), str) or item['id'] in seen:
                    raise RuntimeError('Cannot migrate duplicate or invalid entity IDs')
                seen.add(item['id'])
                self._put_entity(db, collection, item, position)
        db.execute('UPDATE app_state SET body=? WHERE id=1', (encode(state),))

    @staticmethod
    def _put_entity(db, collection, item, position):
        is_order = collection == 'orders'
        try:
            number = int(item.get('orderNo', '0')) if is_order else None
        except (ValueError, TypeError):
            number = 0
        searchable = '\n'.join(str(item.get(field, '')) for field in
                               ('orderNo', 'legacyOrderNo', 'orderDate', 'customerName', 'phone')).lower() if is_order else None
        db.execute('''INSERT OR REPLACE INTO entities
                      (collection,id,body,position,order_date,status,cancelled,order_number,search_text)
                      VALUES(?,?,?,?,?,?,?,?,?)''',
                   (collection, item['id'], encode(item), position, item.get('orderDate') if is_order else None,
                    item.get('status') if is_order else None, int(bool(item.get('cancelled'))) if is_order else None,
                    number, searchable))

    @staticmethod
    def _entities(db, collection):
        return [json.loads(row['body']) for row in db.execute(
            'SELECT body FROM entities WHERE collection=? ORDER BY position', (collection,))]

    @staticmethod
    def _encode_state(db, row):
        # Row bodies were validated/encoded when written. Joining those JSON
        # fragments avoids decoding and re-encoding every historical order.
        metadata = row['body'].strip()
        fields = [metadata[1:-1]] if metadata != '{}' else []
        for collection in COLLECTIONS:
            bodies = [record['body'] for record in db.execute(
                'SELECT body FROM entities WHERE collection=? ORDER BY position', (collection,))]
            fields.append('"' + collection + '":[' + ','.join(bodies) + ']')
        return ('{"state":{' + ','.join(fields) + '},"revision":' + str(row['revision'])
                + ',"initialized":' + ('true' if row['initialized'] else 'false') + '}').encode('utf-8')

    def snapshot(self, if_none_match=None):
        """(revision, immutable payload); None payload means unchanged, no JSON work."""
        with self.connect() as db:
            db.execute('BEGIN')
            revision = db.execute('SELECT revision FROM app_state WHERE id=1').fetchone()[0]
            tag = '"state-{}"'.format(revision)
            tags = [part.strip().replace('W/', '', 1) for part in (if_none_match or '').split(',')]
            if '*' in tags or tag in tags:
                return revision, None
            with self._snapshot_lock:
                if revision == self._snapshot_revision:
                    return revision, self._snapshot_bytes
                row = db.execute('SELECT body,revision,initialized FROM app_state WHERE id=1').fetchone()
                payload = self._encode_state(db, row)
                self._snapshot_revision, self._snapshot_bytes = revision, payload
                return revision, payload

    def read(self):
        # Callers may mutate this dictionary; the shared cached payload stays immutable.
        return json.loads(self.snapshot()[1].decode('utf-8'))

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
            timestamp = time.time()
            attempt = db.execute('SELECT * FROM login_attempts WHERE identity=?', (identity,)).fetchone()
            if attempt and timestamp - attempt['since'] < 900 and attempt['attempts'] >= 15:
                raise ApiError(429, '尝试次数过多，请稍后再试')
            row = db.execute('SELECT * FROM users WHERE username=?', (username,)).fetchone()
            if not row or not row['enabled'] or not password_ok(password, row['password']):
                recent = bool(attempt and timestamp - attempt['since'] < 900)
                since, count = (attempt['since'], attempt['attempts'] + 1) if recent else (timestamp, 1)
                db.execute('DELETE FROM login_attempts WHERE since<?', (timestamp - 900,))
                db.execute('INSERT OR REPLACE INTO login_attempts VALUES(?,?,?)', (identity, count, since))
                db.commit()  # Persist rate limiting before the following ApiError.
                raise ApiError(401, '账号或密码不正确')
            db.execute('DELETE FROM login_attempts WHERE identity=? OR since<?', (identity, timestamp - 900))
            db.execute('DELETE FROM sessions WHERE expires<=?', (timestamp,))
            token, csrf = secrets.token_urlsafe(32), secrets.token_urlsafe(24)
            db.execute('INSERT INTO sessions VALUES(?,?,?,?)', (token, row['id'], csrf, timestamp + 43200))
            return token, csrf, self.user_public(row)

    @staticmethod
    def audit(db, user, action, order=None):
        db.execute('INSERT INTO audit(user_id,username,action,order_id,order_no,occurred_at) VALUES(?,?,?,?,?,?)',
                   (user['id'], user['username'], action, order.get('id') if order else None,
                    order.get('orderNo') if order else None, now()))

    @staticmethod
    def validate_entity(collection, item):
        if not isinstance(item, dict):
            raise ApiError(400, '产品数据格式不正确')
        entity_id(item.get('id'))
        text(item.get('name', ''), 200)
        if collection == 'products':
            integer(item.get('price', 0))
            entity_id(item.get('categoryId'))
            if not all(finite_number(item.get(field, 0)) for field in ('recipeYield', 'lossRate')):
                raise ApiError(400, '配方数值不正确')
            recipe = item.get('recipe', [])
            if not isinstance(recipe, list) or len(recipe) > 500:
                raise ApiError(400, '配方格式不正确')
            for material in recipe:
                if not isinstance(material, dict):
                    raise ApiError(400, '配方明细格式不正确')
                text(material.get('name', ''), 200)
                text(material.get('unit', 'kg'), 20)
                if not finite_number(material.get('amount', 0)):
                    raise ApiError(400, '原料数量不正确')

    @staticmethod
    def _same_creation(collection, current, after):
        candidate = normalize_order(after) if collection == 'orders' else after
        ignored = ('orderNo', 'createdAt', 'updatedAt')
        return {key: value for key, value in current.items() if key not in ignored} == {
            key: value for key, value in candidate.items() if key not in ignored}

    def sync(self, changes, user, encoded=False):
        if not isinstance(changes, list) or len(changes) > 1000:
            raise ApiError(400, '保存内容过多或格式不正确')
        with self.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            row = db.execute('SELECT revision,next_number,initialized FROM app_state WHERE id=1').fetchone()
            sequence, changed, seen, positions = row['next_number'], False, set(), {}
            for change in changes:
                if not isinstance(change, dict):
                    raise ApiError(400, '保存记录格式不正确')
                collection, eid = change.get('collection'), entity_id(change.get('id'))
                if collection not in COLLECTIONS or (collection, eid) in seen:
                    raise ApiError(400, '保存记录不正确或重复')
                seen.add((collection, eid))
                before, after = change.get('before'), change.get('after')
                record = db.execute('SELECT body,position FROM entities WHERE collection=? AND id=?', (collection, eid)).fetchone()
                current = json.loads(record['body']) if record else None
                if before != current:
                    if before is None and current is not None and isinstance(after, dict) and self._same_creation(collection, current, after):
                        continue  # Idempotent retry after a dropped creation response.
                    raise ApiError(409, '该记录已被另一台设备修改，请刷新后重新操作')
                if after is None:
                    if current:
                        db.execute('DELETE FROM entities WHERE collection=? AND id=?', (collection, eid))
                        if collection == 'orders':
                            self.audit(db, user, '删除订单', current)
                        changed = True
                    continue
                if not isinstance(after, dict) or after.get('id') != eid:
                    raise ApiError(400, '记录标识不匹配')
                if after == current:
                    continue
                after = copy.deepcopy(after)
                if collection == 'orders':
                    historical_rounding = bool(current and current['deposit'] > current['orderAmount'] and after.get('deposit') == current['deposit'])
                    after = normalize_order(after, allow_overpayment=historical_rounding)
                    if historical_rounding and after['deposit'] > after['orderAmount'] and after['orderAmount'] < current['orderAmount']:
                        raise ApiError(400, '减少订单金额时，请重新核对定金')
                    if current is None:
                        if db.execute('SELECT 1 FROM order_meta WHERE order_id=?', (eid,)).fetchone():
                            raise ApiError(409, '该订单已删除，请重新新增')
                        after['orderNo'], after['createdAt'] = str(integer(sequence, 1)).zfill(6), now()
                        db.execute('INSERT INTO order_meta VALUES(?,?,?,0)', (eid, sequence, user['id']))
                        sequence += 1
                        self.audit(db, user, '新增订单', after)
                    else:
                        after['orderNo'], after['createdAt'] = current['orderNo'], current.get('createdAt', now())
                        if current.get('legacyOrderNo'):
                            after['legacyOrderNo'] = current['legacyOrderNo']
                        self.audit(db, user, '修改订单', after)
                    after['updatedAt'] = now()
                else:
                    self.validate_entity(collection, after)
                if record:
                    position = record['position']
                else:
                    if collection not in positions:
                        positions[collection] = db.execute('SELECT COALESCE(MAX(position),-1)+1 FROM entities WHERE collection=?', (collection,)).fetchone()[0]
                    position, positions[collection] = positions[collection], positions[collection] + 1
                self._put_entity(db, collection, after, position)
                changed = True
            if changed or not row['initialized']:
                db.execute('UPDATE app_state SET revision=revision+1,next_number=?,initialized=1 WHERE id=1', (sequence,))
        revision, payload = self.snapshot()  # Runs after releasing the writer transaction.
        return (revision, payload) if encoded else json.loads(payload.decode('utf-8'))

    def migrate(self, incoming, user, encoded=False):
        if user['role'] != 'admin':
            raise ApiError(403, '旧设备数据请由管理员登录后合并')
        if not isinstance(incoming, dict) or not isinstance(incoming.get('orders', []), list):
            raise ApiError(400, '备份数据格式不正确')
        if not all(isinstance(item, dict) for item in incoming.get('orders', [])):
            raise ApiError(400, '订单格式不正确')
        digest = hashlib.sha256(json.dumps(incoming, sort_keys=True, ensure_ascii=False, allow_nan=False).encode('utf-8')).hexdigest()
        imported = 0
        with self.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            row = db.execute('SELECT * FROM app_state WHERE id=1').fetchone()
            sequence = row['next_number']
            duplicate = db.execute('SELECT 1 FROM migrations WHERE digest=?', (digest,)).fetchone()
            if not duplicate:
                for collection in ('categories', 'products'):
                    if collection not in incoming:
                        continue
                    items = incoming[collection]
                    if not isinstance(items, list):
                        raise ApiError(400, '产品数据格式不正确')
                    ids = set()
                    for item in items:
                        self.validate_entity(collection, item)
                        if item['id'] in ids:
                            raise ApiError(400, '产品或分类标识重复')
                        ids.add(item['id'])
                    current = self._entities(db, collection)
                    if not row['initialized'] or current == self.seed.get(collection, []):
                        # Untouched seeded prices/recipes may inherit the original device.
                        db.execute('DELETE FROM entities WHERE collection=?', (collection,))
                        for position, item in enumerate(items):
                            self._put_entity(db, collection, item, position)
                    else:
                        existing = {item['id'] for item in current}
                        position = db.execute('SELECT COALESCE(MAX(position),-1)+1 FROM entities WHERE collection=?', (collection,)).fetchone()[0]
                        for item in items:
                            if item['id'] not in existing:
                                self._put_entity(db, collection, item, position)
                                position += 1
                body = json.loads(row['body'])
                if not row['initialized']:
                    body['productionPlans'] = copy.deepcopy(incoming.get('productionPlans', {}))
                position = db.execute('SELECT COALESCE(MAX(position),-1)+1 FROM entities WHERE collection=?', ('orders',)).fetchone()[0]
                for order in sorted(incoming.get('orders', []), key=lambda item: (str(item.get('createdAt', '')), str(item.get('id', '')))):
                    if db.execute('SELECT 1 FROM order_meta WHERE order_id=?', (order.get('id'),)).fetchone():
                        continue  # Keep deleted order IDs tombstoned across imports.
                    clean = normalize_order(order, migrated=True)
                    clean['legacyOrderNo'] = text(str(order.get('orderNo', '')), 100)
                    clean['orderNo'] = str(integer(sequence, 1)).zfill(6)
                    clean['createdAt'], clean['updatedAt'] = text(str(clean.get('createdAt', now())), 40), now()
                    db.execute('INSERT INTO order_meta VALUES(?,?,?,1)', (clean['id'], sequence, user['id']))
                    self._put_entity(db, 'orders', clean, position)
                    sequence, position, imported = sequence + 1, position + 1, imported + 1
                    self.audit(db, user, '合并历史订单', clean)
                db.execute('UPDATE app_state SET body=?,revision=revision+1,next_number=?,initialized=1 WHERE id=1', (encode(body), sequence))
                db.execute('INSERT INTO migrations VALUES(?,?,?)', (digest, user['id'], now()))
        revision, payload = self.snapshot()
        if encoded:
            return revision, payload[:-1] + b',"imported":' + str(imported).encode('ascii') + b'}'
        result = json.loads(payload.decode('utf-8'))
        result['imported'] = imported
        return result

    def admin_orders(self, query):
        """Optional pagination/search; legacy callers still receive every order."""
        def value(name):
            return query.get(name, [''])[0]
        try:
            limit = int(value('limit')) if value('limit') else None
            offset = int(value('offset') or '0')
        except ValueError:
            raise ApiError(400, '分页参数不正确')
        if (limit is not None and not 1 <= limit <= 2000) or not 0 <= offset <= 9007199254740991:
            raise ApiError(400, '分页参数不正确')
        clauses, parameters = ["e.collection='orders'"], []
        if value('date'):
            clauses.append('e.order_date=?')
            parameters.append(valid_date(value('date')))
        if value('status'):
            status = value('status')
            if status == 'cancelled':
                clauses.append('e.cancelled=1')
            elif status in ('picked', 'unpicked'):
                clauses.extend(('e.status=?', 'e.cancelled=0'))
                parameters.append(status)
            else:
                raise ApiError(400, '取货状态不正确')
        if value('q'):
            phrase = text(value('q'), 100).lower().replace('\\', '\\\\').replace('%', '\\%').replace('_', '\\_')
            clauses.append("(e.search_text LIKE ? ESCAPE '\\' OR lower(u.username || char(10) || u.display_name) LIKE ? ESCAPE '\\')")
            parameters.extend(('%' + phrase + '%', '%' + phrase + '%'))
        source = '''FROM entities e LEFT JOIN order_meta m ON e.id=m.order_id
                    LEFT JOIN users u ON m.created_by=u.id WHERE ''' + ' AND '.join(clauses)
        sql = 'SELECT e.body,m.imported,u.username,u.display_name ' + source + ' ORDER BY e.order_number DESC'
        with self.connect() as db:
            db.execute('BEGIN')
            total = db.execute('SELECT COUNT(*) ' + source, parameters).fetchone()[0]
            page_parameters = list(parameters)
            if limit is not None:
                sql += ' LIMIT ? OFFSET ?'
                page_parameters.extend((limit, offset))
            elif offset:
                sql += ' LIMIT -1 OFFSET ?'
                page_parameters.append(offset)
            orders = []
            for row in db.execute(sql, page_parameters):
                item = json.loads(row['body'])
                item.update(creator=row['display_name'] or '未知', creatorUsername=row['username'] or '', imported=bool(row['imported']))
                orders.append(item)
        return {'orders': orders, 'total': total, 'offset': offset, 'limit': limit}


class Handler(BaseHTTPRequestHandler):
    server_version = 'FoodFactory'

    def setup(self):
        self.request.settimeout(15)
        BaseHTTPRequestHandler.setup(self)

    def log_message(self, fmt, *args):
        pass  # No passwords, bodies, cookies or customer data in logs.

    def reply(self, status, data=None, cookie=None, etag=None, body=None):
        if body is None:
            body = b'' if status == 304 else encode(data).encode('utf-8')
        self.send_response(status)
        if status != 304:
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'private, no-cache' if etag else 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        if etag:
            self.send_header('ETag', etag)
        if cookie:
            self.send_header('Set-Cookie', cookie)
        self.end_headers()
        if body:
            self.wfile.write(body)

    def body(self):
        try:
            length = int(self.headers.get('Content-Length', '0'))
        except ValueError:
            raise ApiError(400, '请求长度不正确')
        if not 0 < length <= 4000000:
            raise ApiError(413, '请求内容过大或为空')
        if not self.headers.get('Content-Type', '').startswith('application/json'):
            raise ApiError(415, '请使用 JSON 请求')
        try:
            raw = self.rfile.read(length)
            if len(raw) != length:
                raise ValueError()
            def reject_constant(value):
                raise ValueError('Non-finite JSON number')
            data = json.loads(raw.decode('utf-8'), parse_constant=reject_constant)
            # Also reject exponent overflow and nonfinite values in unknown fields.
            def check_finite(value):
                if isinstance(value, float) and not math.isfinite(value):
                    raise ValueError('Non-finite JSON number')
                if isinstance(value, int) and abs(value) > 9007199254740991:
                    raise ValueError('Integer exceeds browser-safe range')
                if isinstance(value, dict):
                    for item in value.values():
                        check_finite(item)
                elif isinstance(value, list):
                    for item in value:
                        check_finite(item)
            check_finite(data)
        except (ValueError, UnicodeError, RecursionError):
            raise ApiError(400, '请求数据不正确')
        if not isinstance(data, dict):
            raise ApiError(400, '请求数据不正确')
        return data

    def cookie(self):
        cookie = SimpleCookie()
        try:
            cookie.load(self.headers.get('Cookie', ''))
        except Exception:
            return ''
        return cookie['peiliao_session'].value if 'peiliao_session' in cookie else ''

    def do_GET(self):
        self.dispatch('GET')

    def do_POST(self):
        self.dispatch('POST')

    def dispatch(self, method):
        try:
            self._dispatch(method)
        except ApiError as error:
            self.reply(error.status, {'error': error.message})
        except sqlite3.OperationalError as error:
            if 'locked' in str(error).lower() or 'busy' in str(error).lower():
                self.reply(503, {'error': '服务器忙，请稍后重试'})
            else:
                self.server.log_failure(error)
                self.reply(500, {'error': '服务器暂时无法处理请求，请稍后再试'})
        except (BrokenPipeError, ConnectionResetError, TimeoutError):
            pass
        except Exception as error:
            self.server.log_failure(error)
            self.reply(500, {'error': '服务器暂时无法处理请求，请稍后再试'})

    def _dispatch(self, method):
        store, url = self.server.store, urlsplit(self.path)
        path, origin = url.path, self.headers.get('Origin')
        if method == 'POST' and origin and origin != self.server.origin:
            raise ApiError(403, '请求来源不正确')
        if path == '/api/health' and method == 'GET':
            return self.reply(200, {'ok': True, 'version': 3})
        if path == '/api/auth/login' and method == 'POST':
            data = self.body()
            username, password = text(data.get('username', ''), 50), data.get('password', '')
            if not isinstance(password, str) or len(password) > 200:
                raise ApiError(400, '密码格式不正确')
            address = self.headers.get('X-Real-IP', self.client_address[0])
            token, csrf, user = store.login(username, password, address + ':' + username)
            cookie = 'peiliao_session=' + token + '; Path=/; HttpOnly; SameSite=Lax; Max-Age=43200'
            if self.server.secure_cookies:
                cookie += '; Secure'
            return self.reply(200, {'user': user, 'csrf': csrf}, cookie)
        user = store.auth(self.cookie())
        if method == 'POST' and not hmac.compare_digest(self.headers.get('X-CSRF-Token', ''), user['csrf']):
            raise ApiError(403, '登录验证已失效，请重新登录')
        if path == '/api/auth/me' and method == 'GET':
            return self.reply(200, {'user': store.user_public(user), 'csrf': user['csrf']})
        if path == '/api/auth/logout' and method == 'POST':
            with store.connect() as db:
                db.execute('DELETE FROM sessions WHERE token=?', (self.cookie(),))
            return self.reply(200, {'ok': True}, 'peiliao_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Secure')
        if path == '/api/state' and method == 'GET':
            revision, payload = store.snapshot(self.headers.get('If-None-Match'))
            return self.reply(304 if payload is None else 200, etag='"state-{}"'.format(revision), body=payload)
        if path in ('/api/sync', '/api/migrate') and method == 'POST':
            data = self.body()
            revision, payload = store.sync(data.get('changes'), user, encoded=True) if path == '/api/sync' else store.migrate(data.get('state'), user, encoded=True)
            return self.reply(200, etag='"state-{}"'.format(revision), body=payload)
        if path == '/api/auth/password' and method == 'POST':
            data = self.body()
            old, new = data.get('currentPassword', ''), data.get('newPassword', '')
            if not isinstance(old, str) or len(old) > 200 or not password_ok(old, user['password']):
                raise ApiError(400, '当前密码不正确')
            if not isinstance(new, str) or not 7 <= len(new) <= 200:
                raise ApiError(400, '新密码至少需要 7 位')
            hashed = password_hash(new)
            with store.connect() as db:
                db.execute('UPDATE users SET password=? WHERE id=?', (hashed, user['id']))
                db.execute('DELETE FROM sessions WHERE user_id=? AND token<>?', (user['id'], self.cookie()))
            return self.reply(200, {'ok': True})
        if path.startswith('/api/admin/'):
            if user['role'] != 'admin':
                raise ApiError(403, '需要管理员权限')
            return self._admin(path, method, user, parse_qs(url.query, keep_blank_values=True))
        raise ApiError(404, '接口不存在')

    def _admin(self, path, method, user, query):
        store = self.server.store
        if path == '/api/admin/users' and method == 'GET':
            with store.connect() as db:
                users = [store.user_public(row) for row in db.execute('SELECT id,username,display_name,role,enabled FROM users ORDER BY id')]
            return self.reply(200, {'users': users})
        if path == '/api/admin/users' and method == 'POST':
            data = self.body()
            username, password = text(data.get('username', ''), 50), data.get('password', '')
            name = text(data.get('displayName', ''), 100) or username
            if not re.match(r'^[A-Za-z0-9_.-]{2,50}$', username):
                raise ApiError(400, '账号使用 2～50 位字母、数字或 ._-')
            if not isinstance(password, str) or not 7 <= len(password) <= 200:
                raise ApiError(400, '初始密码至少 7 位')
            hashed = password_hash(password)
            with store.connect() as db:
                try:
                    db.execute('INSERT INTO users(username,display_name,password,role) VALUES(?,?,?,?)', (username, name, hashed, 'employee'))
                except sqlite3.IntegrityError:
                    raise ApiError(400, '该账号已存在')
                store.audit(db, user, '创建员工账号：' + username)
            return self.reply(201, {'ok': True})
        if path == '/api/admin/users/update' and method == 'POST':
            data = self.body()
            uid, password, enabled = integer(data.get('id'), 1), data.get('password'), data.get('enabled', True)
            if not isinstance(enabled, bool):
                raise ApiError(400, '账号状态格式不正确')
            hashed = None
            if password:
                if not isinstance(password, str) or not 7 <= len(password) <= 200:
                    raise ApiError(400, '密码至少 7 位')
                hashed = password_hash(password)
            with store.connect() as db:
                target = db.execute('SELECT username FROM users WHERE id=?', (uid,)).fetchone()
                if not target:
                    raise ApiError(404, '账号不存在')
                if target['username'] == 'root':
                    raise ApiError(400, '管理员账号不能停用')
                db.execute('UPDATE users SET enabled=? WHERE id=?', (int(enabled), uid))
                if hashed:
                    db.execute('UPDATE users SET password=? WHERE id=?', (hashed, uid))
                if hashed or not enabled:
                    db.execute('DELETE FROM sessions WHERE user_id=?', (uid,))
                store.audit(db, user, '更新员工账号：' + target['username'])
            return self.reply(200, {'ok': True})
        if path == '/api/admin/orders' and method == 'GET':
            return self.reply(200, store.admin_orders(query))
        if path == '/api/admin/audit' and method == 'GET':
            with store.connect() as db:
                logs = [dict(row) for row in db.execute('SELECT * FROM audit ORDER BY id DESC LIMIT 300')]
            return self.reply(200, {'audit': logs})
        raise ApiError(404, '接口不存在')


class Server(ThreadingMixIn, HTTPServer):
    daemon_threads = True
    request_queue_size = 32

    def __init__(self, address, handler, max_workers=32):
        self._workers = threading.BoundedSemaphore(max_workers)
        HTTPServer.__init__(self, address, handler)

    @staticmethod
    def log_failure(error):
        print('API failure: ' + type(error).__name__, flush=True)

    def process_request(self, request, client_address):
        if not self._workers.acquire(False):
            try:
                body = b'{"error":"Server busy; retry shortly"}'
                response = b'HTTP/1.0 503 Service Unavailable\r\nContent-Type: application/json\r\nCache-Control: no-store\r\nConnection: close\r\nContent-Length: ' + str(len(body)).encode('ascii') + b'\r\n\r\n' + body
                request.settimeout(1)
                request.sendall(response)
            except OSError:
                pass
            finally:
                self.shutdown_request(request)
            return
        try:
            ThreadingMixIn.process_request(self, request, client_address)
        except Exception:
            self._workers.release()
            raise

    def process_request_thread(self, request, client_address):
        try:
            ThreadingMixIn.process_request_thread(self, request, client_address)
        finally:
            self._workers.release()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--data', default=os.environ.get('PEILIAO_DB', 'data/peiliao.sqlite3'))
    parser.add_argument('--seed', default=os.path.join(os.path.dirname(__file__), 'seed.json'))
    parser.add_argument('--port', type=int, default=4188)
    parser.add_argument('--init-only', action='store_true')
    parser.add_argument('--insecure-local-test', action='store_true')
    args = parser.parse_args()
    with open(args.seed, encoding='utf-8') as file:
        seed = json.load(file)
    store = Store(args.data, seed, os.environ.get('PEILIAO_ADMIN_PASSWORD'))
    if args.init_only:
        return
    server = Server(('127.0.0.1', args.port), Handler)
    server.store = store
    server.origin = os.environ.get('PEILIAO_ORIGIN', 'https://YOUR_APP_DOMAIN')
    server.secure_cookies = not args.insecure_local_test
    print('Food factory API listening on loopback port ' + str(args.port), flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == '__main__':
    main()
