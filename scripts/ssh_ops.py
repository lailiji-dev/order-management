"""Task-scoped SSH runner with pinned host keys and local key/environment auth."""
import os
import sys
import shlex
from pathlib import Path

sys.stdout.reconfigure(encoding='utf-8')
sys.stderr.reconfigure(encoding='utf-8')

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / '.tools' / 'python'))
import paramiko

client = paramiko.SSHClient()
client.load_host_keys(str(Path.home() / '.ssh' / 'known_hosts'))
client.set_missing_host_key_policy(paramiko.RejectPolicy())
try:
    authentication = {}
    if os.environ.get('PEILIAO_SSH_KEY'):
        authentication['key_filename'] = os.environ['PEILIAO_SSH_KEY']
    else:
        authentication['password'] = os.environ['PEILIAO_SSH_PASSWORD']
    client.connect('YOUR_SERVER_HOST', port=22, username='root',
                   allow_agent=False, look_for_keys=False, timeout=15, **authentication)
    if sys.argv[1] == 'run':
        script = Path(sys.argv[2]).read_text(encoding='utf-8-sig')
        if os.environ.get('PEILIAO_ADMIN_PASSWORD'):
            script = 'export PEILIAO_ADMIN_PASSWORD=' + shlex.quote(os.environ['PEILIAO_ADMIN_PASSWORD']) + '\n' + script
        stdin, stdout, stderr = client.exec_command('bash -s', timeout=1800)
        stdin.write(script)
        stdin.channel.shutdown_write()
        for line in stdout:
            print(line, end='', flush=True)
        error = stderr.read().decode('utf-8', errors='replace')
        if error:
            print(error, file=sys.stderr, end='')
        sys.exit(stdout.channel.recv_exit_status())
    elif sys.argv[1] == 'upload':
        with client.open_sftp() as sftp:
            sftp.put(sys.argv[2], sys.argv[3])
        print('Upload complete:', sys.argv[3])
    else:
        raise ValueError('Supported operations: run, upload')
finally:
    client.close()
