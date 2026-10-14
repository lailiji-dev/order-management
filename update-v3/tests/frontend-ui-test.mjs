import {inlineAssets} from './frontend-assets.mjs';
import {readFileSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {JSDOM,VirtualConsole} from './test-dom.mjs';
const html=inlineAssets(new URL('../site/peiliao.html',import.meta.url));
const shared=readFileSync(new URL('../site/shared.js',import.meta.url),'utf8');
const errors=[],alerts=[];
function app(seed={},extra={}){const vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e));return new JSDOM(html,{url:'https://isolated.invalid/',runScripts:'dangerously',pretendToBeVisual:true,virtualConsole:vc,beforeParse(w){w.__LOCAL_TEST__=true;w.alert=m=>alerts.push(m);w.confirm=()=>true;w.matchMedia=()=>({matches:false});w.scrollTo=()=>{};w.HTMLElement.prototype.scrollIntoView=()=>{};for(const [k,v] of Object.entries(seed))w.localStorage.setItem(k,v);Object.assign(w,extra);}});}
function input(w,selector,value){const el=w.document.querySelector(selector);assert.ok(el,selector);el.value=String(value);el.dispatchEvent(new w.Event('input',{bubbles:true}));}
let count=0;function check(name,fn){fn();count++;console.log('PASS',name);}
const original={categories:[{id:'c1',name:'煎堆'}],products:[{id:'p1',name:'小煎堆',categoryId:'c1',standardYield:500,lossRate:5,recipe:[{name:'糯米粉',amount:20,unit:'kg'}]}],todayPlan:{p1:50}};
let dom=app({peiliao_data_v1:JSON.stringify(original)}),w=dom.window;
// Fixture-only test: the production seed must not be overwritten.
w.state.products[0].price=125;
w.openNewOrder();
check('Category initially collapsed; quantity blank and four digits fit',()=>{assert.ok(w.document.querySelector('.pe-group.collapsed'));assert.equal(w.document.querySelector('[data-qty]').value,'');assert.equal(w.getComputedStyle(w.document.querySelector('[data-qty]')).minWidth,'86px');w.document.querySelector('[data-group]').click();assert.equal(w.document.querySelector('[data-group]').getAttribute('aria-expanded'),'true');});
input(w,'[data-qty="p1"]',1234);input(w,'#oeDeposit',50.5);w.saveOrder();
check('New decimal deposit rejected',()=>{assert.equal(w.state.orders.length,0);assert.ok(alerts.at(-1).includes('整数元'));});
input(w,'#oeDeposit',50);w.saveOrder();
check('Four-digit quantity and integer deposit saved, contacts optional',()=>{const o=w.state.orders[0];assert.equal(o.items[0].quantity,1234);assert.equal(o.deposit,5000);assert.equal(o.remainingAmount,149250);assert.equal(o.customerName,'');assert.equal(o.phone,'');assert.ok(!w.document.querySelector('.order-card').textContent.includes('产品总数'));});
let first=w.state.orders[0];w.openOrderDetail(first.id);
check('Empty contacts absent from detail',()=>{assert.ok(!w.document.querySelector('#view-order-detail').textContent.includes('电话号码'));assert.ok(!w.document.querySelector('#view-order-detail').textContent.includes('姓名'));});
w.openEditOrder(first.id);input(w,'#oeCustomerName','陈先生');input(w,'#oePhone','13812345678');w.saveOrder();w.openOrderDetail(first.id);
check('Filled contacts shown in detail',()=>{assert.ok(w.document.querySelector('#view-order-detail').textContent.includes('陈先生'));assert.ok(w.document.querySelector('#view-order-detail').textContent.includes('13812345678'));});
w.closeOverlays();w.openNewOrder(w.tomorrowStr());input(w,'[data-qty="p1"]',10);w.saveOrder();
check('Tomorrow tab and independent pickup filters',()=>{assert.equal(w.orderTab,'tomorrow');assert.equal(w.document.querySelectorAll('.order-card').length,1);w.document.querySelector('[data-filter="picked"]').click();assert.equal(w.document.querySelectorAll('.order-card').length,0);w.document.querySelector('[data-filter="unpicked"]').click();assert.equal(w.document.querySelectorAll('.order-card').length,1);});
w.orderTab='today';w.openCopyOrder(first.id);w.saveOrder();w.state.orders[2].earlyPickup=true;w.renderOrders();
check('Early pickup sorts ahead of existing older order',()=>{assert.equal(w.document.querySelector('.order-card').dataset.orderId,w.state.orders[2].id);});
w.toggleStatus(first);w.orderFilters.today='picked';w.renderOrders();
check('Today picked filter excludes unpicked',()=>{assert.equal(w.document.querySelectorAll('.order-card').length,1);assert.equal(w.document.querySelector('.order-card').dataset.orderId,first.id);});
w.state.productionPlans[w.todayStr()]={items:[{productId:'p1',productionQuantity:9000}]};w.openProduction(w.todayStr());
check('Production summary readonly and follows orders instead of historical adjustments',()=>{assert.equal(w.document.querySelector('#prOrder').textContent,'2468 个');assert.equal(w.document.querySelectorAll('#view-production input').length,0);assert.equal(w.document.querySelector('#prSend'),null);assert.equal(w.sendToCalc,undefined);});
w.closeOverlays();w.state.products[0].price=200;w.openEditOrder(first.id);input(w,'#oeNote','更新备注');w.saveOrder();
check('Existing order prices remain intact when editing',()=>{assert.equal(first.items[0].unitPrice,125);});
const originalData=JSON.stringify(w.state);dom.window.close();
// Verify real shared-client logic with controlled API responses and delayed responses.
dom=app({food_factory_app_data_v1:originalData});w=dom.window;const script=w.document.createElement('script');script.textContent=shared;w.document.body.appendChild(script);w.sharedStarted=true;
const migrated=JSON.parse(originalData);migrated.orders.forEach((o,i)=>{o.orderNo=String(i+1).padStart(6,'0');});
let resolveSave,posted;
w.fetch=async (url,options)=>{let body;if(url.endsWith('/state'))body={state:migrated};else if(url.endsWith('/migrate'))body={state:migrated,imported:3};else if(url.endsWith('/sync')){posted=JSON.parse(options.body);await new Promise(resolve=>resolveSave=resolve);body={state:JSON.parse(JSON.stringify(migrated))};for(const change of posted.changes){const list=body.state[change.collection];const idx=list.findIndex(x=>x.id===change.id);if(idx>=0)list.splice(idx,1);if(change.after)list.push({...change.after,orderNo:change.after.orderNo,updatedAt:'server'});}}return {ok:true,json:async()=>body};};
await w.sharedActivate({user:{id:1,username:'root',displayName:'管理员',role:'admin'},csrf:'test'});
check('Original device backed up before automatic merge and admin entry visible',()=>{assert.equal(w.localStorage.getItem('peiliao_before_shared_v2'),originalData);assert.equal(w.localStorage.getItem('peiliao_shared_migrated_v2'),'1');assert.ok(!w.document.querySelector('#adminLink').classList.contains('hidden'));});
const editedId=w.state.orders[0].id;w.state.orders[0].note='修改一';w.saveData();void w.flushShared();w.state.orders[0].note='修改二';w.saveData();resolveSave();
await new Promise(resolve=>setTimeout(resolve,300));
check('Edits made during an in-flight save are retained for next request',()=>{assert.equal(w.state.orders.find(o=>o.id===editedId).note,'修改二');assert.equal(posted.changes[0].after.note,'修改二');});
resolveSave();await new Promise(resolve=>setTimeout(resolve,20));
check('Shared save reaches synchronized state without dropping latest edit',()=>{assert.equal(w.sharedBusy,false);assert.equal(w.sharedFailed,false);assert.equal(w.state.orders.find(o=>o.id===editedId).note,'修改二');});
check('No script or DOM errors',()=>assert.deepEqual(errors,[]));
dom.window.close();
// Parse admin scripts and markup, including login form and tables.
const admin=inlineAssets(new URL('../site/admin.html',import.meta.url));
const adminDom=new JSDOM(admin,{url:'https://isolated.invalid/',runScripts:'dangerously',pretendToBeVisual:true,beforeParse(w){w.fetch=async()=>({ok:false,status:401,json:async()=>({error:'请登录'})});}});
await new Promise(resolve=>setTimeout(resolve,10));
check('Admin login and account/order/audit tables initialize',()=>{for(const id of ['loginForm','createUser','users','orders','audit'])assert.ok(adminDom.window.document.getElementById(id));assert.ok(adminDom.window.document.getElementById('dashboard').classList.contains('hidden'));});
adminDom.window.close();console.log('PASS '+count+' isolated UI checks');
