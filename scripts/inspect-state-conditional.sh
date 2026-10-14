#!/usr/bin/env bash
set -euo pipefail
printf 'Relevant proxy configuration\n'
/www/server/nginx/sbin/nginx -T 2>&1 | grep -n -i -E 'if-none-match|proxy_set_header|proxy_pass_request_headers|proxy_cache|proxy_ignore_headers|proxy_hide_header|hxbj.oneaquilaria|4188' | head -n 100
printf '\nInstalled snapshot code\n'
sed -n '239,254p' /www/server/peiliao-app/app.py
printf '\nProxy defaults\n'
cat /www/server/nginx/conf/proxy.conf
