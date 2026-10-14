#!/usr/bin/env bash
set -euo pipefail
stage=/root/peiliao-upload/v2
app=/www/server/peiliao-app
site=/www/wwwroot/YOUR_APP_DOMAIN
ext=/www/server/panel/vhost/nginx/extension/YOUR_APP_DOMAIN
nginx=/www/server/nginx/sbin/nginx
backup=$(cat "$stage/last-backup")
test -f "$backup/site-before.tar.gz"
/usr/bin/python3 - "$stage" <<'PY'
import sys,zipfile,os
stage=sys.argv[1]
with zipfile.ZipFile(os.path.join(stage,'shared-v2.zip')) as bundle:
    for name in bundle.namelist():
        if name.startswith('/') or '..' in name.split('/'):
            raise RuntimeError('Unsafe archive path')
    bundle.extractall(os.path.join(stage,'package'))
PY
/usr/bin/python3 -m py_compile "$stage/package/server/app.py" "$stage/package/server/backup.py"
mkdir -p "$app/data" "$app/backups" "$ext"
chmod 755 "$app"
chown www:www "$app/data" "$app/backups"
chmod 700 "$app/data" "$app/backups"
install -m 644 "$stage/package/server/app.py" "$app/app.py"
install -m 644 "$stage/package/server/seed.json" "$app/seed.json"
install -m 644 "$stage/package/server/backup.py" "$app/backup.py"
/usr/bin/python3 "$app/app.py" --data "$app/data/peiliao.sqlite3" --init-only
chown www:www "$app/data/"*
chmod 600 "$app/data/"*
cat > /etc/systemd/system/peiliao-shared.service <<'SERVICE'
[Unit]
Description=Peiliao shared orders API
After=network.target
[Service]
Type=simple
User=www
Group=www
WorkingDirectory=/www/server/peiliao-app
ExecStart=/usr/bin/python3 /www/server/peiliao-app/app.py --data /www/server/peiliao-app/data/peiliao.sqlite3
Restart=on-failure
RestartSec=3
Environment=PYTHONUNBUFFERED=1
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
UMask=0077
[Install]
WantedBy=multi-user.target
SERVICE
cat > /etc/systemd/system/peiliao-backup.service <<'SERVICE'
[Unit]
Description=Peiliao daily SQLite backup
[Service]
Type=oneshot
User=www
Group=www
UMask=0077
ExecStart=/usr/bin/python3 /www/server/peiliao-app/backup.py /www/server/peiliao-app/data/peiliao.sqlite3 /www/server/peiliao-app/backups
SERVICE
cat > /etc/systemd/system/peiliao-backup.timer <<'TIMER'
[Unit]
Description=Daily backup for shared orders
[Timer]
OnCalendar=*-*-* 03:20:00
Persistent=true
[Install]
WantedBy=timers.target
TIMER
systemctl daemon-reload
systemctl enable peiliao-shared.service
systemctl restart peiliao-shared.service
for attempt in $(seq 1 15); do
  if curl --fail --silent http://127.0.0.1:4188/api/health; then break; fi
  sleep 1
done
curl --fail --silent http://127.0.0.1:4188/api/health
cat > "$ext/peiliao-shared.conf" <<'CONF'
# Shared order API; only this website is affected.
# Keep ACME challenge requests on HTTP; all other requests use HTTPS.
set $peiliao_https_redirect 0;
if ($scheme = http) { set $peiliao_https_redirect 1; }
if ($uri ~ ^/\.well-known/acme-challenge/) { set $peiliao_https_redirect 0; }
if ($peiliao_https_redirect = 1) { return 308 https://YOUR_APP_DOMAIN$request_uri; }
location ^~ /api/ {
    proxy_pass http://127.0.0.1:4188;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_connect_timeout 10s;
    proxy_read_timeout 60s;
    client_max_body_size 4m;
    add_header Cache-Control "no-store" always;
    add_header X-Content-Type-Options "nosniff" always;
}
location = / { try_files /index.html =404; add_header Cache-Control "no-store" always; }
location = /index.html { add_header Cache-Control "no-store" always; }
location = /peiliao.html { add_header Cache-Control "no-store" always; }
location = /admin.html { add_header Cache-Control "no-store" always; }
location = /shared.js { add_header Cache-Control "no-store" always; }
CONF
if ! "$nginx" -t; then
  if test -f "$backup/nginx-extension/peiliao-shared.conf"; then
    cp -a "$backup/nginx-extension/peiliao-shared.conf" "$ext/peiliao-shared.conf"
  else
    rm -f "$ext/peiliao-shared.conf"
  fi
  echo 'Nginx configuration rejected; existing frontend remains in place.' >&2
  exit 1
fi
install -o www -g www -m 644 "$stage/package/site/peiliao.html" "$site/index.html"
install -o www -g www -m 644 "$stage/package/site/peiliao.html" "$site/peiliao.html"
install -o www -g www -m 644 "$stage/package/site/shared.js" "$site/shared.js"
install -o www -g www -m 644 "$stage/package/site/admin.html" "$site/admin.html"
"$nginx" -s reload
systemctl enable --now peiliao-backup.timer
systemctl start peiliao-backup.service
printf '\nShared API: '
systemctl is-active peiliao-shared.service
printf 'Backup timer: '
systemctl is-active peiliao-backup.timer
sha256sum "$site/index.html" "$site/peiliao.html" "$site/shared.js" "$site/admin.html"
printf 'Deployment backup: %s\n' "$backup"
