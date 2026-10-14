"""Read-only public checks. Never logs application data or login credentials."""
import gzip
import hashlib
import json
from pathlib import Path
import socket
import subprocess
import sys
import tempfile
import time
from email.parser import Parser
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


class NativeResponse:
    def __init__(self, code, headers, body):
        self.code, self.headers, self.body = code, headers, body
    def __enter__(self):
        return self
    def __exit__(self, *args):
        return False
    def read(self):
        return self.body


def native_get(request, timeout):
    # Windows' trusted TLS implementation provides a second verified transport
    # when the local proxy resets Python SSL handshakes. GETs only; no TLS bypass.
    url = request.full_url if isinstance(request, Request) else request
    with tempfile.TemporaryDirectory(prefix='peiliao-public-verify-') as folder:
        header = Path(folder) / 'headers.txt'
        command = ['curl.exe', '--silent', '--show-error', '--retry', '2',
                   '--retry-all-errors', '--connect-timeout', str(timeout),
                   '--max-time', str(timeout), '--dump-header', str(header)]
        if isinstance(request, Request):
            for name, value in request.header_items():
                command.extend(['--header', name + ': ' + value])
        response = subprocess.run(command + [url], stdout=subprocess.PIPE,
                                  stderr=subprocess.PIPE, timeout=timeout*4+10)
        if response.returncode:
            raise OSError('Native verified HTTPS GET failed')
        blocks = header.read_bytes().decode('iso-8859-1').strip().split('\r\n\r\n')
        status, headers = blocks[-1].split('\r\n', 1)
        return NativeResponse(int(status.split()[1]), Parser().parsestr(headers), response.stdout)


def verified_get(request, timeout=15):
    if '--curl' in sys.argv:
        return native_get(request, timeout)
    # Retry transient connection failures on these read-only checks. Preserve
    # certificate verification and return HTTP errors to each status assertion.
    for attempt in range(4):
        try:
            return urlopen(request, timeout=timeout)
        except HTTPError:
            raise
        except (URLError, OSError):
            if attempt == 3:
                raise
            time.sleep(0.5 * (attempt + 1))

origin = 'https://YOUR_APP_DOMAIN'
base = Path(__file__).resolve().parents[1]
manifest_path = Path(sys.argv[sys.argv.index('--manifest')+1]) if '--manifest' in sys.argv else base/'update-v4/release-site/release-manifest.json'
manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
for path in ('/', '/admin.html', '/api/health', '/api/state', '/api/admin/users'):
    try:response = verified_get(origin+path,timeout=15)
    except HTTPError as error:response = error
    with response:
        expected = 401 if path in ('/api/state','/api/admin/users') else 200
        assert response.code == expected, (path,response.code)
        headers=response.headers
        for header in ('Content-Security-Policy','X-Frame-Options','X-Content-Type-Options','Strict-Transport-Security','Referrer-Policy','Permissions-Policy'):
            assert headers.get(header), (path,header)
        assert "script-src 'self'" in headers['Content-Security-Policy']
        assert headers['X-Frame-Options']=='DENY'
        assert 'no-store' in headers['Cache-Control']
    print('PASS route status, authentication and headers',path)
for path in ('/.env','/.git/config','/data/peiliao.sqlite3','/server/app.py','/backup.sql','/secured-v4.zip','/release-manifest.json','/test.php'):
    try:
        with verified_get(origin+path,timeout=15) as response:code=response.code
    except HTTPError as error:code=error.code
    assert code in (403,404),(path,code)
print('PASS 8 sensitive-file/unsupported-route denials')
for name, info in manifest['files'].items():
    if name.endswith('.gz'):continue
    with verified_get(Request(origin+'/'+name,headers={'Accept-Encoding':'gzip'}),timeout=15) as response:
        raw=response.read()
        if response.headers.get('Content-Encoding')=='gzip':raw=gzip.decompress(raw)
        assert hashlib.sha256(raw).hexdigest()==info['sha256'],name
        if name.startswith('assets/'):
            assert 'immutable' in response.headers['Cache-Control']
        assert response.headers.get('Content-Security-Policy'),name
print('PASS all released files match manifest; compressed hashed assets have security headers and immutable caching')
for port in (() if '--skip-external-ports' in sys.argv else (888,3306,4188,3000)):
    try:
        with socket.create_connection(('YOUR_SERVER_HOST',port),timeout=2):reachable=True
    except OSError:reachable=False
    assert not reachable,port
    print('PASS external port not reachable',port)
print('PASS read-only public security verification')
