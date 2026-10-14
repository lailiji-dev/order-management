#!/usr/bin/env bash
set -euo pipefail
stage=/root/peiliao-security
curl --fail --silent --show-error --location --proto '=https' --proto-redir '=https' --connect-timeout 10 --max-time 40 https://download.bt.cn/install/update_panel.sh -o "$stage/vendor-update-panel.sh"
curl --fail --silent --show-error --location --proto '=https' --proto-redir '=https' --connect-timeout 10 --max-time 40 https://download.bt.cn/install/nginx.sh -o "$stage/vendor-nginx.sh"
printf 'PANEL UPDATE SCRIPT\n'
sed -n '1,95p' "$stage/vendor-update-panel.sh"
printf '\nNGINX INSTALL SOURCES AND VERSIONS\n'
grep -n -E 'download_Url|\.tar\.gz|\.zip|nginxVersion|version=|lua.*module|pcre|openssl' "$stage/vendor-nginx.sh" | head -n 100
printf '\nBUILDER PACKAGES\n'
rpm -q make gcc gcc-c++ pcre-devel pcre2-devel gd-devel jemalloc-devel openssl-devel luajit-devel lua-devel 2>/dev/null || true
printf '\nACTIVE MODULE DIRECTIVES\n'
/www/server/nginx/sbin/nginx -T 2>&1 | grep -E 'lua_|cache_purge|sticky|subs_filter|dav_|image_filter|ssl_stapling|slice|ssi|charset|proxy_pass|map ' | head -n 70
printf '\nUPDATER CHECKSUMS\n'
sha256sum "$stage/vendor-update-panel.sh" "$stage/vendor-nginx.sh"
