#!/usr/bin/env bash
set -euo pipefail
journalctl -u peiliao-security-runtime-build.service --no-pager -n 35 -o cat
printf '\nCANDIDATE FILE STATE\n'
if test -d /www/server/panel/pyenv-secure31316; then
    stat -c '%a %U:%G %n' /www/server/panel/pyenv-secure31316
    test ! -x /www/server/panel/pyenv-secure31316/bin/python3.13 || /www/server/panel/pyenv-secure31316/bin/python3.13 --version
fi
