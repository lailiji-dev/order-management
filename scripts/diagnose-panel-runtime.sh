#!/usr/bin/env bash
set -eu
printf 'PANEL_PROCESSES\n'
ps -eo pid,ppid,comm,args | awk '/BT-Panel|BT-Task|bt-task|task.py/ && !/awk/ {print}'
printf 'PANEL_INIT_STATUS\n'
/etc/init.d/bt status; result=$?; echo "status exit=$result"
printf 'PANEL_INIT_CHECKS\n'
sed -n '55,75p;263,289p' /etc/init.d/bt
printf 'CANDIDATE_RUNTIME\n'
/www/server/panel/pyenv-secure31316/bin/python3 -c 'import ssl,sys;print(sys.version.split()[0],ssl.OPENSSL_VERSION)'
printf 'PANEL_HTTP\n'
curl --silent --show-error --max-time 15 --output /dev/null --write-out 'TLS verified HTTP %{http_code}\n' https://YOUR_SERVER_HOST:8977/YOUR_PANEL_ENTRY || true
