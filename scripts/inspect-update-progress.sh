#!/usr/bin/env bash
set -euo pipefail
printf 'SECURITY UPDATE PROGRESS\n'
date -u
tail -n 14 /root/peiliao-security/package-update.log
printf '\nPANEL FINAL UPDATE FUNCTIONS\n'
grep -n -E 'update_panel|update_py|LinuxPanel|unzip|version=|main\(' /root/peiliao-security/vendor-update-panel.sh | tail -n 45
sed -n '280,440p' /root/peiliao-security/vendor-update-panel.sh
printf '\nNGINX SOURCE DEPENDENCY VERSIONS\n'
sed -n '280,420p' /root/peiliao-security/vendor-nginx-source.sh
printf '\nCURRENT BUILDER LIBRARIES\n'
find /usr/local -maxdepth 3 -iname '*luajit*' -o -iname '*jemalloc*' | head -n 20
