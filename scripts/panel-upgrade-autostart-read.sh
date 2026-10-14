set -eu
printf 'Automatic runtime updater (read-only)\n'
sed -n '1,220p' /root/peiliao-security/panel-13.1.0-stage/panel/script/upgrade_flask.sh
printf 'Panel live processes (PID/executable only)\n'
/usr/bin/python3 - <<'PY'
import os
for root,dirs,files in os.walk('/proc'):
    if root.count('/')!=2:dirs[:]=[];continue
    pid=root.split('/')[-1]
    if not pid.isdigit():continue
    try:
        data=open(root+'/cmdline','rb').read().replace(b'\0',b' ')
        if b'/www/server/panel/BT-' in data or b'/www/server/panel/task.py' in data:
            print('panel_pid',pid,'executable',os.readlink(root+'/exe'))
    except (OSError,IOError):pass
PY
