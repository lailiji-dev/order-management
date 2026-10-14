#!/usr/bin/env bash
set -euo pipefail
stage=/root/peiliao-security/v4
/usr/bin/python3 - "$stage" <<'PY'
import os,sys,zipfile
root=sys.argv[1]
with zipfile.ZipFile(os.path.join(root,'secured-v4.zip')) as bundle:
    assert bundle.testzip() is None
    for name in bundle.namelist():
        assert not name.startswith('/') and '..' not in name.split('/')
    bundle.extractall(os.path.join(root,'package'))
PY
PYTHONDONTWRITEBYTECODE=1 /usr/bin/python3 "$stage/package/tests/api-test.py"
PYTHONDONTWRITEBYTECODE=1 /usr/bin/python3 "$stage/package/tests/security-api-test.py"
