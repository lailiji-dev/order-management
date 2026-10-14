#!/usr/bin/env bash
set -euo pipefail
umask 077
candidate=/www/server/panel/pyenv-secure31316
old=/root/peiliao-security/panel-pyenv-before-secure
test "$(cat /root/peiliao-security/panel-secure-runtime-path)" = "$candidate"
test -d /www/server/panel/pyenv
test ! -L /www/server/panel/pyenv
test ! -e "$old"
"$candidate/bin/python3.13" -c 'import sys,ssl; assert sys.version_info[:3]==(3,13,16); assert ssl.OPENSSL_VERSION.startswith("OpenSSL 3.5.9 ")'
/usr/bin/python3 - <<'PY'
import sqlite3,json,hashlib
db=sqlite3.connect('file:/www/server/panel/data/db/panel.db?mode=ro',uri=True)
rows=db.execute('SELECT * FROM users ORDER BY id').fetchall();db.close()
value=hashlib.sha256(json.dumps(rows,default=str,sort_keys=True).encode()).hexdigest()
with open('/root/peiliao-security/panel-users-before-runtime.digest','w') as f:f.write(value)
PY
rollback() {
    result=$?; trap - ERR
    /etc/init.d/bt stop || true
    test ! -L /www/server/panel/pyenv || unlink /www/server/panel/pyenv
    test ! -d "$old" || mv "$old" /www/server/panel/pyenv
    /etc/init.d/bt start || true
    echo 'Runtime switch failed; original panel runtime restored' >&2
    exit "$result"
}
trap rollback ERR
/etc/init.d/bt stop
mv /www/server/panel/pyenv "$old"
chmod 700 "$old"
ln -s "$candidate" /www/server/panel/pyenv
/etc/init.d/bt start
sleep 5
/etc/init.d/bt status
pgrep -f '/www/server/panel/BT-Panel' >/dev/null
pgrep -x 'BT-Task' >/dev/null
/www/server/panel/pyenv/bin/python3 - <<'PY'
import os,sys,sqlite3,json,hashlib,ssl
os.chdir('/www/server/panel');sys.path.insert(0,'class')
import public
db=sqlite3.connect('file:/www/server/panel/data/db/panel.db?mode=ro',uri=True)
rows=db.execute('SELECT * FROM users ORDER BY id').fetchall();db.close()
value=hashlib.sha256(json.dumps(rows,default=str,sort_keys=True).encode()).hexdigest()
assert value==open('/root/peiliao-security/panel-users-before-runtime.digest').read()
print('PASS panel user identities/passwords preserved; version',public.version(),'runtime',sys.version.split()[0],ssl.OPENSSL_VERSION)
PY
trap - ERR
echo 'PASS panel security runtime active; private old runtime backup retained'
