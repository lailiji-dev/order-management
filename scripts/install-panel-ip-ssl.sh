#!/usr/bin/env bash
set -euo pipefail
umask 077
email='YOUR_EMAIL'
ip=YOUR_SERVER_HOST
acme=/root/.acme.sh/acme.sh
test -f /www/server/panel/data/ssl.pl
test -s /root/peiliao-upload/backup-path.txt
backup=$(cat /root/peiliao-upload/backup-path.txt)
test -s "$backup/panel-ssl-before/certificate.pem"
if test ! -f "$acme"; then
    curl --fail --silent --show-error --location https://get.acme.sh -o /root/peiliao-upload/acme-installer.sh
    sh /root/peiliao-upload/acme-installer.sh "email=$email"
fi
"$acme" --version
"$acme" --set-default-ca --server letsencrypt
"$acme" --register-account --server letsencrypt --accountemail "$email"
"$acme" --issue --server letsencrypt --cert-profile shortlived --days 3 --keylength ec-256 -d "$ip" --webroot "/www/wwwroot/$ip/"
cert="/root/.acme.sh/${ip}_ecc/fullchain.cer"
key="/root/.acme.sh/${ip}_ecc/${ip}.key"
openssl x509 -in "$cert" -noout -checkip "$ip"
openssl x509 -in "$cert" -noout -checkend 3600
cert_pub=$(openssl x509 -in "$cert" -noout -pubkey | openssl pkey -pubin -outform DER | sha256sum)
key_pub=$(openssl pkey -in "$key" -pubout -outform DER | sha256sum)
test "$cert_pub" = "$key_pub"
"$acme" --install-cert -d "$ip" --ecc \
    --key-file /www/server/panel/ssl/privateKey.pem \
    --fullchain-file /www/server/panel/ssl/certificate.pem \
    --reloadcmd 'chmod 600 /www/server/panel/ssl/privateKey.pem; service bt restart'
openssl x509 -in /www/server/panel/ssl/certificate.pem -noout -subject -issuer -dates -ext subjectAltName
printf '\nAUTOMATIC RENEWAL\n'
crontab -l | grep 'acme.sh'
printf '\nBACKUP\n%s\n' "$backup"
