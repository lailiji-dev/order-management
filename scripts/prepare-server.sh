#!/usr/bin/env bash
set -euo pipefail
umask 077
stamp=$(date -u +%Y%m%dT%H%M%SZ)
backup="/root/peiliao-backup-$stamp"
mkdir "$backup"
tar -czf "$backup/site-before.tar.gz" -C /www/wwwroot YOUR_APP_DOMAIN
cp -a /www/server/panel/vhost/nginx/YOUR_APP_DOMAIN.conf "$backup/"
cp -a /www/server/panel/ssl "$backup/panel-ssl-before"
mkdir -p /root/peiliao-upload
printf '%s\n' "$backup" > /root/peiliao-upload/backup-path.txt
printf 'Backup complete: %s\n' "$backup"
