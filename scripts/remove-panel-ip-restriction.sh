#!/usr/bin/env bash
# Owner explicitly requested panel access while changing networks/proxies.
set -euo pipefail
umask 077
test "$(id -u)" = 0
backup=/root/peiliao-security/panel-access-before-$(date -u +%Y%m%dT%H%M%SZ)
install -d -m 700 "$backup"
cp -a /etc/firewalld "$backup/firewalld"
if test -f /www/server/panel/data/limitip.conf; then cp -a /www/server/panel/data/limitip.conf "$backup/limitip.conf"; fi
firewall-cmd --permanent --zone=peiliao-secure --add-port=8977/tcp
firewall-cmd --zone=peiliao-secure --add-port=8977/tcp
for scope in permanent runtime; do
  args=(); if test "$scope" = permanent; then args=(--permanent); fi
  while IFS= read -r rule; do
    if [[ "$rule" == *'port="8977"'* && "$rule" == *'source address='* && "$rule" == *' accept'* ]]; then
      firewall-cmd "${args[@]}" --zone=peiliao-secure --remove-rich-rule="$rule"
    fi
  done < <(firewall-cmd "${args[@]}" --zone=peiliao-secure --list-rich-rules)
done
if test -f /www/server/panel/data/limitip.conf; then : > /www/server/panel/data/limitip.conf; /etc/init.d/bt restart; fi
firewall-cmd --zone=peiliao-secure --query-port=8977/tcp
firewall-cmd --permanent --zone=peiliao-secure --query-port=8977/tcp
/www/server/panel/pyenv/bin/python3 - <<'PY'
import os,sys
os.chdir('/www/server/panel');sys.path.insert(0,'class')
import public
assert not public.get_limit_ip(), 'Panel application IP allowlist remains active'
print('PASS panel application has no IP allowlist')
PY
firewall-cmd --zone=peiliao-secure --list-all
firewall-cmd --permanent --zone=peiliao-secure --list-all
echo 'PASS panel TCP access allowed from all source IPs, runtime and persistent settings verified'
