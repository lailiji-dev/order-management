#!/usr/bin/env bash
set -euo pipefail
systemctl reset-failed peiliao-security-runtime-build.service
systemd-run --unit=peiliao-security-runtime-build --property=Nice=10 --property=CPUQuota=150% --property=MemoryMax=1G /bin/bash /root/peiliao-security/build-panel-security-runtime.sh
echo 'Resumed private runtime build with corrected library directory'
