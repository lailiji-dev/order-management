#!/usr/bin/env bash
set -euo pipefail
systemctl is-active peiliao-shared.service peiliao-backup.timer
systemctl show peiliao-shared.service -p User -p Group -p MainPID
ss -lntp '( sport = :4188 )'
stat -c '%a %U:%G %n' /www/server/peiliao-app/data /www/server/peiliao-app/data/peiliao.sqlite3 /www/server/peiliao-app/backups
find /www/server/peiliao-app/backups -maxdepth 1 -name '*.sql.gz' -printf '%f\n'
systemctl list-timers peiliao-backup.timer --no-pager
/www/server/nginx/sbin/nginx -t
journalctl -u peiliao-shared.service -n 6 --no-pager
