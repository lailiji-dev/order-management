#!/usr/bin/env bash
set -euo pipefail
printf 'OS AND RUNTIME\n'
cat /etc/os-release
uname -r
systemctl --version | head -n 1
rpm -q openssh-server openssl nginx firewalld fail2ban 2>/dev/null || true
printf '\nLISTENERS\n'
ss -lntup
printf '\nFIREWALL\n'
systemctl is-active firewalld || true
firewall-cmd --get-active-zones 2>/dev/null || true
firewall-cmd --list-all 2>/dev/null || true
iptables -S 2>/dev/null | head -n 75 || true
printf '\nSSH EFFECTIVE SETTINGS\n'
/usr/sbin/sshd -T | grep -E '^(port|listenaddress|permitrootlogin|passwordauthentication|pubkeyauthentication|permitemptypasswords|maxauthtries|maxstartups|allowtcpforwarding|x11forwarding|logingracetime|usepam|clientaliveinterval|clientalivecountmax|authorizedkeysfile) '
printf '\nPRIVILEGED AND LOGIN ACCOUNTS\n'
getent passwd | awk -F: '$3==0 || ($7!="/sbin/nologin" && $7!="/bin/false" && $7!="/usr/sbin/nologin") {print $1 ":uid=" $3 ":shell=" $7}'
passwd -S root
for file in /root/.ssh/authorized_keys /etc/ssh/sshd_config; do
  if test -f "$file"; then stat -c '%a %U:%G %n' "$file"; fi
done
if test -s /root/.ssh/authorized_keys; then ssh-keygen -lf /root/.ssh/authorized_keys || true; fi
printf '\nRECENT SSH SUCCESS AND FAILURE TOTALS\n'
/usr/bin/python3 - <<'PY'
import glob,re,collections
success=[];failed=collections.Counter();total=0
for name in sorted(glob.glob('/var/log/secure*'))[-5:]:
    if name.endswith('.gz'):continue
    try:
        with open(name,errors='replace') as file:
            for line in file:
                if 'Accepted ' in line and 'sshd[' in line:success.append(line.strip())
                if 'Failed password' in line:
                    total+=1
                    match=re.search(r' from (\S+) port ',line)
                    if match:failed[match.group(1)]+=1
    except OSError:pass
print('Successful SSH logins (last 12):')
for line in success[-12:]:print(line)
print('Failed password total in inspected logs:',total)
print('Top failed sources:',failed.most_common(8))
PY
printf '\nTARGET APPLICATION AND BACKUP ISOLATION\n'
systemctl cat peiliao-shared.service peiliao-backup.service peiliao-backup.timer
stat -c '%a %U:%G %n' /www/server/peiliao-app /www/server/peiliao-app/app.py /www/server/peiliao-app/data /www/server/peiliao-app/data/peiliao.sqlite3 /www/server/peiliao-app/backups
printf '\nWEB ROOT FILE INVENTORY\n'
find /www/wwwroot/YOUR_APP_DOMAIN -maxdepth 2 -type f -printf '%P\n' | head -n 80
printf '\nPANEL VERSION AND NONSECRET ACCESS SETTINGS\n'
cat /www/server/panel/data/version.pl 2>/dev/null || true
for name in port.pl admin_path.pl limitip.conf ssl.pl; do
  file=/www/server/panel/data/$name
  if test -f "$file"; then printf '%s: ' "$name"; head -c 200 "$file"; printf '\n'; fi
done
printf '\nPANEL PASSWORD TOOL LOCATIONS\n'
grep -n -E 'set_panel_pwd|def set|if sys.argv|get_random|check_password' /www/server/panel/tools.py | head -n 45 || true
printf '\nAVAILABLE DISK\n'
df -h /www/server/peiliao-app
