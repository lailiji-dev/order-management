#!/usr/bin/env bash
set -euo pipefail
umask 077
candidate=/root/peiliao-security/nginx-1.30.5-openssl-3.5.9-build/candidate/nginx
binary=/www/server/nginx/sbin/nginx
backup=/root/peiliao-security/nginx-before-security
test -x "$candidate"
timeout 20 "$candidate" -t -c /www/server/nginx/conf/nginx.conf
"$candidate" -V 2>&1 | grep -E '^nginx version|^built with OpenSSL'
install -d -m 700 "$backup"
cp -an "$binary" "$backup/nginx"
cp -an /www/server/nginx/conf/nginx.conf "$backup/nginx.conf"
install -o root -g root -m 755 "$candidate" /www/server/nginx/sbin/nginx.security-next
mv -f /www/server/nginx/sbin/nginx.security-next "$binary"
timeout 20 "$binary" -t
printf 'PASS Nginx 1.30.5/OpenSSL 3.5.9 installed for next restart; existing master keeps serving\n'
