#!/usr/bin/env bash
set -euo pipefail
printf 'RUNTIME\n'
/usr/bin/python3 --version
systemctl is-active peiliao-shared.service peiliao-backup.timer
systemctl show peiliao-shared.service -p MemoryCurrent -p TasksCurrent -p MainPID
df -h /www/server/peiliao-app
printf '\nDATABASE SUMMARY (NO CUSTOMER DATA)\n'
/usr/bin/python3 - <<'PY'
import os,sqlite3,json
path='/www/server/peiliao-app/data/peiliao.sqlite3'
db=sqlite3.connect('file:'+path+'?mode=ro',uri=True)
row=db.execute('SELECT body,revision,next_number,initialized FROM app_state WHERE id=1').fetchone()
state=json.loads(row[0])
print(json.dumps({'sqlite':sqlite3.sqlite_version,'database_bytes':os.path.getsize(path),
 'snapshot_bytes':len(row[0].encode('utf-8')),'orders':len(state.get('orders',[])),
 'products':len(state.get('products',[])),'categories':len(state.get('categories',[])),
 'users':db.execute('SELECT COUNT(*) FROM users').fetchone()[0],
 'audit':db.execute('SELECT COUNT(*) FROM audit').fetchone()[0],
 'revision':row[1],'next_number':row[2],'initialized':bool(row[3])},ensure_ascii=False))
db.close()
PY
printf '\nCOMPRESSION CONFIG\n'
rg -n 'gzip|open_file_cache|keepalive_timeout|worker_processes|worker_connections' /www/server/nginx/conf/nginx.conf || true
printf '\nCURRENT SITE EXTENSION\n'
cat /www/server/panel/vhost/nginx/extension/YOUR_APP_DOMAIN/peiliao-shared.conf
printf '\nPUBLIC TRANSFER BASELINE\n'
for route in / /shared.js /admin.html /api/health; do
  printf '%s ' "$route"
  curl --fail --silent --resolve YOUR_APP_DOMAIN:443:127.0.0.1 --compressed -o /dev/null -w 'status=%{http_code} ttfb=%{time_starttransfer}s bytes=%{size_download}\n' "https://YOUR_APP_DOMAIN$route"
done
printf '\nSITE ARTIFACT HASHES\n'
sha256sum /www/wwwroot/YOUR_APP_DOMAIN/index.html /www/wwwroot/YOUR_APP_DOMAIN/shared.js /www/server/peiliao-app/app.py
