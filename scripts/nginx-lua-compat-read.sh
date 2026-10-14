set -eu
stage=/root/peiliao-security/nginx-1.30.5-openssl-3.5.9-build
grep -nE 'NGX_PCRE2|pcre_fullinfo|pcre2_|PCRE2' "$stage/source/lua-nginx-module-0.10.24/src/ngx_http_lua_regex.c" | head -n 30
grep -nE 'PCRE|pcre' "$stage/source/lua-nginx-module-0.10.24/config" | head -n 35
gpgconf --homedir "$stage/gnupg" --kill gpg-agent
