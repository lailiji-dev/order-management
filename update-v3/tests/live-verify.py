"""Verify release assets and authenticated reads; logs out after checking."""
import os
from pathlib import Path
import runpy

if not os.environ.get('PEILIAO_ADMIN_PASSWORD'):
    raise SystemExit('Set PEILIAO_ADMIN_PASSWORD in the current process environment to verify authenticated reads.')
runpy.run_path(str(Path(__file__).with_name('release-verify.py')), run_name='__main__')
