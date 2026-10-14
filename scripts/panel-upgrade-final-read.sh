set -eu
printf 'Salt initializer source (read-only)\n'
/usr/bin/python3 - <<'PY'
path='/www/server/panel/class/public.py'
lines=open(path).readlines()
for index,line in enumerate(lines):
    if line.startswith('def chdck_salt('):
        print('source',path,'line',index+1)
        print(''.join(lines[index:index+45]));break
PY
printf 'Post-upgrade process/service/API health\n'
/etc/init.d/bt status
systemctl is-active peiliao-shared.service personal-ai-workbench.service
curl --proto '=http' --max-time 10 -fsS http://127.0.0.1:4188/api/health
printf '\nFull archive verification and panel metadata summary\n'
/usr/bin/python3 - <<'PY'
import os,tarfile,json
backup=open('/root/peiliao-security/panel-upgrade-backup-path').read().strip()
path=backup+'/panel-before.tar'
with tarfile.open(path,'r') as archive:
    names=archive.getnames()
    required=['panel/data/db/panel.db','panel/ssl','panel/vhost','panel/pyenv','panel/config']
    print('backup_bytes',os.path.getsize(path),'entries',len(names),'required_paths_present',all(name in names for name in required),'archive_mode',oct(os.stat(path).st_mode&0o777),'backup_dir_mode',oct(os.stat(backup).st_mode&0o777))
report=json.load(open(backup+'/preservation-report.json'))
print('changed_existing_state_files',len(report['changed_existing_state_files']),'changed_existing_tables',len(report['changed_existing_tables']))
print('backup_path',path)
PY
