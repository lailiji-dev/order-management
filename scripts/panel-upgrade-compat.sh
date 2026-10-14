set -eu
printf 'Normal/encrypted code compatibility\n'
/www/server/panel/pyenv/bin/python - <<'PY'
import os,py_compile,re,ast
base='/root/peiliao-security/panel-13.1.0-stage/panel'
compiled=0;encrypted=0;errors=[]
for current,dirs,files in os.walk(base):
    for filename in files:
        if not filename.endswith('.py') and filename not in ('BT-Panel','BT-Task'):continue
        path=os.path.join(current,filename)
        with open(path,'rb') as stream:first=stream.readline().strip()
        if re.fullmatch(rb'[A-Za-z0-9/+]+={1,2}',first):encrypted+=1;continue
        try:py_compile.compile(path,doraise=True);compiled+=1
        except py_compile.PyCompileError:errors.append(os.path.relpath(path,base))
print('plain_sources_compiled',compiled,'vendor_encrypted_modules',encrypted,'syntax_failures',errors)
if errors:raise SystemExit(1)
for folder in ['/www/server/panel',base]:
    for filename in ['class/public.py','class/public/__init__.py']:
        path=os.path.join(folder,filename)
        if not os.path.isfile(path):continue
        tree=ast.parse(open(path).read())
        for node in ast.walk(tree):
            if isinstance(node,ast.FunctionDef) and node.name=='version':
                returns=[row.value.s for row in ast.walk(node) if isinstance(row,ast.Return) and isinstance(row.value,ast.Str)]
                print(('current' if folder=='/www/server/panel' else 'staged')+'_version_literals',returns)
PY
printf 'Current core dependency import checks\n'
/www/server/panel/pyenv/bin/python - <<'PY'
import importlib
modules=['flask','cachelib','flask_session','flask_compress','gevent','psutil','OpenSSL','cryptography','requests','bcrypt','paramiko','sqlite3','websocket','flask_sock','simple_websocket','pyinotify','pymysql','yaml','dateutil']
missing=[]
for name in modules:
    try:
        item=importlib.import_module(name)
        print(name,'available',getattr(item,'__version__',''))
    except Exception as error:
        print(name,'IMPORT_FAILED',type(error).__name__);missing.append(name)
print('missing_core_modules',missing)
if missing:raise SystemExit(1)
PY
printf 'Startup/new DB migration references (code only)\n'
sed -n '220,275p' /root/peiliao-security/panel-13.1.0-stage/panel/BT-Panel
sed -n '1,95p' /root/peiliao-security/panel-13.1.0-stage/panel/BT-Task
printf 'Local HTTPS panel login response before upgrade\n'
curl --proto '=https' --max-time 15 -k -sS -o /root/peiliao-security/panel-before-login.html -w 'http_code=%{http_code}\n' https://127.0.0.1:8977/YOUR_PANEL_ENTRY
/usr/bin/python3 - <<'PY'
import re
text=open('/root/peiliao-security/panel-before-login.html').read()
print('has_login_form',bool(re.search('login|登录|用户名|password',text,re.I)), 'html_bytes',len(text.encode()))
PY
