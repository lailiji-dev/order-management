#!/usr/bin/env bash
set -euo pipefail
test "$(sha256sum /www/server/peiliao-app/app.py | cut -d' ' -f1)" = "$(sha256sum /root/peiliao-security/v4/package/server/app.py | cut -d' ' -f1)"
/usr/bin/python3 - <<'PY'
import importlib.util,re,sqlite3
from urllib.request import urlopen
spec=importlib.util.spec_from_file_location('released_api','/www/server/peiliao-app/app.py')
api=importlib.util.module_from_spec(spec);spec.loader.exec_module(api)
assert api.LOGIN_FAILURE_LIMIT==10 and api.LOGIN_LOCK_SECONDS==3600
with urlopen('https://YOUR_APP_DOMAIN/admin.html',timeout=15) as response:page=response.read().decode('utf-8')
assert '连续输错密码 10 次后，账号锁定 1 小时' in page
asset=re.search(r'<script defer src="([^"]+)"',page).group(1)
with urlopen('https://YOUR_APP_DOMAIN'+asset,timeout=15) as response:code=response.read().decode('utf-8')
assert 'data-delete' in code and 'admin/users/delete' in code
db=sqlite3.connect('file:/www/server/peiliao-app/data/peiliao.sqlite3?mode=ro',uri=True)
assert db.execute('PRAGMA integrity_check').fetchone()[0]=='ok'
print('PASS public deletion control and deployed 10-failure/3600-second policy; storage integrity')
for table in ('users','deleted_users','account_login_failures'):
    print('Aggregate',table,db.execute('SELECT count(*) FROM '+table).fetchone()[0])
db.close()
PY
systemctl is-active peiliao-shared.service peiliao-backup.timer
firewall-cmd --zone=peiliao-secure --query-port=8977/tcp
firewall-cmd --permanent --zone=peiliao-secure --query-port=8977/tcp
echo 'PASS services and requested unrestricted panel source IP policy retained'
