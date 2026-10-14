import copy
from contextlib import closing
import importlib.util
import json
from pathlib import Path
import tempfile
import gzip
import sqlite3
import statistics
import sys
import threading
import time
import tracemalloc
import unittest
from unittest.mock import patch
from concurrent.futures import ThreadPoolExecutor
from urllib.request import Request, urlopen
from urllib.error import HTTPError

base = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('app', str(base / 'server/app.py'))
app = importlib.util.module_from_spec(spec); spec.loader.exec_module(app)

def order(eid, deposit=100):
    return {'id':eid,'orderNo':eid,'orderDate':'2026-10-03','status':'unpicked','deposit':deposit,
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
    def request(self,path,body=None,session=None,csrf=True,origin=None,extra_headers=None):
        headers=dict(extra_headers or {});data=None
        if session: headers['Cookie']=session['cookie']
        if body is not None:
            data=json.dumps(body).encode();headers['Content-Type']='application/json'
            if csrf and session:headers['X-CSRF-Token']=session['csrf']
            if origin:headers['Origin']=origin
        try:response=urlopen(Request(self.url+'/api/'+path,data,headers),timeout=10)
        except HTTPError as error:response=error
        raw=response.read().decode();result=json.loads(raw) if raw else {}
        result['_cookie']=response.headers.get('Set-Cookie','').split(';')[0]
        result['_etag']=response.headers.get('ETag');result['_length']=len(raw)
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
        records=self.store.read()['state']['orders'];self.assertEqual(sorted(o['orderNo'] for o in records),['order'+str(i) for i in range(10)])
        before=records[0];after=dict(before,note='第一次编辑')
        self.assertEqual(self.request('sync',{'changes':[self.change(after,before)]},self.admin)[0],200)
        self.assertEqual(self.request('sync',{'changes':[self.change(dict(before,note='另一设备'),before)]},self.admin)[0],409)
        record=self.store.read()['state']['orders'][-1]
        self.assertEqual(self.request('sync',{'changes':[self.change(None,record)]},self.admin)[0],200)
        code,result=create(99);self.assertEqual(code,200);self.assertEqual(result['state']['orders'][-1]['orderNo'],'order99')
        self.assertEqual(self.request('sync',{'changes':[self.change(order(record['id']))]},self.admin)[0],409)
    def test_manual_number_required_unique_concurrent_edit_and_idempotent_retry(self):
        for number in ('', '  ', None, 123, 'a\nb', 'a'*101):
            candidate=dict(order('invalid'),orderNo=number)
            self.assertEqual(self.request('sync',{'changes':[self.change(candidate)]},self.admin)[0],400)
        original=dict(order('manual'),orderNo='  000007-A  ')
        code,result=self.request('sync',{'changes':[self.change(original)]},self.admin)
        self.assertEqual(code,200)
        saved=result['state']['orders'][0]
        self.assertEqual(saved['orderNo'],'000007-A')
        self.assertEqual(self.request('sync',{'changes':[self.change(original)]},self.admin)[0],200)
        self.assertEqual(self.request('sync',{'changes':[self.change(dict(original,orderNo='different'))]},self.admin)[0],409)
        candidate=dict(order('collision'),orderNo='000007-a')
        self.assertEqual(self.request('sync',{'changes':[self.change(candidate)]},self.admin)[0],409)
        self.assertEqual(self.request('sync',{'changes':[self.change(dict(saved,status='picked'),saved)]},self.admin)[0],200)
        # Number uniqueness covers different dates and all pickup statuses.
        self.assertEqual(self.request('sync',{'changes':[self.change(dict(candidate,orderDate='2026-10-04'))]},self.admin)[0],409)
        def create(i):
            item=dict(order('collision-'+str(i)),orderNo='MY-001')
            return self.request('sync',{'changes':[self.change(item)]},self.admin)[0]
        with ThreadPoolExecutor(max_workers=8) as pool: statuses=list(pool.map(create,range(8)))
        self.assertEqual(statuses.count(200),1)
        self.assertEqual(statuses.count(409),7)
        current=next(o for o in self.store.read()['state']['orders'] if o['id']=='manual')
        self.assertEqual(self.request('sync',{'changes':[self.change(dict(current,orderNo='my-001'),current)]},self.admin)[0],409)
        renamed=dict(current,orderNo='自填00008')
        self.assertEqual(self.request('sync',{'changes':[self.change(renamed,current)]},self.admin)[0],200)
        large=dict(order('big-number'),orderNo='9'*100)
        self.assertEqual(self.request('sync',{'changes':[self.change(large)]},self.admin)[0],200)
        self.assertEqual(next(o for o in self.store.read()['state']['orders'] if o['id']=='big-number')['orderNo'],'9'*100)
        self.assertEqual(self.request('admin/orders?limit=1',session=self.admin)[1]['orders'][0]['id'],'big-number')

    def test_history_import_skips_existing_custom_number(self):
        self.assertEqual(self.request('sync',{'changes':[self.change(dict(order('manual-import-collision'),orderNo='000002'))]},self.admin)[0],200)
        code,reply=self.request('migrate',{'state':{'orders':[order('old-backup')]}},self.admin)
        self.assertEqual(code,200)
        self.assertEqual(reply['state']['orders'][-1]['orderNo'],'000003')

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
        self.assertEqual(self.request('admin/users',{'username':'employee1','displayName':'员工甲','password':'012345'},self.admin)[0],201)
        _,staff=self.login('employee1','012345');self.assertEqual(self.request('admin/orders',session=staff)[0],403)
        self.assertEqual(self.request('migrate',{'state':{'orders':[]}},staff)[0],403)
        self.assertEqual(self.request('sync',{'changes':[self.change(order('staff-order'))]},staff)[0],200)
        public=self.request('state',session=staff)[1]['state']['orders'][0];self.assertNotIn('creator',public)
        private=self.request('admin/orders',session=self.admin)[1]['orders'][0];self.assertEqual(private['creatorUsername'],'employee1')
        uid=staff['user']['id'];self.assertEqual(self.request('admin/users/update',{'id':uid,'enabled':False},self.admin)[0],200)
        self.assertEqual(self.request('state',session=staff)[0],401);self.assertEqual(self.login('employee1','012345')[0],401)
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
        self.assertEqual(updated['orderNo'],'fake')
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
            row=restored.execute('SELECT next_number FROM app_state').fetchone()
            self.assertEqual(row[0],2)
            self.assertEqual(restored.execute('PRAGMA integrity_check').fetchone()[0],'ok')
        recovered=app.Store(str(Path(self.tmp.name)/'restored.db'),self.store.seed)
        self.assertEqual(recovered.read()['state']['orders'][0]['id'],'backup-order')
        restored_user=recovered.auth(self.admin['cookie'].split('=',1)[1])
        result=recovered.sync([self.change(order('after-restore'))],restored_user)
        self.assertEqual(result['state']['orders'][-1]['orderNo'],'after-restore')

    def test_conditional_snapshot_auth_cache_and_revisions(self):
        code,first=self.request('state',session=self.admin)
        self.assertEqual(code,200);self.assertEqual(first['_etag'],'"state-0"')
        # Both a conditional read and an unconditional same-revision read reuse
        # the encoded bytes, so neither should assemble any entity collection.
        with patch.object(self.store,'_encode_state',side_effect=AssertionError('snapshot rebuilt')):
            code,unchanged=self.request('state',session=self.admin,extra_headers={'If-None-Match':first['_etag']})
            self.assertEqual(code,304);self.assertEqual(unchanged['_length'],0)
            self.assertEqual(self.request('state',session=self.admin)[0],200)
        self.assertEqual(self.request('state',extra_headers={'If-None-Match':first['_etag']})[0],401)
        code,saved=self.request('sync',{'changes':[self.change(order('etag-order'))]},self.admin)
        self.assertEqual(saved['_etag'],'"state-1"')
        self.assertEqual(self.request('state',session=self.admin,extra_headers={'If-None-Match':first['_etag']})[0],200)
        revision=saved['revision']
        replay=self.request('sync',{'changes':[self.change(order('etag-order'))]},self.admin)[1]
        self.assertEqual(replay['revision'],revision)
        self.assertEqual(self.request('state',session=self.admin,extra_headers={'If-None-Match':'W/'+saved['_etag']})[0],304)
        self.request('auth/logout',{},self.admin)
        self.assertEqual(self.request('state',session=self.admin,extra_headers={'If-None-Match':saved['_etag']})[0],401)

    def test_weak_proxy_etag_lists_wildcard_and_authentication(self):
        # gzip-capable reverse proxies may weaken the otherwise strong ETag.
        # A GET must compare weak tags, but authentication still runs first.
        code,first=self.request('state',session=self.admin)
        self.assertEqual(code,200)
        weak='W/'+first['_etag']
        for header in [weak, '"state-999", '+weak, 'W/"unrelated", '+first['_etag'], '*']:
            code,result=self.request('state',session=self.admin,extra_headers={'If-None-Match':header})
            self.assertEqual(code,304);self.assertEqual(result['_length'],0)
            self.assertEqual(self.request('state',extra_headers={'If-None-Match':header})[0],401)
        self.request('sync',{'changes':[self.change(order('etag-new-revision'))]},self.admin)
        code,changed=self.request('state',session=self.admin,extra_headers={'If-None-Match':weak})
        self.assertEqual(code,200);self.assertNotEqual(changed['_etag'],first['_etag'])
        self.assertEqual(self.request('state',session=self.admin,extra_headers={'If-None-Match':'W/'+changed['_etag']})[0],304)

    def test_admin_pagination_search_literal_wildcards_and_filters(self):
        first=order('page-one');first.update(orderNo='000001',customerName='陈%先生',phone='13800138000')
        second=order('page-two');second.update(orderNo='000002',orderDate='2026-10-04',status='picked')
        third=order('page-three');third.update(orderNo='000003',cancelled=True)
        self.request('sync',{'changes':[self.change(item) for item in [first,second,third]]},self.admin)
        page=self.request('admin/orders?limit=2&offset=0',session=self.admin)[1]
        self.assertEqual(page['total'],3);self.assertEqual([item['orderNo'] for item in page['orders']],['000003','000002'])
        tail=self.request('admin/orders?limit=2&offset=2',session=self.admin)[1]
        self.assertEqual(len(tail['orders']),1);self.assertEqual(tail['orders'][0]['phone'],'13800138000')
        self.assertEqual(len(self.request('admin/orders',session=self.admin)[1]['orders']),3)
        for query,total in [('q=%25',1),('q=1380013',1),('q=root',3),('date=2026-10-04',1),('status=picked',1),('status=unpicked',1),('status=cancelled',1)]:
            self.assertEqual(self.request('admin/orders?limit=100&'+query,session=self.admin)[1]['total'],total)
        for query in ['limit=0','offset=-1','limit=5000','date=2026-99-01','status=bogus']:
            self.assertEqual(self.request('admin/orders?'+query,session=self.admin)[0],400)

    def test_nonfinite_and_invalid_recipe_are_rejected_atomically(self):
        before=self.store.read()['state']['products'][0]
        for field,value in [('recipeYield',float('nan')),('lossRate',float('inf')),('recipeYield',-1)]:
            after=dict(before,**{field:value})
            code,_=self.request('sync',{'changes':[self.change(order('must-rollback')),{'collection':'products','id':before['id'],'before':before,'after':after}]},self.admin)
            self.assertEqual(code,400);self.assertEqual(self.store.read()['state']['orders'],[])
        after=dict(before,recipe=[{'name':'糖','amount':float('inf'),'unit':'kg'}])
        self.assertEqual(self.request('sync',{'changes':[{'collection':'products','id':before['id'],'before':before,'after':after}]},self.admin)[0],400)
        after=dict(before,recipeYield=1e300)
        self.assertEqual(self.request('sync',{'changes':[{'collection':'products','id':before['id'],'before':before,'after':after}]},self.admin)[0],400)
        bad=order('x'*101)
        self.assertEqual(self.request('sync',{'changes':[self.change(bad)]},self.admin)[0],400)
        payload=json.dumps({'changes':[], 'extra':1.25}).replace('1.25','1e999').encode()
        headers={'Content-Type':'application/json','Cookie':self.admin['cookie'],'X-CSRF-Token':self.admin['csrf']}
        with self.assertRaises(HTTPError) as error:
            urlopen(Request(self.url+'/api/sync',payload,headers),timeout=10)
        self.assertEqual(error.exception.code,400);error.exception.close()

    def test_busy_workers_are_bounded_and_recover(self):
        acquired=0
        try:
            # The login response may have arrived just before its handler's
            # finally block releases a worker. Wait for that request to finish
            # instead of confusing transient occupancy with pool capacity.
            deadline=time.monotonic()+3
            for _ in range(32):
                self.assertTrue(self.server._workers.acquire(timeout=max(0,deadline-time.monotonic())),
                                'Earlier request did not release its worker')
                acquired+=1
            self.assertEqual(acquired,32)
            extra=self.server._workers.acquire(False)
            if extra:acquired+=1
            self.assertFalse(extra,'Worker pool exceeds the configured 32-request limit')
            # Exercise the actual busy branch without a client/socket close
            # race: Windows may reset a connection closed before request bytes
            # were consumed. The captured response must still be HTTP 503.
            class CapturedSocket:
                def __init__(self):self.response=b''
                def settimeout(self,seconds):pass
                def sendall(self,data):self.response+=data
            rejected=CapturedSocket()
            with patch.object(self.server,'shutdown_request') as shutdown:
                self.server.process_request(rejected,('127.0.0.1',0))
                shutdown.assert_called_once_with(rejected)
            headers,body=rejected.response.split(b'\r\n\r\n',1)
            self.assertTrue(headers.startswith(b'HTTP/1.0 503 Service Unavailable\r\n'))
            self.assertIn('error',json.loads(body.decode('utf-8')))
            self.assertFalse(self.server._workers.acquire(False),'Busy rejection leaked a worker permit')
        finally:
            for _ in range(acquired):self.server._workers.release()
        self.assertEqual(self.request('health')[0],200)

    def test_custom_legacy_identifiers_remain_editable(self):
        custom=order('自定义"订单');custom['items'][0]['productId']='产品"旧编号'
        code,result=self.request('sync',{'changes':[self.change(custom)]},self.admin)
        self.assertEqual(code,200)
        before=result['state']['orders'][0]
        self.assertEqual(self.request('sync',{'changes':[self.change(dict(before,note='修改自定义编号'),before)]},self.admin)[0],200)
        before=self.store.read()['state']['orders'][0]
        self.assertEqual(self.request('sync',{'changes':[self.change(None,before)]},self.admin)[0],200)

    def test_production_format_v2_database_migration_and_restart(self):
        old_spec=importlib.util.spec_from_file_location('v2',str(base.parent/'update-v2/server/app.py'))
        old_app=importlib.util.module_from_spec(old_spec);old_spec.loader.exec_module(old_app)
        old_path=str(Path(self.tmp.name)/'old-v2.db')
        old=old_app.Store(old_path,self.store.seed,'original-password')
        token,csrf,user=old.login('root','original-password','legacy-device')
        old.sync([self.change(order('old-a')),self.change(order('old-b'))],user)
        b=old.read()['state']['orders'][1];old.sync([self.change(None,b)],user)
        old.migrate({'orders':[order('old-import',150)]},dict(user,role='admin'))
        with old.connect() as db:
            before_tables={name:[tuple(row) for row in db.execute('SELECT * FROM '+name)] for name in ['users','sessions','order_meta','audit','migrations','login_attempts']}
            before_counter=tuple(db.execute('SELECT revision,next_number,initialized FROM app_state').fetchone())
        expected=old.read()
        upgraded=app.Store(old_path,self.store.seed)
        self.assertEqual(upgraded.read(),expected)
        self.assertEqual(upgraded.auth(token)['username'],'root')
        with upgraded.connect() as db:
            after_tables={name:[tuple(row) for row in db.execute('SELECT * FROM '+name)] for name in before_tables}
            before_tables['sessions']=[(app.session_key(row[0]),)+row[1:] for row in before_tables['sessions']]
            self.assertEqual(before_tables,after_tables)
            self.assertEqual(tuple(db.execute('SELECT revision,next_number,initialized FROM app_state').fetchone()),before_counter)
            self.assertEqual(db.execute('PRAGMA user_version').fetchone()[0],4)
            self.assertNotIn('orders',json.loads(db.execute('SELECT body FROM app_state').fetchone()[0]))
            self.assertEqual(db.execute('PRAGMA integrity_check').fetchone()[0],'ok')
        restarted=app.Store(old_path,self.store.seed)
        self.assertEqual(restarted.read(),expected)
        with self.assertRaises(app.ApiError) as error:
            restarted.sync([self.change(order('old-b'))],user)
        self.assertEqual(error.exception.status,409)
        result=restarted.sync([self.change(order('next-after-upgrade'))],user)
        self.assertEqual(result['state']['orders'][-1]['orderNo'],'next-after-upgrade')
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

def benchmark():
    """Local synthetic benchmark. Never connects to or writes a live server."""
    old_spec=importlib.util.spec_from_file_location('v2_bench',str(base.parent/'update-v2/server/app.py'))
    old_app=importlib.util.module_from_spec(old_spec);old_spec.loader.exec_module(old_app)
    seed=json.loads((base/'server/seed.json').read_text(encoding='utf-8'))

    def median_ms(operation,iterations=9):
        operation()
        timings=[]
        for _ in range(iterations):
            started=time.perf_counter();operation();timings.append((time.perf_counter()-started)*1000)
        return round(statistics.median(timings),3)

    results=[]
    for size in (1000,10000):
        with tempfile.TemporaryDirectory() as folder:
            records=[]
            for index in range(size):
                record=app.normalize_order(order('benchmark-'+str(index)))
                record.update(orderNo=str(index+1).zfill(6),createdAt='2026-10-03T00:00:00Z',updatedAt='2026-10-03T00:00:00Z')
                records.append(record)
            state=dict(copy.deepcopy(seed),orders=records)
            stores=[]
            for module,name in [(old_app,'v2'),(app,'v3')]:
                path=str(Path(folder)/(name+'.db'))
                legacy=old_app.Store(path,seed,'benchmark-password')
                with legacy.connect() as db:
                    db.execute('UPDATE app_state SET body=?,revision=5,next_number=?,initialized=1',
                               (json.dumps(state,ensure_ascii=False),size+1))
                    db.executemany('INSERT INTO order_meta VALUES(?,?,1,0)',[(record['id'],index+1) for index,record in enumerate(records)])
                stores.append(module.Store(path,seed))
            old,new=stores
            user={'id':1,'username':'root','role':'admin'}
            old_read=lambda:json.dumps(old.read(),ensure_ascii=False).encode('utf-8')
            new_read=lambda:new.snapshot()[1]
            old_wire=len(old_read());new_wire=len(new_read())
            old_get=median_ms(old_read);new_get=median_ms(new_read)
            unchanged=median_ms(lambda:new.snapshot('"state-5"'))
            # Exclude fixture/current-state lookup from the timed operation: a
            # real client already sends its compare-and-swap before value.
            def write_measure(store,name):
                times=[]
                for attempt in range(10):
                    current=store.read()['state']['orders'][0]
                    change={'collection':'orders','id':current['id'],'before':current,'after':dict(current,note=name+'-'+str(attempt))}
                    started=time.perf_counter()
                    if name=='v3':store.sync([change],user,encoded=True)
                    else:json.dumps(store.sync([change],user),ensure_ascii=False).encode('utf-8')
                    duration=(time.perf_counter()-started)*1000
                    if attempt:times.append(duration)
                return round(statistics.median(times),3)

            old_write=write_measure(old,'v2');new_write=write_measure(new,'v3')
            peak={}
            for name,operation in [('v2',old_read),('v3',new_read)]:
                tracemalloc.start();operation();peak[name]=tracemalloc.get_traced_memory()[1];tracemalloc.stop()
            results.append({'orders':size,'v2_get_ms':old_get,'v3_cached_get_ms':new_get,'v3_unchanged_poll_ms':unchanged,
                            'v2_edit_ms':old_write,'v3_edit_ms':new_write,'v2_snapshot_bytes':old_wire,'v3_snapshot_bytes':new_wire,
                            'v2_get_peak_allocation_bytes':peak['v2'],'v3_cached_get_peak_allocation_bytes':peak['v3']})
    print(json.dumps({'environment':'local synthetic SQLite/store paths; excludes network and authentication; median of 9 warm samples',
                      'python':sys.version.split()[0],'sqlite':sqlite3.sqlite_version,'results':results},ensure_ascii=False,indent=2))


if __name__=='__main__':
    if '--benchmark' in sys.argv:benchmark()
    else:unittest.main(verbosity=2)
