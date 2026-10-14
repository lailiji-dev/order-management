#!/usr/bin/env bash
set -eu
printf 'SYSTEM\n'
id
cat /etc/os-release
printf '\nPANEL\n'
test -d /www/server/panel
cat /www/server/panel/data/port.pl
printf '\nSSL enabled: '
test -f /www/server/panel/data/ssl.pl && printf 'yes\n' || printf 'no\n'
ls -l /www/server/panel/ssl/privateKey.pem /www/server/panel/ssl/certificate.pem
openssl x509 -in /www/server/panel/ssl/certificate.pem -noout -subject -issuer -dates -ext subjectAltName
printf '\nNGINX\n'
/www/server/nginx/sbin/nginx -t
printf '\nTARGET SITES\n'
for file in /www/server/panel/vhost/nginx/*.conf; do
    if grep -Eq 'hxbj\.oneaquilaria\.com|47\.250\.42\.154' "$file"; then
        printf '\n%s\n' "$file"
        cat "$file"
    fi
done
printf '\nWEBROOTS\n'
for path in /www/wwwroot/YOUR_APP_DOMAIN /www/wwwroot/YOUR_SERVER_HOST; do
    if test -d "$path"; then ls -la "$path"; fi
done
printf '\nACME\n'
if test -f /root/.acme.sh/acme.sh; then /root/.acme.sh/acme.sh --version; fi
command -v curl openssl crontab
crontab -l 2>/dev/null | grep 'acme.sh' || true
