#!/usr/bin/env bash
set -euo pipefail
umask 077
test "$(grubby --default-kernel)" = /boot/vmlinuz-5.10.134-19.8.al8.x86_64
/www/server/nginx/sbin/nginx -t
sshd -t
systemctl is-active peiliao-shared.service peiliao-backup.timer personal-ai-workbench.service firewalld
systemctl is-enabled nginx mysqld bt peiliao-shared.service peiliao-backup.timer personal-ai-workbench.service firewalld
/usr/bin/python3 - <<'PY'
import sqlite3,json,hashlib
db=sqlite3.connect('file:/www/server/peiliao-app/data/peiliao.sqlite3?mode=ro',uri=True)
assert db.execute('PRAGMA integrity_check').fetchone()[0]=='ok'
snapshot={table:db.execute('SELECT * FROM '+table+' ORDER BY rowid').fetchall() for table in ('users','entities')}
with open('/root/peiliao-security/pre-reboot-business.digest','w') as f:f.write(hashlib.sha256(json.dumps(snapshot,sort_keys=True,default=str).encode()).hexdigest())
db.close()
print('PASS business data and employee identity baseline captured privately')
PY
cat /proc/sys/kernel/random/boot_id > /root/peiliao-security/pre-reboot-boot-id
systemd-run --unit=peiliao-security-approved-reboot --on-active=3s /usr/bin/systemctl reboot
echo 'PASS authorized reboot scheduled; recovery verification required'
