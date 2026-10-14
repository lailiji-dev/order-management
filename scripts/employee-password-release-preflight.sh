#!/usr/bin/env bash
set -euo pipefail
systemctl is-active peiliao-shared.service peiliao-backup.timer
test "$(systemctl show peiliao-shared.service -p User --value)" = peiliao
firewall-cmd --zone=peiliao-secure --query-port=8977/tcp
firewall-cmd --permanent --zone=peiliao-secure --query-port=8977/tcp
/usr/bin/python3 - <<'PY'
import hashlib,sqlite3
from pathlib import Path
app=Path('/www/server/peiliao-app/app.py')
print('Current deployed API source digest',hashlib.sha256(app.read_bytes()).hexdigest())
db=sqlite3.connect('file:/www/server/peiliao-app/data/peiliao.sqlite3?mode=ro',uri=True)
assert db.execute('PRAGMA integrity_check').fetchone()[0]=='ok'
print('PASS target SQLite integrity; accounts',db.execute('SELECT count(*) FROM users').fetchone()[0],'business records',db.execute('SELECT count(*) FROM entities').fetchone()[0])
db.close()
PY
curl --fail --silent https://YOUR_APP_DOMAIN/api/health | /usr/bin/python3 -c 'import json,sys;data=json.load(sys.stdin);assert data["version"]==4 and data["ok"];print("PASS public production API v4")'
echo 'PASS target service, storage and requested panel access policy verified before release'
