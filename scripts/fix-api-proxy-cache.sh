#!/usr/bin/env bash
set -euo pipefail
ext=/www/server/panel/vhost/nginx/extension/YOUR_APP_DOMAIN/peiliao-shared.conf
nginx=/www/server/nginx/sbin/nginx
backup=/root/peiliao-upload/v3/nginx-before-cache-fix-$(date -u +%Y%m%dT%H%M%SZ).conf
cp -a "$ext" "$backup"
/usr/bin/python3 - "$ext" <<'PY'
import sys
path=sys.argv[1]
with open(path,encoding='utf-8') as file:text=file.read()
needle='    proxy_pass http://127.0.0.1:4188;'
assert text.count(needle)==1, 'Unexpected API proxy configuration'
if '    proxy_cache off;' not in text:
    text=text.replace(needle,needle+'\n    proxy_cache off;')
with open(path,'w',encoding='utf-8') as file:file.write(text)
PY
if ! "$nginx" -t || ! "$nginx" -s reload; then
  cp -a "$backup" "$ext"
  "$nginx" -t && "$nginx" -s reload
  exit 1
fi
printf 'PASS application API does not inherit the global proxy cache\n'
