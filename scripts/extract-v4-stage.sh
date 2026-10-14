#!/usr/bin/env bash
set -euo pipefail
/usr/bin/python3 - <<'PY'
from pathlib import Path
import zipfile
stage=Path('/root/peiliao-security/v4')
with zipfile.ZipFile(str(stage/'secured-v4.zip')) as z:
    assert z.testzip() is None
    for n in z.namelist():assert not n.startswith('/') and '..' not in n.split('/')
    z.extractall(str(stage/'package'))
print('PASS tested V4 source and deployment configs extracted')
PY
