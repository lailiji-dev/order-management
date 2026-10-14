'use strict';
var sharedSession=null, sharedBaseline=null, sharedBusy=false, sharedFailed=false, sharedStarted=false;
var sharedTimer=null;
var sharedCollections=['categories','products','orders'];
function sharedCopy(v){return JSON.parse(JSON.stringify(v));}
function sharedDiff(before,after){
  var changes=[];
  sharedCollections.forEach(function(collection){
    var a={},b={};(before[collection]||[]).forEach(function(x){a[x.id]=x;});(after[collection]||[]).forEach(function(x){b[x.id]=x;});
    Array.from(new Set(Object.keys(a).concat(Object.keys(b)))).forEach(function(id){
      if(JSON.stringify(a[id]||null)!==JSON.stringify(b[id]||null))changes.push({collection:collection,id:id,before:a[id]||null,after:b[id]||null});
    });
  });return changes;
}
async function sharedApi(path,data){
  var options={credentials:'same-origin',cache:'no-store',headers:{}};
  if(data!==undefined){options.method='POST';options.headers['Content-Type']='application/json';options.headers['X-CSRF-Token']=sharedSession?sharedSession.csrf:'';options.body=JSON.stringify(data);}
  var response=await fetch('/api/'+path,options), body=await response.json();
  if(!response.ok){var error=new Error(body.error||'请求失败');error.status=response.status;throw error;}return body;
}
function sharedStatus(message,failed){
  document.getElementById('syncStatus').textContent=message;
  document.getElementById('syncRetry').classList.toggle('hidden',!failed);
}
function sharedCache(){try{localStorage.setItem(LS_KEY,JSON.stringify(state));}catch(e){sharedStatus('本机缓存不可用，服务器数据仍保留',false);}}
function sharedPendingKey(){return 'peiliao_pending_shared_v2_'+sharedSession.user.id;}
function sharedPending(){
  if(!sharedSession||!sharedBaseline)return;
  try{if(sharedDiff(sharedBaseline,state).length)localStorage.setItem(sharedPendingKey(),JSON.stringify({before:sharedBaseline,after:state}));else localStorage.removeItem(sharedPendingKey());}catch(error){sharedStatus('本机备份不可用，请保持页面打开直到同步完成',false);}
}
function sharedSame(a,b){
  if(!a||!b)return a===b;
  var ignored=['orderNo','createdAt','updatedAt'];
  return Object.keys(a).every(function(key){return ignored.includes(key)||JSON.stringify(a[key])===JSON.stringify(b[key]);});
}
function sharedRecover(remote){
  var saved=localStorage.getItem(sharedPendingKey());if(!saved)return remote;
  var pending=JSON.parse(saved),merged=sharedCopy(remote),conflicts=0;
  sharedDiff(pending.before,pending.after).forEach(function(change){
    var list=merged[change.collection],idx=list.findIndex(function(x){return x.id===change.id;}),current=idx<0?null:list[idx];
    if(sharedSame(change.after,current))return;
    if(!sharedSame(change.before,current)){conflicts++;return;}
    if(idx>=0)list.splice(idx,1);
    if(change.after){var record=sharedCopy(change.after);if(change.collection==='orders'&&current){record.orderNo=current.orderNo;record.createdAt=current.createdAt;record.updatedAt=current.updatedAt;}list.push(record);}
  });
  if(conflicts){localStorage.setItem('peiliao_conflict_backup_'+Date.now(),JSON.stringify(pending.after));alert('上次有 '+conflicts+' 条未同步修改与服务器冲突，已保留本机备份，请核对后重新修改。');}
  else if(sharedDiff(remote,merged).length)alert('上次未同步的修改已恢复，正在继续保存。');
  localStorage.removeItem(sharedPendingKey());return merged;
}
function sharedApply(remote){
  var localPlan=state.todayPlan,localDate=state.calcPlanDate;
  state=sharedCopy(remote);state.todayPlan=localPlan||{};state.calcPlanDate=localDate||todayStr();sharedCache();localStorage.setItem('peiliao_shared_cache_v2','1');
}
function sharedRender(){
  renderOrders();renderPlan();renderDateCalc();
  var detail=document.getElementById('view-order-detail');
  if(!detail.classList.contains('hidden'))closeOverlays();
}
function queueSharedSave(){if(!sharedSession||!sharedBaseline)return;sharedPending();sharedFailed=false;sharedStatus('正在保存到服务器…',false);if(!sharedBusy)void flushShared();}
async function flushShared(){
  if(sharedBusy||!sharedSession||!sharedBaseline)return;
  var desired=sharedCopy(state),changes=sharedDiff(sharedBaseline,desired);
  if(!changes.length){sharedStatus('已同步',false);return;}
  sharedBusy=true;
  try{
    var reply=await sharedApi('sync',{changes:changes});
    var later=sharedDiff(desired,state),merged=sharedCopy(reply.state);
    later.forEach(function(change){
      var list=merged[change.collection],idx=list.findIndex(function(x){return x.id===change.id;}),serverRecord=idx<0?null:list[idx];
      if(idx>=0)list.splice(idx,1);
      if(change.after){var record=sharedCopy(change.after);if(change.collection==='orders'&&serverRecord){record.orderNo=serverRecord.orderNo;record.createdAt=serverRecord.createdAt;record.updatedAt=serverRecord.updatedAt;}list.push(record);}
    });
    sharedBaseline=sharedCopy(reply.state);sharedApply(merged);sharedFailed=false;sharedPending();
    // Re-render cards after the server assigns the official order number. Keep an active editor intact.
    renderOrders();
  }catch(error){
    sharedFailed=true;
    sharedStatus('未同步：'+error.message,true);
    if(error.status===409){
      localStorage.setItem('peiliao_conflict_backup_'+Date.now(),JSON.stringify(state));
      try{var latest=await sharedApi('state');sharedBaseline=sharedCopy(latest.state);sharedApply(latest.state);sharedFailed=false;sharedPending();closeOverlays();sharedRender();sharedStatus('已同步；冲突修改已保留在本机备份',false);}catch(ignore){}
      alert('另一台设备已修改同一条记录。为避免覆盖，已保留本机冲突备份，并读取服务器最新数据。请重新核对这次修改。');
    }else if(error.status===401){sharedHide();}
  }finally{
    sharedBusy=false;
    if(!sharedFailed&&sharedSession){if(sharedDiff(sharedBaseline,state).length)void flushShared();else sharedStatus('已同步',false);}
  }
}
function sharedHide(){sharedSession=null;clearInterval(sharedTimer);closeOverlays();var dialog=document.getElementById('passwordDialog');if(dialog.open)dialog.close();document.getElementById('view-recipe').classList.add('hidden');document.body.classList.add('auth-pending');document.getElementById('authPanel').classList.remove('hidden');}
async function sharedActivate(session){
  sharedSession=session;
  var incoming=sharedCopy(state), reply=await sharedApi('state');
  var marker='peiliao_shared_migrated_v2';
  if(!localStorage.getItem(marker)&&localStorage.getItem('peiliao_before_shared_v2'))incoming=JSON.parse(localStorage.getItem('peiliao_before_shared_v2'));
  var hasOriginal=!!localStorage.getItem('peiliao_before_shared_v2')||(!localStorage.getItem('peiliao_shared_cache_v2')&&(localStorage.getItem(LS_KEY)||localStorage.getItem(OLD_KEY)));
  if(session.user.role==='admin'&&!localStorage.getItem(marker)&&hasOriginal){
    // Preserve the original device data before any replacement by the server cache.
    if(!localStorage.getItem('peiliao_before_shared_v2'))localStorage.setItem('peiliao_before_shared_v2',JSON.stringify(incoming));
    reply=await sharedApi('migrate',{state:incoming});
    localStorage.setItem(marker,'1');
    if(reply.imported)alert('已合并 '+reply.imported+' 笔旧订单。定金已四舍五入为整数元，原数据保留在本机备份。');
  }else if(session.user.role!=='admin'&&!localStorage.getItem('peiliao_shared_cache_v2')&&hasOriginal&&!localStorage.getItem(marker)&&!localStorage.getItem('peiliao_before_shared_v2')){
    localStorage.setItem('peiliao_before_shared_v2',JSON.stringify(incoming));
    alert('本机旧订单已保留备份。请使用管理员账号登录此设备，完成旧订单合并。');
  }
  sharedBaseline=sharedCopy(reply.state);sharedApply(sharedRecover(reply.state));
  document.getElementById('accountName').textContent=session.user.displayName+'（'+session.user.username+'）';
  document.getElementById('adminLink').classList.toggle('hidden',session.user.role!=='admin');
  document.body.classList.remove('auth-pending');document.getElementById('authPanel').classList.add('hidden');
  if(!sharedStarted){sharedStarted=true;init();}else{closeOverlays();sharedRender();}
  sharedStatus('已同步',false);clearInterval(sharedTimer);
  sharedTimer=setInterval(sharedRefresh,15000);
  sharedFailed=false;if(sharedDiff(sharedBaseline,state).length)queueSharedSave();
}
async function sharedRefresh(){
  if(!sharedSession||sharedBusy||sharedFailed||sharedDiff(sharedBaseline,state).length)return;
  if(['view-order-edit','view-price','view-recipe','view-production'].some(function(id){return !document.getElementById(id).classList.contains('hidden');}))return;
  try{var reply=await sharedApi('state');if(JSON.stringify(reply.state)!==JSON.stringify(sharedBaseline)){sharedBaseline=sharedCopy(reply.state);sharedApply(reply.state);sharedRender();}sharedStatus('已同步',false);}
  catch(error){if(error.status===401)sharedHide();else sharedStatus('连接中断；下次自动重连',false);}
}
async function sharedImportFile(event){
  var file=event.target.files[0];event.target.value='';if(!file)return;
  if(!sharedSession||sharedSession.user.role!=='admin'){alert('导入旧订单需要管理员账号。');return;}
  if(sharedBusy||sharedFailed){alert('请先完成当前保存，再导入备份。');return;}
  try{
    var incoming=JSON.parse(await file.text());
    if(!incoming.categories||!incoming.products)throw new Error('备份格式不正确');
    if(!incoming.orders)incoming=migrateOld(incoming);
    localStorage.setItem('peiliao_import_backup_'+Date.now(),JSON.stringify(incoming));
    var reply=await sharedApi('migrate',{state:incoming});sharedBaseline=sharedCopy(reply.state);sharedApply(reply.state);closeOverlays();sharedRender();
    alert('合并完成，新增 '+reply.imported+' 笔订单。已有订单不会被备份覆盖。');
  }catch(error){alert('导入失败：'+error.message);}
}
async function bootShared(){
  document.getElementById('loginForm').addEventListener('submit',async function(event){
    event.preventDefault();var button=document.getElementById('loginSubmit');button.disabled=true;document.getElementById('loginError').textContent='';
    try{var session=await sharedApi('auth/login',{username:document.getElementById('loginUsername').value.trim(),password:document.getElementById('loginPassword').value});document.getElementById('loginPassword').value='';await sharedActivate(session);}
    catch(error){sharedHide();document.getElementById('loginError').textContent=error.message;}finally{button.disabled=false;}
  });
  document.getElementById('syncRetry').addEventListener('click',function(){queueSharedSave();});
  document.getElementById('logoutButton').addEventListener('click',async function(){
    if(sharedBusy||sharedFailed||sharedDiff(sharedBaseline,state).length){alert('当前修改尚未同步，请先完成保存。');return;}
    try{await sharedApi('auth/logout',{});sharedHide();}catch(error){alert(error.message);}
  });
  document.getElementById('changePassword').addEventListener('click',function(){document.getElementById('passwordForm').reset();document.getElementById('passwordError').textContent='';document.getElementById('passwordDialog').showModal();});
  document.getElementById('passwordCancel').addEventListener('click',function(){document.getElementById('passwordDialog').close();});
  document.getElementById('passwordForm').addEventListener('submit',async function(event){
    event.preventDefault();var button=event.target.querySelector('[type="submit"]');button.disabled=true;
    try{await sharedApi('auth/password',{currentPassword:document.getElementById('currentPassword').value,newPassword:document.getElementById('nextPassword').value});document.getElementById('passwordDialog').close();alert('密码已修改。');}catch(error){document.getElementById('passwordError').textContent=error.message;}finally{button.disabled=false;}
  });
  window.addEventListener('beforeunload',function(event){if(sharedBusy||sharedFailed||(sharedSession&&sharedBaseline&&sharedDiff(sharedBaseline,state).length)){event.preventDefault();event.returnValue='当前修改尚未同步';}});
  try{await sharedActivate(await sharedApi('auth/me'));}catch(error){sharedHide();if(error.status!==401)document.getElementById('loginError').textContent='连接服务器失败：'+error.message;}
}
