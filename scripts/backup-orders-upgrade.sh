#!/usr/bin/env bash
set -euo pipefail
umask 077
test -d /www/wwwroot/YOUR_APP_DOMAIN
grep -q 'server_name YOUR_APP_DOMAIN;' /www/server/panel/vhost/nginx/YOUR_APP_DOMAIN.conf
stamp=$(date -u +%Y%m%dT%H%M%SZ)
backup="/root/peiliao-orders-backup-$stamp"
mkdir "$backup"
tar -czf "$backup/site-before.tar.gz" -C /www/wwwroot YOUR_APP_DOMAIN
cp -a /www/server/panel/vhost/nginx/YOUR_APP_DOMAIN.conf "$backup/"
printf '%s\n' "$backup" > /root/peiliao-upload/orders-backup-path.txt
printf 'Orders upgrade backup: %s\n' "$backup"
sha256sum /www/wwwroot/YOUR_APP_DOMAIN/index.html
