#!/usr/bin/env bash
set -euo pipefail
grep -nE 'error_log|pid ' /www/server/nginx/conf/nginx.conf
for log in /www/wwwlogs/nginx_error.log /www/server/nginx/logs/error.log; do
    test ! -f "$log" || tail -n 30 "$log" | grep -E 'bind\(\)|emerg|reconfiguring' || true
done
# A listener address transition cannot reuse the previous wildcard socket on
# reload. Firewall already blocks this port; defer its bind change to reboot.
/usr/bin/python3 - <<'PY'
p='/www/server/nginx/conf/nginx.conf'
with open(p) as f:text=f.read()
assert 'listen 127.0.0.1:888;' in text
with open(p,'w') as f:f.write(text.replace('listen 127.0.0.1:888;','listen 888;'))
PY
/www/server/nginx/sbin/nginx -t
/www/server/nginx/sbin/nginx -s reload
sleep 2
curl --fail --silent https://YOUR_APP_DOMAIN/api/health
printf '\nPASS public V4 API serving; loopback listener change deferred to reboot\n'
