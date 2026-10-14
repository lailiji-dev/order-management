set -eu
printf 'Actual panel users table location (non-secret fields only)\n'
cd /www/server/panel
/www/server/panel/pyenv/bin/python - <<'PY'
import sys,os,sqlite3,re
sys.path.insert(0,'class')
import public
model=public.M('users')
rows=model.field('id,username,length(password) as password_length').select()
print('public_M_users',rows)
for name,value in vars(model).items():
    if isinstance(value,str) and ('/www/server/panel/' in value or value.endswith('.db')):print('model_path',name,value)
for root,dirs,files in os.walk('/www/server/panel/data'):
    for filename in files:
        if not filename.endswith('.db'):continue
        path=os.path.join(root,filename)
        try:
            connection=sqlite3.connect('file:'+path+'?mode=ro',uri=True)
            if connection.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='users'").fetchone():
                print('users_database',path,'rows',connection.execute('SELECT id,username,length(password) FROM users').fetchall())
            connection.close()
        except sqlite3.DatabaseError:pass
for source in ['/www/server/panel/class/common.py','/root/peiliao-security/panel-13.1.0-stage/panel/class/common.py']:
    text=open(source).read();match=re.search(r"g\.version\s*=\s*['\"]([^'\"]+)['\"]",text)
    print('version',('current' if source.startswith('/www') else 'staged'),match.group(1) if match else 'not found')
PY
printf 'Startup update check body (code only)\n'
sed -n '198,235p' /root/peiliao-security/panel-13.1.0-stage/panel/BT-Panel
printf 'Security-check HTTP handler source locations\n'
grep -nE 'limitip|iplist|domain.conf|admin_path.pl|admin_path|return.*404|abort\(404' /www/server/panel/BTPanel/__init__.py | head -n 30
