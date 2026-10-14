#!/usr/bin/env bash
set -euo pipefail
conf=/www/server/panel/vhost/nginx/panel-ip-acme.conf
root=/www/wwwroot/YOUR_SERVER_HOST
test ! -e "$conf"
mkdir -p "$root/.well-known/acme-challenge"
chmod 0755 "$root" "$root/.well-known" "$root/.well-known/acme-challenge"
cat > "$conf" <<'NGINX'
server {
    listen 80;
    server_name YOUR_SERVER_HOST;
    root /www/wwwroot/YOUR_SERVER_HOST;
    location ^~ /.well-known/acme-challenge/ {
        default_type text/plain;
        try_files $uri =404;
    }
    location / { return 404; }
    access_log /www/wwwlogs/panel-ip-acme.log;
    error_log /www/wwwlogs/panel-ip-acme.error.log;
}
NGINX
if ! /www/server/nginx/sbin/nginx -t; then
    mv "$conf" /root/peiliao-upload/panel-ip-acme.conf.failed
    exit 1
fi
/www/server/nginx/sbin/nginx -s reload
printf 'peiliao-panel-acme-preflight-20261002\n' > "$root/.well-known/acme-challenge/codex-panel-preflight"
chmod 0644 "$root/.well-known/acme-challenge/codex-panel-preflight"
curl --fail --silent --show-error -H 'Host: YOUR_SERVER_HOST' http://127.0.0.1/.well-known/acme-challenge/codex-panel-preflight
