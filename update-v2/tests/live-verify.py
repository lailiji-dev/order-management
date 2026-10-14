"""Read-only production verification. Creates a login session, then logs out."""
import hashlib
import http.cookiejar
import json
import os
from pathlib import Path
from urllib.request import Request, build_opener, HTTPCookieProcessor, HTTPRedirectHandler
from urllib.error import HTTPError

origin='https://YOUR_APP_DOMAIN'
cookies=http.cookiejar.CookieJar();client=build_opener(HTTPCookieProcessor(cookies))
def request(path, data=None, csrf=None):
    headers={'Origin':origin};body=None
    if data is not None:
        headers['Content-Type']='application/json';body=json.dumps(data).encode()
    if csrf:headers['X-CSRF-Token']=csrf
    try:response=client.open(Request(origin+path,body,headers),timeout=30)
    except HTTPError as error:response=error
    raw=response.read();return response.code,json.loads(raw.decode()),response.headers

base=Path(__file__).resolve().parents[1]
for remote,local in [('/', 'peiliao.html'),('/peiliao.html','peiliao.html'),('/shared.js','shared.js'),('/admin.html','admin.html')]:
    response=client.open(origin+remote,timeout=30);actual=hashlib.sha256(response.read()).hexdigest()
    expected=hashlib.sha256((base/'site'/local).read_bytes()).hexdigest()
    assert actual==expected,(remote,'unexpected content');assert 'no-store' in response.headers.get('Cache-Control','')
    print('PASS live artifact and cache policy:',remote)
assert request('/api/state')[0]==401
code,login,headers=request('/api/auth/login',{'username':'root','password':os.environ['PEILIAO_ADMIN_PASSWORD']})
assert code==200 and login['user']['role']=='admin'
assert all(flag in headers.get('Set-Cookie','') for flag in ('Secure','HttpOnly','SameSite=Lax'))
assert request('/api/auth/me')[0]==200
code,state,_=request('/api/state');assert code==200
assert all('creator' not in order for order in state['state']['orders'])
assert request('/api/admin/users')[0]==200
code,orders,_=request('/api/admin/orders');assert code==200
assert request('/api/admin/audit')[0]==200
assert request('/api/sync',{'changes':[]})[0]==403
assert request('/api/auth/logout',{},login['csrf'])[0]==200
assert request('/api/state')[0]==401
print('PASS live login, secure cookie, shared read, admin permissions, CSRF and logout')
print('Live order count:',len(orders['orders']),'Initialized:',state['initialized'])
class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self,*args):return None
try:build_opener(NoRedirect()).open('http://YOUR_APP_DOMAIN/',timeout=20)
except HTTPError as error:assert error.code==308 and error.headers['Location']==origin+'/'
else:raise AssertionError('HTTPS redirect missing')
print('PASS HTTP redirects to HTTPS')
