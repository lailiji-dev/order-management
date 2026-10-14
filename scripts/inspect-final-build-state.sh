#!/usr/bin/env bash
set -euo pipefail
rpm -q pcre pcre-devel pcre2 pcre2-devel
printf 'PROCESSES\n'
pgrep -af '(make -j|dnf|build-hardened|upgrade_flask)' || true
printf 'CURRENT PANEL RUNTIME\n'
/www/server/panel/pyenv/bin/python3 --version
cat /www/server/panel/data/version.pl
printf '\nAPP HEALTH\n'
curl --fail --silent http://127.0.0.1:4188/api/health
printf '\nPRIVATE CANDIDATE STATE\n'
find /root/peiliao-security -maxdepth 2 -type f -name '*runtime*' -o -name '*pyenv*' -o -name '*panel*upgrade*'
