import assert from 'node:assert/strict';
import {load,dataFor} from './optimization-benchmark.mjs';

let checks=0;
function check(name,fn){fn();checks++;console.log('PASS '+name);}
const data=dataFor({count:140,days:1});
const {dom}=await load('update-v3',data),w=dom.window,root=w.document.getElementById('view-orders');
try{
  check('Large same-day list preserves all records and shows bounded first page',()=>{assert.equal(w.state.orders.length,140);assert.equal(root.querySelectorAll('.order-card').length,60);});
  const first=root.querySelector('.order-card'),firstAction=first.querySelector('[data-act="detail"]');firstAction.focus();w.renderOrders();
  check('Identical refresh keeps existing nodes and keyboard focus',()=>{assert.equal(root.querySelector('.order-card'),first);assert.equal(w.document.activeElement,firstAction);});
  const loadMore=root.querySelector('[data-more-orders]');assert.ok(loadMore);loadMore.click();
  check('Loading another page preserves sorting and adds only sixty cards',()=>{assert.equal(root.querySelectorAll('.order-card').length,120);assert.ok(root.querySelector('.order-card').classList.contains('early-pickup'));});
  root.querySelector('[data-filter="picked"]').click();
  check('Changing filter resets pagination and keeps status filtering accurate',()=>{assert.equal(root.querySelectorAll('.order-card').length,60);assert.ok(Array.from(root.querySelectorAll('.order-card')).every(card=>card.classList.contains('picked')));});
  w.sharedSession={user:{id:1,username:'review',role:'admin'},csrf:'review'};w.sharedBaseline=w.sharedSnapshot(w.state);w.sharedBusy=false;w.sharedFailed=false;
  let resolveRefresh;const priorState=w.sharedCopy(w.state);
  w.fetch=()=>new Promise(resolve=>resolveRefresh=resolve);
  const refresh=w.sharedRefresh();w.state.orders[0].note='本机编辑发生在刷新期间';w.saveData();
  resolveRefresh({ok:true,status:200,headers:{get:()=>null},json:async()=>({state:priorState,revision:2})});await refresh;
  check('An in-flight refresh cannot replace newer local edits',()=>assert.equal(w.state.orders[0].note,'本机编辑发生在刷新期间'));
  w.sharedPending();
  check('Offline backup stores only the modified record and remains recoverable',()=>{const raw=w.localStorage.getItem(w.sharedPendingKey()),pending=JSON.parse(raw);assert.equal(pending.changes.length,1);assert.ok(raw.length<2000);assert.equal(w.sharedRecover(priorState).orders.find(order=>order.id===priorState.orders[0].id).note,'本机编辑发生在刷新期间');});
  w.localStorage.setItem(w.sharedPendingKey(),JSON.stringify({before:w.sharedBaseline,after:w.sharedSnapshot(w.state)}));
  check('Legacy whole-state offline backups remain readable after upgrade',()=>assert.equal(w.sharedRecover(priorState).orders.find(order=>order.id===priorState.orders[0].id).note,'本机编辑发生在刷新期间'));
  w.clearTimeout(w.sharedSaveTimer);w.clearTimeout(w.sharedBackupTimer);w.sharedBusy=false;
  const oldSession=w.sharedSession,newSession={user:{id:2,username:'new-review',role:'admin'},csrf:'new-review'};
  const expiredRefresh=w.sharedRefresh();w.sharedSession=newSession;
  resolveRefresh({ok:false,status:401,headers:{get:()=>null},json:async()=>({error:'旧会话已失效'})});await expiredRefresh;
  check('An expired response from an older session cannot log out the new session',()=>{assert.notEqual(oldSession,newSession);assert.equal(w.sharedSession,newSession);});
  const malicious='special" onclick="window.injected=true';
  const seed=dataFor({count:1,days:1});seed.orders[0].id=malicious;seed.orders[0].note='<img src="x" onerror="window.injected=true">';seed.categories.push({id:malicious,name:'<img onerror="evil">'});seed.products.push({id:malicious,name:'<script>evil</script>',categoryId:malicious,price:125,recipeYield:500,lossRate:0,enabled:true,recipe:[]});
  const loaded=await load('update-v3',seed),bad=loaded.dom.window;
  try{
    check('Imported quoted IDs remain data and cannot create event attributes',()=>{const card=bad.document.querySelector('.order-card');assert.equal(card.dataset.orderId,malicious);assert.equal(card.querySelector('[data-act="detail"]').dataset.id,malicious);assert.equal(bad.document.querySelector('[onclick],[onerror]'),null);});
    bad.openNewOrder();bad.openRecipe();
    check('Recipe and quantity templates escape imported product/category IDs',()=>{assert.ok(Array.from(bad.document.querySelectorAll('[data-qty]')).some(el=>el.dataset.qty===malicious));assert.ok(Array.from(bad.document.querySelectorAll('.cat-name-input')).some(el=>el.dataset.cat===malicious));assert.equal(bad.document.querySelector('[onclick],[onerror]'),null);assert.equal(bad.injected,undefined);});
    const before={categories:[],products:[],orders:[{id:'__proto__',note:'before'}]},after={categories:[],products:[],orders:[{id:'__proto__',note:'after'}]};
    check('Prototype-shaped IDs participate in shared synchronization diff',()=>{const diff=bad.sharedDiff(before,after);assert.equal(diff.length,1);assert.equal(diff[0].id,'__proto__');});
  }finally{loaded.dom.window.close();}
  console.log('PASS '+checks+' independent optimization regressions');
}finally{dom.window.close();}
