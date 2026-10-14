#!/usr/bin/env bash
set -euo pipefail
printf 'VENDOR PREBUILT OS DETECTION\n'
sed -n '330,403p' /root/peiliao-security/vendor-nginx.sh
printf '\nVENDOR NGINX VERSION IMPORTS\n'
sed -n '1,38p' /root/peiliao-security/vendor-nginx.sh
printf '\nPANEL UPDATE FINAL STEPS\n'
sed -n '435,480p' /root/peiliao-security/vendor-update-panel.sh
printf '\nOFFICIAL PANEL ARCHIVE\n'
curl --fail --silent --show-error --location --proto '=https' --proto-redir '=https' --connect-timeout 10 --max-time 120 https://download.bt.cn/install/update/LinuxPanel-13.1.0.zip -o /root/peiliao-security/panel-13.1.0.zip
/usr/bin/python3 - <<'PY'
import zipfile
with zipfile.ZipFile('/root/peiliao-security/panel-13.1.0.zip') as archive:
    assert archive.testzip() is None
    names=archive.namelist()
    print('Archive entries:',len(names))
    print('Data entries:',sum(name.startswith('panel/data/') for name in names))
    for name in names:
        if name.startswith('/') or '..' in name.split('/'):raise RuntimeError('Unsafe vendor zip')
    for name in ('panel/class/common.py','panel/BTPanel/__init__.py'):
        if name in names:
            text=archive.read(name).decode('utf-8','replace')
            print(name, 'first lines:')
            print('\n'.join(text.splitlines()[:14]))
PY
