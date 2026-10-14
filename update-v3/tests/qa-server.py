"""Isolated local browser QA server. All accounts/orders live in a temp DB."""
import argparse
import datetime
import importlib.util
import json
import os
from pathlib import Path
import tempfile
from urllib.parse import urlsplit, unquote
from http.server import SimpleHTTPRequestHandler

parser=argparse.ArgumentParser();parser.add_argument('--version',choices=('v2','v3'),default='v3');parser.add_argument('--port',type=int,default=43500);parser.add_argument('--release',action='store_true')
args=parser.parse_args();base=Path(__file__).resolve().parents[2]/('update-'+args.version)
spec=importlib.util.spec_from_file_location('qa_api',str(base/'server/app.py'));api=importlib.util.module_from_spec(spec);spec.loader.exec_module(api)
temp=tempfile.TemporaryDirectory(prefix='peiliao-browser-qa-');seed=json.loads((base/'server/seed.json').read_text(encoding='utf-8'))
seed['products'][0]['price']=125;seed['products'][1]['price']=250
store=api.Store(str(Path(temp.name)/'qa.sqlite3'),seed,'test-admin-123')
today=datetime.date.today();orders=[]
for index in range(3):
    date=today+datetime.timedelta(days=1 if index==2 else 0)
    orders.append({'id':'qa-order-'+str(index),'orderNo':'OLD-'+str(index),'orderDate':date.isoformat(),
      'status':'picked' if index==0 else 'unpicked','deposit':100 if index else 150,
      'earlyPickup':index==1,'customerName':'测试客户' if index==0 else '', 'phone':'13800000000' if index==0 else '',
      'note':'隔离浏览器测试','items':[{'productId':seed['products'][0]['id'],'productName':seed['products'][0]['name'],'quantity':10+index,'unitPrice':125}]})
store.migrate({'orders':orders},{'id':1,'username':'root','role':'admin'})
class Handler(api.Handler,SimpleHTTPRequestHandler):
    def do_GET(self):
        if urlsplit(self.path).path.startswith('/api/'):return api.Handler.do_GET(self)
        return SimpleHTTPRequestHandler.do_GET(self)
    def do_HEAD(self):return SimpleHTTPRequestHandler.do_HEAD(self)
    def translate_path(self,path):
        pieces=[x for x in unquote(urlsplit(path).path).split('/') if x and x not in ('.','..')]
        if not pieces:pieces=['peiliao.html']
        return str(base/('release-site' if args.release else 'site')/Path(*pieces))
server=api.Server(('127.0.0.1',args.port),Handler);server.store=store;server.origin='http://127.0.0.1:'+str(args.port);server.secure_cookies=False
print('Isolated '+args.version+' browser QA: '+server.origin,flush=True)
try:server.serve_forever()
finally:server.server_close();temp.cleanup()
