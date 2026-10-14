#!/usr/bin/env bash
set -euo pipefail
umask 077
stage=/root/peiliao-security/panel-python-3.13.16-build
install -d -m 700 "$stage"
cd "$stage"
archive="$stage/Python-3.13.16.tar.xz"
if test ! -f "$archive"; then
    curl --fail --location --proto '=https' --tlsv1.2 --connect-timeout 15 --max-time 300 --silent --show-error https://www.python.org/ftp/python/3.13.16/Python-3.13.16.tar.xz -o "$archive.part"
    mv "$archive.part" "$archive"
fi
printf 'f4b1bfb3c79b5bb11b8d228a12504163b4c0dab4d679828d8f5f26b6cb6ab35d  %s\n' "$archive" | sha256sum --check --status
/usr/bin/python3 - "$stage" <<'PY'
from pathlib import Path,PurePosixPath
import sys,tarfile
stage=Path(sys.argv[1])
with tarfile.open(str(stage/'Python-3.13.16.tar.xz'),'r:xz') as z:
    for m in z.getmembers():
        p=PurePosixPath(m.name)
        assert not p.is_absolute() and '..' not in p.parts and p.parts and p.parts[0]=='Python-3.13.16'
        assert m.isfile() or m.isdir()
    if not (stage/'Python-3.13.16').exists():z.extractall(str(stage))
print('PASS current official Python source checksum and safe archive')
PY
openssl=/www/server/panel/openssl-security-3.5.9
test -f "$openssl/lib64/libssl.a"
ln -sfn lib64 "$openssl/lib"
candidate=/www/server/panel/pyenv-secure31316
test ! -L "$candidate"
# Only resume this task's unactivated candidate after an interrupted install.
test ! -L /www/server/panel/pyenv
cd "$stage/Python-3.13.16"
./configure --prefix="$candidate" --with-openssl="$openssl" --with-ensurepip=install > "$stage/configure.log" 2>&1
printf 'Compiling Python 3.13.16 with OpenSSL 3.5.9 in private stage\n'
nice -n 10 make -j2 > "$stage/make.log" 2>&1
nice -n 10 make install > "$stage/install.log" 2>&1
bundle=$(cat /root/peiliao-security/panel-runtime313-stage/candidate-path)
cp -a "$bundle/lib/python3.13/site-packages/." "$candidate/lib/python3.13/site-packages/"
ln -sfn python3.13 "$candidate/bin/python"
ln -sfn python3.13 "$candidate/bin/python3"
ln -sfn python3.13 "$candidate/bin/python3.7"
ln -sfn python3.13 "$candidate/lib/python3.7"
find "$candidate" -type d -exec chmod 700 {} +
find "$candidate" -type f -exec chmod 600 {} +
chmod 700 "$candidate"/bin/*
"$candidate/bin/python3.13" - <<'PY'
import ssl,sys,importlib.metadata as m
from urllib.request import urlopen
import json,subprocess
assert sys.version_info[:3]==(3,13,16)
assert ssl.OPENSSL_VERSION.startswith('OpenSSL 3.5.9 ')
with urlopen('https://pypi.org/pypi/cryptography/json',timeout=20) as r:version=json.load(r)['info']['version']
# Use the official current compatible wheel, keep unrelated vendor pins intact.
subprocess.run([sys.executable,'-m','pip','install','--disable-pip-version-check','--index-url','https://pypi.org/simple','--only-binary=:all:','--no-deps','--upgrade','cryptography=='+version],check=True)
for name in ('flask','gevent','psutil','OpenSSL','cryptography','requests','bcrypt','paramiko','yaml','redis','docker'):__import__(name)
import cryptography.hazmat.bindings.openssl.binding as b
binding=b.Binding();crypto=binding.ffi.string(binding.lib.OpenSSL_version(0)).decode()
print('Python',sys.version.split()[0],'SSL',ssl.OPENSSL_VERSION,'Cryptography',m.version('cryptography'),'CryptoSSL',crypto)
print('PASS security runtime and compatible core dependencies')
PY
"$candidate/bin/python3.13" - <<'PY'
import os,sys
os.chdir('/www/server/panel');sys.path.insert(0,'/www/server/panel/class');sys.path.insert(0,'/www/server/panel')
import public,db,userlogin
print('PASS installed panel modules compatible with security runtime')
PY
printf '%s\n' "$candidate" > /root/peiliao-security/panel-secure-runtime-path
