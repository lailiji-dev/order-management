set -eu
printf 'Staged login verification code locations\n'
/usr/bin/python3 - <<'PY'
import os,re
base='/root/peiliao-security/panel-13.1.0-stage/panel/class'
for current,dirs,files in os.walk(base):
    for name in files:
        if not name.endswith('.py'):continue
        path=os.path.join(current,name)
        if 'Login' not in name and 'login' not in name and name not in ['db.py','tools.py','panelAuth.py']:continue
        for index,line in enumerate(open(path,errors='replace'),1):
            if re.search('password_salt|password.*getField|encrypt|decrypt|password.*==|md5|bcrypt|check_password',line,re.I):
                print(os.path.relpath(path,base),index,line.strip()[:260])
PY
printf 'Decoded user field metadata only\n'
cd /www/server/panel
/www/server/panel/pyenv/bin/python - <<'PY'
import os,sys
sys.path.insert(0,'class')
import public
for field in ['username','password','password_salt']:
    value=public.M('users').where('id=?',(1,)).getField(field)
    if field=='username':print('decoded_username',value)
    else:print('decoded_'+field+'_type',type(value).__name__,'length',len(value) if isinstance(value,(str,bytes)) else None)
PY
