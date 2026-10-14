"""Verify deployed public artifacts without authentication or data changes."""
import hashlib
from pathlib import Path
from urllib.request import urlopen
base=Path(__file__).resolve().parents[1]
for remote,local in [('/','peiliao.html'),('/peiliao.html','peiliao.html'),('/shared.js','shared.js'),('/admin.html','admin.html')]:
    with urlopen('https://YOUR_APP_DOMAIN'+remote,timeout=30) as response:
        assert hashlib.sha256(response.read()).digest()==hashlib.sha256((base/'site'/local).read_bytes()).digest()
        assert 'no-store' in response.headers.get('Cache-Control','')
    print('PASS final public artifact:',remote,flush=True)
