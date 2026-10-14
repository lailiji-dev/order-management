"""Change only the website root credential explicitly chosen by the owner."""
import importlib.util
import json
import os
from pathlib import Path
import sqlite3
import sys
import time

payload = json.load(sys.stdin)
assert set(payload) == {'websitePassword'}
password = payload['websitePassword']
assert isinstance(password, str) and 8 <= len(password) <= 200
assert '\n' not in password and '\r' not in password
os.umask(0o077)

def other_credentials():
    root = next(line for line in Path('/etc/shadow').read_text().splitlines() if line.startswith('root:'))
    with sqlite3.connect('file:/www/server/panel/data/db/panel.db?mode=ro', uri=True) as db:
        panel = db.execute('SELECT * FROM users ORDER BY id').fetchall()
    return root, panel

before_credentials = other_credentials()
spec = importlib.util.spec_from_file_location('website_api', '/www/server/peiliao-app/app.py')
api = importlib.util.module_from_spec(spec)
spec.loader.exec_module(api)
hashed = api.password_hash(password)
path = '/www/server/peiliao-app/data/peiliao.sqlite3'
with sqlite3.connect(path, timeout=30) as db:
    db.execute('PRAGMA busy_timeout=30000')
    target = db.execute("SELECT id,username FROM users WHERE username='root' AND role='admin'").fetchone()
    assert target, 'Website root administrator missing'
    backup_path = '/root/peiliao-security/website-password-before-' + str(time.time_ns()) + '.sqlite3'
    with sqlite3.connect(backup_path) as backup:
        db.backup(backup)
    db.execute('BEGIN IMMEDIATE')
    other_users = db.execute('SELECT * FROM users WHERE id<>? ORDER BY id', (target[0],)).fetchall()
    entities = db.execute('SELECT * FROM entities ORDER BY rowid').fetchall()
    changed = db.execute('UPDATE users SET password=? WHERE id=?', (hashed, target[0])).rowcount
    assert changed == 1
    db.execute('DELETE FROM sessions WHERE user_id=?', (target[0],))
    db.execute('INSERT INTO audit(user_id,username,action,occurred_at) VALUES(?,?,?,?)',
               (target[0], target[1], '管理员维护：按用户要求修改网站管理员密码', api.now()))
    assert db.execute('SELECT * FROM users WHERE id<>? ORDER BY id', (target[0],)).fetchall() == other_users
    assert db.execute('SELECT * FROM entities ORDER BY rowid').fetchall() == entities
    assert api.password_ok(password, db.execute('SELECT password FROM users WHERE id=?', (target[0],)).fetchone()[0])
assert other_credentials() == before_credentials, 'Unrelated server or panel credential changed'
print('PASS only website root password changed; root website sessions revoked')
print('PASS server root, panel accounts, employee accounts and business records unchanged')
