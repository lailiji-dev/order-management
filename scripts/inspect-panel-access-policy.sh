#!/usr/bin/env bash
set -euo pipefail
firewall-cmd --get-active-zones
firewall-cmd --zone=peiliao-secure --list-all
firewall-cmd --permanent --zone=peiliao-secure --list-all
grep -nE '^def get_limit_ip|^def set_limit_ip|limitip.conf' /www/server/panel/class/public.py /www/server/panel/class/config.py | head -n 35
if test -f /www/server/panel/data/limitip.conf; then printf 'PANEL_IP_ALLOWLIST\n'; head -c 1000 /www/server/panel/data/limitip.conf; printf '\n'; else echo 'PANEL_IP_ALLOWLIST absent'; fi
grep -nE 'port="8977"|8977/tcp' /etc/firewalld/zones/*.xml || true
