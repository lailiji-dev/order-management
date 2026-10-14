#!/usr/bin/env bash
set -euo pipefail
umask 077
install -d -m 700 /root/peiliao-security/tls-before-hardening
/usr/bin/python3 - <<'PY'
from pathlib import Path
import re,shutil
folder=Path('/www/server/panel/vhost/nginx');backup=Path('/root/peiliao-security/tls-before-hardening')
ciphers='ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305'
count=0
for path in folder.glob('*.conf'):
    text=path.read_text()
    if 'ssl_protocols' not in text:continue
    if not (backup/path.name).exists():shutil.copy2(str(path),str(backup/path.name))
    text=re.sub(r'ssl_protocols\s+[^;]+;', 'ssl_protocols TLSv1.2 TLSv1.3;',text)
    text=re.sub(r'ssl_ciphers\s+[^;]+;', 'ssl_ciphers '+ciphers+';',text)
    path.write_text(text);count+=1
p=Path('/www/server/nginx/conf/nginx.conf');text=p.read_text()
assert 'listen 888;' in text
p.write_text(text.replace('listen 888;','listen 127.0.0.1:888;'))
print('PASS secure TLS policy for',count,'SSL vhosts; phpMyAdmin loopback listener prepared for reboot')
PY
/www/server/nginx/sbin/nginx -t
test "$(grubby --default-kernel)" = /boot/vmlinuz-5.10.134-19.8.al8.x86_64
sshd -t
systemctl is-active peiliao-shared.service peiliao-backup.timer personal-ai-workbench.service firewalld
echo 'PASS pre-reboot configuration and essential services validated'
