#!/usr/bin/env bash
set -euo pipefail
stage=/root/peiliao-upload/v3
app=/www/server/peiliao-app
site=/www/wwwroot/YOUR_APP_DOMAIN
ext=/www/server/panel/vhost/nginx/extension/YOUR_APP_DOMAIN/peiliao-shared.conf
nginx=/www/server/nginx/sbin/nginx
backup=/root/peiliao-v3-backup-$(date -u +%Y%m%dT%H%M%SZ)
test -f "$app/data/peiliao.sqlite3"
test -f "$stage/optimized-v3.zip"
/usr/bin/python3 - "$stage" <<'PY'
import os,sys,zipfile
with zipfile.ZipFile(os.path.join(sys.argv[1],'optimized-v3.zip')) as bundle:
    for name in bundle.namelist():
        if name.startswith('/') or '..' in name.split('/'):
            raise RuntimeError('Unsafe archive path')
    bundle.extractall(os.path.join(sys.argv[1],'package'))
PY
for source in "$stage/package/server/"*.py; do /usr/bin/python3 -m py_compile "$source"; done
mkdir -m 700 "$backup"
cp -a "$ext" "$backup/nginx-before.conf"
cp -a /etc/systemd/system/peiliao-shared.service "$backup/service-before.conf"
tar -czf "$backup/site-before.tar.gz" -C "$site" .
# Briefly reject writes while taking the consistent database snapshot/migration.
# Existing clients preserve pending changes and can retry after the release.
/usr/bin/python3 - "$ext" <<'PY'
import sys
path=sys.argv[1]
with open(path,encoding='utf-8') as file:text=file.read()
text=text.replace('location ^~ /api/ {','location ^~ /api/ {\n    return 503;')
with open(path,'w',encoding='utf-8') as file:file.write(text)
PY
if ! "$nginx" -t; then cp -a "$backup/nginx-before.conf" "$ext"; exit 1; fi
if ! "$nginx" -s reload; then
  cp -a "$backup/nginx-before.conf" "$ext"
  "$nginx" -t && "$nginx" -s reload
  exit 1
fi
rollback() {
  result=$?
  trap - ERR
  echo 'Deployment failed; restoring the pre-release application and database.' >&2
  systemctl stop peiliao-shared.service || true
  if test -f "$backup/app-before.tar.gz"; then
    # Restore a stopped database including its matching WAL files.
    for file in "$app/data/peiliao.sqlite3" "$app/data/peiliao.sqlite3-wal" "$app/data/peiliao.sqlite3-shm"; do
      test ! -f "$file" || rm -f -- "$file"
    done
    tar -xzf "$backup/app-before.tar.gz" -C /www/server
  fi
  tar -xzf "$backup/site-before.tar.gz" -C "$site"
  cp -a "$backup/nginx-before.conf" "$ext"
  cp -a "$backup/service-before.conf" /etc/systemd/system/peiliao-shared.service
  systemctl daemon-reload
  systemctl start peiliao-shared.service || true
  "$nginx" -t && "$nginx" -s reload || true
  exit "$result"
}
trap rollback ERR
systemctl stop peiliao-shared.service
tar -czf "$backup/app-before.tar.gz.part" -C /www/server peiliao-app
gzip -t "$backup/app-before.tar.gz.part"
tar -tzf "$backup/app-before.tar.gz.part" > /dev/null
mv "$backup/app-before.tar.gz.part" "$backup/app-before.tar.gz"
/usr/bin/python3 "$stage/database-fingerprint.py" "$app/data/peiliao.sqlite3" > "$backup/data-before.json"
for file in "$stage/package/server/"*.py "$stage/package/server/"*.json; do
  install -m 644 "$file" "$app/$(basename "$file")"
done
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
LimitNOFILE=4096
TasksMax=64
[Install]
WantedBy=multi-user.target
SERVICE
systemctl daemon-reload
systemctl start peiliao-shared.service
for attempt in $(seq 1 20); do
  if curl --fail --silent http://127.0.0.1:4188/api/health > "$stage/health.json"; then break; fi
  sleep 1
done
/usr/bin/python3 - "$stage/health.json" <<'PY'
import json,sys
with open(sys.argv[1]) as file:data=json.load(file)
assert data['ok'] and data['version']==3, 'New API did not start'
PY
/usr/bin/python3 "$stage/database-fingerprint.py" "$app/data/peiliao.sqlite3" "$backup/data-before.json"
cat > "$stage/final-nginx.conf" <<'CONF'
# Peiliao v3: preserve ACME and enforce HTTPS for application traffic.
set $peiliao_https_redirect 0;
if ($scheme = http) { set $peiliao_https_redirect 1; }
if ($uri ~ ^/\.well-known/acme-challenge/) { set $peiliao_https_redirect 0; }
if ($peiliao_https_redirect = 1) { return 308 https://YOUR_APP_DOMAIN$request_uri; }
gzip on;
gzip_vary on;
gzip_min_length 512;
gzip_comp_level 5;
gzip_types text/css application/javascript application/json image/svg+xml;
location ^~ /api/ {
    proxy_pass http://127.0.0.1:4188;
    proxy_cache off;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_connect_timeout 10s;
    proxy_read_timeout 60s;
    client_max_body_size 4m;
    add_header Cache-Control "no-store" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Strict-Transport-Security "max-age=31536000" always;
}
location ^~ /assets/ {
    try_files $uri =404;
    add_header Cache-Control "public, max-age=31536000, immutable" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Strict-Transport-Security "max-age=31536000" always;
}
location = / { try_files /index.html =404; add_header Cache-Control "no-store" always; add_header Strict-Transport-Security "max-age=31536000" always; }
location = /index.html { add_header Cache-Control "no-store" always; add_header Strict-Transport-Security "max-age=31536000" always; }
location = /peiliao.html { add_header Cache-Control "no-store" always; add_header Strict-Transport-Security "max-age=31536000" always; }
location = /admin.html { add_header Cache-Control "no-store" always; add_header Strict-Transport-Security "max-age=31536000" always; }
# Keep the v2 alias for already-open legacy pages. V3 uses fingerprinted assets.
location = /shared.js { add_header Cache-Control "no-store" always; }
location = /release-manifest.json { return 404; }
CONF
if "$nginx" -V 2>&1 | grep -q -- '--with-http_gzip_static_module'; then
  printf '\ngzip_static on;\n' >> "$stage/final-nginx.conf"
fi
# Validate final configuration, without reopening writes before files are ready.
cp -a "$stage/final-nginx.conf" "$ext"
"$nginx" -t
mkdir -p "$site/assets"
for file in "$stage/package/site/assets/"*; do
  install -o www -g www -m 644 "$file" "$site/assets/$(basename "$file")"
done
for file in "$stage/package/site/"*; do
  test -f "$file" || continue
  name=$(basename "$file")
  test "$name" != release-manifest.json || continue
  install -o www -g www -m 644 "$file" "$site/.$name.next"
  mv -f "$site/.$name.next" "$site/$name"
done
"$nginx" -s reload
# The new release is serving writes now; do not restore an older DB afterwards.
trap - ERR
systemctl start peiliao-backup.service
systemctl is-active peiliao-shared.service peiliao-backup.timer
printf 'Data-preserving release backup: %s\n' "$backup"
printf '%s\n' "$backup" > "$stage/last-backup"
sha256sum "$site/index.html" "$app/app.py"
