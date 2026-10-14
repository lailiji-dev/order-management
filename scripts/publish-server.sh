#!/usr/bin/env bash
set -euo pipefail
site=/www/wwwroot/YOUR_APP_DOMAIN
test -s /root/peiliao-upload/index.html
test -s /root/peiliao-upload/peiliao.html
grep -q peiliao_data_v1 /root/peiliao-upload/index.html
test -s /root/peiliao-upload/backup-path.txt
install -o www -g www -m 0644 /root/peiliao-upload/index.html "$site/index.html.new"
install -o www -g www -m 0644 /root/peiliao-upload/peiliao.html "$site/peiliao.html.new"
mv -f "$site/index.html.new" "$site/index.html"
mv -f "$site/peiliao.html.new" "$site/peiliao.html"
sha256sum "$site/index.html" "$site/peiliao.html"
curl --fail --silent --show-error --resolve YOUR_APP_DOMAIN:443:127.0.0.1 https://YOUR_APP_DOMAIN/ | grep -o '<title>[^<]*</title>'
