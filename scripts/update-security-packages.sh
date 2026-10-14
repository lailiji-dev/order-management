#!/usr/bin/env bash
set -euo pipefail
install -d -m 700 /root/peiliao-security
rpm -qa > /root/peiliao-security/packages-before.txt
dnf -y upgrade-minimal --security > /root/peiliao-security/package-update.log 2>&1
tail -n 18 /root/peiliao-security/package-update.log
printf '\nUpdated authentication/runtime packages\n'
rpm -q openssh-server openssl platform-python sudo kernel-core
printf '\nRemaining security advisory count\n'
dnf -q updateinfo list --security > /root/peiliao-security/security-advisories-after.txt
wc -l /root/peiliao-security/security-advisories-after.txt
printf '\nDefault boot kernel\n'
grubby --default-kernel
