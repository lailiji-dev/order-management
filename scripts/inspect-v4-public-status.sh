#!/usr/bin/env bash
set -euo pipefail
printf 'API DIRECT / PUBLIC\n'
curl -sS -i http://127.0.0.1:4188/api/health
curl -sS -i https://YOUR_APP_DOMAIN/api/health
printf '\nMAINTENANCE DIRECTIVES (FILES ONLY)\n'
grep -nE 'return 503|location |proxy_pass' /www/server/panel/vhost/nginx/extension/YOUR_APP_DOMAIN/peiliao-shared.conf /www/server/nginx/conf/peiliao-security-proxy.conf
printf '\nNGINX ERROR EVENTS (STATIC STARTUP DIAGNOSTICS)\n'
tail -n 80 /www/server/nginx/logs/error.log | grep -E 'emerg|alert|crit|configuration|open\(\).*failed|signal process|reconfigur|start worker' | sed -E 's/request:.*$/request redacted/' || true
printf '\nAPP COUNTS AND SERVICE\n'
systemctl show peiliao-shared.service -p ActiveState -p SubState -p MainPID -p MemoryCurrent -p TasksCurrent
"/www/server/nginx/sbin/nginx" -t
