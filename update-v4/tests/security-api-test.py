"""Isolated backend security regression. Never contacts a production server."""
import copy
import hashlib
import importlib.util
import json
from pathlib import Path
import socket
import sqlite3
import time
import unittest
from concurrent.futures import ThreadPoolExecutor
from unittest.mock import patch
from urllib.error import HTTPError
from urllib.request import Request, urlopen
from urllib.parse import quote

base = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('shared_tests', str(base / 'tests/api-test.py'))
shared = importlib.util.module_from_spec(spec)
spec.loader.exec_module(shared)
app = shared.app
GOOD_PASSWORD = 'only-for-isolated-tests-42'


class SecurityTests(unittest.TestCase):
    # Reuse fixture helpers, without rerunning its inherited business tests.
    setUp = shared.SharedTests.setUp
    tearDown = shared.SharedTests.tearDown
    request = shared.SharedTests.request
    login = shared.SharedTests.login
    change = shared.SharedTests.change

    def raw_request(self, path, payload, headers=None, authenticated=True):
        request_headers = {'Content-Type': 'application/json'}
        if authenticated:
            request_headers.update(Cookie=self.admin['cookie'], **{'X-CSRF-Token': self.admin['csrf']})
        request_headers.update(headers or {})
        try:
            response = urlopen(Request(self.url + '/api/' + path, payload, request_headers), timeout=10)
        except HTTPError as error:
            response = error
        status, raw, result_headers = response.code, response.read(), response.headers
        response.close()
        return status, raw, result_headers

    def test_login_audit_records_success_failure_lock_logout_without_secrets(self):
        self.assertEqual(self.request('admin/users', {'username':'auditstaff','password':'0123'}, self.admin)[0], 201)
        wrong_password = 'never-log-this-password-marker'
        self.assertEqual(self.login('auditstaff', wrong_password)[0], 401)
        code, employee = self.login('auditstaff', '0123')
        self.assertEqual(code, 200)
        self.assertEqual(self.request('admin/audit')[0], 401)
        self.assertEqual(self.request('admin/audit', session=employee)[0], 403)
        self.assertEqual(self.request('auth/logout', {}, employee)[0], 200)
        with patch.object(self.store, '_verify_password', return_value=False):
            for _ in range(9):
                self.assertEqual(self.login('auditstaff', wrong_password)[0], 401)
            self.assertEqual(self.login('auditstaff', wrong_password)[0], 429)
        rows = self.request('admin/audit', session=self.admin)[1]['audit']
        events = [row for row in rows if row['username'] == 'auditstaff']
        self.assertEqual(len(events), 13)
        self.assertEqual(events[0]['action'], '登录失败：连续错误10次，账号锁定1小时')
        self.assertEqual([row['action'] for row in events[-3:]],
                         ['退出登录', '登录成功', '登录失败：账号或密码不正确'])
        self.assertTrue(all(row['user_id'] == employee['user']['id'] and row['occurred_at'].endswith('Z')
                            and row['order_id'] is None and row['order_no'] is None for row in events))
        encoded = json.dumps(rows)
        for secret in (wrong_password, employee['csrf'], employee['cookie'].split('=', 1)[1], 'pbkdf2_sha256$'):
            self.assertNotIn(secret, encoded)
        before = len(rows)
        for _ in range(15):
            self.assertEqual(self.login('auditstaff', '0123')[0], 429)
        with patch.object(self.store, '_verify_password', return_value=False):
            self.assertEqual(self.login('unknown-user', wrong_password)[0], 401)
        self.assertEqual(len(self.request('admin/audit', session=self.admin)[1]['audit']), before)
        restarted = app.Store(self.store.path, self.store.seed)
        with restarted.connect() as db:
            self.assertEqual(db.execute('SELECT count(*) FROM audit WHERE username=?', ('auditstaff',)).fetchone()[0], 13)

    def test_disabled_account_login_is_audited(self):
        self.assertEqual(self.request('admin/users', {'username':'disabledstaff','password':'0123'}, self.admin)[0], 201)
        _, employee = self.login('disabledstaff', '0123')
        self.assertEqual(self.request('admin/users/update', {'id':employee['user']['id'],'enabled':False}, self.admin)[0], 200)
        self.assertEqual(self.login('disabledstaff', '0123')[0], 401)
        rows = self.request('admin/audit', session=self.admin)[1]['audit']
        self.assertEqual(rows[0]['username'], 'disabledstaff')
        self.assertEqual(rows[0]['action'], '登录失败：账号已停用')

    def test_employee_account_and_name_have_no_field_length_limits(self):
        for username, name in [('q', '名'), ('staff_' + 'x' * 12000, '员工姓名' * 1500)]:
            self.assertEqual(self.request('admin/users', {'username':username,'displayName':name,'password':'0123'}, self.admin)[0], 201)
            code, employee = self.login(username, '0123')
            self.assertEqual(code, 200)
            self.assertEqual(employee['user']['username'], username)
            self.assertEqual(employee['user']['displayName'], name)
            users = self.request('admin/users', session=self.admin)[1]['users']
            stored = next(user for user in users if user['id'] == employee['user']['id'])
            self.assertEqual(stored['username'], username)
            self.assertEqual(stored['displayName'], name)
            self.assertEqual(self.request('admin/users', {'username':username,'password':'0123'}, self.admin)[0], 400)
            self.assertEqual(self.request('sync', {'changes':[self.change(shared.order('length-' + str(len(username))))]}, employee)[0], 200)
            orders = self.request('admin/orders', session=self.admin)[1]['orders']
            record = next(order for order in orders if order['id'] == 'length-' + str(len(username)))
            self.assertEqual(record['creatorUsername'], username)
            self.assertEqual(record['creator'], name)
        for username in ['', 'with space', '中文', 'staff\nother', 'x' * 60 + '!']:
            self.assertEqual(self.request('admin/users', {'username':username,'password':'0123'}, self.admin)[0], 400)

    def test_login_persists_thirty_days_and_expires_at_exact_boundary_after_restart(self):
        self.assertEqual(self.request('admin/users', {'username':'rememberstaff','password':'0123'}, self.admin)[0], 201)
        timestamp = time.time()
        for username, password in [('root','test-password-123'), ('rememberstaff','0123')]:
            with patch.object(app.time, 'time', return_value=timestamp):
                status, raw, headers = self.raw_request('auth/login', json.dumps({'username':username,'password':password}).encode('utf-8'), authenticated=False)
            self.assertEqual(status, 200)
            cookie = app.SimpleCookie()
            # Python 3.6 treats SameSite as a separate cookie, so inspect
            # attributes directly and parse only the name/value component.
            cookie.load(headers['Set-Cookie'].split(';')[0])
            attributes = [part.strip().lower() for part in headers['Set-Cookie'].split(';')[1:]]
            self.assertIn('max-age=2592000', attributes)
            self.assertIn('httponly', attributes)
            self.assertIn('samesite=lax', attributes)
            session = json.loads(raw.decode('utf-8'))
            session['cookie'] = 'peiliao_session=' + cookie['peiliao_session'].value
            key = app.session_key(cookie['peiliao_session'].value)
            restarted = app.Store(self.store.path, self.store.seed)
            self.server.store = restarted
            with restarted.connect() as db:
                self.assertEqual(db.execute('SELECT expires FROM sessions WHERE token=?', (key,)).fetchone()[0], timestamp + 2592000)
            with patch.object(app.time, 'time', return_value=timestamp + 2591999):
                self.assertEqual(self.request('auth/me', session=session)[0], 200)
                self.assertEqual(self.request('state', session=session)[0], 200)
            # Ordinary visits do not move the fixed expiry beyond 30 days.
            with restarted.connect() as db:
                self.assertEqual(db.execute('SELECT expires FROM sessions WHERE token=?', (key,)).fetchone()[0], timestamp + 2592000)
            with patch.object(app.time, 'time', return_value=timestamp + 2592000):
                self.assertEqual(self.request('auth/me', session=session)[0], 401)
                self.assertEqual(self.request('state', session=session)[0], 401)

    def test_calculation_denial_redacts_all_responses_and_price_edits_preserve_recipe(self):
        self.assertEqual(self.request('admin/users', {'username':'orderstaff','password':'0123'}, self.admin)[0], 201)
        _, employee = self.login('orderstaff', '0123')
        self.assertFalse(employee['user']['canCalculate'])
        product = self.request('state', session=self.admin)[1]['state']['products'][0]
        secret = dict(product, recipe=[{'name':'PRIVATE-RECIPE-MARKER','amount':2,'unit':'kg'}], recipeYield=543, lossRate=8, note='PRIVATE-NOTE-MARKER')
        self.assertEqual(self.request('sync', {'changes':[{'collection':'products','id':product['id'],'before':product,'after':secret}]}, self.admin)[0], 200)
        code, limited = self.request('state', session=employee)
        self.assertEqual(code, 200)
        self.assertFalse(limited['permissions']['canCalculate'])
        self.assertTrue(limited['_etag'].endswith('-orders"'))
        visible = limited['state']['products'][0]
        self.assertEqual(set(visible), set(app.ORDER_PRODUCT_FIELDS))
        for marker in ('PRIVATE-RECIPE-MARKER','PRIVATE-NOTE-MARKER','recipeYield','lossRate'):
            self.assertNotIn(marker, json.dumps(limited))
        self.assertEqual(limited['state']['productionPlans'], {})
        change = {'collection':'products','id':visible['id'],'before':visible,'after':dict(visible, price=125)}
        code, saved = self.request('sync', {'changes':[change]}, employee)
        self.assertEqual(code, 403)
        self.assertEqual(self.request('admin/prices', {'changes':[{'id':visible['id'],'beforePrice':visible['price'],'price':125}]}, self.admin)[0], 200)
        current = self.store.read()['state']['products'][0]
        self.assertEqual(current['price'], 125)
        self.assertEqual(current['recipe'], secret['recipe'])
        self.assertEqual(current['recipeYield'], 543)
        visible = self.request('state', session=employee)[1]['state']['products'][0]
        change.update(before=visible, after=dict(visible, recipe=[]))
        self.assertEqual(self.request('sync', {'changes':[change]}, employee)[0], 403)
        self.assertEqual(self.request('sync', {'changes':[{'collection':'categories','id':'c1','before':None,'after':None}]}, employee)[0], 403)
        code, saved = self.request('sync', {'changes':[self.change(shared.order('permitted-order'))]}, employee)
        self.assertEqual(code, 200)
        self.assertFalse(saved['permissions']['canCalculate'])
        self.assertNotIn('PRIVATE-RECIPE-MARKER', json.dumps(saved))

    def test_admin_prices_auth_csrf_cas_atomicity_and_historical_order_snapshots(self):
        self.request('admin/users',{'username':'price-staff','password':'0123'},self.admin)
        _,employee=self.login('price-staff','0123')
        uid=employee['user']['id']
        self.request('admin/users/permissions',{'id':uid,'canCalculate':True},self.admin)
        products=self.request('state',session=self.admin)[1]['state']['products']
        first,second=products[:2]
        change={'id':first['id'],'beforePrice':first['price'],'price':234}
        for method_body in (None,{'changes':[change]}):
            self.assertEqual(self.request('admin/prices',method_body)[0],401)
            self.assertEqual(self.request('admin/prices',method_body,employee)[0],403)
        self.assertEqual(self.request('admin/prices',{'changes':[change]},self.admin,csrf=False)[0],403)
        forged={'collection':'products','id':first['id'],'before':first,'after':dict(first,price=234)}
        self.assertEqual(self.request('sync',{'changes':[forged]},employee)[0],403)
        item=shared.order('historical-price');item['items'][0]['unitPrice']=111
        self.request('sync',{'changes':[self.change(item)]},self.admin)
        historic=copy.deepcopy(self.store.read()['state']['orders'])
        for bad in (-1,1.5,True,9007199254740992):
            self.assertEqual(self.request('admin/prices',{'changes':[dict(change,price=bad)]},self.admin)[0],400)
        conflicting={'id':second['id'],'beforePrice':second['price']+1,'price':500}
        self.assertEqual(self.request('admin/prices',{'changes':[change,conflicting]},self.admin)[0],409)
        self.assertEqual(self.store.read()['state']['products'][0],first)
        code,reply=self.request('admin/prices',{'changes':[change]},self.admin)
        self.assertEqual(code,200)
        self.assertEqual(reply['products'][0]['price'],234)
        self.assertNotIn('recipe',reply['products'][0])
        self.assertEqual(self.store.read()['state']['products'][0],dict(first,price=234))
        self.assertEqual(self.store.read()['state']['orders'],historic)
        self.assertEqual(self.request('admin/prices',{'changes':[dict(change,price=400)]},self.admin)[0],409)
        self.assertEqual(self.request('state',session=employee)[1]['state']['products'][0]['price'],234)
        # Price configuration is independent of the administrator's calculator access.
        self.request('admin/users/permissions',{'id':1,'canCalculate':False},self.admin)
        self.assertEqual(self.request('admin/prices',{'changes':[dict(change,beforePrice=234,price=0)]},self.admin)[0],200)

    def test_calculation_permissions_are_admin_only_and_apply_to_active_sessions_and_etags(self):
        self.request('admin/users', {'username':'permissionstaff','password':'0123'}, self.admin)
        _, employee = self.login('permissionstaff', '0123')
        uid = employee['user']['id']
        body = {'id':uid,'canCalculate':True}
        self.assertEqual(self.request('admin/users/permissions', body)[0], 401)
        self.assertEqual(self.request('admin/users/permissions', body, employee)[0], 403)
        self.assertEqual(self.request('admin/users/permissions', body, self.admin, csrf=False)[0], 403)
        for invalid in (None, 0, 'true', []):
            self.assertEqual(self.request('admin/users/permissions', dict(body, canCalculate=invalid), self.admin)[0], 400)
        self.assertEqual(self.request('admin/users/permissions', dict(body, id=9999), self.admin)[0], 404)
        denied = self.request('state', session=employee)[1]
        self.assertEqual(self.request('admin/users/permissions', body, self.admin)[0], 200)
        self.assertTrue(self.request('auth/me', session=employee)[1]['user']['canCalculate'])
        code, granted = self.request('state', session=employee, extra_headers={'If-None-Match':denied['_etag']})
        self.assertEqual(code, 200)
        self.assertTrue(granted['permissions']['canCalculate'])
        self.assertIn('recipe', granted['state']['products'][0])
        self.assertEqual(granted['revision'], denied['revision'])
        self.assertEqual(self.request('state', session=employee, extra_headers={'If-None-Match':granted['_etag']})[0], 304)
        self.assertEqual(self.request('admin/users/permissions', dict(body, canCalculate=False), self.admin)[0], 200)
        self.assertFalse(self.request('auth/me', session=employee)[1]['user']['canCalculate'])
        code, revoked = self.request('state', session=employee, extra_headers={'If-None-Match':granted['_etag']})
        self.assertEqual(code, 200)
        self.assertFalse(revoked['permissions']['canCalculate'])
        self.assertNotIn('recipe', revoked['state']['products'][0])
        self.assertNotEqual(revoked['_etag'], granted['_etag'])
        self.assertEqual(self.request('state', session=employee, extra_headers={'If-None-Match':revoked['_etag']})[0], 304)
        rows = self.request('admin/audit', session=self.admin)[1]['audit']
        self.assertTrue(any(row['action']=='授予配比计算权限：permissionstaff' for row in rows))
        self.assertTrue(any(row['action']=='撤销配比计算权限：permissionstaff' for row in rows))

    def test_calculation_permission_persists_and_is_not_inherited_by_recreated_account(self):
        self.request('admin/users', {'username':'permanentstaff','password':'0123'}, self.admin)
        _, employee = self.login('permanentstaff', '0123')
        uid = employee['user']['id']
        self.request('admin/users/permissions', {'id':uid,'canCalculate':True}, self.admin)
        restarted = app.Store(self.store.path, self.store.seed)
        self.server.store = restarted
        self.assertTrue(self.request('auth/me', session=employee)[1]['user']['canCalculate'])
        self.assertTrue(self.login('permanentstaff', '0123')[1]['user']['canCalculate'])
        self.assertEqual(self.request('admin/users/delete', {'id':uid}, self.admin)[0], 200)
        with restarted.connect() as db:
            self.assertEqual(db.execute('SELECT count(*) FROM user_permissions WHERE user_id=?',(uid,)).fetchone()[0], 0)
        self.request('admin/users', {'username':'permanentstaff','password':'0123'}, self.admin)
        _, replacement = self.login('permanentstaff', '0123')
        self.assertGreater(replacement['user']['id'], uid)
        self.assertFalse(replacement['user']['canCalculate'])

    def test_admin_can_revoke_own_calculation_without_losing_permission_management(self):
        self.assertTrue(self.admin['user']['canCalculate'])
        self.assertEqual(self.request('admin/users/permissions', {'id':1,'canCalculate':False}, self.admin)[0], 200)
        self.assertFalse(self.request('state', session=self.admin)[1]['permissions']['canCalculate'])
        self.assertEqual(self.request('migrate', {'state':{'orders':[]}}, self.admin)[0], 403)
        self.assertEqual(self.request('admin/users', session=self.admin)[0], 200)
        self.assertEqual(self.request('admin/users/permissions', {'id':1,'canCalculate':True}, self.admin)[0], 200)
        self.assertTrue(self.request('state', session=self.admin)[1]['permissions']['canCalculate'])

    def test_employee_numeric_password_bounds_and_admin_policy(self):
        for password in ['', '123', '12345678901', '123a', ' 1234', '1234\n', '１２３４', '١٢٣٤', None, 1234, True]:
            code, _ = self.request('admin/users', {'username': 'employee', 'password': password}, self.admin)
            self.assertEqual(code, 400)
        for length in range(4, 11):
            password = '0123456789'[:length]
            username = 'numeric' + str(length)
            self.assertEqual(self.request('admin/users', {'username': username, 'password': password}, self.admin)[0], 201)
            self.assertEqual(self.login(username, password)[0], 200)
        self.assertEqual(self.request('admin/users', {'username': 'employee', 'password': '0000'}, self.admin)[0], 201)
        _, employee = self.login('employee', '0000')
        self.assertEqual(self.request('admin/users/update', {'id': employee['user']['id'], 'password': 'weakpwd'}, self.admin)[0], 400)
        self.assertEqual(self.request('auth/password', {'currentPassword': 'test-password-123', 'newPassword': 'short123'}, self.admin)[0], 400)
        self.assertEqual(self.request('auth/password', {'currentPassword': 'test-password-123', 'newPassword': '1234'}, self.admin)[0], 400)
        self.assertTrue(app.validate_password('白云下的春天与秋天共享一段独立口令', 'employee'))

    def test_employee_numeric_reset_change_and_existing_login_compatibility(self):
        self.assertEqual(self.request('admin/users', {'username': 'employee', 'password': '0000'}, self.admin)[0], 201)
        _, employee = self.login('employee', '0000')
        uid = employee['user']['id']
        self.assertEqual(self.request('admin/users/update', {'id': uid, 'password': '0123456789'}, self.admin)[0], 200)
        self.assertEqual(self.request('state', session=employee)[0], 401)
        self.assertEqual(self.login('employee', '0000')[0], 401)
        _, employee = self.login('employee', '0123456789')
        _, other = self.login('employee', '0123456789')
        self.assertEqual(self.request('auth/password', {'currentPassword': '0123456789', 'newPassword': '123a'}, employee)[0], 400)
        self.assertEqual(self.request('auth/password', {'currentPassword': '0123456789', 'newPassword': '1111'}, employee)[0], 200)
        self.assertEqual(self.request('state', session=other)[0], 401)
        self.assertEqual(self.login('employee', '1111')[0], 200)
        with self.store.connect() as db:
            db.execute('UPDATE users SET password=? WHERE id=?', (app.password_hash(GOOD_PASSWORD), uid))
        self.assertEqual(self.login('employee', GOOD_PASSWORD)[0], 200)

    def test_legacy_password_hash_compatible_and_new_hash_cost(self):
        password, salt = 'legacy-password-example', '0123456789abcdef0123456789abcdef'
        old = salt + ':' + hashlib.pbkdf2_hmac('sha256', password.encode('utf-8'), bytes.fromhex(salt), 300000).hex()
        self.assertTrue(app.password_ok(password, old))
        self.assertFalse(app.password_ok('wrong', old))
        current = app.password_hash(password)
        self.assertTrue(current.startswith('pbkdf2_sha256$600000$'))
        self.assertTrue(app.password_ok(password, current))
        self.assertFalse(app.password_ok('wrong', current))

    def test_rotating_usernames_cannot_bypass_ip_limit(self):
        with patch.object(self.store, '_verify_password', return_value=False):
            for index in range(30):
                self.assertEqual(self.login('missing-' + str(index), 'wrong')[0], 401)
            self.assertEqual(self.login('a-new-name', 'wrong')[0], 429)

    def test_rotating_ip_or_username_case_cannot_bypass_account_limit(self):
        with patch.object(self.store, '_verify_password', return_value=False):
            for index in range(9):
                code, _ = self.request('auth/login', {'username': 'root' if index % 2 else 'Root', 'password': 'wrong'},
                                       extra_headers={'X-Real-IP': '192.0.2.' + str(index)})
                self.assertEqual(code, 401)
            code, _ = self.request('auth/login', {'username': 'root', 'password': 'wrong'},
                                   extra_headers={'X-Real-IP': '198.51.100.9'})
            self.assertEqual(code, 429)

    def test_tenth_wrong_password_locks_for_hour_and_success_resets_counter(self):
        timestamp = time.time()
        with patch.object(app.time, 'time', return_value=timestamp):
            with patch.object(self.store, '_verify_password', return_value=False):
                for _ in range(9):
                    self.assertEqual(self.login('root', 'wrong')[0], 401)
            self.assertEqual(self.login('root', 'test-password-123')[0], 200)
            with patch.object(self.store, '_verify_password', return_value=False):
                for _ in range(9):
                    self.assertEqual(self.login('root', 'wrong')[0], 401)
                code, response = self.login('root', 'wrong')
                self.assertEqual(code, 429)
                self.assertIn('60 分钟', response['error'])
            with self.store.connect() as db:
                row = db.execute('SELECT * FROM account_login_failures').fetchone()
                self.assertEqual(row['attempts'], 10)
                self.assertEqual(row['locked_until'], timestamp + 3600)
        restarted = app.Store(self.store.path, self.store.seed)
        self.server.store = restarted
        with patch.object(app.time, 'time', return_value=timestamp + 3599), patch.object(restarted, '_verify_password', side_effect=AssertionError('Locked account must not hash passwords')):
            self.assertEqual(self.login('root', 'test-password-123')[0], 429)
        with patch.object(app.time, 'time', return_value=timestamp + 3600):
            self.assertEqual(self.login('root', 'test-password-123')[0], 200)
        with restarted.connect() as db:
            self.assertEqual(db.execute('SELECT COUNT(*) FROM account_login_failures').fetchone()[0], 0)

    def test_parallel_failed_passwords_count_atomically_without_extending_lock(self):
        identity = app.rate_identity('account', 'root')
        timestamp = time.time()
        def fail(_):
            try:
                self.store._failed_login('root', identity)
                return 401
            except app.ApiError as error:
                return error.status
        with patch.object(app.time, 'time', return_value=timestamp), ThreadPoolExecutor(max_workers=12) as pool:
            results = list(pool.map(fail, range(30)))
        self.assertEqual(results.count(401), 9)
        self.assertEqual(results.count(429), 21)
        with patch.object(app.time, 'time', return_value=timestamp + 1800):
            self.assertEqual(fail(0), 429)
        with self.store.connect() as db:
            row = db.execute('SELECT * FROM account_login_failures WHERE identity=?', (identity,)).fetchone()
            self.assertEqual(row['attempts'], 10)
            self.assertEqual(row['locked_until'], timestamp + 3600)

    def test_delete_employee_revokes_sessions_and_preserves_history_with_reused_name(self):
        self.assertEqual(self.request('admin/users', {'username':'departed','displayName':'原员工','password':'0123'}, self.admin)[0], 201)
        _, employee = self.login('departed', '0123')
        uid = employee['user']['id']
        record = shared.order('departed-order')
        self.assertEqual(self.request('sync', {'changes':[self.change(record)]}, employee)[0], 200)
        original = self.request('state', session=self.admin)[1]['state']
        self.assertEqual(self.request('admin/users/delete', {'id':uid})[0], 401)
        self.assertEqual(self.request('admin/users/delete', {'id':uid}, employee)[0], 403)
        self.assertEqual(self.request('admin/users/delete', {'id':uid}, self.admin, csrf=False)[0], 403)
        self.assertEqual(self.request('admin/users/delete', {'id':1}, self.admin)[0], 400)
        self.assertEqual(self.request('admin/users/delete', {'id':uid}, self.admin)[0], 200)
        self.assertEqual(self.request('state', session=employee)[0], 401)
        self.assertEqual(self.login('departed', '0123')[0], 401)
        self.assertEqual(self.request('admin/users/delete', {'id':uid}, self.admin)[0], 404)
        self.assertEqual(self.request('state', session=self.admin)[1]['state'], original)
        self.assertEqual(len(self.request('admin/users', session=self.admin)[1]['users']), 1)
        old = self.request('admin/orders?q=' + quote('原员工'), session=self.admin)[1]
        self.assertEqual(old['total'], 1)
        self.assertEqual(old['orders'][0]['creator'], '原员工')
        self.assertTrue(old['orders'][0]['creatorDeleted'])
        self.assertEqual(self.request('admin/users', {'username':'departed','displayName':'新员工','password':'9876'}, self.admin)[0], 201)
        _, replacement = self.login('departed', '9876')
        self.assertGreater(replacement['user']['id'], uid)
        self.assertEqual(self.request('admin/orders', session=self.admin)[1]['orders'][0]['creator'], '原员工')
        with self.store.connect() as db:
            self.assertNotIn('password', [row[1] for row in db.execute('PRAGMA table_info(deleted_users)')])
            self.assertEqual(db.execute('SELECT count(*) FROM sessions WHERE user_id=?', (uid,)).fetchone()[0], 0)

    def test_employee_lock_does_not_lock_another_account(self):
        self.assertEqual(self.request('admin/users', {'username':'lockedstaff','password':'0123'}, self.admin)[0], 201)
        with patch.object(self.store, '_verify_password', return_value=False):
            for _ in range(9):
                self.assertEqual(self.login('lockedstaff', 'wrong')[0], 401)
            self.assertEqual(self.login('lockedstaff', 'wrong')[0], 429)
        self.assertEqual(self.login('lockedstaff', '0123')[0], 429)
        self.assertEqual(self.login('root', 'test-password-123')[0], 200)

    def test_rate_reservation_is_atomic_under_parallel_failures(self):
        identity = app.rate_identity('atomic-test', 'same-account')
        def reserve(_):
            try:
                self.store._reserve_attempts(((identity, 15),))
                return 200
            except app.ApiError as error:
                return error.status
        with ThreadPoolExecutor(max_workers=24) as pool:
            outcomes = list(pool.map(reserve, range(40)))
        self.assertEqual(outcomes.count(200), 15)
        self.assertEqual(outcomes.count(429), 25)
        with self.store.connect() as db:
            self.assertEqual(db.execute('SELECT attempts FROM login_attempts WHERE identity=?', (identity,)).fetchone()[0], 15)

    def test_rate_record_growth_is_bounded_and_window_recovers(self):
        with self.store.connect() as db:
            db.executemany('INSERT INTO login_attempts VALUES(?,?,?)', [('capacity-' + str(i), 1, time.time()) for i in range(5000)])
        with self.assertRaises(app.ApiError) as error:
            self.store._reserve_attempts(((app.rate_identity('ip', 'new-ip'), 30),))
        self.assertEqual(error.exception.status, 429)
        with patch.object(app.time, 'time', return_value=time.time() + 901):
            self.store._reserve_attempts(((app.rate_identity('ip', 'new-ip'), 30),))
        with self.store.connect() as db:
            self.assertEqual(db.execute('SELECT COUNT(*) FROM login_attempts').fetchone()[0], 1)

    def test_authentication_computations_have_separate_concurrency_bound(self):
        self.assertTrue(self.store._auth_workers.acquire(False))
        self.assertTrue(self.store._auth_workers.acquire(False))
        self.assertFalse(self.store._auth_workers.acquire(False))
        try:
            with patch.object(self.store, '_verify_password', side_effect=AssertionError('hashing should not start')):
                self.assertEqual(self.login('root', 'wrong')[0], 429)
            self.assertEqual(self.request('health')[0], 200)
        finally:
            self.store._auth_workers.release()
            self.store._auth_workers.release()
        self.assertEqual(self.login('root', 'test-password-123')[0], 200)

    def test_nonexistent_and_disabled_accounts_still_verify_hash(self):
        with patch.object(self.store, '_verify_password', return_value=False) as verify:
            self.assertEqual(self.login('nonexistent', 'wrong')[0], 401)
            self.assertEqual(verify.call_count, 1)
            self.assertEqual(verify.call_args[0][1], self.store._dummy_password)
        with self.store.connect() as db:
            db.execute('UPDATE users SET enabled=0 WHERE username=?', ('root',))
        with patch.object(self.store, '_verify_password', return_value=True) as verify:
            self.assertEqual(self.login('root', 'test-password-123')[0], 401)
            self.assertEqual(verify.call_count, 1)

    def test_personal_password_failure_throttling_and_session_revocation(self):
        _, other = self.login('root', 'test-password-123')
        with patch.object(self.store, '_verify_password', return_value=False):
            for _ in range(8):
                self.assertEqual(self.request('auth/password', {'currentPassword': 'wrong', 'newPassword': GOOD_PASSWORD}, self.admin)[0], 400)
            self.assertEqual(self.request('auth/password', {'currentPassword': 'wrong', 'newPassword': GOOD_PASSWORD}, self.admin)[0], 429)
        with patch.object(app.time, 'time', return_value=time.time() + 901):
            self.assertEqual(self.request('auth/password', {'currentPassword': 'test-password-123', 'newPassword': GOOD_PASSWORD}, self.admin)[0], 200)
        self.assertEqual(self.request('state', session=other)[0], 401)
        self.assertEqual(self.request('state', session=self.admin)[0], 200)
        self.assertEqual(self.login('root', GOOD_PASSWORD)[0], 200)

    def test_concurrent_reset_cannot_be_overwritten_by_stale_password_change(self):
        token = self.admin['cookie'].split('=', 1)[1]
        stale = self.store.auth(token)
        replacement = app.password_hash('independent-replacement-84')
        with self.store.connect() as db:
            db.execute('UPDATE users SET password=? WHERE id=?', (replacement, stale['id']))
        with self.assertRaises(app.ApiError) as error:
            self.store.change_password(stale, 'test-password-123', GOOD_PASSWORD, token)
        self.assertEqual(error.exception.status, 401)
        with self.store.connect() as db:
            self.assertEqual(db.execute('SELECT password FROM users WHERE id=?', (stale['id'],)).fetchone()[0], replacement)

    def test_sessions_store_hashes_and_hash_itself_cannot_be_replayed(self):
        token = self.admin['cookie'].split('=', 1)[1]
        with self.store.connect() as db:
            stored = db.execute('SELECT token FROM sessions').fetchone()[0]
        self.assertEqual(stored, app.session_key(token))
        self.assertNotEqual(stored, token)
        self.assertEqual(self.store.auth(token)['username'], 'root')
        with self.assertRaises(app.ApiError) as error:
            self.store.auth(stored)
        self.assertEqual(error.exception.status, 401)
        self.request('auth/logout', {}, self.admin)
        self.assertEqual(self.request('state', session=self.admin)[0], 401)

    def test_duplicate_json_deep_json_and_huge_structure_rejected_atomically(self):
        original = self.store.read()
        payloads = [b'{"changes":[],"changes":[]}',
                    ('{"changes":[],"extra":' + '[' * 60 + '0' + ']' * 60 + '}').encode('ascii'),
                    json.dumps({'changes': [], 'extra': [0] * 100001}).encode('ascii'),
                    json.dumps({'changes': [], 'x' * 201: 'unused'}).encode('ascii')]
        for payload in payloads:
            code, body, _ = self.raw_request('sync', payload)
            self.assertEqual(code, 400)
            self.assertNotIn(b'Traceback', body)
            self.assertEqual(self.store.read(), original)
        self.assertEqual(self.request('sync', {'changes': []}, self.admin)[0], 200)

    def test_huge_decimal_integer_rejected_before_expensive_conversion(self):
        # Prove the oversized branch rejects before calling int(), including
        # on Python 3.6 where decimal conversion has no default digit limit.
        with patch.object(app, 'int', side_effect=AssertionError('integer conversion started'), create=True):
            with self.assertRaises(ValueError):
                app.json_integer_literal('9' * 10000)
            with self.assertRaises(ValueError):
                app.json_integer_literal('-' + '9' * 10000)
        self.assertEqual(app.json_integer_literal('9007199254740991'), 9007199254740991)
        self.assertEqual(app.json_integer_literal('-9007199254740991'), -9007199254740991)
        for literal in ['9007199254740992', '-9007199254740992']:
            with self.assertRaises(ValueError):
                app.json_integer_literal(literal)
        original = self.store.read()
        payload = b'{"changes":[],"extra":' + b'9' * 10000 + b'}'
        self.assertEqual(self.raw_request('sync', payload)[0], 400)
        self.assertEqual(self.store.read(), original)

    def test_content_type_login_body_limit_and_nonascii_csrf(self):
        self.assertEqual(self.raw_request('auth/login', b'{}', {'Content-Type': 'application/jsonp'}, False)[0], 415)
        self.assertEqual(self.raw_request('auth/login', b'{}', {'Content-Length':'4000001'}, False)[0], 413)
        self.assertEqual(self.raw_request('admin/users', b'{}', {'Content-Length':'4000001'})[0], 413)
        self.assertEqual(self.raw_request('sync', b'{"changes":[]}', {'X-CSRF-Token': '\u00e9'})[0], 403)
        self.assertEqual(self.raw_request('sync', b'{"changes":[]}', {'Sec-Fetch-Site': 'cross-site'})[0], 403)
        self.assertEqual(self.raw_request('sync', b'{"changes":[]}', {'Origin': 'null'})[0], 403)

    def test_invalid_unicode_and_control_identifiers_return_400(self):
        original = self.store.read()
        for payload in [b'{"changes":[],"extra":"\\ud800"}',
                        b'{"changes":[],"\\ud800":"extra"}']:
            self.assertEqual(self.raw_request('sync', payload)[0], 400)
            self.assertEqual(self.store.read(), original)
        for identifier in ['bad\x00id', 'bad\rid', 'bad\nid', 'bad\x7fid']:
            self.assertEqual(self.request('sync', {'changes': [self.change(shared.order(identifier))]}, self.admin)[0], 400)
            self.assertEqual(self.store.read(), original)
        malformed = shared.order('malformed')
        malformed['id'] = ['invalid-id-type']
        self.assertEqual(self.request('migrate', {'state': {'orders': [malformed]}}, self.admin)[0], 400)
        self.assertEqual(self.store.read(), original)
        # Unicode and quoted opaque identifiers remain supported.
        self.assertEqual(self.request('sync', {'changes': [self.change(shared.order('自定义"订单'))]}, self.admin)[0], 200)

    def test_ambiguous_content_length_and_transfer_encoding_rejected(self):
        # Direct loopback request verifies backend guard in addition to nginx.
        for extras in [b'Content-Length: 2\r\nContent-Length: 2\r\n',
                       b'Content-Length: 2\r\nTransfer-Encoding: chunked\r\n']:
            with socket.create_connection(('127.0.0.1', self.server.server_port), timeout=5) as connection:
                connection.sendall(b'POST /api/auth/login HTTP/1.0\r\nHost: isolated.invalid\r\nContent-Type: application/json\r\n' + extras + b'\r\n{}')
                response = connection.recv(8192)
            self.assertTrue(response.startswith(b'HTTP/1.0 400 '), response)

    def test_sql_injection_is_data_and_sensitive_fields_never_public(self):
        self.assertEqual(self.login("root' OR 1=1 --", 'wrong')[0], 401)
        malicious = shared.order("x'; DROP TABLE users; --")
        malicious.update(creatorUsername='forged-admin', password='forged', role='admin')
        code, result = self.request('sync', {'changes': [self.change(malicious)]}, self.admin)
        self.assertEqual(code, 200)
        record = result['state']['orders'][0]
        for field in ('password', 'role', 'creatorUsername'):
            self.assertNotIn(field, record)
        self.assertEqual(self.request('admin/orders?q=%27%20OR%201%3D1%20--', session=self.admin)[1]['total'], 0)
        public = self.request('auth/me', session=self.admin)[1]['user']
        self.assertNotIn('password', public)
        self.assertNotIn('csrf', public)
        self.assertEqual(self.request('admin/users', session=self.admin)[1]['users'][0]['username'], 'root')

    def test_http_error_and_invalid_uri_do_not_leak_runtime_or_state(self):
        code, raw, headers = self.raw_request('not-found', b'{}', authenticated=False)
        self.assertEqual(code, 401)
        self.assertNotIn('Python', headers.get('Server', ''))
        self.assertNotIn(b'Traceback', raw)
        self.assertEqual(self.request('admin/orders?' + '&'.join('q=x' for _ in range(21)), session=self.admin)[0], 400)
        self.assertEqual(self.request('state?' + 'x' * 4100, session=self.admin)[0], 414)


if __name__ == '__main__':
    unittest.main(verbosity=2)
