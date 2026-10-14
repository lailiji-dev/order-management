#!/usr/bin/env bash
set -euo pipefail
test "$(sha256sum /www/server/peiliao-app/app.py | cut -d' ' -f1)" = "$(sha256sum /root/peiliao-security/v4/package/server/app.py | cut -d' ' -f1)"
/usr/bin/python3 - <<'PY'
import importlib.util,re,sqlite3
from urllib.request import urlopen
spec=importlib.util.spec_from_file_location('released_api','/www/server/peiliao-app/app.py')
api=importlib.util.module_from_spec(spec);spec.loader.exec_module(api)
assert api.text('x'*12000,None)=='x'*12000
assert api.text('员工姓名'*1500,None)=='员工姓名'*1500
with urlopen('https://YOUR_APP_DOMAIN/admin.html',timeout=15) as response:page=response.read().decode('utf-8')
account=re.search(r'<input\s[^>]*id="newUsername"[^>]*>',page).group(0)
name=re.search(r'<input\s[^>]*id="newName"[^>]*>',page).group(0)
assert 'maxlength' not in account and 'minlength' not in account
assert 'pattern="[A-Za-z0-9_.\\-]+"' in account
assert 'maxlength' not in name and 'minlength' not in name
assert 'required' in account and 'required' in name
with sqlite3.connect('file:/www/server/peiliao-app/data/peiliao.sqlite3?mode=ro',uri=True) as db:
    assert db.execute('PRAGMA integrity_check').fetchone()[0]=='ok'
    print('PASS existing account count',db.execute('SELECT count(*) FROM users').fetchone()[0])
print('PASS live forms and deployed account/name validation have no fixed field length limits')
PY
systemctl is-active peiliao-shared.service peiliao-backup.timer
firewall-cmd --zone=peiliao-secure --query-port=8977/tcp
firewall-cmd --permanent --zone=peiliao-secure --query-port=8977/tcp
