set -eu
grep -nE 'wget.*(ngx_|lua-nginx|lua_nginx|sticky|dav|ndk|nginx_module)|add-module|configure .*user|lua_nginx_module|ngx_devel_kit' /root/peiliao-security/vendor-nginx-source.sh
sed -n '310,490p' /root/peiliao-security/vendor-nginx-source.sh
sed -n '820,1120p' /root/peiliao-security/vendor-nginx-source.sh
pkg-config --modversion libpcre2-8
ldconfig -p | grep -E 'libluajit|jemalloc'
