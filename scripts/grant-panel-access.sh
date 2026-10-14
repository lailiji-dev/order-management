#!/usr/bin/env bash
# Panel source IP restrictions were removed at the owner's explicit request.
set -euo pipefail
test "$(id -u)" = 0
firewall-cmd --zone=peiliao-secure --query-port=8977/tcp
firewall-cmd --permanent --zone=peiliao-secure --query-port=8977/tcp
printf 'Panel already permits all source IPs; no per-IP grant is needed.\n'
