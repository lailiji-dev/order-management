#!/usr/bin/env bash
set -euo pipefail
systemctl is-active peiliao-shared.service peiliao-backup.timer
systemctl show peiliao-shared.service -p MemoryCurrent -p TasksCurrent -p MainPID -p TasksMax -p LimitNOFILE
/www/server/nginx/sbin/nginx -t
curl --fail --silent http://127.0.0.1:4188/api/health
printf '\nStorage metadata (no customer data)\n'
/usr/bin/python3 /root/peiliao-upload/v3/database-fingerprint.py /www/server/peiliao-app/data/peiliao.sqlite3
stat -c '%a %U:%G %n' /www/server/peiliao-app/data/peiliao.sqlite3 /www/server/peiliao-app/backups
printf '\nLatest database backup\n'
latest=$(find /www/server/peiliao-app/backups -maxdepth 1 -name '*.sql.gz' -printf '%p\n' | sort | tail -n 1)
test -n "$latest"
gzip -t "$latest"
stat -c '%a %U:%G %s bytes %n' "$latest"
systemctl list-timers peiliao-backup.timer --no-pager
printf '\nAPI recent service log\n'
journalctl -u peiliao-shared.service -n 6 --no-pager
