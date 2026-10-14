#!/usr/bin/env bash
set -euo pipefail
site=/www/wwwroot/YOUR_APP_DOMAIN
src=/root/peiliao-upload/orders-v1.1.html
test -s /root/peiliao-upload/orders-backup-path.txt
test -s "$src"
grep -q food_factory_app_data_v1 "$src"
grep -q 'id="recipeContent"' "$src"
grep -q 'function saveOrder' "$src"
install -o www -g www -m 0644 "$src" "$site/index.html.new"
install -o www -g www -m 0644 "$src" "$site/peiliao.html.new"
mv -f "$site/index.html.new" "$site/index.html"
mv -f "$site/peiliao.html.new" "$site/peiliao.html"
sha256sum "$site/index.html" "$site/peiliao.html"
curl --fail --silent --show-error --resolve YOUR_APP_DOMAIN:443:127.0.0.1 https://YOUR_APP_DOMAIN/ | grep -o '<title>[^<]*</title>'
