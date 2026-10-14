#!/usr/bin/env bash
set -euo pipefail
for path in /www/server/panel /www/server/panel/data /www/server/panel/data/db /www/server/panel/data/db/panel.db /www/server/panel/config /www/server/panel/class /www/server/panel/mod /www/server/nginx/conf /www/server/nginx/lib/lua /www/server/panel/vhost/nginx; do
    stat -c '%a %U:%G %n' "$path"
    if runuser -u www -- test -w "$path"; then printf 'RISK www can modify %s\n' "$path"; fi
done
printf 'PRIVATE SERVER STORAGE\n'
stat -c '%a %U:%G %n' /root/.ssh /root/.ssh/authorized_keys /root/peiliao-security
