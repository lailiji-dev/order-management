#!/usr/bin/env bash
set -euo pipefail
ps -eo pid,ppid,stat,etime,args | grep -E '(build-hardened|candidate/nginx|make -j|gcc|cc1|openssl.*make)' | grep -v grep || true
stage=/root/peiliao-security/nginx-1.30.5-openssl-3.5.9-build
for file in candidate-version.txt candidate-config-test.txt; do test ! -f "$stage/$file" || cat "$stage/$file"; done
printf '\nAVAILABLE VENDOR RUNTIME BUNDLE\n'
curl --proto '=https' --tlsv1.2 --connect-timeout 15 --max-time 30 --silent --head https://download.bt.cn/install/pyenv/cpython-3.13.16-x86_64-unknown-linux-gnu-bundle.tar.gz | head -n 1
