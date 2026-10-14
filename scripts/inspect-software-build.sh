#!/usr/bin/env bash
set -euo pipefail
printf 'NGINX BUILD OPTIONS\n'
/www/server/nginx/sbin/nginx -V 2>&1
printf '\nNGINX SOURCE DIRECTORIES\n'
find /www/server/nginx/src -maxdepth 2 -type d 2>/dev/null | head -n 60 || true
printf '\nMEMORY\n'
free -m
printf '\nNATIVE PANEL PYTHON\n'
readlink -f /www/server/panel/pyenv/bin/python3
printf '\nPANEL UPDATE IMPLEMENTATION LOCATIONS\n'
grep -n -E 'update_panel|def UpdatePanel|def update_panel|update.sh|download.bt.cn.*update' /www/server/panel/class/ajax.py /www/server/panel/class/panelVersion.py | head -n 35 || true
printf '\nWEBSITE DOMAIN NAMES\n'
grep -h -E '^ *server_name ' /www/server/panel/vhost/nginx/*.conf
printf '\nENABLED SERVICES\n'
systemctl is-enabled nginx bt mysqld sshd 2>/dev/null || true
