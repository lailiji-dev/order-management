#!/usr/bin/env bash
# Read-only, target-scoped audit. No secrets, cookies, account names or order data.
set -euo pipefail
app=/www/server/peiliao-app
site=/www/wwwroot/YOUR_APP_DOMAIN
nginx=/www/server/nginx/sbin/nginx
db="$app/data/peiliao.sqlite3"
printf 'TARGET_SERVICE_ISOLATION\n'
systemctl show peiliao-shared.service --property=User --property=Group --property=NoNewPrivileges --property=ProtectSystem --property=ProtectHome --property=PrivateTmp --property=PrivateDevices --property=ReadWritePaths --property=CapabilityBoundingSet --property=RestrictAddressFamilies --property=TasksMax --property=LimitNOFILE
printf 'TARGET_FILE_PERMISSIONS\n'
for target in "$app" "$app/app.py" "$app/data" "$db" "$app/backups" "$site"; do
  if test -e "$target"; then stat --format='%a %U:%G %n' -- "$target"; fi
done
printf 'TARGET_SELECTED_LISTENERS\n'
ss -lntp | awk 'NR==1 || $4 ~ /:(22|80|443|8977|4188)$/ {print}'
printf 'TARGET_HTTP_RESPONSE_HEADERS\n'
for route in / /admin.html /api/health /api/state /api/admin/users; do
  printf 'ROUTE %s\n' "$route"
  curl --silent --show-error --max-time 15 --dump-header - --output /dev/null "https://YOUR_APP_DOMAIN$route" | awk 'BEGIN{IGNORECASE=1} /^HTTP\// || /^(Content-Security-Policy|X-Frame-Options|Referrer-Policy|Permissions-Policy|Strict-Transport-Security|X-Content-Type-Options|Cache-Control|Access-Control-Allow-Origin|Server):/ {gsub(/\r/,"");print}'
done
printf 'TARGET_STORAGE_AGGREGATES\n'
/usr/bin/python3 - "$db" "$site" <<'PY'
import json,os,sqlite3,sys
database,site=sys.argv[1:]
db=sqlite3.connect('file:'+database+'?mode=ro',uri=True)
try:
    health=db.execute('PRAGMA integrity_check').fetchone()[0]
    result={'integrity_ok':health=='ok','schema_version':db.execute('PRAGMA user_version').fetchone()[0]}
    for table in ('users','sessions','entities','audit'):
        result[table+'_count']=db.execute('SELECT COUNT(*) FROM '+table).fetchone()[0]
    print(json.dumps(result,sort_keys=True))
finally:db.close()
classes={'env_or_config':0,'database':0,'archive_or_backup':0,'php':0,'hidden_directory':0,'symlink':0}
for folder,directories,files in os.walk(site,followlinks=False):
    for directory in directories:
        if directory.startswith('.') and directory!='.well-known':classes['hidden_directory']+=1
    for name in files:
        lower=name.lower();path=os.path.join(folder,name)
        if os.path.islink(path):classes['symlink']+=1
        if lower=='.env' or lower.endswith(('.ini','.conf','.config','.toml','.yaml','.yml')):classes['env_or_config']+=1
        if lower.endswith(('.sqlite','.sqlite3','.db','.sql','.sql.gz')):classes['database']+=1
        if lower.endswith(('.zip','.tar','.tar.gz','.tgz','.bak','.old','.part')):classes['archive_or_backup']+=1
        if lower.endswith(('.php','.phtml','.php3','.php4','.php5','.php7','.phar')):classes['php']+=1
print('public_root_risk_counts='+json.dumps(classes,sort_keys=True))
PY
printf 'SSH_EFFECTIVE_AUTH_SETTINGS\n'
if command -v sshd >/dev/null 2>&1; then
  sshd -T | awk '/^(permitrootlogin|passwordauthentication|pubkeyauthentication|permitemptypasswords|maxauthtries|maxstartups|allowtcpforwarding|gatewayports|usepam) / {print}'
fi
printf 'TARGET_NGINX_SYNTAX\n'
"$nginx" -t
