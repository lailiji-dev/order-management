set -eu
printf 'Runtime dependency check with panel class paths\n'
/www/server/panel/pyenv/bin/python - <<'PY'
import os,sys,importlib
for root in ['/www/server/panel','/root/peiliao-security/panel-13.1.0-stage/panel']:
    sys.path.insert(0,os.path.join(root,'class'))
    sys.modules.pop('flask_compress',None)
    try:
        import flask_compress
        print('current' if root=='/www/server/panel' else 'staged','flask_compress available',flask_compress.__file__)
    except Exception as error:print('missing',type(error).__name__)
PY
printf 'Version resolver and startup calls (code only)\n'
sed -n '2194,2210p' /www/server/panel/class/public.py
sed -n '2251,2270p' /root/peiliao-security/panel-13.1.0-stage/panel/class/public.py
grep -nE 'check_upgrade|upgrade_flask|cleanup\(|init_database|13\.1\.0|11\.1\.0' /root/peiliao-security/panel-13.1.0-stage/panel/BT-Panel /root/peiliao-security/panel-13.1.0-stage/panel/runconfig.py /www/server/panel/runconfig.py
printf 'Dynamic private-path HTTPS response (without printing private path)\n'
/www/server/panel/pyenv/bin/python - <<'PY'
import os,re,requests
requests.packages.urllib3.disable_warnings()
base='/www/server/panel/data'
pathfile=os.path.join(base,'admin_path.pl')
path=open(pathfile).read().strip() if os.path.isfile(pathfile) else '/login'
portfile=os.path.join(base,'port.pl')
port=open(portfile).read().strip() if os.path.isfile(portfile) else '8888'
ipsfile=os.path.join(base,'limitip.conf')
count=0
if os.path.isfile(ipsfile):count=len(open(ipsfile).read().strip().split(','))
response=requests.get('https://127.0.0.1:'+port+path,verify=False,timeout=15)
open('/root/peiliao-security/panel-before-login.html','wb').write(response.content)
print('port',port,'private_path_present',bool(path),'allowlist_exists',os.path.isfile(ipsfile),'http_code',response.status_code,'has_login_form',bool(re.search('login|登录|用户名|password',response.text,re.I)),'html_bytes',len(response.content))
PY
