#!/usr/bin/env bash
set -euo pipefail
umask 077
stage=/root/peiliao-security/v4
app=/www/server/peiliao-app
site=/www/wwwroot/YOUR_APP_DOMAIN
ext=/www/server/panel/vhost/nginx/extension/YOUR_APP_DOMAIN/peiliao-shared.conf
vhost=/www/server/panel/vhost/nginx/YOUR_APP_DOMAIN.conf
global=/www/server/nginx/conf/nginx.conf
nginx=/www/server/nginx/sbin/nginx
backup=/root/peiliao-security/release-before-$(date -u +%Y%m%dT%H%M%SZ)
test -f "$app/data/peiliao.sqlite3"
test -f "$stage/package/server/security-headers.conf"
test -f "$stage/security-database-fingerprint.py"
install -d -m 700 "$backup"
cp -a "$ext" "$backup/extension.conf"
cp -a "$vhost" "$backup/vhost.conf"
cp -a "$global" "$backup/global.conf"
cp -a /etc/systemd/system/peiliao-shared.service "$backup/api.service"
cp -a /etc/systemd/system/peiliao-backup.service "$backup/backup.service"
tar --exclude=./.user.ini -czf "$backup/site.tar.gz.part" -C "$site" .
gzip -t "$backup/site.tar.gz.part"
mv "$backup/site.tar.gz.part" "$backup/site.tar.gz"
# Block every API request during the data-preserving maintenance window.
/usr/bin/python3 - "$ext" <<'PY'
import sys
p=sys.argv[1]
with open(p) as f:text=f.read()
assert 'location ^~ /api/ {' in text
text=text.replace('location ^~ /api/ {','location ^~ /api/ {\n    return 503;')
text=text.replace('location = /api/auth/login {','location = /api/auth/login {\n    return 503;')
with open(p,'w') as f:f.write(text)
PY
if ! "$nginx" -t; then cp -a "$backup/extension.conf" "$ext"; exit 1; fi
if ! "$nginx" -s reload; then cp -a "$backup/extension.conf" "$ext"; "$nginx" -t && "$nginx" -s reload; exit 1; fi
rollback() {
    result=$?; trap - ERR
    echo 'Release failed before reopening writes; restoring matching application/database/configuration.' >&2
    systemctl stop peiliao-shared.service peiliao-backup.timer peiliao-backup.service || true
    rm -f /etc/systemd/system/peiliao-shared.service.d/security-stage.conf
    if test -f "$backup/app.tar.gz"; then
        for file in "$app/data/peiliao.sqlite3" "$app/data/peiliao.sqlite3-wal" "$app/data/peiliao.sqlite3-shm"; do
            test ! -f "$file" || rm -f -- "$file"
        done
        tar -xzf "$backup/app.tar.gz" -C /www/server
    fi
    tar -xzf "$backup/site.tar.gz" -C "$site"
    cp -a "$backup/extension.conf" "$ext"; cp -a "$backup/vhost.conf" "$vhost"; cp -a "$backup/global.conf" "$global"
    cp -a "$backup/api.service" /etc/systemd/system/peiliao-shared.service
    cp -a "$backup/backup.service" /etc/systemd/system/peiliao-backup.service
    systemctl daemon-reload; systemctl start peiliao-shared.service peiliao-backup.timer || true
    "$nginx" -t && "$nginx" -s reload || true
    exit "$result"
}
trap rollback ERR
systemctl stop peiliao-backup.timer peiliao-backup.service peiliao-shared.service
tar -czf "$backup/app.tar.gz.part" -C /www/server peiliao-app
gzip -t "$backup/app.tar.gz.part"; tar -tzf "$backup/app.tar.gz.part" > /dev/null
mv "$backup/app.tar.gz.part" "$backup/app.tar.gz"
/usr/bin/python3 "$stage/security-database-fingerprint.py" "$app/data/peiliao.sqlite3" > "$backup/data-before.json"
getent passwd peiliao >/dev/null || useradd --system --user-group --home-dir /nonexistent --shell /sbin/nologin peiliao
test "$(getent passwd peiliao | cut -d: -f7)" = /sbin/nologin
chown root:peiliao "$app"; chmod 750 "$app"
for file in "$stage/package/server/"*.py "$stage/package/server/"*.json; do
    install -o root -g peiliao -m 640 "$file" "$app/$(basename "$file")"
done
chown -R peiliao:peiliao "$app/data" "$app/backups"
find "$app/data" "$app/backups" -type d -exec chmod 700 {} +
find "$app/data" "$app/backups" -type f -exec chmod 600 {} +
install -m 644 "$stage/package/server/peiliao-shared.service" /etc/systemd/system/peiliao-shared.service
install -m 644 "$stage/package/server/peiliao-backup.service" /etc/systemd/system/peiliao-backup.service
systemctl daemon-reload
# A temporary port isolates validation from old Nginx workers draining requests.
install -d -m 755 /etc/systemd/system/peiliao-shared.service.d
cat > /etc/systemd/system/peiliao-shared.service.d/security-stage.conf <<'UNIT'
[Service]
ExecStart=
ExecStart=/usr/bin/python3 /www/server/peiliao-app/app.py --data /www/server/peiliao-app/data/peiliao.sqlite3 --port 4189
UNIT
systemctl daemon-reload
systemctl start peiliao-shared.service
for attempt in $(seq 1 30); do
    if curl --fail --silent http://127.0.0.1:4189/api/health > "$stage/health.json"; then break; fi
    sleep 1
done
/usr/bin/python3 - "$stage/health.json" <<'PY'
import json,sys
with open(sys.argv[1]) as f:data=json.load(f)
assert data['ok'] and data['version']==4
PY
/usr/bin/python3 "$stage/security-database-fingerprint.py" "$app/data/peiliao.sqlite3" "$backup/data-before.json"
install -o root -g root -m 644 "$stage/package/server/security-headers.conf" /www/server/nginx/conf/peiliao-security-headers.conf
install -o root -g root -m 644 "$stage/package/server/security-http.conf" /www/server/nginx/conf/peiliao-security-http.conf
install -o root -g root -m 644 "$stage/package/server/proxy-api.conf" /www/server/nginx/conf/peiliao-security-proxy.conf
install -o root -g root -m 644 "$stage/package/server/peiliao-shared.conf" "$ext"
/usr/bin/python3 - "$global" "$vhost" <<'PY'
import re,sys
p=sys.argv[1]
with open(p) as f:text=f.read()
include='include /www/server/nginx/conf/peiliao-security-http.conf;'
if include not in text:
    text,count=re.subn(r'(http\s*\{)',r'\1\n    '+include,text,count=1)
    assert count==1
# Listener address changes require a full restart; host hardening handles that.
with open(p,'w') as f:f.write(text)
p=sys.argv[2]
with open(p) as f:text=f.read()
text=re.sub(r'ssl_protocols\s+[^;]+;', 'ssl_protocols TLSv1.2 TLSv1.3;',text)
text=re.sub(r'^\s*include enable-php-[^;]+;', '\n    # Static application: no PHP interpreter.',text,flags=re.M)
# Remove legacy asset regex locations; the extension explicitly allows release routes.
text=re.sub(r'\s*location ~ .*\\\.\(gif\|jpg\|jpeg\|png\|bmp\|swf\)\$\s*\{[^}]*\}', '',text)
text=re.sub(r'\s*location ~ .*\\\.\(js\|css\)\?\$\s*\{[^}]*\}', '',text)
with open(p,'w') as f:f.write(text)
PY
"$nginx" -t
install -d -o root -g root -m 755 "$site/assets"
for file in "$stage/package/site/assets/"*; do install -o root -g root -m 644 "$file" "$site/assets/$(basename "$file")"; done
for file in "$stage/package/site/"*; do
    test -f "$file" || continue
    name=$(basename "$file"); test "$name" != release-manifest.json || continue
    install -o root -g root -m 644 "$file" "$site/.$name.next"
    mv -f "$site/.$name.next" "$site/$name"
done
# Protect every ordinary static file, keeping immutable Baota .user.ini intact.
find "$site" -type d -exec chown root:root {} + -exec chmod 755 {} +
find "$site" -type f ! -name .user.ini -exec chown root:root {} + -exec chmod 644 {} +
# All migration/data/config/asset checks passed. Old proxy workers may reach the
# normal port as soon as it starts, so rollback must be disabled beforehand.
trap - ERR
systemctl stop peiliao-shared.service
rm -f /etc/systemd/system/peiliao-shared.service.d/security-stage.conf
systemctl daemon-reload
systemctl start peiliao-shared.service
"$nginx" -s reload
sleep 2
curl --fail --silent https://YOUR_APP_DOMAIN/api/health | /usr/bin/python3 -c 'import json,sys; assert json.load(sys.stdin)["version"]==4'
systemctl start peiliao-backup.timer peiliao-backup.service
systemctl is-active peiliao-shared.service peiliao-backup.timer
printf '%s\n' "$backup" > "$stage/last-backup"
echo 'PASS V4 published, data preserved, private service user and headers enabled'
