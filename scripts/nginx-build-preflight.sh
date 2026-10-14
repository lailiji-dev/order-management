set -eu
/www/server/nginx/sbin/nginx -V 2>&1
cat /etc/os-release
command -v gcc make perl curl gpg pkg-config
rpm -q gcc make perl pcre2-devel zlib-devel libxslt-devel gd-devel perl-ExtUtils-Embed
df -h /root/peiliao-security
free -m
find /usr/local/include /usr/local/lib -maxdepth 2 -type f \( -name '*luajit*' -o -name 'liblua*' -o -name '*jemalloc*' \) -print
sed -n '1,280p' /root/peiliao-security/vendor-nginx-source.sh
