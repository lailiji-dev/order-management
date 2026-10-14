"""Pinned-key transport. Consumes decrypted DPAPI values from a local pipe."""
import json
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / '.tools/python'))
import paramiko

mode = sys.argv[1]
payload = json.load(sys.stdin)
client = paramiko.SSHClient()
client.load_host_keys(str(Path.home() / '.ssh/known_hosts'))
client.set_missing_host_key_policy(paramiko.RejectPolicy())
try:
    client.connect('YOUR_SERVER_HOST', username='root', key_filename=str(Path.home() / '.ssh/YOUR_SSH_KEY'),
                   allow_agent=False, look_for_keys=False, timeout=15)
    python = '/www/server/panel/pyenv/bin/python3' if mode in ('host','verifypanel','websitechosen') else '/usr/bin/python3'
    remote_helper = '/root/peiliao-security/set-website-admin-password.py' if mode == 'websitechosen' else '/root/peiliao-security/rotate-approved-credentials.py ' + mode
    stdin, stdout, stderr = client.exec_command(python + ' ' + remote_helper, timeout=120)
    stdin.write(json.dumps(payload))
    stdin.channel.shutdown_write()
    output = stdout.read().decode('utf-8', 'replace')
    error = stderr.read().decode('utf-8', 'replace')
    code = stdout.channel.recv_exit_status()
    for line in output.splitlines():
        if line.startswith(('PASS ', 'FAIL ')):print(line)
    if code:
        # Do not echo arbitrary vendor exceptions that might include secrets.
        print('Credential rotation failed; no secrets logged. Remote exit code:', code, file=sys.stderr)
        import re
        locations = re.findall(r'File "([^"]+)", line (\d+)', error)
        print('Failure locations:', [(Path(name).name, int(line)) for name, line in locations[-3:]], file=sys.stderr)
        types = re.findall(r'^([A-Za-z]+Error|AssertionError):', error, re.M)
        if types:print('Failure type:', types[-1], file=sys.stderr)
        http_codes = re.findall(r'HTTPError: HTTP Error (\d{3})', error)
        if http_codes:print('Failure HTTP status:', http_codes[-1], file=sys.stderr)
    sys.exit(code)
finally:
    client.close()
