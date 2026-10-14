"""Publish this frontend-only change with a backup and unchanged-data checks.

Runs on the existing server with Python 3.6; does not restart services.
"""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import shutil
import sqlite3
import sys
import tempfile


stage = Path(sys.argv[1]).resolve()
site = Path('/www/wwwroot/YOUR_APP_DOMAIN')
database = Path('/www/server/peiliao-app/data/peiliao.sqlite3')
backend = Path('/www/server/peiliao-app/app.py')
plan = json.loads((stage / 'plan.json').read_text(encoding='utf-8'))
spec = importlib.util.spec_from_file_location('retention', str(stage / 'fingerprint.py'))
retention = importlib.util.module_from_spec(spec)
spec.loader.exec_module(retention)


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


assert set(plan['files']) == {'index.html', 'index.html.gz', 'peiliao.html',
                             'peiliao.html.gz', plan['asset'], plan['asset'] + '.gz'}
assert plan['asset'].startswith('assets/app.') and plan['asset'].endswith('.js')
for name, expected in plan['files'].items():
    assert '..' not in Path(name).parts and not Path(name).is_absolute()
    assert digest(stage / name) == expected, 'Staged asset checksum mismatch'
for name, expected in plan['previous'].items():
    assert digest(site / name) == expected, 'Live release changed; publication stopped'
assert digest(backend) == plan['backend'], 'Backend changed; publication stopped'

backup = Path(tempfile.mkdtemp(prefix='order-display-before-', dir='/root/peiliao-security'))
os.chmod(str(backup), 0o700)
for name in plan['files']:
    if (site / name).exists():
        target = backup / name
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(str(site / name), str(target))

guard = sqlite3.connect(str(database), timeout=10)
installed = []
try:
    # Briefly serialize writes so before/after checks use identical business data.
    guard.execute('BEGIN IMMEDIATE')
    before = retention.fingerprint(database)
    source = sqlite3.connect(database.resolve().as_uri() + '?mode=ro', uri=True)
    try:
        with (backup / 'database.sql').open('w', encoding='utf-8') as output:
            for line in source.iterdump():
                output.write(line + '\n')
        os.chmod(str(backup / 'database.sql'), 0o600)
    finally:
        source.close()
    (backup / 'data-before.json').write_text(json.dumps(before), encoding='utf-8')
    # Publish the fingerprinted JS first; switch HTML only after it is available.
    names = sorted(plan['files'], key=lambda name: not name.startswith('assets/'))
    for name in names:
        target = site / name
        pending = target.with_name('.' + target.name + '.next')
        shutil.copyfile(str(stage / name), str(pending))
        os.chmod(str(pending), 0o644)
        os.replace(str(pending), str(target))
        installed.append(name)
        assert digest(target) == plan['files'][name]
    after = retention.fingerprint(database)
    assert before == after, 'Business data changed during frontend publication'
    assert digest(backend) == plan['backend']
except Exception:
    for name in reversed(installed):
        if (backup / name).exists():
            os.replace(str(backup / name), str(site / name))
    raise
finally:
    guard.rollback()
    guard.close()
print('PASS frontend published; complete business-data fingerprint unchanged')
print('Backup:', backup)
