set -eu
find /www/server/nginx /usr/local/lib/lua -maxdepth 6 -path '*/resty/core/base.lua' -print 2>/dev/null
grep -nE 'version|ngx_lua_version|0[.]10[.]' /www/server/nginx/lib/lua/resty/core/base.lua /www/server/nginx/lualib/resty/core/base.lua /usr/local/lib/lua/5.1/resty/core/base.lua 2>/dev/null || true
grep -nE 'lua_package_path|lua_load_resty_core' /www/server/nginx/conf/nginx.conf /www/server/panel/vhost/nginx/*.conf || true
