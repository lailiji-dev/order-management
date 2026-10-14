#!/usr/bin/env bash
set -euo pipefail
site=/www/wwwroot/YOUR_APP_DOMAIN
backup=/root/peiliao-client-backup-$(date -u +%Y%m%dT%H%M%SZ)
mkdir -m 700 "$backup"
cp -a "$site/shared.js" "$backup/shared.js"
install -o www -g www -m 644 /root/peiliao-upload/v2/shared.js "$site/.shared-next.js"
mv -f "$site/.shared-next.js" "$site/shared.js"
printf 'Client recovery backup: %s\n' "$backup"
sha256sum "$site/shared.js"
