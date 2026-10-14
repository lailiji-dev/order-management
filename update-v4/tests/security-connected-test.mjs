import {inlineAssets} from '../../update-v3/tests/frontend-assets.mjs';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {JSDOM,VirtualConsole} from '../../update-v3/tests/test-dom.mjs';
import assert from 'node:assert/strict';
const base=path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1').replaceAll('%E7%BD%91%E7%AB%99','网站')),'..');
const {fileURLToPath}=await import('node:url');const appPath=fileURLToPath(new URL('../server/app.py',import.meta.url));
const folder=mkdtempSync(path.join(tmpdir(),'peiliao-api-'));
if(!path.resolve(folder).startsWith(path.resolve(tmpdir())+path.sep))throw new Error('Unsafe isolated test folder');
const backend=spawn(process.env.PEILIAO_TEST_PYTHON||'python',[appPath,'--data',path.join(folder,'orders.db'),'--seed',fileURLToPath(new URL('../server/seed.json',import.meta.url)),'--port','43288','--insecure-local-test'],{env:{...process.env,PEILIAO_ADMIN_PASSWORD:'isolated-safe-password-42'}});
let diagnostics='';backend.stderr.on('data',data=>diagnostics+=data.toString());backend.stdout.on('data',data=>diagnostics+=data.toString());backend.on('exit',code=>diagnostics+=' Exit '+code);
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(predicate){for(let i=0;i<500;i++){if(await predicate())return;await wait(20);}throw new Error('Test timeout '+diagnostics);}
let html=inlineAssets(new URL('../site/peiliao.html',import.meta.url));const shared=readFileSync(new URL('../site/shared.js',import.meta.url),'utf8');
html=html.replace(/<script src="\/shared.js[^>]*><\/script>/,()=>'<script>'+shared+'</script>');
const errors=[],doms=[];
function browser(local,restore={}){let cookie='';const vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e));const dom=new JSDOM(html,{url:'https://YOUR_APP_DOMAIN/',runScripts:'dangerously',pretendToBeVisual:true,virtualConsole:vc,beforeParse(w){w.AbortController=globalThis.AbortController;w.alert=()=>{};w.confirm=()=>true;w.matchMedia=()=>({matches:false});w.scrollTo=()=>{};w.HTMLElement.prototype.scrollIntoView=()=>{};if(local)w.localStorage.setItem('food_factory_app_data_v1',JSON.stringify(local));for(const [key,value] of Object.entries(restore))w.localStorage.setItem(key,value);w.fetch=async(url,options={})=>{const headers={...options.headers,Origin:'https://YOUR_APP_DOMAIN'};if(cookie)headers.Cookie=cookie;const response=await fetch('http://127.0.0.1:43288'+url,{...options,headers});if(response.headers.get('set-cookie'))cookie=response.headers.get('set-cookie').split(';')[0];return response;};}});doms.push(dom);return dom.window;}
async function login(w,user,password){w.document.querySelector('#loginUsername').value=user;w.document.querySelector('#loginPassword').value=password;w.document.querySelector('#loginForm').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await until(()=>w.sharedStarted&&!w.document.body.classList.contains('auth-pending'));}
function quantity(w,n){w.openNewOrder(w.todayStr());w.document.querySelector('#oeOrderNo').value='MANUAL-'+n;let input=w.document.querySelector('[data-qty="p1"]');input.value=String(n);input.dispatchEvent(new w.Event('input',{bubbles:true}));w.saveOrder();}
try{
  let lastFailure='';try{await until(async()=>{try{const response=await fetch('http://127.0.0.1:43288/api/health');lastFailure='HTTP '+response.status+' '+await response.text();return response.ok;}catch(e){lastFailure=e.message+' '+String(e.cause);return false;}});}catch(error){throw new Error(error.message+' '+lastFailure);}
  const seed={dataVersion:1,categories:[{id:'c1',name:'煎堆',sort:1}],products:[{id:'p1',name:'小煎堆',categoryId:'c1',price:125,recipe:[],recipeYield:500,enabled:true}],orders:[{id:'old',orderNo:'20261003-001',orderDate:'2026-10-03',deposit:150,status:'unpicked',items:[{productId:'p1',productName:'小煎堆',unitPrice:125,quantity:10}],note:''}],productionPlans:{},todayPlan:{}};
  const root=browser(seed);await login(root,'root','isolated-safe-password-42');
  assert.equal(root.state.orders[0].deposit,200);assert.equal(root.state.orders[0].orderNo,'000001');assert.ok(root.localStorage.getItem('peiliao_before_shared_v2'));
  // Actual backend round-trip with legacy storage, precise jin edits and export.
  let recipeProduct=(await root.sharedApi('state')).state.products[0];
  await root.sharedApi('sync',{changes:[{collection:'products',id:recipeProduct.id,before:recipeProduct,after:{...recipeProduct,recipe:[{name:'测试原料',amount:1.23456789,unit:'kg'}]}}]});
  await root.sharedRefresh();root.renderRecipe();
  let weightInput=root.document.querySelector('[data-prod="p1"][data-mat="0"][data-f="amount"]');
  assert.equal(Number(weightInput.value),2.46913578);
  weightInput.value='3.123456789';weightInput.dispatchEvent(new root.Event('input',{bubbles:true}));
  await until(()=>!root.sharedBusy&&!root.sharedFailed);
  let recipeReply=(await root.sharedApi('state')).state.products[0].recipe[0];
  assert.equal(recipeReply.amount,3.123456789);assert.equal(recipeReply.unit,'斤');
  assert.equal(root.weightStateForTransfer(root.state).products[0].recipe[0].amount,3.123456789);
  root.showView('orders');
  await root.sharedApi('admin/users',{username:'employee1',displayName:'员工甲',password:'012345'});
  const staff=browser();await login(staff,'employee1','012345');
  quantity(root,1234);quantity(staff,4321);await until(()=>!root.sharedBusy&&!staff.sharedBusy);
  assert.equal(root.sharedFailed,false);assert.equal(staff.sharedFailed,false);
  const result=await root.sharedApi('state');assert.equal(result.state.orders.length,3);
  assert.deepEqual(result.state.orders.map(o=>o.orderNo).sort(),['000001','MANUAL-1234','MANUAL-4321']);
  const details=await root.sharedApi('admin/orders');const employeeOrder=details.orders.find(o=>o.items[0].quantity===4321);assert.equal(employeeOrder.creatorUsername,'employee1');
  assert.ok(result.state.orders.every(o=>!('creator' in o)));assert.ok(staff.document.querySelector('#adminLink').classList.contains('hidden'));
  await root.sharedRefresh();await staff.sharedRefresh();assert.equal(root.state.orders.length,3);assert.equal(staff.state.orders.length,3);
  // Two devices edit the same order; the stale edit must be rejected and locally recoverable.
  root.state.orders.find(o=>o.id==='old').note='管理员修改';root.saveData();await until(()=>!root.sharedBusy);
  staff.state.orders.find(o=>o.id==='old').note='员工过期修改';staff.saveData();await until(()=>!staff.sharedBusy);
  assert.equal(staff.state.orders.find(o=>o.id==='old').note,'管理员修改');assert.ok(Object.keys(staff.localStorage).some(k=>k.startsWith('peiliao_conflict_backup_')));
  await root.sharedApi('auth/logout',{});root.state.orders.find(o=>o.id==='old').note='会话失效后的修改';root.saveData();await until(()=>!root.sharedBusy);
  assert.equal(root.sharedSession,null);assert.ok(root.localStorage.getItem('peiliao_pending_shared_v2_1'));
  await login(root,'root','isolated-safe-password-42');await until(()=>!root.sharedBusy);assert.equal((await root.sharedApi('state')).state.orders.find(o=>o.id==='old').note,'会话失效后的修改');assert.equal(root.localStorage.getItem('peiliao_pending_shared_v2_1'),null);
  const onlineFetch=root.fetch;root.fetch=async(url,options)=>{if(url.endsWith('/sync'))throw new Error('isolated offline test');return onlineFetch(url,options);};
  root.state.orders.find(o=>o.id==='old').note='断网重载后恢复';root.saveData();await until(()=>!root.sharedBusy);assert.equal(root.sharedFailed,true);
  const cache=Object.fromEntries(Object.keys(root.localStorage).map(key=>[key,root.localStorage.getItem(key)]));root.close();
  const reloaded=browser(null,cache);await login(reloaded,'root','isolated-safe-password-42');await until(()=>!reloaded.sharedBusy);
  assert.equal((await reloaded.sharedApi('state')).state.orders.find(o=>o.id==='old').note,'断网重载后恢复');assert.equal(reloaded.localStorage.getItem('peiliao_pending_shared_v2_1'),null);
  assert.deepEqual(errors,[]);console.log('PASS real API integration: migration, concurrent saves, numbering, employee attribution, polling, conflict backup, expired sessions and offline reload recovery');
}finally{doms.forEach(dom=>dom.window.close());backend.kill();await new Promise(resolve=>backend.once('exit',resolve));rmSync(folder,{recursive:true,force:true});}
