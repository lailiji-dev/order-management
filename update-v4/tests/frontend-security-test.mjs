import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {inlineAssets} from '../../update-v3/tests/frontend-assets.mjs';
import {JSDOM,VirtualConsole} from '../../update-v3/tests/test-dom.mjs';

const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const errors=[],alerts=[];
function page(name='peiliao.html',{version='update-v4',local=true,storage={},fetch}={}){
  const vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e));
  return new JSDOM(inlineAssets(new URL('../../'+version+'/site/'+name,import.meta.url)),{
    url:'https://isolated.invalid/',runScripts:'dangerously',pretendToBeVisual:true,virtualConsole:vc,
    beforeParse(w){w.__LOCAL_TEST__=local;w.alert=m=>alerts.push(m);w.confirm=()=>true;w.matchMedia=()=>({matches:false});w.scrollTo=()=>{};w.HTMLElement.prototype.scrollIntoView=()=>{};w.fetch=fetch||(async()=>({ok:false,status:401,json:async()=>({error:'请登录'})}));for(const [key,value] of Object.entries(storage))w.localStorage.setItem(key,value);}
  });
}
function response(data){return {ok:true,status:200,headers:{get:()=>null},json:async()=>data};}
function account(id=1,role='employee'){return {user:{id,username:'isolated'+id,displayName:'隔离测试'+id,role,canCalculate:role==='admin'},csrf:'test'+id};}
function record(w,id='private-order'){
  return {id,orderNo:'000001',orderDate:w.todayStr?w.todayStr():'2026-10-03',customerName:'敏感客户',phone:'13900001111',note:'private-secret',status:'unpicked',cancelled:false,earlyPickup:false,
    deposit:0,orderAmount:125,remainingAmount:125,createdAt:'2026-01-01',updatedAt:'2026-01-01',items:[{productId:'p1',productName:'测试产品',quantity:1,unitPrice:125,subtotal:125}]};
}
let passed=0;function check(name,fn){fn();passed++;console.log('PASS '+name);}

// Reproduce the old DOM sink in an isolated fixture to distinguish confirmed
// local/import XSS from remote persisted values normalized by the API.
const injected='2026-10-03<img id="xss-probe" src="x" onerror="window.injected=true">';
const dateNow=new Date(),deviceDate=dateNow.getFullYear()+'-'+String(dateNow.getMonth()+1).padStart(2,'0')+'-'+String(dateNow.getDate()).padStart(2,'0');
const legacyFixture={dataVersion:1,categories:[{id:'c1',name:'本机测试',sort:1}],products:[{id:'p1',name:'本机产品',categoryId:'c1',price:125,recipeYield:500,lossRate:0,enabled:true,recipe:[]}],orders:[],settings:{},productionPlans:{},todayPlan:{p1:1},calcPlanDate:injected};
const legacyStorage={food_factory_app_data_v1:JSON.stringify(legacyFixture),peiliao_plan_date_v1:deviceDate};
let dom=page('peiliao.html',{version:'update-v3',storage:legacyStorage}),w=dom.window;
w.onCalculate();
check('v3 fixture reproduces unescaped imported calculation date in print DOM',()=>{const el=w.document.querySelector('#printArea #xss-probe');assert.ok(el);el.dispatchEvent(new w.Event('error'));assert.equal(w.injected,true);});
dom.window.close();

dom=page('peiliao.html',{storage:legacyStorage});w=dom.window;w.onCalculate();
check('Calculation and print HTML escape an imported date payload',()=>{assert.equal(w.document.querySelector('#xss-probe'),null);assert.ok(w.document.querySelector('#printArea').textContent.includes('<img'));assert.equal(w.injected,undefined);});
w.openNewOrder(injected);
check('Order edit date payload cannot create executable markup',()=>{assert.equal(w.document.querySelector('#view-order-edit img,[onerror]'),null);assert.ok(w.document.querySelector('#oeDate').textContent.includes('<img'));});
w.closeOverlays();w.state.orders=[record(w)];w.state.orders[0].items[0].quantity='1" autofocus onfocus="window.injected=true';w.invalidateDataIndex();w.openEditOrder('private-order');
check('Imported malformed quantity cannot escape an input attribute',()=>{assert.equal(w.document.querySelector('[onfocus],[autofocus]'),null);assert.equal(w.injected,undefined);});
w.closeOverlays();w.state.orders[0].items[0].quantity=1;w.state.orders[0].orderDate=injected;w.openOrderDetail('private-order');
check('Order detail and production date output stay plain text',()=>{assert.equal(w.document.querySelector('#xss-probe'),null);w.openProduction(injected);assert.equal(w.document.querySelector('#xss-probe'),null);});
dom.window.close();

dom=page();w=dom.window;const remote=JSON.parse(JSON.stringify(w.state));remote.orders=[record(w)];
w.fetch=async()=>response({state:remote,revision:1});w.sharedStarted=true;await w.sharedActivate(account());
check('Shared server records are not persisted as a full local cache',()=>{assert.equal(w.localStorage.getItem(w.LS_KEY),null);const plan=JSON.parse(w.localStorage.getItem(w.LS_LOCAL_PLAN));assert.equal(plan.orders,undefined);assert.ok(!JSON.stringify(plan).includes('private-secret'));});
w.openOrderDetail('private-order');w.document.querySelector('#nextPassword').value='sensitive-unused-password';w.sharedHide();
check('Logout/expiry removes private order DOM, memory and password values',()=>{assert.equal(w.state.orders.length,0);assert.equal(w.sharedBaseline,null);assert.equal(w.sharedSession,null);assert.ok(!w.document.body.textContent.includes('private-secret'));assert.ok(!w.document.body.textContent.includes('13900001111'));assert.equal(w.document.querySelector('#nextPassword').value,'');assert.equal(w.editBuf,null);assert.equal(w.planRenderSignature,'');assert.equal(w.overlayReturnFocus,null);assert.equal(w.document.querySelector('#view-orders').__lastHTML,undefined);});
await w.sharedActivate(account());w.state.orders[0].note='unsaved-private-edit';w.sharedHide();
check('Expiry keeps only the user pending recovery record and original legacy backups',()=>{const pending=JSON.parse(w.localStorage.getItem('peiliao_pending_shared_v2_1'));assert.equal(pending.changes.length,1);assert.equal(pending.changes[0].after.note,'unsaved-private-edit');assert.equal(w.localStorage.getItem(w.LS_KEY),null);});
dom.window.close();

// A prior v3 full cache may be present on the device when v4 first loads.
dom=page('peiliao.html',{storage:{peiliao_shared_cache_v2:'1',food_factory_app_data_v1:JSON.stringify(remote),peiliao_before_shared_v2:JSON.stringify({orders:[{note:'original-device-order'}]})}});w=dom.window;
check('Upgrade purges acknowledged shared cache but preserves original device backup',()=>{assert.equal(w.state.orders.length,0);assert.equal(w.localStorage.getItem(w.LS_KEY),null);assert.ok(w.localStorage.getItem('peiliao_before_shared_v2').includes('original-device-order'));});dom.window.close();
dom=page('peiliao.html',{storage:{peiliao_shared_cache_v2:'1',food_factory_app_data_v1:'{"orders":[{"note":"private-partial'}});w=dom.window;
check('Malformed old shared caches are also purged safely',()=>{assert.equal(w.localStorage.getItem(w.LS_KEY),null);assert.equal(w.state.orders.length,0);});dom.window.close();

// Login failure must not discard the yet-to-be-migrated original local data.
dom=page('peiliao.html',{local:false,storage:{food_factory_app_data_v1:JSON.stringify(remote)}});w=dom.window;await sleep(10);let imported=null;
w.fetch=async(url,options)=>{if(url.endsWith('/migrate'))imported=JSON.parse(options.body).state;return response({state:remote,revision:2,imported:1});};await w.sharedActivate(account(1,'admin'));
check('Legacy orders survive an initial unauthenticated boot and merge at administrator login',()=>{assert.equal(imported.orders[0].note,'private-secret');assert.ok(w.localStorage.getItem('peiliao_before_shared_v2').includes('private-secret'));assert.equal(w.localStorage.getItem(w.LS_KEY),null);});dom.window.close();

dom=page('peiliao.html',{local:false,storage:{food_factory_app_data_v1:JSON.stringify(remote)}});w=dom.window;await sleep(10);const restrictedAdmin=account(1,'admin');restrictedAdmin.user.canCalculate=false;
w.fetch=async()=>response({state:remote,revision:1,permissions:{canCalculate:false}});await w.sharedActivate(restrictedAdmin);
check('An administrator without calculation permission preserves the original device backup before switching to shared data',()=>{assert.ok(w.localStorage.getItem('peiliao_before_shared_v2').includes('private-secret'));assert.equal(w.sharedCanCalculate(),false);assert.equal(w.localStorage.getItem(w.LS_KEY),null);});dom.window.close();

for(const status of [200,401]){
  dom=page();w=dom.window;const first=JSON.parse(JSON.stringify(w.state));first.orders=[record(w)];w.sharedStarted=true;w.fetch=async()=>response({state:first,revision:1});await w.sharedActivate(account(1));
  w.state.orders[0].note='old-account-edit';let finish;w.fetch=()=>new Promise(resolve=>finish=resolve);const inFlight=w.flushShared();w.sharedHide();
  const fresh=JSON.parse(JSON.stringify(w.state));fresh.orders=[{...record(w,'new-account-order'),note:'new-account-state'}];w.fetch=async()=>response({state:fresh,revision:2});await w.sharedActivate(account(2));
  finish(status===200?response({state:first,revision:3}):{ok:false,status:401,json:async()=>({error:'旧会话失效'})});await inFlight;
  check('A late '+status+' save response cannot restore or close a new account session',()=>{assert.equal(w.sharedSession.user.id,2);assert.equal(w.state.orders[0].note,'new-account-state');assert.equal(w.state.orders[0].id,'new-account-order');});dom.window.close();
}

dom=page('peiliao.html',{local:false});w=dom.window;await sleep(10);w.fetch=async()=>response({state:remote,revision:1});await w.sharedActivate(account());w.fetch=async()=>({ok:false,status:401,json:async()=>({error:'请登录'})});let restored=new w.Event('pageshow');Object.defineProperty(restored,'persisted',{value:true});w.dispatchEvent(restored);
check('A main page restored from browser history erases private data before reauthentication',()=>{assert.equal(w.state.orders.length,0);assert.equal(w.document.querySelectorAll('.order-card').length,0);assert.equal(w.sharedSession,null);});await sleep(10);dom.window.close();

dom=page('admin.html',{local:false});w=dom.window;await sleep(10);w.session=account(1,'admin');w.allUsers=[{id:'1" onclick="window.injected=true',username:'<b>账号</b>',displayName:'<img onerror="evil">',role:'employee',enabled:true}];w.renderUsers();
w.allOrders=[{...record(w),creator:'管理员',creatorUsername:'root',items:[{productName:'<img onerror="evil">',quantity:'<img id="admin-injected" onerror="evil">'}]}];w.orderTotal=1;w.renderOrders();
check('Admin record text and opaque identifiers cannot create event attributes',()=>{assert.equal(w.document.querySelector('[onclick],[onerror],#admin-injected'),null);assert.ok(w.document.querySelector('#orders').textContent.includes('<img'));});
w.node('audit').innerHTML='<tr><td>private-audit</td></tr>';w.node('newPassword').value='unused-secret';w.hide();
check('Admin logout removes tables, reset state and draft employee passwords',()=>{assert.equal(w.node('orders').children.length,0);assert.equal(w.node('users').children.length,0);assert.equal(w.node('audit').children.length,0);assert.equal(w.node('newPassword').value,'');assert.equal(w.allOrders.length,0);assert.equal(w.resetUser,null);});
w.session=account(1,'admin');let finishUsers;w.fetch=async(url)=>url.endsWith('/users')?new Promise(resolve=>finishUsers=resolve):response(url.includes('/orders')?{orders:[],total:0,offset:0}:{audit:[{occurred_at:'2026-10-03',username:'private',action:'secret-audit'}]});const refreshing=w.refresh();w.hide();finishUsers(response({users:[{id:2,username:'private',displayName:'private-user',role:'employee'}]}));await refreshing;
check('Admin requests completed after logout cannot refill hidden private tables',()=>{assert.equal(w.node('users').children.length,0);assert.equal(w.node('orders').children.length,0);assert.equal(w.node('audit').children.length,0);assert.equal(w.allUsers.length,0);});dom.window.close();
dom=page('admin.html',{local:false});w=dom.window;await sleep(10);w.session=account(1,'admin');w.allOrders=[{...record(w),creator:'private-admin',creatorUsername:'root'}];w.orderTotal=1;w.renderOrders();w.node('dashboard').classList.remove('hidden');restored=new w.Event('pageshow');Object.defineProperty(restored,'persisted',{value:true});w.dispatchEvent(restored);
check('A cached admin history page clears tables before reauthentication',()=>{assert.equal(w.node('orders').children.length,0);assert.equal(w.session,null);assert.equal(w.node('dashboard').classList.contains('hidden'),true);});await sleep(10);dom.window.close();

dom=page('admin.html',{local:false});w=dom.window;await sleep(10);w.session=account(1,'admin');
w.fetch=async(url)=>response(url.endsWith('/users')?{users:[]}:url.includes('/orders')?{orders:[],total:0,offset:0}:{audit:[{occurred_at:'2026-10-04T00:00:00Z',username:'<img id="audit-injection" onerror="evil">',action:'登录成功',order_no:null},{occurred_at:'2026-10-03T00:00:00Z',username:'employee',action:'登录失败：连续错误10次，账号锁定1小时',order_no:null}]});await w.refresh();
check('Recent operations display login results and keep account text escaped',()=>{assert.equal(w.node('audit').children.length,2);assert.ok(w.node('audit').textContent.includes('登录成功'));assert.ok(w.node('audit').textContent.includes('账号锁定1小时'));assert.ok(w.node('audit').textContent.includes('<img'));assert.equal(w.document.querySelector('#audit-injection,[onerror]'),null);});dom.window.close();

for(const status of [200,401]){
  let finishMe;
  dom=page('admin.html',{local:false,fetch:async(url)=>{
    if(url.endsWith('/auth/me'))return new Promise(resolve=>finishMe=resolve);
    if(url.endsWith('/auth/login'))return response(account(2,'admin'));
    if(url.endsWith('/admin/users'))return response({users:[]});
    if(url.endsWith('/admin/audit'))return response({audit:[]});
    return response({orders:[],total:0,offset:0});
  }});w=dom.window;
  w.node('username').value='isolated2';w.node('password').value='isolated-safe-password-42';w.node('loginForm').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await sleep(10);
  finishMe(status===200?response(account(1,'admin')):{ok:false,status:401,json:async()=>({error:'旧会话失效'})});await sleep(10);
  check('Late admin boot '+status+' response cannot replace a manual login',()=>{assert.equal(w.session.user.id,2);assert.equal(w.node('dashboard').classList.contains('hidden'),false);});dom.window.close();
}

check('Employee account and name fields accept single-character and long values without truncation',()=>{
  const doc=new JSDOM(readFileSync(new URL('../site/admin.html',import.meta.url),'utf8'));
  const username=doc.window.document.getElementById('newUsername'),name=doc.window.document.getElementById('newName');
  for(const field of [username,name]){assert.equal(field.hasAttribute('maxlength'),false);assert.equal(field.hasAttribute('minlength'),false);}
  for(const value of ['q','staff_'+ 'x'.repeat(12000)]){username.value=value;assert.equal(username.checkValidity(),true);assert.equal(username.value,value);}
  name.value='员工姓名'.repeat(1500);assert.equal(name.checkValidity(),true);assert.equal(name.value.length,6000);
  for(const field of [username,name]){field.value='';assert.equal(field.checkValidity(),false);}
  doc.window.close();
});

dom=page('peiliao.html',{local:false});w=dom.window;await sleep(10);
const permissionState=JSON.parse(JSON.stringify(remote));permissionState.products[0].recipe=[{name:'PRIVATE-PERMISSION-RECIPE',amount:2,unit:'kg'}];permissionState.products[0].recipeYield=777;
let calcAllowed=false;
w.fetch=async(url)=>response(url.endsWith('/auth/me')?{...account(2),user:{...account(2).user,canCalculate:calcAllowed}}:{state:permissionState,revision:1,permissions:{canCalculate:calcAllowed}});
await w.sharedActivate(account(2));
check('Unauthorized users have no calculation navigation, view, recipe data or callable calculation',()=>{
  assert.equal(w.document.getElementById('navCalc').classList.contains('hidden'),true);w.showView('calc');w.openRecipe();w.onCalculate();w.onExport();
  assert.equal(w.document.getElementById('view-calc').classList.contains('hidden'),true);assert.equal(w.document.getElementById('view-recipe').classList.contains('hidden'),true);
  assert.equal(w.document.getElementById('resultArea').textContent,'');assert.equal(w.document.getElementById('recipeContent').textContent,'');
  assert.ok(!JSON.stringify(w.state).includes('PRIVATE-PERMISSION-RECIPE'));assert.throws(()=>w.calculate(),/权限/);assert.equal(w.state.orders.length,1);
});
calcAllowed=true;await w.sharedRefresh();
check('A permission grant restores the module without relogin or a changed business revision',()=>{assert.equal(w.sharedCanCalculate(),true);assert.equal(w.document.getElementById('navCalc').classList.contains('hidden'),false);assert.ok(JSON.stringify(w.state).includes('PRIVATE-PERMISSION-RECIPE'));});
w.renderRecipe();w.showView('recipe');w.document.getElementById('printArea').textContent='PRIVATE-PERMISSION-RECIPE';w.state.orders[0].note='unsaved-order-preserved';w.sharedBusy=true;calcAllowed=false;await w.sharedRefresh();
check('Revocation is checked during editing, clears calculation DOM/data and preserves unsaved orders',()=>{assert.equal(w.sharedCanCalculate(),false);assert.equal(w.document.getElementById('view-recipe').classList.contains('hidden'),true);assert.equal(w.document.getElementById('navCalc').classList.contains('hidden'),true);assert.equal(w.document.getElementById('printArea').textContent,'');assert.equal(w.document.getElementById('recipeContent').textContent,'');assert.ok(!JSON.stringify(w.state).includes('PRIVATE-PERMISSION-RECIPE'));assert.equal(w.state.orders[0].note,'unsaved-order-preserved');});dom.window.close();

dom=page('peiliao.html',{local:false});w=dom.window;await sleep(10);const permitted=account(2);permitted.user.canCalculate=true;w.sharedSession=permitted;let finishPermissionState;
w.fetch=()=>new Promise(resolve=>finishPermissionState=resolve);const stalePermissionResponse=w.sharedApi('state');w.sharedSession.user.canCalculate=false;w.sharedPermissionUI();finishPermissionState(response({state:permissionState,revision:1,permissions:{canCalculate:true}}));const latePermissionReply=await stalePermissionResponse;
check('A late response from a formerly authorized request cannot restore revoked recipe data',()=>{assert.equal(latePermissionReply.permissions.canCalculate,false);assert.ok(!JSON.stringify(latePermissionReply.state).includes('PRIVATE-PERMISSION-RECIPE'));});dom.window.close();

let savedPermission=false,permissionWrites=[];
dom=page('admin.html',{local:false,fetch:async(url,options={})=>{
  if(url.endsWith('/auth/me'))return response(account(1,'admin'));
  if(url.endsWith('/admin/users/permissions')){const body=JSON.parse(options.body);permissionWrites.push(body);savedPermission=body.canCalculate;return response({ok:true});}
  if(url.endsWith('/admin/users'))return response({users:[{id:1,username:'root',displayName:'管理员',role:'admin',enabled:true,canCalculate:true},{id:2,username:'staff',displayName:'测试员工',role:'employee',enabled:true,canCalculate:savedPermission}]});
  return response(url.includes('/orders')?{orders:[],total:0,offset:0}:{audit:[]});
}});w=dom.window;await sleep(20);const permissionCheckbox=w.document.querySelector('[data-calc="2"]');permissionCheckbox.checked=true;permissionCheckbox.dispatchEvent(new w.Event('change',{bubbles:true}));await sleep(20);
check('Admin permission setting saves only the selected account and refreshes the persisted checkbox',()=>{assert.equal(JSON.stringify(permissionWrites),JSON.stringify([{id:2,canCalculate:true}]));assert.equal(w.document.querySelector('[data-calc="2"]').checked,true);assert.equal(w.document.querySelector('[data-calc="1"]').checked,true);});dom.window.close();

check('Employee create/reset fields accept only 4–10 digits and preserve leading zeros',()=>{
  const doc=new JSDOM(readFileSync(new URL('../site/admin.html',import.meta.url),'utf8'));
  for(const id of ['newPassword','resetPassword']){
    const field=doc.window.document.getElementById(id);
    assert.equal(field.minLength,4);assert.equal(field.maxLength,10);assert.equal(field.inputMode,'numeric');
    for(const value of ['0000','0123456789','1111']){field.value=value;assert.equal(field.checkValidity(),true,value);assert.equal(field.value,value);}
    for(const value of ['', '123','12345678901','123a','１２３４','1234 ']){field.value=value;assert.equal(field.checkValidity(),false,value);}
  }
  doc.window.close();
});
dom=page('peiliao.html',{local:false});w=dom.window;await sleep(10);
w.document.getElementById('passwordDialog').showModal=()=>{};
check('Personal password dialog switches employee/admin validation without weakening admin policy',()=>{
  w.sharedSession=account(2,'employee');w.document.getElementById('changePassword').click();
  const field=w.document.getElementById('nextPassword');assert.equal(field.minLength,4);assert.equal(field.maxLength,10);field.value='0123';assert.equal(field.checkValidity(),true);field.value='123a';assert.equal(field.checkValidity(),false);
  w.sharedSession=account(1,'admin');w.document.getElementById('changePassword').click();
  assert.equal(field.minLength,15);assert.equal(field.maxLength,200);assert.equal(field.hasAttribute('pattern'),false);assert.equal(field.hasAttribute('inputmode'),false);
});dom.window.close();
let employeeDeleted=false,deleteCalls=0;
dom=page('admin.html',{local:false,fetch:async(url,options={})=>{
  if(url.endsWith('/auth/me'))return response(account(1,'admin'));
  if(url.endsWith('/admin/users/delete')){assert.deepEqual(JSON.parse(options.body),{id:2});deleteCalls++;employeeDeleted=true;return response({ok:true});}
  if(url.endsWith('/admin/users'))return response({users:[{id:1,username:'root',displayName:'管理员',role:'admin',enabled:true},...(employeeDeleted?[]:[{id:2,username:'staff',displayName:'测试员工',role:'employee',enabled:true}])]});
  if(url.endsWith('/admin/audit'))return response({audit:[]});
  return response({orders:[],total:0,offset:0});
}});w=dom.window;await sleep(20);
check('Admin account has no deletion control',()=>assert.equal(w.document.querySelector('[data-delete="1"]'),null));
w.confirm=()=>false;w.document.querySelector('[data-delete="2"]').click();await sleep(10);
check('Cancelled employee deletion sends no request',()=>assert.equal(deleteCalls,0));
w.confirm=()=>true;w.document.querySelector('[data-delete="2"]').click();await sleep(20);
check('Confirmed employee deletion targets only the employee and refreshes the list',()=>{assert.equal(deleteCalls,1);assert.equal(w.document.querySelector('[data-delete="2"]'),null);assert.ok(w.document.getElementById('message').textContent.includes('历史订单已保留'));assert.equal(w.allUsers.length,1);});dom.window.close();
check('Production pages use self-hosted external scripts and no inline handlers',()=>{for(const file of ['peiliao.html','admin.html']){const source=readFileSync(new URL('../site/'+file,import.meta.url),'utf8'),doc=new JSDOM(source);for(const script of doc.window.document.querySelectorAll('script')){assert.ok(script.getAttribute('src').startsWith('/'));assert.equal(script.textContent.trim(),'');}assert.equal(doc.window.document.querySelector('[onclick],[onload],[onerror]'),null);doc.window.close();}});
dom=page();w=dom.window;
const phoneOrders=[record(w,'today-phone'),{...record(w,'tomorrow-phone'),orderNo:'MANUAL-2',orderDate:w.tomorrowStr(),phone:'138-0013-8000',status:'picked'},
  {...record(w,'historic-phone'),orderNo:'HISTORY-3',orderDate:'2020-01-01',phone:'13800138000'},
  {...record(w,'no-phone'),orderNo:'NO-PHONE',phone:''}];
w.state.orders=phoneOrders;w.renderOrders();
check('Today cards show the associated phone only when supplied and have no price editor',()=>{
  assert.ok(w.document.querySelector('[data-order-id="today-phone"] .oc-phone').textContent.includes('13900001111'));
  assert.equal(w.document.querySelector('[data-order-id="no-phone"] .oc-phone'),null);
  assert.equal(w.document.querySelector('#btnOrderPrices'),null);assert.equal(w.openPriceSettings,undefined);
  assert.equal(w.buildProductEditCard(w.state.products[0]).includes('data-f="price"'),false);
});
function searchPhone(text){const field=w.document.querySelector('#orderPhoneSearch');field.value=text;field.dispatchEvent(new w.Event('input',{bubbles:true}));}
searchPhone('1390000');
check('Today partial phone search filters cards and preserves input focus',()=>{assert.equal(w.document.querySelectorAll('.order-card').length,1);assert.equal(w.document.activeElement.id,'orderPhoneSearch');});
searchPhone('-');
check('A search containing only separators does not match orders without phone numbers',()=>assert.equal(w.document.querySelectorAll('.order-card').length,0));
w.document.querySelector('[data-tab="tomorrow"]').click();searchPhone('1380013');
check('Tomorrow phone search normalizes separators and combines with pickup filters',()=>{assert.equal(w.document.querySelectorAll('.order-card').length,1);assert.ok(w.document.querySelector('.oc-phone').textContent.includes('138-0013-8000'));w.document.querySelector('[data-filter="unpicked"]').click();assert.equal(w.document.querySelectorAll('.order-card').length,0);w.document.querySelector('[data-filter="picked"]').click();assert.equal(w.document.querySelectorAll('.order-card').length,1);});
w.document.querySelector('[data-tab="all"]').click();searchPhone('13800138000');
check('All-orders phone search covers dates outside the current calendar month',()=>{assert.equal(w.document.querySelectorAll('.order-card').length,2);assert.ok(w.document.querySelector('[data-order-id="historic-phone"]'));w.document.querySelector('[data-clear-phone]').click();assert.ok(w.document.querySelector('.cal-grid'));assert.equal(w.document.querySelector('#orderPhoneSearch').value,'');});
w.state.orders[0].phone='<img id="phone-xss" onerror="evil">';w.orderTab='today';w.orderPhoneQueries.today='';w.renderOrders();
check('Phone display and search values escape stored markup',()=>{assert.equal(w.document.querySelector('#phone-xss,[onerror]'),null);searchPhone('<img');assert.equal(w.document.querySelector('#phone-xss,[onerror]'),null);});
w.openNewOrder(w.todayStr());const qty=w.document.querySelector('[data-qty="p1"]');qty.value='1';qty.dispatchEvent(new w.Event('input',{bubbles:true}));
const initialOrders=w.state.orders.length;
check('New order number is an empty required field; missing or duplicate numbers prevent saving',()=>{
  assert.equal(w.document.querySelector('#oeOrderNo').value,'');assert.equal(w.document.querySelector('#oeOrderNo').required,true);
  w.saveOrder();assert.equal(w.state.orders.length,initialOrders);
  w.document.querySelector('#oeOrderNo').value='000001';w.saveOrder();assert.equal(w.state.orders.length,initialOrders);
});
w.document.querySelector('#oeOrderNo').value='  客订-00009  ';w.saveOrder();
check('Manual number is preserved after save and edit; copy requires a new number',()=>{
  const saved=w.state.orders.find(o=>o.orderNo==='客订-00009');assert.ok(saved);w.openEditOrder(saved.id);assert.equal(w.document.querySelector('#oeOrderNo').value,'客订-00009');
  w.document.querySelector('#oeOrderNo').value='改号-00010';w.saveOrder();assert.equal(saved.orderNo,'改号-00010');w.openCopyOrder(saved.id);assert.equal(w.document.querySelector('#oeOrderNo').value,'');
});dom.window.close();
let priceWrites=[];
dom=page('admin.html',{local:false,fetch:async(url,options={})=>{
  if(url.endsWith('/auth/me'))return response(account(1,'admin'));
  if(url.endsWith('/admin/users'))return response({users:[]});
  if(url.endsWith('/admin/prices')){if(options.method==='POST')priceWrites.push(JSON.parse(options.body));return response({products:[{id:'p1',name:'产品',price:priceWrites.length?234:125,enabled:true}]});}
  return response(url.includes('/orders')?{orders:[],total:0,offset:0}:{audit:[]});
}});w=dom.window;await sleep(20);
w.document.querySelector('[data-price="p1"]').value='2.34';w.document.querySelector('#priceForm').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await sleep(20);
check('Admin pricing submits integer cents with a comparison price and displays persisted values',()=>{assert.equal(JSON.stringify(priceWrites),JSON.stringify([{changes:[{id:'p1',beforePrice:125,price:234}]}]));assert.equal(w.document.querySelector('[data-price="p1"]').value,'2.34');});
w.hide();
check('Admin logout also clears price data and drafts',()=>{assert.equal(w.allPrices.length,0);assert.equal(w.document.querySelector('#prices').textContent,'');assert.equal(w.document.querySelector('#priceMessage').textContent,'');});dom.window.close();
check('No script or DOM errors in the security fixtures',()=>assert.deepEqual(errors,[]));
console.log('PASS '+passed+' frontend security checks (all fixtures isolated)');
