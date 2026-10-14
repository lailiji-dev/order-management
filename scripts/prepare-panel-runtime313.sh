#!/usr/bin/env bash
set -euo pipefail
umask 077
stage=/root/peiliao-security/panel-runtime313-stage
install -d -m 700 "$stage" "$stage/extracted"
archive="$stage/cpython-3.13.14-x86_64-unknown-linux-gnu-bundle.tar.gz"
if test ! -f "$archive"; then
    curl --fail --location --proto '=https' --tlsv1.2 --connect-timeout 15 --max-time 600 --retry 2 --silent --show-error https://download.bt.cn/install/pyenv/cpython-3.13.14-x86_64-unknown-linux-gnu-bundle.tar.gz -o "$archive.part"
    gzip -t "$archive.part"
    mv "$archive.part" "$archive"
fi
sha256sum "$archive" > "$stage/bundle-local-sha256.txt"
/usr/bin/python3 - "$stage" <<'PY'
import os,sys,tarfile
from pathlib import Path,PurePosixPath
stage=Path(sys.argv[1]);dest=stage/'extracted';root=dest.resolve()
with tarfile.open(str(stage/'cpython-3.13.14-x86_64-unknown-linux-gnu-bundle.tar.gz'),'r:gz') as z:
    for m in z.getmembers():
        p=PurePosixPath(m.name)
        assert not p.is_absolute() and '..' not in p.parts and p.parts and p.parts[0] in ('python','pyenv') and '\\' not in m.name
        if m.issym():target=(dest/Path(*p.parts)).parent/m.linkname
        elif m.islnk():target=dest/m.linkname
        elif m.isfile() or m.isdir():continue
        else:raise RuntimeError('Special archive entry rejected')
        assert os.path.commonpath([str(root),str(target.resolve())])==str(root), 'Archive link escapes staging'
    z.extractall(str(dest))
roots=[p for p in dest.iterdir() if p.name in ('python','pyenv') and p.is_dir()]
assert len(roots)==1
candidate=roots[0]
assert (candidate/'bin/python3.13').is_file()
with open(str(stage/'candidate-path'),'w') as f:f.write(str(candidate)+'\n')
print('PASS official HTTPS bundle CRC and safe archive paths/links')
PY
candidate=$(cat "$stage/candidate-path")
find "$candidate" -type d -exec chmod 700 {} +
find "$candidate" -type f -exec chmod 600 {} +
chmod 700 "$candidate"/bin/*
ln -sfn python3.13 "$candidate/bin/python3.7"
ln -sfn python3.13 "$candidate/bin/python3"
ln -sfn python3.13 "$candidate/bin/python"
ln -sfn python3.13 "$candidate/lib/python3.7"
chown -R root:root "$candidate"
"$candidate/bin/python3.13" - <<'PY'
import sys,ssl,sqlite3,importlib.metadata as m
assert sys.version_info[:3]==(3,13,14)
for name in ('flask','gevent','psutil','OpenSSL','cryptography','requests','bcrypt','paramiko','yaml','redis','docker'):
    __import__(name)
print('Python',sys.version.split()[0],'SSL',ssl.OPENSSL_VERSION,'SQLite',sqlite3.sqlite_version)
for name in ('flask','werkzeug','requests','cryptography','gevent'):print(name,m.version(name))
print('PASS core runtime imports and supported Python version')
PY
"$candidate/bin/python3.13" - <<'PY'
import os,sys
os.chdir('/www/server/panel')
sys.path.insert(0,'/www/server/panel/class');sys.path.insert(0,'/www/server/panel')
import public,db,userlogin
print('PASS installed panel core modules load with new runtime')
PY
