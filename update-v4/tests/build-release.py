"""Build deterministic, content-fingerprinted assets for the Baota release."""
import gzip
import hashlib
import json
from pathlib import Path
import re
import subprocess
import zipfile

base=Path(__file__).resolve().parents[1]
source=base/'site';destination=base/'release-site';assets=destination/'assets'
assets.mkdir(parents=True,exist_ok=True)
subprocess.run(['node',str(base/'tests/build-assets.mjs')],check=True)
mapping={}
for file in sorted(source.iterdir()):
    if file.suffix not in ('.js','.css'):continue
    raw=(base/'release-assets'/file.name).read_bytes()
    digest=hashlib.sha256(raw).hexdigest()[:12]
    name=file.stem+'.'+digest+file.suffix
    target=assets/name;target.write_bytes(raw)
    mapping[file.name]='/assets/'+name
for file in sorted(source.iterdir()):
    if file.suffix=='.html':
        text=file.read_text(encoding='utf-8')
        def reference(match):
            original=match.group(2);name=original.split('?')[0].lstrip('/')
            return match.group(1)+mapping.get(name,original)+match.group(3)
        text=re.sub(r'((?:src|href)=["\'])([^"\']+)(["\'])',reference,text)
        (destination/file.name).write_text(text,encoding='utf-8')
    elif file.suffix not in ('.css','.js'):
        (destination/file.name).write_bytes(file.read_bytes())
(destination/'index.html').write_bytes((destination/'peiliao.html').read_bytes())
manifest={'version':4,'assets':mapping,'files':{}}
for file in sorted(destination.rglob('*')):
    if not file.is_file() or file.name=='release-manifest.json' or file.suffix=='.gz':continue
    raw=file.read_bytes();relative=file.relative_to(destination).as_posix()
    manifest['files'][relative]={'bytes':len(raw),'sha256':hashlib.sha256(raw).hexdigest()}
    if file.suffix in ('.html','.css','.js','.svg'):
        compressed=gzip.compress(raw,compresslevel=6,mtime=0)
        Path(str(file)+'.gz').write_bytes(compressed)
        manifest['files'][relative]['gzipBytes']=len(compressed)
(destination/'release-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
with zipfile.ZipFile(base/'secured-v4.zip','w',zipfile.ZIP_DEFLATED) as bundle:
    for file in sorted(destination.rglob('*')):
        if file.is_file():bundle.write(file,'site/'+file.relative_to(destination).as_posix())
    for file in sorted((base/'server').glob('*')):
        if file.is_file() and file.suffix in ('.py','.json','.service','.conf'):bundle.write(file,'server/'+file.name)
print(json.dumps({'assets':mapping,'htmlBytes':manifest['files']['index.html']['bytes'],
 'htmlGzipBytes':manifest['files']['index.html']['gzipBytes'],'package':'secured-v4.zip'},ensure_ascii=False))
