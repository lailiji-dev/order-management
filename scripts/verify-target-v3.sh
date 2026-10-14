#!/usr/bin/env bash
set -euo pipefail
stage=/root/peiliao-upload/v3
/usr/bin/python3 - "$stage" <<'PY'
import os,sys,zipfile
with zipfile.ZipFile(os.path.join(sys.argv[1],'optimized-v3.zip')) as bundle:
    for name in bundle.namelist():
        if name.startswith('/') or '..' in name.split('/'):raise RuntimeError('Unsafe archive path')
    bundle.extractall(os.path.join(sys.argv[1],'package'))
PY
/usr/bin/python3 "$stage/package/tests/api-test.py"
printf '\nTARGET RUNTIME PERFORMANCE (TEMP DATABASE ONLY)\n'
/usr/bin/python3 "$stage/package/tests/api-test.py" --benchmark
