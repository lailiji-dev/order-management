#!/usr/bin/env bash
set -euo pipefail
grep -nE 'SESSION_TYPE|SESSION_FILE_DIR|SESSION_REDIS|Session\(app|FileSystemSession' /www/server/panel/BTPanel/__init__.py /www/server/panel/class/userlogin.py || true
printf '\nPREPARED BUILD PROGRESS\n'
stage=/root/peiliao-security/panel-python-3.13.16-build
for file in make.log install.log; do test ! -f "$stage/$file" || tail -n 2 "$stage/$file"; done
printf '\nSYSTEM BUILD DEPENDENCIES\n'
rpm -q sqlite sqlite-devel openssl openssl-devel libffi-devel expat
