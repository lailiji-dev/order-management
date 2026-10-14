#!/usr/bin/env bash
set -euo pipefail
printf 'PANEL UPDATE EXECUTION DETAILS\n'
sed -n '100,280p' /root/peiliao-security/vendor-update-panel.sh
printf '\nNGINX SOURCE INSTALLER DETAILS\n'
curl --fail --silent --show-error --location --proto '=https' --proto-redir '=https' --max-time 30 https://download.bt.cn/install/0/nginx.sh -o /root/peiliao-security/vendor-nginx-source.sh
grep -n -E 'download_Url|\.tar\.gz|\.zip|openssl=|pcre=|ngx_devel|lua_nginx|sticky' /root/peiliao-security/vendor-nginx-source.sh | head -n 100
printf '\nACTIVE LOCAL DATABASE MANAGEMENT SERVER\n'
sed -n '100,145p' /www/server/nginx/conf/nginx.conf
printf '\nPANEL SESSION STORAGE IMPLEMENTATION\n'
grep -n -E 'SESSION_TYPE|SESSION_FILE_DIR|SESSION_SQLALCHEMY|secret_key|session_dir' /www/server/panel/BTPanel/__init__.py | head -n 20
printf '\nOFFICIAL STABLE PANEL VERSION\n'
curl --fail --silent --show-error --location --proto '=https' --proto-redir '=https' --max-time 15 https://www.bt.cn/api/panel/get_version
printf '\n'
