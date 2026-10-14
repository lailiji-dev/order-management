'use strict';

// Shared records are synchronized independently from the device's calculation plan.
var sharedSession=null,sharedBaseline=null,sharedBusy=false,sharedFailed=false,sharedStarted=false;
var sharedTimer=null,sharedSaveTimer=null,sharedBackupTimer=null,sharedSending=false,sharedRefreshing=false;
var sharedRevision=null,sharedETag=null,sharedLastDate=null;
var sharedAuthAttempt=0;
var sharedCollections=['categories','products','orders'];
var SHARED_SAVE_DELAY=250,SHARED_POLL_DELAY=15000;

function sharedCopy(value){return JSON.parse(JSON.stringify(value));}
function sharedSnapshot(value){var result={};sharedCollections.forEach(function(c){result[c]=sharedCopy(value[c]||[]);});return result;}
function sharedDiff(before,after){
  var changes=[];
  sharedCollections.forEach(function(collection){
    var previous=new Map(),current=new Map();
    (before[collection]||[]).forEach(function(record){previous.set(record.id,record);});
    (after[collection]||[]).forEach(function(record){current.set(record.id,record);});
    new Set(Array.from(previous.keys()).concat(Array.from(current.keys()))).forEach(function(id){
      var a=previous.get(id)||null,b=current.get(id)||null;
      if(JSON.stringify(a)!==JSON.stringify(b))changes.push({collection:collection,id:id,before:a,after:b});
    });
  });return changes;
}
async function sharedApi(path,data,conditional){
  var options={credentials:'same-origin',cache:'no-store',headers:{}};
  if(data!==undefined){options.method='POST';options.headers['Content-Type']='application/json';options.headers['X-CSRF-Token']=sharedSession?sharedSession.csrf:'';options.body=JSON.stringify(data);}
  if(conditional&&sharedETag)options.headers['If-None-Match']=sharedETag;
  var controller=typeof AbortController==='function'?new AbortController():null;
  if(controller)options.signal=controller.signal;
  var timeout=setTimeout(function(){if(controller)controller.abort();},20000);
  try{
    var response=await fetch('/api/'+path,options);
    if(response.status===304)return {notModified:true};
    var body;try{body=await response.json();}catch(error){throw new Error('服务器响应异常，请稍后重试');}
    if(!response.ok){var failure=new Error(body.error||'请求失败');failure.status=response.status;throw failure;}
    if(body.state){body.etag=response.headers&&response.headers.get?response.headers.get('ETag'):null;if(!body.etag&&body.revision!==undefined)body.etag='"state-'+body.revision+'"';}
    return body;
  }catch(error){if(error.name==='AbortError')throw new Error('连接超时，请重试；未同步修改已保留');throw error;}
  finally{clearTimeout(timeout);}
}
function sharedAccept(reply){sharedBaseline=sharedSnapshot(reply.state);sharedRevision=reply.revision===undefined?null:reply.revision;sharedETag=reply.etag||null;}
function sharedStatus(message,failed){var node=document.getElementById('syncStatus');if(node.textContent!==message)node.textContent=message;document.getElementById('syncRetry').classList.toggle('hidden',!failed);}
function sharedCache(){persistLocalCache();}
function sharedPendingKey(){return 'peiliao_pending_shared_v2_'+sharedSession.user.id;}
function sharedPending(){
  clearTimeout(sharedBackupTimer);sharedBackupTimer=null;
  if(!sharedSession||!sharedBaseline)return;
  try{var changes=sharedDiff(sharedBaseline,state);if(changes.length)localStorage.setItem(sharedPendingKey(),JSON.stringify({changes:changes}));else localStorage.removeItem(sharedPendingKey());}
  catch(error){sharedStatus('本机备份不可用，请保持页面打开直到同步完成',false);}
}
function sharedSame(a,b){if(!a||!b)return a===b;var ignored=['orderNo','createdAt','updatedAt'];return Object.keys(a).every(function(key){return ignored.includes(key)||JSON.stringify(a[key])===JSON.stringify(b[key]);});}
function sharedRecover(remote){
  var saved=localStorage.getItem(sharedPendingKey());if(!saved)return remote;
  var pending=JSON.parse(saved),merged=sharedCopy(remote),conflicts=0;
  (pending.changes||sharedDiff(pending.before,pending.after)).forEach(function(change){
    var list=merged[change.collection],idx=list.findIndex(function(x){return x.id===change.id;}),current=idx<0?null:list[idx];
    if(sharedSame(change.after,current))return;
    if(!sharedSame(change.before,current)){conflicts++;return;}
    if(idx>=0)list.splice(idx,1);
    if(change.after){var record=sharedCopy(change.after);if(change.collection==='orders'&&current){record.orderNo=current.orderNo;record.createdAt=current.createdAt;record.updatedAt=current.updatedAt;}list.push(record);}
  });
  if(conflicts){localStorage.setItem('peiliao_conflict_backup_'+Date.now(),JSON.stringify(pending.after||pending));alert('上次有 '+conflicts+' 条未同步修改与服务器冲突，已保留本机备份，请核对后重新修改。');}
  else if(sharedDiff(remote,merged).length)alert('上次未同步的修改已恢复，正在继续保存。');
  // Keep the pending record until recovery has been acknowledged by the server.
  return merged;
}
function sharedApply(remote){var plan=state.todayPlan,date=state.calcPlanDate;state=sharedCopy(remote);state.todayPlan=plan||{};state.calcPlanDate=date||todayStr();invalidateDataIndex();sharedCache();localStorage.setItem('peiliao_shared_cache_v2','1');}
function sharedRender(changes){
  var collections=new Set((changes||[]).map(function(change){return change.collection;})),all=!changes;
  if(all||collections.has('orders'))renderOrders();
  if((all||collections.has('categories')||collections.has('products'))&&!document.getElementById('view-calc').classList.contains('hidden'))renderPlan();
  renderDateCalc();
  var detail=document.getElementById('view-order-detail');
  if(!detail.classList.contains('hidden')&&(all||collections.has('orders'))){var id=detail.dataset.orderId;if(id&&findOrder(id))openOrderDetail(id);else closeOverlays();}
}
function queueSharedSave(){
  if(!sharedSession||!sharedBaseline)return;
  sharedFailed=false;sharedBusy=true;sharedStatus('正在保存到服务器…',false);
  clearTimeout(sharedBackupTimer);sharedBackupTimer=setTimeout(sharedPending,120);
  if(sharedSending)return;
  clearTimeout(sharedSaveTimer);sharedSaveTimer=setTimeout(function(){sharedSaveTimer=null;void flushShared();},SHARED_SAVE_DELAY);
}
async function flushShared(){
  if(sharedSending||!sharedSession||!sharedBaseline)return;
  clearTimeout(sharedSaveTimer);sharedSaveTimer=null;
  var desired=sharedSnapshot(state),changes=sharedDiff(sharedBaseline,desired);
  if(!changes.length){sharedBusy=false;sharedPending();sharedStatus('已同步',false);return;}
  sharedSending=true;sharedBusy=true;sharedPending();
  try{
    var reply=await sharedApi('sync',{changes:changes}),later=sharedDiff(desired,state),merged=sharedCopy(reply.state);
    later.forEach(function(change){var list=merged[change.collection],idx=list.findIndex(function(x){return x.id===change.id;}),record=idx<0?null:list[idx];if(idx>=0)list.splice(idx,1);if(change.after){var after=sharedCopy(change.after);if(change.collection==='orders'&&record){after.orderNo=record.orderNo;after.createdAt=record.createdAt;after.updatedAt=record.updatedAt;}list.push(after);}});
    var remoteChanges=sharedDiff(state,merged);sharedAccept(reply);sharedApply(merged);sharedFailed=false;sharedPending();sharedRender(remoteChanges);
  }catch(error){
    sharedFailed=true;sharedStatus('未同步：'+error.message,true);
    if(error.status===409){
      localStorage.setItem('peiliao_conflict_backup_'+Date.now(),JSON.stringify(state));
      try{var latest=await sharedApi('state');sharedAccept(latest);sharedApply(latest.state);sharedFailed=false;sharedPending();closeOverlays();sharedRender();sharedStatus('已同步；冲突修改已保留在本机备份',false);}catch(ignore){}
      alert('另一台设备已修改同一条记录。为避免覆盖，已保留本机冲突备份，并读取服务器最新数据。请重新核对这次修改。');
    }else if(error.status===401)sharedHide();
  }finally{sharedSending=false;sharedBusy=false;if(!sharedFailed&&sharedSession){if(sharedDiff(sharedBaseline,state).length)queueSharedSave();else sharedStatus('已同步',false);}}
}
function sharedHide(){
  if(sharedSession)sharedPending();sharedSession=null;clearTimeout(sharedTimer);clearTimeout(sharedSaveTimer);sharedSaveTimer=null;
  closeOverlays();var dialog=document.getElementById('passwordDialog');if(dialog.open)dialog.close();document.getElementById('view-recipe').classList.add('hidden');document.body.classList.add('auth-pending');document.getElementById('authPanel').classList.remove('hidden');document.getElementById('loginUsername').focus();
}
function sharedScheduleRefresh(){clearTimeout(sharedTimer);sharedTimer=null;if(sharedSession&&!document.hidden)sharedTimer=setTimeout(async function(){await sharedRefresh();sharedScheduleRefresh();},SHARED_POLL_DELAY);}
async function sharedActivate(session){
  sharedSession=session;
  var incoming=sharedCopy(state),reply=await sharedApi('state'),marker='peiliao_shared_migrated_v2';
  if(!localStorage.getItem(marker)&&localStorage.getItem('peiliao_before_shared_v2'))incoming=JSON.parse(localStorage.getItem('peiliao_before_shared_v2'));
  var original=!!localStorage.getItem('peiliao_before_shared_v2')||(!localStorage.getItem('peiliao_shared_cache_v2')&&(localStorage.getItem(LS_KEY)||localStorage.getItem(OLD_KEY)));
  if(session.user.role==='admin'&&!localStorage.getItem(marker)&&original){
    if(!localStorage.getItem('peiliao_before_shared_v2'))localStorage.setItem('peiliao_before_shared_v2',JSON.stringify(incoming));
    reply=await sharedApi('migrate',{state:incoming});localStorage.setItem(marker,'1');
    if(reply.imported)alert('已合并 '+reply.imported+' 笔旧订单。定金已四舍五入为整数元，原数据保留在本机备份。');
  }else if(session.user.role!=='admin'&&!localStorage.getItem('peiliao_shared_cache_v2')&&original&&!localStorage.getItem(marker)&&!localStorage.getItem('peiliao_before_shared_v2')){localStorage.setItem('peiliao_before_shared_v2',JSON.stringify(incoming));alert('本机旧订单已保留备份。请使用管理员账号登录此设备，完成旧订单合并。');}
  sharedAccept(reply);sharedApply(sharedRecover(reply.state));sharedLastDate=todayStr();
  document.getElementById('accountName').textContent=session.user.displayName+'（'+session.user.username+'）';document.getElementById('passwordUsername').value=session.user.username;
  document.getElementById('adminLink').classList.toggle('hidden',session.user.role!=='admin');document.body.classList.remove('auth-pending');document.getElementById('authPanel').classList.add('hidden');
  if(!sharedStarted){sharedStarted=true;init();}else{closeOverlays();sharedRender();}
  sharedStatus('已同步',false);sharedScheduleRefresh();sharedFailed=false;if(sharedDiff(sharedBaseline,state).length)queueSharedSave();else sharedPending();
}
async function sharedRefresh(){
  if(!sharedSession||sharedBusy||sharedFailed||sharedRefreshing||document.hidden)return;
  if(['view-order-edit','view-price','view-recipe','view-production'].some(function(id){return !document.getElementById(id).classList.contains('hidden');}))return;
  sharedRefreshing=true;
  var baselineAtStart=sharedBaseline,sessionAtStart=sharedSession;
  try{
    var reply=await sharedApi('state',undefined,true);
    // Never replace edits started while a GET was in flight.
    if(sharedBusy||sharedFailed||sharedSession!==sessionAtStart||sharedBaseline!==baselineAtStart)return;
    if(!reply.notModified&&(reply.revision===undefined||reply.revision!==sharedRevision)){var changes=sharedDiff(sharedBaseline,reply.state);sharedAccept(reply);if(changes.length){sharedApply(reply.state);sharedRender(changes);}}
    if(sharedLastDate!==todayStr()){sharedLastDate=todayStr();renderOrders();renderDateCalc();}sharedStatus('已同步',false);
  }catch(error){if(sharedSession!==sessionAtStart)return;if(error.status===401)sharedHide();else sharedStatus('连接中断；下次自动重连',false);}
  finally{sharedRefreshing=false;}
}
async function sharedImportFile(event){
  var file=event.target.files[0];event.target.value='';if(!file)return;
  if(!sharedSession||sharedSession.user.role!=='admin'){alert('导入旧订单需要管理员账号。');return;}
  if(sharedBusy||sharedFailed){alert('请先完成当前保存，再导入备份。');return;}
  try{var incoming=JSON.parse(await file.text());if(!incoming.categories||!incoming.products)throw new Error('备份格式不正确');if(!incoming.orders)incoming=migrateOld(incoming);localStorage.setItem('peiliao_import_backup_'+Date.now(),JSON.stringify(incoming));var reply=await sharedApi('migrate',{state:incoming});sharedAccept(reply);sharedApply(reply.state);closeOverlays();sharedRender();alert('合并完成，新增 '+reply.imported+' 笔订单。已有订单不会被备份覆盖。');}
  catch(error){alert('导入失败：'+error.message);}
}
async function bootShared(){
  document.getElementById('loginForm').addEventListener('submit',async function(event){event.preventDefault();sharedAuthAttempt++;var button=document.getElementById('loginSubmit');button.disabled=true;document.getElementById('loginError').textContent='';try{var session=await sharedApi('auth/login',{username:document.getElementById('loginUsername').value.trim(),password:document.getElementById('loginPassword').value});document.getElementById('loginPassword').value='';await sharedActivate(session);}catch(error){sharedHide();document.getElementById('loginError').textContent=error.message;}finally{button.disabled=false;}});
  document.getElementById('syncRetry').addEventListener('click',queueSharedSave);
  document.getElementById('logoutButton').addEventListener('click',async function(){if(sharedBusy||sharedFailed){alert('当前修改尚未同步，请先完成保存。');return;}try{await sharedApi('auth/logout',{});sharedHide();}catch(error){alert(error.message);}});
  document.getElementById('changePassword').addEventListener('click',function(){document.getElementById('passwordForm').reset();document.getElementById('passwordUsername').value=sharedSession.user.username;document.getElementById('passwordError').textContent='';document.getElementById('passwordDialog').showModal();});
  document.getElementById('passwordCancel').addEventListener('click',function(){document.getElementById('passwordDialog').close();});
  document.getElementById('passwordForm').addEventListener('submit',async function(event){event.preventDefault();var button=event.target.querySelector('[type="submit"]');button.disabled=true;try{await sharedApi('auth/password',{currentPassword:document.getElementById('currentPassword').value,newPassword:document.getElementById('nextPassword').value});document.getElementById('passwordDialog').close();alert('密码已修改。');}catch(error){document.getElementById('passwordError').textContent=error.message;}finally{button.disabled=false;}});
  window.addEventListener('beforeunload',function(event){if(sharedBusy||sharedFailed){sharedPending();persistLocalCache();event.preventDefault();event.returnValue='当前修改尚未同步';}});
  window.addEventListener('pagehide',sharedPending);
  document.addEventListener('visibilitychange',function(){sharedScheduleRefresh();if(!document.hidden)void sharedRefresh();else sharedPending();});
  window.addEventListener('online',function(){if(sharedFailed)queueSharedSave();else void sharedRefresh();sharedScheduleRefresh();});
  var attemptAtStart=sharedAuthAttempt;
  try{var previousSession=await sharedApi('auth/me');if(attemptAtStart===sharedAuthAttempt)await sharedActivate(previousSession);}
  catch(error){if(attemptAtStart!==sharedAuthAttempt)return;sharedHide();if(error.status!==401)document.getElementById('loginError').textContent='连接服务器失败：'+error.message;}
}
