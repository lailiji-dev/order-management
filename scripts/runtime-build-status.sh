#!/usr/bin/env bash
set -euo pipefail
systemctl show peiliao-security-runtime-build.service -p ActiveState -p SubState -p Result -p ExecMainStatus -p MemoryCurrent
printf 'THREAD-SAFE SSL BUILD\n'
test ! -f /root/peiliao-security/panel-threaded-openssl-build/make.log || tail -n 2 /root/peiliao-security/panel-threaded-openssl-build/make.log
printf '\nPYTHON BUILD\n'
test ! -f /root/peiliao-security/panel-python-3.13.16-build/make.log || tail -n 2 /root/peiliao-security/panel-python-3.13.16-build/make.log
if test -f /root/peiliao-security/panel-secure-runtime-path; then echo 'PASS runtime candidate readiness marker present'; fi
