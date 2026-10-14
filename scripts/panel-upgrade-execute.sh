set -eu
umask 077
backup=/root/peiliao-security/panel-backup-$(date -u +%Y%m%dT%H%M%SZ)
mkdir -m 700 "$backup"
printf '%s\n' "$backup" > /root/peiliao-security/panel-upgrade-backup-path
chmod 600 /root/peiliao-security/panel-upgrade-backup-path
printf 'Stopping only Baota panel/task processes\n'
/etc/init.d/bt stop
trap '/etc/init.d/bt start >/dev/null 2>&1 || true' EXIT
printf 'Creating complete stopped-panel archive\n'
tar --acls --xattrs -cpf "$backup/panel-before.tar.part" -C /www/server panel
tar -tf "$backup/panel-before.tar.part" > "$backup/archive-files.txt"
test -s "$backup/archive-files.txt"
mv "$backup/panel-before.tar.part" "$backup/panel-before.tar"
chmod 600 "$backup/panel-before.tar" "$backup/archive-files.txt"
cp -p /etc/init.d/bt "$backup/bt-init-before"
cp -p /var/spool/cron/root "$backup/root-cron-before"
/www/server/panel/pyenv/bin/python -m pip freeze > "$backup/runtime-packages-before.txt"
/www/server/panel/pyenv/bin/python /root/peiliao-security/panel-upgrade-safe.py "$backup/preservation-report.json"
printf 'Validating essential installed code before restart\n'
/www/server/panel/pyenv/bin/python -m py_compile /www/server/panel/BT-Panel /www/server/panel/BT-Task /www/server/panel/BTPanel/__init__.py /www/server/panel/class/public.py
date +%s > /www/server/panel/upgrade_flask_time.pl
chmod 600 /www/server/panel/upgrade_flask_time.pl
printf 'Starting only Baota panel/task processes\n'
/etc/init.d/bt start
trap - EXIT
printf 'Panel full backup: %s/panel-before.tar\n' "$backup"
