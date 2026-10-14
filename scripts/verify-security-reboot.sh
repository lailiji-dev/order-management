#!/usr/bin/env bash
set -euo pipefail
umask 077
printf 'BOOT_AND_SERVICES\n'
test "$(cat /proc/sys/kernel/random/boot_id)" != "$(cat /root/peiliao-security/pre-reboot-boot-id)"
test "$(uname -r)" = 5.10.134-19.8.al8.x86_64
uname -r
uptime
systemctl is-active nginx mysqld bt peiliao-shared.service peiliao-backup.timer personal-ai-workbench.service firewalld
printf 'NGINX_RUNNING_BINARY\n'
master=$(pgrep -f '^nginx: master process' | head -n 1)
test -n "$master"
test "$(sha256sum /proc/$master/exe | cut -d' ' -f1)" = "$(sha256sum /www/server/nginx/sbin/nginx | cut -d' ' -f1)"
/proc/$master/exe -V 2>&1 | sed -n '1,3p'
printf 'PANEL_RUNNING_RUNTIME\n'
test "$(readlink -f /proc/$(pgrep -x BT-Panel)/exe)" = /www/server/panel/pyenv-secure31316/bin/python3.13
pgrep -x BT-Task >/dev/null
/www/server/panel/pyenv/bin/python3 - <<'PY'
import sys,ssl,os
from cryptography.hazmat.backends.openssl.backend import backend
os.chdir('/www/server/panel');sys.path.insert(0,'class');import public
assert public.version()=='13.1.0'
assert sys.version_info[:3]==(3,13,16)
assert ssl.OPENSSL_VERSION.startswith('OpenSSL 3.5.9 ')
assert backend.openssl_version_text().startswith('OpenSSL 4.0.3 ')
print('PASS panel',public.version(),'Python',sys.version.split()[0],ssl.OPENSSL_VERSION,'cryptography',backend.openssl_version_text())
PY
printf 'PERSISTENT_NETWORK_SECURITY\n'
firewall-cmd --get-active-zones
firewall-cmd --zone=peiliao-secure --list-all
sshd -T | awk '/^(permitrootlogin|passwordauthentication|pubkeyauthentication|maxauthtries|maxstartups|allowtcpforwarding|gatewayports) / {print}'
sshd -T | grep -x 'passwordauthentication no'
ss -lntp | awk 'NR==1 || $4 ~ /:(22|80|443|8977|888|3306|4188|3000)$/ {print}'
test "$(ss -lntH | awk '$4 ~ /:3306$/ {print $4}')" = 127.0.0.1:3306
test "$(ss -lntH | awk '$4 ~ /:888$/ {print $4}')" = 127.0.0.1:888
printf 'DATA_PRESERVATION\n'
/usr/bin/python3 - <<'PY'
import sqlite3,json,hashlib
db=sqlite3.connect('file:/www/server/peiliao-app/data/peiliao.sqlite3?mode=ro',uri=True)
assert db.execute('PRAGMA integrity_check').fetchone()[0]=='ok'
snapshot={table:db.execute('SELECT * FROM '+table+' ORDER BY rowid').fetchall() for table in ('users','entities')}
value=hashlib.sha256(json.dumps(snapshot,sort_keys=True,default=str).encode()).hexdigest()
assert value==open('/root/peiliao-security/pre-reboot-business.digest').read(),'Business data changed since reboot baseline; review before declaring preservation'
print('PASS SQLite integrity and all business records, employee identities/passwords unchanged across reboot')
db.close()
PY
printf 'SITES_AND_CERTIFICATES\n'
for host in YOUR_APP_DOMAIN YOUR_OTHER_SITE_DOMAIN YOUR_OTHER_SITE_DOMAIN; do
  status=$(curl --silent --show-error --max-time 20 --output /dev/null --write-out '%{http_code}' "https://$host/")
  case "$status" in 200|301|302|303|307|308) echo "PASS HTTPS $host $status";; *) echo "FAIL HTTPS $host $status";exit 1;;esac
  final=$(curl --silent --show-error --location --max-redirs 4 --max-time 20 --output /dev/null --write-out '%{http_code}' "https://$host/")
  test "$final" = 200
  echo "PASS $host final page $final"
done
status=$(curl --silent --show-error --max-time 15 --resolve YOUR_SERVER_HOST:8977:127.0.0.1 --user-agent 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36' --output /dev/null --write-out '%{http_code}' https://YOUR_SERVER_HOST:8977/YOUR_PANEL_ENTRY)
test "$status" = 200
echo 'PASS trusted panel HTTPS login page'
printf 'BACKUP_AFTER_BOOT\n'
systemctl start peiliao-backup.service
test "$(systemctl show peiliao-backup.service -p Result --value)" = success
backup=$(find /www/server/peiliao-app/backups -maxdepth 1 -type f -name '*.gz' -printf '%T@ %p\n' | sort -nr | head -n 1 | cut -d' ' -f2-)
test -n "$backup"
test "$(stat -c '%a %U:%G' "$backup")" = '600 peiliao:peiliao'
gzip -t "$backup"
echo 'PASS post-boot scheduled backup, private ownership and gzip integrity'
printf 'AVAILABLE_SECURITY_ADVISORIES\n'
dnf -q updateinfo list --security
echo 'PASS server reboot and recovery checks'
