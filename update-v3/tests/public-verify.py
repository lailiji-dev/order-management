"""Verify public release assets without creating a login session."""
import os
from pathlib import Path
import subprocess
import sys

environment = os.environ.copy()
environment.pop('PEILIAO_ADMIN_PASSWORD', None)
subprocess.run([sys.executable, str(Path(__file__).with_name('release-verify.py'))], env=environment, check=True)
