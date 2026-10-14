#!/usr/bin/env bash
set -euo pipefail
printf 'ALL SUCCESSFUL SSH SOURCE AGGREGATES\n'
/usr/bin/python3 - <<'PY'
import glob,re,collections,json
summary={}
for name in sorted(glob.glob('/var/log/secure*')):
    if name.endswith('.gz'):continue
    try:
        with open(name,errors='replace') as file:
            for line in file:
                match=re.search(r'Accepted (\S+) for (\S+) from (\S+) port ',line)
                if match:
                    method,user,ip=match.groups();key=(user,ip,method)
                    record=summary.setdefault(key,{'count':0,'first':line[:15],'last':line[:15]})
                    record['count']+=1;record['last']=line[:15]
    except OSError:pass
for key,value in summary.items():print(json.dumps(dict(value,user=key[0],source=key[1],method=key[2])))
PY
printf '\nADMIN ACCOUNT STATUS\n'
id admin
passwd -S admin
if test -s YOUR_AUTHORIZED_KEYS_PATH; then ssh-keygen -lf YOUR_AUTHORIZED_KEYS_PATH || true; fi
printf '\nPANEL VERSION (NO SETTINGS)\n'
grep -n -E "version *=|__version__|panelVersion" /www/server/panel/class/common.py /www/server/panel/BTPanel/__init__.py | head -n 12 || true
printf '\nPANEL PASSWORD TOOL IMPLEMENTATION\n'
sed -n '155,178p' /www/server/panel/tools.py
printf '\nFIREWALL OFFLINE DEFAULTS\n'
firewall-offline-cmd --get-default-zone
firewall-offline-cmd --zone=public --list-all
printf '\nACTIVE DATABASE CLIENT COUNTS\n'
ss -nt state established '( sport = :3306 )'
printf '\nNGINX AND MYSQL CONFIGURATION\n'
/www/server/nginx/sbin/nginx -v
grep -n -E '^(bind-address|skip-networking|port|\[mysqld\])' /etc/my.cnf || true
printf '\nSECURITY PACKAGE ADVISORIES\n'
dnf --refresh updateinfo list --security
