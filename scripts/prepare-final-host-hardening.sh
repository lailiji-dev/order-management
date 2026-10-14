#!/usr/bin/env bash
set -euo pipefail
umask 077
stage=/root/peiliao-security
cp -an /etc/my.cnf "$stage/mysql-before-security.cnf"
/usr/bin/python3 - <<'PY'
import re
p='/etc/my.cnf'
with open(p) as f:text=f.read()
text=re.sub(r'^\s*bind-address\s*=.*\n', '',text,flags=re.M)
text,count=re.subn(r'^\[mysqld\]\s*$', '[mysqld]\nbind-address = 127.0.0.1',text,count=1,flags=re.M)
assert count==1
with open(p,'w') as f:f.write(text)
PY
/www/server/mysql/bin/mysqld --defaults-file=/etc/my.cnf --verbose --help > "$stage/mysql-config-validation.log" 2>&1
grep -E '^bind-address\s' "$stage/mysql-config-validation.log"
find /www/server/panel/vhost/cert -type f -name privkey.pem -exec chown root:root {} + -exec chmod 600 {} +
if test -f /www/server/panel/ssl/privateKey.pem; then chown root:root /www/server/panel/ssl/privateKey.pem; chmod 600 /www/server/panel/ssl/privateKey.pem; fi
test -f /boot/vmlinuz-5.10.134-19.8.al8.x86_64
test -s /boot/initramfs-5.10.134-19.8.al8.x86_64.img
grubby --set-default /boot/vmlinuz-5.10.134-19.8.al8.x86_64
test "$(grubby --default-kernel)" = /boot/vmlinuz-5.10.134-19.8.al8.x86_64
printf 'PASS MySQL loopback config valid, TLS private-key permissions fixed, security kernel selected\n'
