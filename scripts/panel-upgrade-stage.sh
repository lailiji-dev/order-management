set -eu
umask 077
stage=/root/peiliao-security/panel-13.1.0-stage
mkdir -p "$stage"
chmod 700 /root/peiliao-security "$stage"
/usr/bin/python3 - <<'PY'
import os,stat,zipfile,pathlib
base='/root/peiliao-security/panel-13.1.0-stage'
with zipfile.ZipFile('/root/peiliao-security/panel-13.1.0.zip') as archive:
    for item in archive.infolist():
        path=pathlib.PurePosixPath(item.filename)
        mode=item.external_attr>>16
        if path.is_absolute() or '..' in path.parts or path.parts[0]!='panel' or stat.S_ISLNK(mode):
            raise RuntimeError('Unsafe archive path')
    archive.extractall(base)
    for item in archive.infolist():
        full=os.path.join(base,item.filename)
        if os.path.isfile(full):
            mode=(item.external_attr>>16)&0o777
            os.chmod(full,mode if mode else 0o644)
print('Validated and staged archive without executing its scripts')
PY
printf 'Vendor update final operations (read-only)\n'
sed -n '260,520p' /root/peiliao-security/vendor-update-panel.sh
printf 'Current/new version declarations and startup imports\n'
grep -nE 'version|^import |^from |pyenv|python' /www/server/panel/BTPanel/__init__.py "$stage/panel/BTPanel/__init__.py" "$stage/panel/BT-Panel" "$stage/panel/BT-Task" "$stage/panel/runconfig.py" | head -n 100
printf 'Archive root/data/config paths\n'
/usr/bin/python3 - <<'PY'
import os
base='/root/peiliao-security/panel-13.1.0-stage/panel'
print('Root paths:',sorted(os.listdir(base)))
for name in ('data','config','ssl','vhost'):
    folder=os.path.join(base,name)
    for current,dirs,files in os.walk(folder):
        for file in files:print(os.path.relpath(os.path.join(current,file),base))
PY
printf 'Python3.7 source compile check (no imports/execution)\n'
/www/server/panel/pyenv/bin/python - <<'PY'
import os,py_compile
base='/root/peiliao-security/panel-13.1.0-stage/panel'
compiled=0;errors=[]
for current,dirs,files in os.walk(base):
    for filename in files:
        if not filename.endswith('.py'):continue
        path=os.path.join(current,filename)
        try:py_compile.compile(path,doraise=True);compiled+=1
        except py_compile.PyCompileError as error:errors.append((os.path.relpath(path,base),str(error)))
print('compiled_files',compiled,'compile_errors',len(errors))
for row in errors[:20]:print(row)
if errors:raise SystemExit(1)
PY
printf 'Current core dependency versions/import presence\n'
/www/server/panel/pyenv/bin/python - <<'PY'
import importlib,pkg_resources
modules=['flask','gevent','psutil','OpenSSL','cryptography','requests','bcrypt','paramiko','sqlite3','psutil','websocket','flask_sock','simple_websocket']
for name in modules:
    try:
        item=importlib.import_module(name)
        print(name,'available',getattr(item,'__version__',''))
    except Exception as error:print(name,'IMPORT_FAILED',type(error).__name__)
PY
