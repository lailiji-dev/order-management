#!/usr/bin/env bash
set -euo pipefail
printf 'BOUND DOMAIN\n'
if test -s /www/server/panel/data/domain.conf; then cat /www/server/panel/data/domain.conf; else printf 'none\n'; fi
printf '\nLOCAL PANEL HTTP\n'
curl --silent --show-error --resolve YOUR_SERVER_HOST:8977:127.0.0.1 --output /root/peiliao-upload/panel-entry-response.html --write-out 'HTTP %{http_code}\n' https://YOUR_SERVER_HOST:8977/YOUR_PANEL_ENTRY
grep -o '<title>[^<]*</title>' /root/peiliao-upload/panel-entry-response.html || true
printf '\nROUTE RULE LOCATIONS\n'
grep -nE 'admin_path|domain\.conf|limitip|abort\(404|404 Not Found' /www/server/panel/BTPanel/__init__.py | head -50
