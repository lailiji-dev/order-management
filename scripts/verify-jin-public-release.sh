#!/usr/bin/env bash
set -euo pipefail
systemctl is-active peiliao-shared.service peiliao-backup.timer
/usr/bin/python3 /root/peiliao-security/v4/verify-public-security.py --manifest /root/peiliao-security/v4/package/site/release-manifest.json --skip-external-ports
printf 'PASS public HTTPS routes and exact release assets verified from server without TLS bypass\n'
