"""Build hashed/gzipped assets and an allowlisted runtime deployment archive."""
import gzip
import hashlib
import json
from pathlib import Path
import re
import shutil
import subprocess
import zipfile


ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / 'dist'
FRONTEND_FILES = ('admin.css', 'admin.html', 'admin.js', 'app.css', 'app.js',
                  'favicon.svg', 'index.html', 'shared.js')
DEPLOY_FILES = ('nginx.conf', 'proxy.conf', 'order-management.service',
                'order-management-backup.service', 'order-management-backup.timer')


def main():
    # Only this explicitly named generated directory may be cleared.
    if DIST.exists():
        if DIST.resolve() != ROOT / 'dist':
            raise RuntimeError('Build output must stay inside this project')
        shutil.rmtree(str(DIST))
    site = DIST / 'site'
    assets = site / 'assets'
    assets.mkdir(parents=True)
    subprocess.run(['node', str(ROOT / 'scripts/build-assets.mjs'), json.dumps(FRONTEND_FILES)],
                   check=True, cwd=str(ROOT))
    mapping = {}
    for file in [ROOT / 'frontend' / name for name in FRONTEND_FILES]:
        if file.suffix not in ('.js', '.css'):
            continue
        raw = (DIST / '.assets' / file.name).read_bytes()
        name = file.stem + '.' + hashlib.sha256(raw).hexdigest()[:12] + file.suffix
        (assets / name).write_bytes(raw)
        mapping[file.name] = '/assets/' + name
    for file in [ROOT / 'frontend' / name for name in FRONTEND_FILES]:
        if file.suffix == '.html':
            def reference(match):
                name = match.group(2).split('?')[0].lstrip('/')
                return match.group(1) + mapping.get(name, match.group(2)) + match.group(3)
            text = re.sub(r'((?:src|href)=["\'])([^"\']+)(["\'])', reference,
                          file.read_text(encoding='utf-8'))
            (site / file.name).write_text(text, encoding='utf-8')
        elif file.suffix not in ('.js', '.css') and file.is_file():
            shutil.copyfile(str(file), str(site / file.name))
    # A generated alias preserves old bookmarks without duplicate source HTML.
    (site / 'peiliao.html').write_bytes((site / 'index.html').read_bytes())
    manifest = {'version': 4, 'assets': mapping, 'files': {}}
    for file in sorted(site.rglob('*')):
        if not file.is_file():
            continue
        raw = file.read_bytes()
        meta = {'bytes': len(raw), 'sha256': hashlib.sha256(raw).hexdigest()}
        manifest['files'][file.relative_to(site).as_posix()] = meta
        if file.suffix in ('.html', '.css', '.js', '.svg'):
            compressed = gzip.compress(raw, compresslevel=6, mtime=0)
            Path(str(file) + '.gz').write_bytes(compressed)
            meta['gzipBytes'] = len(compressed)
    (site / 'release-manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')
    entries = [(file, 'site/' + file.relative_to(site).as_posix())
               for file in sorted(site.rglob('*')) if file.is_file()]
    entries += [(ROOT / 'backend' / name, 'backend/' + name)
                for name in ('app.py', 'backup.py', 'seed.json')]
    entries += [(ROOT / 'deploy' / name, 'deploy/' + name) for name in DEPLOY_FILES]
    entries += [(ROOT / name, name) for name in ('README.md', 'DEPLOY.md', 'SANITIZATION-REPORT.md')]
    archive = DIST / 'order-management.zip'
    with zipfile.ZipFile(str(archive), 'w', zipfile.ZIP_DEFLATED) as bundle:
        for file, name in entries:
            info = zipfile.ZipInfo(name, date_time=(1980, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o100644 << 16
            bundle.writestr(info, file.read_bytes())
    print('Built dist/site and dist/order-management.zip')


if __name__ == '__main__':
    main()
