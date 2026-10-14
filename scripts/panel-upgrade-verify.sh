set -eu
printf 'Baota panel process status\n'
/etc/init.d/bt status
printf 'Upgrade health and protected metadata verification\n'
cd /www/server/panel
/www/server/panel/pyenv/bin/python - <<'PY'
import os,sys,re,json,sqlite3,requests,hashlib
sys.path.insert(0,'class')
import public
backup=open('/root/peiliao-security/panel-upgrade-backup-path').read().strip()
report=json.load(open(backup+'/preservation-report.json'))
print('current_panel_version',public.version(),'python_runtime',sys.version.split()[0])
model=public.M('users').where('id=?',(1,));username=model.getField('username');password=model.getField('password');salt=model.getField('salt')
print('actual_user_metadata',{'id':1,'username':username,'decoded_password_length':len(password) if isinstance(password,str) else None,'decoded_salt_length':len(salt) if isinstance(salt,str) else None})
before=report['before']['tables']['data/db/panel.db:users']
connection=sqlite3.connect('file:/www/server/panel/data/db/panel.db?mode=ro',uri=True)
rows=connection.execute('SELECT * FROM users').fetchall();connection.close()
data=json.dumps(rows,sort_keys=True,default=lambda value:value.hex() if isinstance(value,bytes) else str(value))
print('users_table_unchanged',before=={'count':len(rows),'fingerprint':hashlib.sha256(data.encode()).hexdigest()})
changed=[]
for name,fingerprint in report['before']['files'].items():
    if name.startswith('ssl/') or name in ['data/admin_path.pl','data/port.pl','data/ssl.pl','data/domain.conf','data/limitip.conf','data/api.json','data/letsencrypt.json']:
        path=os.path.join('/www/server/panel',name)
        if not os.path.isfile(path) or hashlib.sha256(open(path,'rb').read()).hexdigest()!=fingerprint:changed.append(name)
print('critical_certificate_port_path_files_unchanged',not changed,'changed_paths',changed)
cron_before=open(backup+'/root-cron-before','rb').read();cron_after=open('/var/spool/cron/root','rb').read()
print('root_cron_unchanged',cron_before==cron_after)
requests.packages.urllib3.disable_warnings()
base='https://127.0.0.1:'+str(public.get_panel_port())
private=public.get_admin_path()
paths=[private,private+'/',private+'/login','/login']
for index,path in enumerate(paths):
    try:
        response=requests.get(base+path,verify=False,timeout=15)
        login=bool(re.search('登录|password|username|login-form',response.text,re.I))
        print('local_https_route',index,'status',response.status_code,'login_html',login,'bytes',len(response.content))
        if response.status_code==200 and login:open(backup+'/login-after.html','wb').write(response.content)
    except requests.RequestException as error:print('local_https_route',index,'FAILED',type(error).__name__)
print('backup',backup+'/panel-before.tar')
PY
printf 'Runtime external sites/services status (read-only)\n'
systemctl is-active peiliao-app.service personal-ai-workbench.service
printf 'Relevant startup errors (redacted code-only classification)\n'
/usr/bin/python3 - <<'PY'
import os,re
for filename in ['error.log','panel.log','task.log']:
    path='/www/server/panel/logs/'+filename
    if not os.path.isfile(path):continue
    lines=open(path,errors='replace').read().splitlines()[-30:]
    signals=[line for line in lines if re.search(r'ModuleNotFoundError|ImportError|SyntaxError|Traceback',line)]
    print(filename,'recent_import_error_markers',len(signals))
PY
