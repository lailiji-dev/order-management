#!/usr/bin/env bash
set -eu
python3 --version
command -v python3
ss -lntp '( sport = :4188 )'
/www/server/nginx/sbin/nginx -t
printf '\nTARGET SITE\n'
cat /www/server/panel/vhost/nginx/YOUR_APP_DOMAIN.conf
printf '\nEXISTING APP DIRECTORY\n'
if test -d /www/server/peiliao-app; then ls -la /www/server/peiliao-app; fi
printf '\nSITE HASH\n'
sha256sum /www/wwwroot/YOUR_APP_DOMAIN/index.html
