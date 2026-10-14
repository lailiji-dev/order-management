#!/usr/bin/env bash
set -eu
printf 'PANEL_LISTENER\n'
ss -lntp | awk 'NR==1 || $4 ~ /:8977$/ {print}'
printf 'PANEL_HTTPS_LOCAL\n'
curl --silent --show-error --max-time 15 --resolve YOUR_SERVER_HOST:8977:127.0.0.1 --output /dev/null --write-out 'TLS verified HTTP %{http_code}\n' https://YOUR_SERVER_HOST:8977/YOUR_PANEL_ENTRY || true
printf 'PANEL_SSL_CODE\n'
grep -nE 'SSLContext|PROTOCOL_TLS|ssl_version|ciphers|load_cert_chain|ssl_protocol|ssl_context|WSGIServer' /www/server/panel/BT-Panel /www/server/panel/runserver.py | head -n 70 || true
printf 'PANEL_EFFECTIVE_RUNTIME\n'
readlink -f /proc/$(pgrep -x BT-Panel)/exe
/www/server/panel/pyenv/bin/python3 -c 'import sys,ssl,cryptography; from cryptography.hazmat.backends.openssl.backend import backend; print(sys.version.split()[0],ssl.OPENSSL_VERSION,cryptography.__version__,backend.openssl_version_text())'
printf 'PANEL_ENTRY_SETTINGS\n'
for name in admin_path.pl domain.conf limitip.conf bind.pl; do if test -f /www/server/panel/data/$name; then printf '%s: ' "$name"; head -c 300 /www/server/panel/data/$name; printf '\n'; fi; done
sed -n '7326,7365p' /www/server/panel/class/public.py
grep -nE 'abort\(404|error_not_login|def init\(' /www/server/panel/class/common.py /www/server/panel/class/userlogin.py | head -n 35
curl --silent --show-error --user-agent 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36' --max-time 10 --resolve YOUR_SERVER_HOST:8977:127.0.0.1 --output /dev/null --write-out 'Full browser agent HTTP %{http_code}\n' https://YOUR_SERVER_HOST:8977/YOUR_PANEL_ENTRY
