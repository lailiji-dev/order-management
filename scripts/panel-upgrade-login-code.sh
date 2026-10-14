set -eu
printf 'Official login password comparison (source only)\n'
sed -n '110,175p' /www/server/panel/class/userlogin.py
printf 'Official password salt and reset helpers (source only)\n'
/www/server/panel/pyenv/bin/python - <<'PY'
import os,re
files=['/www/server/panel/class/public.py','/www/server/panel/tools.py','/www/server/panel/class/tools.py','/www/server/panel/class/db.py']
for filename in files:
    if not os.path.isfile(filename):continue
    lines=open(filename).readlines()
    for index,line in enumerate(lines):
        if re.search(r'^\s*def (password_salt|set_panel_pwd|SetPanelPwd|_decrypt|_encrypt|getField)\(',line):
            print(filename,'line',index+1)
            for row in lines[index:index+40]:
                print(row.rstrip())
PY
printf 'Panel listener/service names only\n'
ss -ltnp | grep ':8977 ' || true
systemctl list-units --type=service --all --no-pager | grep -Ei 'peiliao|workbench' || true
printf 'HTTPS login with correct public-IP Host\n'
/www/server/panel/pyenv/bin/python - <<'PY'
import os,sys,requests,re
sys.path.insert(0,'/www/server/panel/class')
import public
requests.packages.urllib3.disable_warnings()
base='https://127.0.0.1:'+str(public.get_panel_port());private=public.get_admin_path()
for index,path in enumerate([private,private+'/login']):
    response=requests.get(base+path,headers={'Host':'YOUR_SERVER_HOST:8977'},verify=False,timeout=15)
    print('correct_host_login_route',index,'status',response.status_code,'login_form',bool(re.search('登录|password|username|login-form',response.text,re.I)),'bytes',len(response.content))
PY
