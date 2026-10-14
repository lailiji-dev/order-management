import copy
from contextlib import closing
import importlib.util
import json
from pathlib import Path
import tempfile
import gzip
import sqlite3
import threading
import unittest
from concurrent.futures import ThreadPoolExecutor
from urllib.request import Request, urlopen
from urllib.error import HTTPError

base = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('app', str(base / 'server/app.py'))
app = importlib.util.module_from_spec(spec); spec.loader.exec_module(app)

def order(eid, deposit=100):
    return {'id':eid,'orderNo':'ignored','orderDate':'2026-10-03','status':'unpicked','deposit':deposit,
            'items':[{'productId':'p1','productName':'产品','quantity':1234,'unitPrice':125}], 'note':''}

class SharedTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory()
        self.store=app.Store(str(Path(self.tmp.name)/'test.db'),json.loads((base/'server/seed.json').read_text(encoding='utf-8')),'test-password-123')
        self.server=app.Server(('127.0.0.1',0),app.Handler);self.server.store=self.store
        self.server.origin='https://isolated.invalid';self.server.secure_cookies=False
        self.thread=threading.Thread(target=self.server.serve_forever,daemon=True);self.thread.start()
        self.url='http://127.0.0.1:'+str(self.server.server_port)
        _,self.admin=self.login('root','test-password-123')
    def tearDown(self):
        self.server.shutdown();self.server.server_close();self.thread.join();self.tmp.cleanup()
    def request(self,path,body=None,session=None,csrf=True,origin=None):
        headers={};data=None
        if session: headers['Cookie']=session['cookie']
        if body is not None:
            data=json.dumps(body).encode();headers['Content-Type']='application/json'
            if csrf and session:headers['X-CSRF-Token']=session['csrf']
            if origin:headers['Origin']=origin
        try:response=urlopen(Request(self.url+'/api/'+path,data,headers),timeout=10)
        except HTTPError as error:response=error
        result=json.loads(response.read().decode());result['_cookie']=response.headers.get('Set-Cookie','').split(';')[0]
        code=response.code;response.close();return code,result
    def login(self,name,password):
        code,result=self.request('auth/login',{'username':name,'password':password})
        if code==200:result['cookie']=result['_cookie']
        return code,result
    def change(self,after,before=None):return {'collection':'orders','id':after['id'] if after else before['id'],'before':before,'after':after}
    def test_shared_numbering_concurrency_conflicts_and_no_reuse(self):
        def create(i):return self.request('sync',{'changes':[self.change(order('order'+str(i)))]},self.admin)
        with ThreadPoolExecutor(max_workers=10) as pool:responses=list(pool.map(create,range(10)))
        self.assertTrue(all(code==200 for code,_ in responses))
        records=self.store.read()['state']['orders'];self.assertEqual(sorted(int(o['orderNo']) for o in records),list(range(1,11)))
        before=records[0];after=dict(before,note='第一次编辑')
        self.assertEqual(self.request('sync',{'changes':[self.change(after,before)]},self.admin)[0],200)
        self.assertEqual(self.request('sync',{'changes':[self.change(dict(before,note='另一设备'),before)]},self.admin)[0],409)
        record=max(self.store.read()['state']['orders'],key=lambda o:int(o['orderNo']))
        self.assertEqual(self.request('sync',{'changes':[self.change(None,record)]},self.admin)[0],200)
        code,result=create(99);self.assertEqual(code,200);self.assertEqual(result['state']['orders'][-1]['orderNo'],'000011')
        self.assertEqual(self.request('sync',{'changes':[self.change(order(record['id']))]},self.admin)[0],409)
    def test_migration_rounding_idempotence_and_deleted_orders(self):
        state={'orders':[order('a',149),order('b',150),order('c',199)]}
        code,result=self.request('migrate',{'state':state},self.admin);self.assertEqual(code,200)
        self.assertEqual([o['deposit'] for o in result['state']['orders']],[100,200,200])
        self.assertEqual(result['state']['orders'][1]['remainingAmount'],154050)
        self.assertEqual(self.request('migrate',{'state':state},self.admin)[1]['imported'],0)
        before=result['state']['orders'][0];self.request('sync',{'changes':[self.change(None,before)]},self.admin)
        state['extra']='new-backup';self.assertEqual(self.request('migrate',{'state':state},self.admin)[1]['imported'],0)
    def test_auth_permissions_csrf_creator_and_disable(self):
        self.assertEqual(self.request('state')[0],401)
        self.assertEqual(self.request('sync',{'changes':[]},self.admin,csrf=False)[0],403)
        self.assertEqual(self.request('sync',{'changes':[]},self.admin,origin='https://evil.invalid')[0],403)
        self.assertEqual(self.request('admin/users',{'username':'employee1','displayName':'员工甲','password':'test-employee'},self.admin)[0],201)
        _,staff=self.login('employee1','test-employee');self.assertEqual(self.request('admin/orders',session=staff)[0],403)
        self.assertEqual(self.request('migrate',{'state':{'orders':[]}},staff)[0],403)
        self.assertEqual(self.request('sync',{'changes':[self.change(order('staff-order'))]},staff)[0],200)
        public=self.request('state',session=staff)[1]['state']['orders'][0];self.assertNotIn('creator',public)
        private=self.request('admin/orders',session=self.admin)[1]['orders'][0];self.assertEqual(private['creatorUsername'],'employee1')
        uid=staff['user']['id'];self.assertEqual(self.request('admin/users/update',{'id':uid,'enabled':False},self.admin)[0],200)
        self.assertEqual(self.request('state',session=staff)[0],401);self.assertEqual(self.login('employee1','test-employee')[0],401)
        self.assertEqual(self.request('admin/users/update',{'id':1,'enabled':False},self.admin)[0],400)
    def test_validation_atomicity_and_retry(self):
        good=order('good');bad=order('bad',150)
        self.assertEqual(self.request('sync',{'changes':[self.change(good),self.change(bad)]},self.admin)[0],400)
        self.assertEqual(self.store.read()['state']['orders'],[])
        self.assertEqual(self.request('sync',{'changes':[self.change(good)]},self.admin)[0],200)
        self.assertEqual(self.request('sync',{'changes':[self.change(good)]},self.admin)[0],200)
        self.assertEqual(len(self.store.read()['state']['orders']),1)
        before=self.store.read()['state']['orders'][0];after=dict(before,orderDate='2026-10-04',orderNo='fake')
        updated=self.request('sync',{'changes':[self.change(after,before)]},self.admin)[1]['state']['orders'][0]
        self.assertEqual(updated['orderNo'],'000001')
        self.assertEqual(self.request('sync',{'changes':[{'collection':'productionPlans','id':'bad','before':None,'after':{}}]},self.admin)[0],400)
    def test_rounded_historical_full_deposit_remains_editable(self):
        old=order('rounded',150);old['items'][0]['quantity']=1;old['items'][0]['unitPrice']=150
        code,result=self.request('migrate',{'state':{'orders':[old]}},self.admin);self.assertEqual(code,200)
        before=result['state']['orders'][0];self.assertEqual(before['remainingAmount'],-50)
        self.assertEqual(self.request('sync',{'changes':[self.change(dict(before,note='仍可编辑'),before)]},self.admin)[0],200)
    def test_backup_restores_shared_orders_and_number_sequence(self):
        self.request('sync',{'changes':[self.change(order('backup-order'))]},self.admin)
        backup_spec=importlib.util.spec_from_file_location('backup',str(base/'server/backup.py'))
        module=importlib.util.module_from_spec(backup_spec);backup_spec.loader.exec_module(module)
        destination=Path(self.tmp.name)/'backups';module.backup(self.store.path,str(destination))
        archive=next(destination.glob('*.sql.gz'))
        with gzip.open(str(archive),'rt',encoding='utf-8') as stream, closing(sqlite3.connect(str(Path(self.tmp.name)/'restored.db'))) as restored:
            restored.executescript(stream.read())
            row=restored.execute('SELECT body,next_number FROM app_state').fetchone()
            self.assertEqual(json.loads(row[0])['orders'][0]['id'],'backup-order');self.assertEqual(row[1],2)
    def test_original_catalogue_import_after_another_device_starts(self):
        self.request('sync',{'changes':[self.change(order('new-device'))]},self.admin)
        incoming=self.store.read()['state'];incoming['products'][0]['price']=875
        code,result=self.request('migrate',{'state':incoming},self.admin);self.assertEqual(code,200)
        self.assertEqual(result['state']['products'][0]['price'],875)
        # Once a shared price is explicitly edited, a backup must not revert it.
        before=result['state']['products'][0];after=dict(before,price=999)
        self.request('sync',{'changes':[{'collection':'products','id':before['id'],'before':before,'after':after}]},self.admin)
        incoming['note']='different backup';result=self.request('migrate',{'state':incoming},self.admin)[1]
        self.assertEqual(next(p for p in result['state']['products'] if p['id']==before['id'])['price'],999)

if __name__=='__main__':unittest.main(verbosity=2)
