#!/usr/bin/env bash
set -euo pipefail
mkdir -p /root/peiliao-upload/v3
mkdir -p /root/peiliao-upload/v3/package/tests /root/peiliao-upload/v3/update-v2/server
chmod 700 /root/peiliao-upload/v3
/www/server/nginx/sbin/nginx -V 2>&1 | grep -o -- '--with-http_gzip_static_module' || true
