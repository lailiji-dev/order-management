set -eu
printf 'Panel version/startup code references\n'
sed -n '20,60p' /root/peiliao-security/panel-13.1.0-stage/panel/BTPanel/__init__.py
grep -nE 'BT_VERSION|def version|13\.1\.0|11\.1\.0' /root/peiliao-security/panel-13.1.0-stage/panel/class/public.py /www/server/panel/class/public.py | head -n 30
sed -n '220,275p' /root/peiliao-security/panel-13.1.0-stage/panel/BT-Panel
sed -n '1,95p' /root/peiliao-security/panel-13.1.0-stage/panel/BT-Task
printf 'Dependency metadata from official PyPI HTTPS\n'
/usr/bin/python3 - <<'PY'
import urllib.request,json,importlib
for package,version in [('Flask-Compress','1.14')]:
    raw=json.load(urllib.request.urlopen('https://pypi.org/pypi/{}/{}/json'.format(package,version),timeout=20))
    print(package,version,'requires_python',raw['info']['requires_python'],'requirements',raw['info']['requires_dist'])
try:
    import brotli
    print('brotli available',getattr(brotli,'__version__',''))
except ImportError:print('system_brotli not present')
PY
/www/server/panel/pyenv/bin/python - <<'PY'
try:
    import brotli
    print('panel_brotli available',getattr(brotli,'__version__',''))
except ImportError:print('panel_brotli missing')
PY
printf 'Local HTTPS panel login response before upgrade\n'
curl --proto '=https' --max-time 15 -k -sS -o /root/peiliao-security/panel-before-login.html -w 'http_code=%{http_code}\n' https://127.0.0.1:8977/YOUR_PANEL_ENTRY
/usr/bin/python3 - <<'PY'
import re
text=open('/root/peiliao-security/panel-before-login.html').read()
print('has_login_form',bool(re.search('login|登录|用户名|password',text,re.I)), 'html_bytes',len(text.encode()))
PY
