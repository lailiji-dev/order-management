#!/usr/bin/env bash
set -euo pipefail
site=/www/wwwroot/YOUR_APP_DOMAIN
stage=/root/peiliao-upload/v2
backup=/root/peiliao-v2-backup-$(date -u +%Y%m%dT%H%M%SZ)
test -f "$site/index.html"
id www >/dev/null
mkdir -p "$stage" "$backup"
chmod 700 "$backup"
tar -czf "$backup/site-before.tar.gz" -C "$site" .
cp -a /www/server/panel/vhost/nginx/YOUR_APP_DOMAIN.conf "$backup/site-nginx.conf"
if test -d /www/server/panel/vhost/nginx/extension/YOUR_APP_DOMAIN; then
  cp -a /www/server/panel/vhost/nginx/extension/YOUR_APP_DOMAIN "$backup/nginx-extension"
fi
if test -d /www/server/peiliao-app; then
  systemctl stop peiliao-shared.service
  tar -czf "$backup/shared-app-before.tar.gz" -C /www/server peiliao-app
  systemctl start peiliao-shared.service
fi
printf '%s\n' "$backup" > "$stage/last-backup"
printf 'Backup saved: %s\n' "$backup"
