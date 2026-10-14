"""Server-side credential rotation; secrets arrive only on SSH standard input."""
import contextlib
import io
import json
import os
from pathlib import Path
import subprocess
import sys

payload = json.load(sys.stdin)
mode = sys.argv[1]
for name, value in payload.items():
    minimum = 1 if mode in ('verifywebsite', 'verifyaccountfeatures', 'verifyloginaudit', 'verifycalcpermissions', 'verifyordercontrols') else 30
    if not isinstance(value, str) or not minimum <= len(value) <= 200 or '\n' in value or ':' in value:
        raise SystemExit('Invalid generated credential payload')

if mode == 'host':
    subprocess.run(['chpasswd'], input=('root:' + payload['serverPassword'] + '\n').encode('utf-8'), check=True)
    os.chdir('/www/server/panel')
    sys.path.insert(0, '/www/server/panel')
    sys.path.insert(0, '/www/server/panel/class')
    with contextlib.redirect_stdout(io.StringIO()):
        import importlib.util
        panel_tools_spec = importlib.util.spec_from_file_location('panel_root_tools', '/www/server/panel/tools.py')
        tools = importlib.util.module_from_spec(panel_tools_spec)
        panel_tools_spec.loader.exec_module(tools)
        import public
        tools.set_panel_pwd(payload['panelPassword'], False)
        expected = public.password_salt(public.md5(payload['panelPassword']), uid=1)
        stored = public.M('users').where('id=?', (1,)).getField('password')
        assert stored == expected, 'Panel password update failed'
    session_root = Path('/www/server/panel/data/session')
    if session_root.is_dir():
        for file in session_root.iterdir():
            if file.is_file() and not file.is_symlink():
                file.unlink()
    print('PASS console-root and panel credentials rotated; panel sessions invalidated')
elif mode == 'verifypanel':
    os.chdir('/www/server/panel')
    sys.path.insert(0, '/www/server/panel/class')
    with contextlib.redirect_stdout(io.StringIO()):
        import public
        assert public.M('users').where('id=?',(1,)).getField('username') == '33b43edf'
        expected = public.password_salt(public.md5(payload['panelPassword']),uid=1)
        assert public.M('users').where('id=?',(1,)).getField('password') == expected
    print('PASS retained panel username and new encrypted local credential match active panel authentication')
elif mode == 'website':
    import importlib.util
    import sqlite3
    module_path = '/www/server/peiliao-app/app.py'
    spec = importlib.util.spec_from_file_location('secure_api', module_path)
    api = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(api)
    hashed = api.password_hash(payload['websitePassword'])
    with sqlite3.connect('/www/server/peiliao-app/data/peiliao.sqlite3') as db:
        row = db.execute("SELECT id,username FROM users WHERE username='root' AND role='admin'").fetchone()
        assert row, 'Existing root administrator missing'
        db.execute('UPDATE users SET password=? WHERE id=?', (hashed, row[0]))
        db.execute('DELETE FROM sessions WHERE user_id=?', (row[0],))
        db.execute('DELETE FROM login_attempts')
        db.execute('INSERT INTO audit(user_id,username,action,occurred_at) VALUES(?,?,?,?)',
                   (row[0], row[1], '安全维护：轮换管理员凭据', api.now()))
    print('PASS website root credential rotated; existing employee accounts retained')
elif mode in ('verifywebsite', 'verifyaccountfeatures', 'verifyloginaudit', 'verifycalcpermissions', 'verifyordercontrols'):
    import hashlib
    import sqlite3
    import time
    from urllib.request import Request, urlopen
    from urllib.error import HTTPError
    origin = 'https://YOUR_APP_DOMAIN'
    request = Request(origin + '/api/auth/login',
                      data=json.dumps({'username':'root','password':payload['websitePassword']}).encode('utf-8'),
                      headers={'Content-Type':'application/json','Origin':origin})
    login_started = time.time()
    with urlopen(request, timeout=20) as response:
        assert response.status == 200
        cookie = response.headers['Set-Cookie'].split(';')[0]
        flags = response.headers['Set-Cookie'].lower()
        assert 'secure' in flags and 'httponly' in flags and 'samesite=lax' in flags
        assert 'max-age=2592000' in [part.strip().lower() for part in response.headers['Set-Cookie'].split(';')[1:]]
        account = json.load(response)
    print('PASS new-password HTTPS login')
    csrf = account['csrf']
    headers = {'Cookie':cookie,'X-CSRF-Token':csrf,'Origin':origin,'Content-Type':'application/json'}
    try:
        key='sha256:'+hashlib.sha256(cookie.split('=',1)[1].encode('utf-8')).hexdigest()
        with sqlite3.connect('file:/www/server/peiliao-app/data/peiliao.sqlite3?mode=ro',uri=True) as db:
            expiry=db.execute('SELECT expires FROM sessions WHERE token=?',(key,)).fetchone()[0]
            assert login_started+2592000 <= expiry <= time.time()+2592000
        print('PASS live persistent cookie and server session both expire 30 days after login')
        with urlopen(Request(origin + '/api/auth/me', headers=headers), timeout=20) as response:
            identity=json.load(response)
            assert identity['user']['username']=='root' and identity['user']['role']=='admin'
        print('PASS authenticated identity')
        with urlopen(Request(origin + '/api/state', headers=headers), timeout=20) as response:
            state=json.load(response); etag=response.headers['ETag']
            assert 'orders' in state['state'] and 'products' in state['state']
        print('PASS authenticated shared state')
        try:
            urlopen(Request(origin + '/api/state', headers=dict(headers, **{'If-None-Match':etag})), timeout=20)
            raise AssertionError('Conditional state request did not return 304')
        except HTTPError as error:assert error.code==304
        with urlopen(Request(origin + '/api/admin/users', headers=headers), timeout=20) as response:
            assert response.status==200
            users=json.load(response)['users']
        if mode == 'verifyordercontrols':
            with urlopen(Request(origin + '/api/admin/prices', headers=headers),timeout=20) as response:
                products=json.load(response)['products']
            assert all(isinstance(p['price'],int) and p['price'] >= 0 and 'recipe' not in p for p in products)
            for body in (None,b'{"changes":[]}'):
                try:
                    urlopen(Request(origin + '/api/admin/prices',data=body,
                                    headers={'Content-Type':'application/json','Origin':origin}),timeout=20)
                    raise AssertionError('Unauthenticated price access accepted')
                except HTTPError as error:assert error.code==401
            with sqlite3.connect('file:/www/server/peiliao-app/data/peiliao.sqlite3?mode=ro',uri=True) as db:
                assert db.execute('PRAGMA integrity_check').fetchone()[0]=='ok'
                assert db.execute("SELECT 1 FROM sqlite_master WHERE type='index' AND name='entities_custom_number'").fetchone()
            print('PASS live admin prices are accessible only when authenticated; recipe fields excluded; SQLite integrity and number index valid; no prices or orders changed')
        if mode == 'verifycalcpermissions':
            assert all(isinstance(user.get('canCalculate'),bool) for user in users)
            assert state['permissions']['canCalculate']==identity['user']['canCalculate']
            invalid=json.dumps({'id':identity['user']['id'],'canCalculate':'invalid'}).encode('utf-8')
            try:
                urlopen(Request(origin + '/api/admin/users/permissions',data=invalid,headers=headers),timeout=20)
                raise AssertionError('Invalid permission value accepted')
            except HTTPError as error:assert error.code==400
            try:
                urlopen(Request(origin + '/api/admin/users/permissions',data=b'{"id":1,"canCalculate":false}',
                                headers={'Content-Type':'application/json','Origin':origin}),timeout=20)
                raise AssertionError('Unauthenticated permission update accepted')
            except HTTPError as error:assert error.code==401
            with sqlite3.connect('file:/www/server/peiliao-app/data/peiliao.sqlite3?mode=ro',uri=True) as db:
                assert db.execute('PRAGMA integrity_check').fetchone()[0]=='ok'
                assert db.execute('SELECT count(*) FROM user_permissions WHERE can_calculate NOT IN (0,1)').fetchone()[0]==0
            print('PASS live user permissions and state visibility agree; endpoint rejects invalid and unauthenticated changes; no permissions changed')
        if mode == 'verifyloginaudit':
            with urlopen(Request(origin + '/api/admin/audit', headers=headers), timeout=20) as response:
                audit = json.load(response)['audit']
            login_event = next(row for row in audit if row['username']=='root' and row['action']=='登录成功')
            assert login_event['user_id']==identity['user']['id'] and login_event['occurred_at'].endswith('Z')
            assert login_event['order_no'] is None
            serialized=json.dumps(audit)
            assert payload['websitePassword'] not in serialized and csrf not in serialized and cookie.split('=',1)[1] not in serialized
            print('PASS live administrator login appears in recent audit with account, time and result; no credentials recorded')
        if mode == 'verifyaccountfeatures':
            body=json.dumps({'id':identity['user']['id']}).encode('utf-8')
            try:
                urlopen(Request(origin + '/api/admin/users/delete',data=body,headers=headers),timeout=20)
                raise AssertionError('Administrator deletion was accepted')
            except HTTPError as error:
                assert error.code==400
                assert '管理员账号不能删除' in json.load(error)['error']
            try:
                urlopen(Request(origin + '/api/admin/users/delete',data=body,headers={'Cookie':cookie,'Content-Type':'application/json','Origin':origin}),timeout=20)
                raise AssertionError('Missing CSRF protection on deletion')
            except HTTPError as error:assert error.code==403
            print('PASS deployed employee deletion endpoint protects administrator and rejects missing CSRF; no employee deleted')
        try:
            urlopen(Request(origin + '/api/sync', data=b'{}', headers={'Cookie':cookie,'Content-Type':'application/json','Origin':origin}),timeout=20)
            raise AssertionError('Missing CSRF protection')
        except HTTPError as error:assert error.code==403
    finally:
        with urlopen(Request(origin + '/api/auth/logout', data=b'{}', headers=headers), timeout=20) as response:
            assert response.status==200
    try:
        urlopen(Request(origin + '/api/state',headers={'Cookie':cookie}),timeout=20)
        raise AssertionError('Logged-out session remains active')
    except HTTPError as error:assert error.code==401
    if mode == 'verifyloginaudit':
        import sqlite3
        with sqlite3.connect('file:/www/server/peiliao-app/data/peiliao.sqlite3?mode=ro',uri=True) as db:
            assert db.execute('SELECT 1 FROM audit WHERE id>? AND user_id=? AND action=?',
                              (login_event['id'],identity['user']['id'],'退出登录')).fetchone()
        print('PASS live logout is persisted in audit and its session is revoked')
    print('PASS HTTPS new-password login, admin permission, secure cookie, state/304, CSRF rejection and logout revocation')
else:
    raise SystemExit('Unsupported rotation mode')
