#!/usr/bin/env bash
set -euo pipefail
printf 'PANEL ENTRY PATH\n'
cat /www/server/panel/data/admin_path.pl
printf '\nPANEL LISTENER\n'
ss -lntp '( sport = :8977 )'
printf '\nRENEWAL CONFIG\n'
grep -E '^Le_(Domain|Webroot|API|Days|NextRenewTime|NextRenewTimeStr|CertProfile|RealKeyPath|RealFullChainPath)=' /root/.acme.sh/YOUR_SERVER_HOST_ecc/YOUR_SERVER_HOST.conf
printf '\nCRON CHECK\n'
/root/.acme.sh/acme.sh --cron --home /root/.acme.sh
printf '\nWEBSITE HASH\n'
sha256sum /www/wwwroot/YOUR_APP_DOMAIN/index.html
printf '\nPRIVATE KEY PERMISSIONS\n'
stat -c '%a %U %n' /www/server/panel/ssl/privateKey.pem
rm -f /www/wwwroot/YOUR_SERVER_HOST/.well-known/acme-challenge/codex-panel-preflight
