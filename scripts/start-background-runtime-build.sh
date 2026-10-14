#!/usr/bin/env bash
set -euo pipefail
systemd-run --unit=peiliao-security-runtime-build --property=Nice=10 --property=CPUQuota=150% --property=MemoryMax=1G /bin/bash -c 'bash /root/peiliao-security/build-threaded-openssl.sh && bash /root/peiliao-security/build-panel-security-runtime.sh'
printf 'Private runtime build dispatched with CPU/memory limits; production panel unchanged\n'
