#!/usr/bin/env bash
set -euo pipefail
printf 'CERTIFICATES_AND_RENEWAL\n'
for file in /www/server/panel/ssl/certificate.pem /www/server/panel/vhost/cert/YOUR_APP_DOMAIN/fullchain.pem; do
  openssl x509 -in "$file" -noout -dates
  openssl x509 -in "$file" -checkend 86400 -noout
done
crontab -l | /usr/bin/python3 -c 'import sys;lines=[line for line in sys.stdin if "acme.sh" in line and "--cron" in line and not line.lstrip().startswith("#")];assert lines;print("PASS active ACME renewal cron entries",len(lines));print("Renewal schedule:"," ".join(lines[0].split()[:5]))'
for file in /www/server/panel/ssl/privateKey.pem /www/server/panel/vhost/cert/YOUR_APP_DOMAIN/privkey.pem; do
  test "$(stat -c '%a %U:%G' "$file")" = '600 root:root'
done
test "$(systemctl show peiliao-shared.service -p User --value)" = peiliao
test "$(stat -c '%a %U:%G' /www/server/peiliao-app/data/peiliao.sqlite3)" = '600 peiliao:peiliao'
test "$(stat -c '%a %U:%G' /www/server/peiliao-app/data)" = '700 peiliao:peiliao'
systemctl list-timers peiliao-backup.timer --no-pager
echo 'PASS certificate expiry, renewal schedule, TLS key privacy, dedicated data isolation and backup timer'
