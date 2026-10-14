'use strict';

var session=null,allOrders=[],allUsers=[],resetUser=null;
var orderOffset=0,orderTotal=0,orderPageSize=100,orderRequest=0,searchTimer=null,refreshBusy=false;
function escapeText(value){return String(value==null?'':value).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
function node(id){return document.getElementById(id);}
async function api(path,data){
  var sessionAtStart=session;
  var options={credentials:'same-origin',cache:'no-store',headers:{}};
  if(data!==undefined){options.method='POST';options.headers['Content-Type']='application/json';options.headers['X-CSRF-Token']=session?session.csrf:'';options.body=JSON.stringify(data);}
  var controller=typeof AbortController==='function'?new AbortController():null;if(controller)options.signal=controller.signal;
  var timer=setTimeout(function(){if(controller)controller.abort();},20000);
  try{var response=await fetch('/api/'+path,options),body=await response.json();if(!response.ok){var error=new Error(body.error||'请求失败');error.status=response.status;throw error;}return body;}
  catch(error){if(error.name==='AbortError')throw new Error('请求超时，请重试');if((error.status===401||error.status===403)&&session===sessionAtStart)hide();throw error;}
  finally{clearTimeout(timer);}
}
function message(text){node('message').textContent=text;}
function hide(){session=null;allOrders=[];allUsers=[];orderRequest++;node('dashboard').classList.add('hidden');node('loginPanel').classList.remove('hidden');if(node('resetDialog').open)node('resetDialog').close();node('username').focus();}
async function activate(auth){session=auth;if(auth.user.role!=='admin'){hide();throw new Error('此账号没有管理员权限，请返回订单系统。');}await refresh();node('adminName').textContent=auth.user.displayName;node('dashboard').classList.remove('hidden');node('loginPanel').classList.add('hidden');}
function renderUsers(){
  node('users').innerHTML=allUsers.map(function(user){return '<tr><td>'+escapeText(user.username)+'</td><td>'+escapeText(user.displayName)+'</td><td>'+(user.role==='admin'?'管理员':'员工')+'</td><td>'+(user.enabled?'可用':'已停用')+'</td><td>'+(user.role==='admin'?'<span class="muted">在订单系统修改密码</span>':'<button data-toggle="'+user.id+'">'+(user.enabled?'停用':'启用')+'</button> <button data-reset="'+user.id+'">重置密码</button>')+'</td></tr>';}).join('');
}
function renderOrders(){
  node('orderCount').textContent='共 '+orderTotal+' 笔订单'+(orderTotal?' · 当前 '+(orderOffset+1)+'—'+Math.min(orderOffset+allOrders.length,orderTotal):'');
  node('orders').innerHTML=allOrders.map(function(order){return '<tr><td>'+escapeText(order.orderNo)+(order.legacyOrderNo?'<div class="muted">原 '+escapeText(order.legacyOrderNo)+'</div>':'')+'</td><td>'+escapeText(order.orderDate)+'</td><td>'+(order.cancelled?'已取消':order.status==='picked'?'已取货':'未取')+(order.earlyPickup?' <span class="badge">★早取</span>':'')+'</td><td class="wrap">'+order.items.map(function(item){return escapeText(item.productName)+' × '+item.quantity;}).join('、')+'</td><td>'+escapeText(order.customerName||'—')+'<div class="muted">'+escapeText(order.phone||'')+'</div></td><td>¥'+(order.orderAmount/100).toFixed(2)+' / ¥'+Math.round(order.deposit/100)+'</td><td>'+escapeText(order.creator)+'<div class="muted">'+escapeText(order.creatorUsername)+(order.imported?' · 历史合并':'')+'</div></td></tr>';}).join('')||'<tr><td colspan="7" class="muted">暂无匹配订单</td></tr>';
  node('ordersPrevious').disabled=orderOffset===0;node('ordersNext').disabled=orderOffset+orderPageSize>=orderTotal;
}
async function fetchOrders(){
  var request=++orderRequest,query=node('orderSearch').value.trim(),offset=orderOffset;
  node('ordersBusy').textContent='正在加载…';
  try{
    var reply=await api('admin/orders?limit='+orderPageSize+'&offset='+offset+'&q='+encodeURIComponent(query));
    if(request!==orderRequest)return;
    allOrders=reply.orders;orderTotal=reply.total===undefined?allOrders.length:reply.total;orderOffset=reply.offset===undefined?offset:reply.offset;
    if(orderOffset>=orderTotal&&orderOffset>0){orderOffset=0;return fetchOrders();}
    renderOrders();node('ordersBusy').textContent='';
  }catch(error){if(request===orderRequest)node('ordersBusy').textContent='加载失败：'+error.message;throw error;}
}
async function refresh(){
  if(refreshBusy)return;refreshBusy=true;node('refresh').disabled=true;message('');
  try{
    var replies=await Promise.all([api('admin/users'),api('admin/audit'),fetchOrders()]);allUsers=replies[0].users;renderUsers();
    node('audit').innerHTML=replies[1].audit.map(function(row){return '<tr><td>'+escapeText(new Date(row.occurred_at).toLocaleString('zh-CN'))+'</td><td>'+escapeText(row.username)+'</td><td>'+escapeText(row.action)+'</td><td>'+escapeText(row.order_no||'—')+'</td></tr>';}).join('')||'<tr><td colspan="4" class="muted">暂无操作记录</td></tr>';
  }finally{refreshBusy=false;node('refresh').disabled=false;}
}
node('loginForm').addEventListener('submit',async function(event){event.preventDefault();var button=node('loginButton');button.disabled=true;node('loginError').textContent='';try{await activate(await api('auth/login',{username:node('username').value.trim(),password:node('password').value}));node('password').value='';}catch(error){node('loginError').textContent=error.message;}finally{button.disabled=false;}});
node('createUser').addEventListener('submit',async function(event){event.preventDefault();var button=event.target.querySelector('button');button.disabled=true;try{await api('admin/users',{username:node('newUsername').value.trim(),displayName:node('newName').value.trim(),password:node('newPassword').value});event.target.reset();await refresh();message('员工账号已创建。');}catch(error){message(error.message);}finally{button.disabled=false;}});
node('users').addEventListener('click',async function(event){
  var button=event.target.closest('button');if(!button)return;var id=Number(button.dataset.toggle||button.dataset.reset),user=allUsers.find(function(item){return item.id===id;});if(!user)return;
  if(button.dataset.reset){resetUser=user;node('resetTitle').textContent='重置 '+user.displayName+' 的密码';node('resetUsername').value=user.username;node('resetPassword').value='';node('resetError').textContent='';node('resetDialog').showModal();return;}
  button.disabled=true;try{await api('admin/users/update',{id:id,enabled:!user.enabled});await refresh();}catch(error){message(error.message);}finally{button.disabled=false;}
});
node('resetForm').addEventListener('submit',async function(event){event.preventDefault();var button=event.target.querySelector('[type="submit"]');button.disabled=true;try{await api('admin/users/update',{id:resetUser.id,enabled:resetUser.enabled,password:node('resetPassword').value});node('resetDialog').close();await refresh();}catch(error){node('resetError').textContent=error.message;}finally{button.disabled=false;}});
node('resetCancel').addEventListener('click',function(){node('resetDialog').close();});
node('orderSearch').addEventListener('input',function(){clearTimeout(searchTimer);searchTimer=setTimeout(function(){orderOffset=0;void fetchOrders().catch(function(error){message(error.message);});},180);});
node('ordersPrevious').addEventListener('click',function(){orderOffset=Math.max(0,orderOffset-orderPageSize);void fetchOrders().catch(function(error){message(error.message);});});
node('ordersNext').addEventListener('click',function(){orderOffset+=orderPageSize;void fetchOrders().catch(function(error){message(error.message);});});
node('refresh').addEventListener('click',function(){void refresh().catch(function(error){message(error.message);});});
node('logout').addEventListener('click',async function(){try{await api('auth/logout',{});hide();}catch(error){message(error.message);}});
api('auth/me').then(activate).catch(function(error){hide();if(error.status!==401)node('loginError').textContent=error.message;});
