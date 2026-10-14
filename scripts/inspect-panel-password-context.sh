#!/usr/bin/env bash
set -euo pipefail
sed -n '1,30p' /www/server/panel/tools.py
grep -n -A 35 '^def password_salt' /www/server/panel/class/public.py
sed -n '62,100p' /www/server/panel/BTPanel/__init__.py
