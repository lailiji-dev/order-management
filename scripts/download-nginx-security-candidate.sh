#!/usr/bin/env bash
set -euo pipefail
stage=/root/peiliao-security/nginx-candidate
install -d -m 700 "$stage"
cd "$stage"
base=https://download.bt.cn/soft/nginx
name=''
for candidate_name in el-8-nginx-1.30.5.tar.gz el-7-nginx-1.30.5.tar.gz el-8-nginx-1.30.4.tar.gz el-7-nginx-1.30.4.tar.gz; do
  if curl --fail --silent --location --proto '=https' --proto-redir '=https' --connect-timeout 8 --max-time 15 "$base/$candidate_name.256sum" -o "$candidate_name.256sum"; then
    name=$candidate_name;break
  fi
done
test -n "$name" || { echo 'No verified vendor binary available; source build required'; exit 1; }
curl --fail --silent --show-error --location --proto '=https' --proto-redir '=https' --connect-timeout 10 --max-time 180 "$base/$name" -o "$name"
sha256sum -c "$name.256sum"
/usr/bin/python3 - "$name" "$stage" <<'PY'
import os,sys,tarfile
with tarfile.open(sys.argv[1]) as archive:
    for item in archive.getmembers():
        name=item.name
        if name.startswith('/') or '..' in name.split('/') or item.issym() or item.islnk():
            raise RuntimeError('Unsafe vendor archive member')
    archive.extractall(os.path.join(sys.argv[2],'extracted'))
PY
candidate="$stage/extracted/nginx/sbin/nginx"
test -x "$candidate"
"$candidate" -V 2>&1
"$candidate" -t -p /www/server/nginx -c /www/server/nginx/conf/nginx.conf
printf '%s\n' "$candidate" > /root/peiliao-security/nginx-candidate-path
