#!/usr/bin/env bash
set -euo pipefail
test -s /root/.ssh/authorized_keys
backup=/root/peiliao-security/access-before-$(date -u +%Y%m%dT%H%M%SZ)
install -d -m 700 "$backup"
cp -a /etc/ssh/sshd_config "$backup/sshd_config"
cp -a /etc/firewalld "$backup/firewalld"
cat > "$backup/sshd_config.next" <<'SSH'
# Peiliao security: new administrator key was independently verified first.
PubkeyAuthentication yes
PasswordAuthentication no
ChallengeResponseAuthentication no
PermitRootLogin prohibit-password
PermitEmptyPasswords no
MaxAuthTries 3
MaxStartups 10:30:30
LoginGraceTime 30
X11Forwarding no
AllowTcpForwarding local
GatewayPorts no
PermitTunnel no
SSH
cat /etc/ssh/sshd_config >> "$backup/sshd_config.next"
/usr/sbin/sshd -t -f "$backup/sshd_config.next"
install -m 600 "$backup/sshd_config.next" /etc/ssh/sshd_config
if ! systemctl reload sshd; then cp -a "$backup/sshd_config" /etc/ssh/sshd_config; exit 1; fi
printf 'PASS SSH uses public keys; existing imported administrator key retained\n'
zone=peiliao-secure
if ! firewall-offline-cmd --get-zones | tr ' ' '\n' | grep -qx "$zone"; then
  firewall-offline-cmd --new-zone="$zone" > /dev/null
fi
# Owner requested unrestricted panel source IPs for changing networks/proxies.
for port in 22/tcp 80/tcp 443/tcp 443/udp 8977/tcp; do firewall-offline-cmd --zone="$zone" --add-port="$port" > /dev/null; done
firewall-offline-cmd --set-default-zone="$zone" > /dev/null
systemctl enable --now firewalld
firewall-cmd --get-active-zones
firewall-cmd --zone="$zone" --list-all
printf 'PASS default host firewall permits panel source IP changes and blocks unused database/FTP ports\n'
printf '%s\n' "$backup" > /root/peiliao-security/last-access-backup
