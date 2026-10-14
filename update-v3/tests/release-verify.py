"""Verify the published release. No test orders or accounts are created."""
import gzip
import hashlib
import http.cookiejar
import json
import os
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, build_opener, HTTPCookieProcessor, HTTPRedirectHandler

origin = 'https://YOUR_APP_DOMAIN'
manifest = json.loads((Path(__file__).resolve().parents[1] / 'release-site/release-manifest.json').read_text(encoding='utf-8'))
cookies = http.cookiejar.CookieJar()
client = build_opener(HTTPCookieProcessor(cookies))

def request(path, data=None, csrf=None, headers=None):
    fields = {'Origin': origin}
    fields.update(headers or {})
    body = None
    if data is not None:
        fields['Content-Type'] = 'application/json'
        body = json.dumps(data).encode('utf-8')
    if csrf:
        fields['X-CSRF-Token'] = csrf
    try:
        response = client.open(Request(origin + path, body, fields), timeout=30)
    except HTTPError as error:
        response = error
    return response.code, response.read(), response.headers

for name, metadata in manifest['files'].items():
    path = '/' if name == 'index.html' else '/' + name
    code, raw, headers = request(path, headers={'Accept-Encoding': 'gzip'})
    assert code == 200, (path, code)
    transfer = len(raw)
    if 'gzipBytes' in metadata:
        assert headers.get('Content-Encoding') == 'gzip', (path, 'gzip missing')
        assert transfer == metadata['gzipBytes'], (path, 'unexpected compressed size')
        raw = gzip.decompress(raw)
    assert hashlib.sha256(raw).hexdigest() == metadata['sha256'], (path, 'content mismatch')
    policy = headers.get('Cache-Control', '')
    if name.startswith('assets/'):
        assert 'immutable' in policy and 'max-age=31536000' in policy, (path, policy)
    elif name.endswith('.html'):
        assert 'no-store' in policy, (path, policy)
    if name != 'favicon.svg':
        assert headers.get('Strict-Transport-Security'), (path, 'HSTS missing')
    print('PASS artifact, compression and cache:', path, transfer, 'bytes', flush=True)

assert request('/release-manifest.json')[0] == 404
assert request('/api/state', headers={'If-None-Match': '"state-0"'})[0] == 401
code, raw, _ = request('/api/health')
assert code == 200 and json.loads(raw) == {'ok': True, 'version': 3}
print('PASS API health v3 and unauthenticated access protection', flush=True)

password = os.environ.get('PEILIAO_ADMIN_PASSWORD')
if password:
    code, raw, headers = request('/api/auth/login', {'username': 'root', 'password': password})
    assert code == 200, ('login', code)
    login = json.loads(raw)
    assert login['user']['role'] == 'admin'
    assert all(flag in headers.get('Set-Cookie', '') for flag in ('Secure', 'HttpOnly', 'SameSite=Lax'))
    try:
        assert request('/api/auth/me')[0] == 200
        code, raw, headers = request('/api/state', headers={'Accept-Encoding': 'gzip'})
        assert code == 200 and headers.get('ETag')
        assert headers.get('Content-Encoding') == 'gzip'
        state = json.loads(gzip.decompress(raw))
        assert all('creator' not in order for order in state['state']['orders'])
        code, raw, _ = request('/api/state', headers={'If-None-Match': headers['ETag'], 'Accept-Encoding': 'gzip'})
        assert code == 304 and raw == b'', ('conditional state', code, headers['ETag'], len(raw))
        for tag in (headers['ETag'].removeprefix('W/'), '*'):
            code, raw, _ = request('/api/state', headers={'If-None-Match': tag})
            assert code == 304 and raw == b''
        code, raw, _ = request('/api/admin/orders?limit=100&offset=0')
        orders = json.loads(raw)
        assert code == 200 and len(orders['orders']) <= 100 and orders['total'] == len(state['state']['orders'])
        assert request('/api/admin/users')[0] == 200
        assert request('/api/admin/audit')[0] == 200
        assert request('/api/sync', {'changes': []})[0] == 403
        print('PASS login, ETag 304, admin pagination, CSRF and secure session', flush=True)
        print('Production shared orders:', orders['total'], 'Initialized:', state['initialized'], flush=True)
    finally:
        assert request('/api/auth/logout', {}, login['csrf'])[0] == 200
    assert request('/api/state')[0] == 401
    print('PASS logout', flush=True)

class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, *args):
        return None

try:
    build_opener(NoRedirect()).open('http://YOUR_APP_DOMAIN/', timeout=20)
except HTTPError as error:
    assert error.code == 308 and error.headers['Location'] == origin + '/'
else:
    raise AssertionError('HTTPS redirect missing')
print('PASS HTTP to HTTPS redirect', flush=True)
