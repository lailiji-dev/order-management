#!/usr/bin/env bash
set -euo pipefail
printf 'SECURITY PACKAGE PROCESS STATUS\n'
ps -eo pid,comm | grep -E 'dnf|dracut|grub|depmod' || true
tail -n 8 /root/peiliao-security/package-update.log
printf '\nINSTALLED VERSIONS\n'
rpm -q openssh-server openssl platform-python sudo kernel-core
grubby --default-kernel
printf '\nVENDOR OS DETECTION SOURCE\n'
grep -n -E 'OS_NAME=|OS_V=|nginx_130|nginx_131' /root/peiliao-security/vendor-nginx.sh /www/server/panel/install/public.sh | head -n 30
printf '\nVENDOR ARCHIVE DATA TYPES\n'
/usr/bin/python3 - <<'PY'
import zipfile
with zipfile.ZipFile('/root/peiliao-security/panel-13.1.0.zip') as archive:
    for name in archive.namelist():
        if name.startswith('panel/data/') and not name.endswith('/'):print(name)
PY
