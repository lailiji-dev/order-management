"""Fetch vendor module archives over HTTPS and pin their independent SHA256."""
import concurrent.futures
import hashlib
import json
from pathlib import Path
from urllib.request import urlopen

base=Path(__file__).resolve().parents[1]/'security-build-artifacts'
base.mkdir(exist_ok=True)
files=['ngx_cache_purge-2.3.tar.gz','nginx-sticky-module-ng-1.3.0.zip',
       'lua-nginx-module-0.10.24.zip','ngx_devel_kit-0.3.1.zip',
       'nginx-dav-ext-module-3.0.0.tar.gz','ngx_http_substitutions_filter_module-master.zip']

def fetch(name):
    url='https://download.bt.cn/src/'+name
    digest=hashlib.sha256()
    with urlopen(url,timeout=60) as response, (base/name).open('wb') as output:
        while True:
            chunk=response.read(65536)
            if not chunk:break
            output.write(chunk);digest.update(chunk)
    return {'name':name,'url':url,'sha256':digest.hexdigest()}

with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
    records=list(pool.map(fetch,files))
(base/'module-manifest.json').write_text(json.dumps(records,indent=2)+'\n',encoding='utf-8')
print(json.dumps(records,indent=2))
