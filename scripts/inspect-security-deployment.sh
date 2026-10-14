#!/usr/bin/env bash
set -euo pipefail
printf 'CURRENT APPLICATION UNITS\n'
systemctl cat peiliao-shared.service peiliao-backup.service peiliao-backup.timer
printf '\nCURRENT VHOST\n'
cat /www/server/panel/vhost/nginx/YOUR_APP_DOMAIN.conf
printf '\nCURRENT APP NGINX\n'
cat /www/server/panel/vhost/nginx/extension/YOUR_APP_DOMAIN/peiliao-shared.conf
printf '\nGLOBAL NGINX STRUCTURE\n'
grep -nE 'include|listen.*888|ssl_protocols|user |http |log_format' /www/server/nginx/conf/nginx.conf
printf '\nMYSQL SERVICE AND BIND CONFIG\n'
systemctl list-unit-files 'mysql*' 'mysqld*'
grep -nE '^\[|^bind.address|^port|^skip.networking|^socket' /etc/my.cnf
printf '\nAPP/SITE PERMISSIONS\n'
stat -c '%a %U:%G %n' /www/server/peiliao-app /www/server/peiliao-app/data /www/server/peiliao-app/backups /www/wwwroot/YOUR_APP_DOMAIN
lsattr /www/wwwroot/YOUR_APP_DOMAIN/.user.ini 2>/dev/null || true
printf '\nPANEL USER IDS (NO HASHES)\n'
/usr/bin/python3 - <<'PY'
import sqlite3
db=sqlite3.connect('file:/www/server/panel/data/default.db?mode=ro',uri=True)
for row in db.execute('select id,username,length(password) from users'):print(row)
PY
