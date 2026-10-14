"use strict";

/* =================================================================
 *  农历算法（1900-2100）— 仅用于展示
 * ================================================================= */
var lunarInfo=[0x04bd8,0x04ae0,0x0a570,0x054d5,0x0d260,0x0d950,0x16554,0x056a0,0x09ad0,0x055d2,
0x04ae0,0x0a5b6,0x0a4d0,0x0d250,0x1d255,0x0b540,0x0d6a0,0x0ada2,0x095b0,0x14977,
0x04970,0x0a4b0,0x0b4b5,0x06a50,0x06d40,0x1ab54,0x02b60,0x09570,0x052f2,0x04970,
0x06566,0x0d4a0,0x0ea50,0x16a95,0x05ad0,0x02b60,0x186e3,0x092e0,0x1c8d7,0x0c950,
0x0d4a0,0x1d8a6,0x0b550,0x056a0,0x1a5b4,0x025d0,0x092d0,0x0d2b2,0x0a950,0x0b557,
0x06ca0,0x0b550,0x15355,0x04da0,0x0a5b0,0x14573,0x052b0,0x0a9a8,0x0e950,0x06aa0,
0x0aea6,0x0ab50,0x04b60,0x0aae4,0x0a570,0x05260,0x0f263,0x0d950,0x05b57,0x056a0,
0x096d0,0x04dd5,0x04ad0,0x0a4d0,0x0d4d4,0x0d250,0x0d558,0x0b540,0x0b6a0,0x195a6,
0x095b0,0x049b0,0x0a974,0x0a4b0,0x0b27a,0x06a50,0x06d40,0x0af46,0x0ab60,0x09570,
0x04af5,0x04970,0x064b0,0x074a3,0x0ea50,0x06b58,0x05ac0,0x0ab60,0x096d5,0x092e0,
0x0c960,0x0d954,0x0d4a0,0x0da50,0x07552,0x056a0,0x0abb7,0x025d0,0x092d0,0x0cab5,
0x0a950,0x0b4a0,0x0baa4,0x0ad50,0x055d9,0x04ba0,0x0a5b0,0x15176,0x052b0,0x0a930,
0x07954,0x06aa0,0x0ad50,0x05b52,0x04b60,0x0a6e6,0x0a4e0,0x0d260,0x0ea65,0x0d530,
0x05aa0,0x076a3,0x096d0,0x04afb,0x04ad0,0x0a4d0,0x1d0b6,0x0d250,0x0d520,0x0dd45,
0x0b5a0,0x056d0,0x055b2,0x049b0,0x0a577,0x0a4b0,0x0aa50,0x1b255,0x06d20,0x0ada0,
0x14b63,0x09370,0x049f8,0x04970,0x064b0,0x168a6,0x0ea50,0x06b20,0x1a6c4,0x0aae0,
0x092e0,0x0d2e3,0x0c960,0x0d557,0x0d4a0,0x0da50,0x05d55,0x056a0,0x0a6d0,0x055d4,
0x052d0,0x0a9b8,0x0a950,0x0b4a0,0x0b6a6,0x0ad50,0x055a0,0x0aba4,0x0a5b0,0x052b0,
0x0b273,0x06930,0x07337,0x06aa0,0x0ad50,0x14b55,0x04b60,0x0a570,0x054e4,0x0d160,
0x0e968,0x0d520,0x0daa0,0x16aa6,0x056d0,0x04ae0,0x0a9d4,0x0a2d0,0x0d150,0x0f252,
0x0d520];
var Gan=['甲','乙','丙','丁','戊','己','庚','辛','壬','癸'];
var Zhi=['子','丑','寅','卯','辰','巳','午','未','申','酉','戌','亥'];
var nStr1=['日','一','二','三','四','五','六','七','八','九','十'];
var nStr2=['初','十','廿','卅'];
var nStr3=['正','二','三','四','五','六','七','八','九','十','冬','腊'];
var lunarFestival={'1-1':'春节','1-15':'元宵','2-2':'龙头节','5-5':'端午','7-7':'七夕','7-15':'中元','8-15':'中秋','9-9':'重阳','12-8':'腊八','12-23':'祭灶'};

function lYearDays(y){var sum=348,i;for(i=0x8000;i>0x8;i>>=1){sum+=(lunarInfo[y-1900]&i)?1:0;}return sum+leapDays(y);}
function leapDays(y){if(leapMonth(y)){return (lunarInfo[y-1900]&0x10000)?30:29;}return 0;}
function leapMonth(y){return lunarInfo[y-1900]&0xf;}
function monthDays(y,m){return (lunarInfo[y-1900]&(0x10000>>m))?30:29;}
function solar2lunar(y,m,d){
  var offset=(Date.UTC(y,m-1,d)-Date.UTC(1900,0,31))/86400000;
  var temp=0,i;
  for(i=1900;i<2101&&offset>0;i++){temp=lYearDays(i);offset-=temp;}
  if(offset<0){offset+=temp;i--;}
  var ly=i;
  var leapM=leapMonth(ly);
  var isLeap=false;
  for(i=1;i<13&&offset>0;i++){
    if(leapM>0&&i===(leapM+1)&&!isLeap){--i;isLeap=true;temp=leapDays(ly);}
    else{temp=monthDays(ly,i);}
    if(isLeap===true&&i===(leapM+1))isLeap=false;
    offset-=temp;
  }
  if(offset===0&&leapM>0&&i===leapM+1){if(isLeap){isLeap=false;}else{isLeap=true;--i;}}
  if(offset<0){offset+=temp;--i;}
  return {lYear:ly,lMonth:i,lDay:offset+1,isLeap:isLeap,cGan:(ly-1864)%10,cZhi:(ly-1864)%12};
}
function toChinaDay(d){
  if(d===10)return '初十';if(d===20)return '二十';if(d===30)return '三十';
  var t=Math.floor(d/10),o=d%10;
  if(d<10)return '初'+nStr1[o];
  return nStr2[t]+nStr1[o];
}
function toChinaMonth(m){return (m<1||m>12)?'':nStr3[m-1]+'月';}
var lunarTextCache=new Map();
function lunarText(y,m,d){
  var key=y+'-'+m+'-'+d;if(lunarTextCache.has(key))return lunarTextCache.get(key);
  var L=solar2lunar(y,m,d);
  var md=(L.isLeap?'闰':'')+toChinaMonth(L.lMonth);
  var dd=toChinaDay(L.lDay);
  var ganzhi=Gan[L.cGan]+Zhi[L.cZhi]+'年';
  var fest=lunarFestival[L.lMonth+'-'+L.lDay];
  var result={monthDay:dd,ganzhi:ganzhi,full:L.isLeap?'闰'+toChinaMonth(L.lMonth)+dd:md+dd,fest:fest};
  if(lunarTextCache.size>400)lunarTextCache.clear();lunarTextCache.set(key,result);return result;
}

/* =================================================================
 *  基础工具
 * ================================================================= */
function genId(p){p=p||'id';return p+Date.now().toString(36)+Math.random().toString(36).slice(2,7);}
function escapeHtml(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
function pad2(n){return String(n).padStart(2,'0');}
function todayStr(){var d=new Date();return d.getFullYear()+'-'+pad2(d.getMonth()+1)+'-'+pad2(d.getDate());}
function parseDate(s){var a=String(s).split('-');return {y:parseInt(a[0],10),m:parseInt(a[1],10),d:parseInt(a[2],10)};}
function weekdayCn(s){var wd=['日','一','二','三','四','五','六'][new Date(s).getDay()];return '星期'+wd;}
function todayDateText(){var t=todayStr();var p=parseDate(t);var L=lunarText(p.y,p.m,p.d);return t+'　'+weekdayCn(t)+'　农历 '+L.monthDay;}
function fmtKg(n){var r=Math.round((Number(n)+Number.EPSILON)*1000)/1000;return r.toString();}
function fmtCount(n){return Math.round(Number(n)).toString();}
function toKg(amount,unit){amount=parseFloat(amount)||0;return unit==='g'?amount/1000:amount;}
/* 金额：内部统一用「分」整数 */
function yuanToCents(y){return Math.round((parseFloat(y)||0)*100);}
function centsToYuan(c){return (Math.round(c||0)/100);}
function fmtMoney(c){return '¥'+(Math.round(c||0)/100).toFixed(2);}
function fmtNum(n){var v=Number(n)||0;return v.toLocaleString('zh-CN');}

/* =================================================================
 *  默认数据（产品价格初始化为 0，由用户后续设置）
 * ================================================================= */
var DEFAULT_DATA={
  dataVersion:1,
  categories:[
    {id:'c1',name:'煎堆',sort:1},
    {id:'c2',name:'糍粑',sort:2},
    {id:'c3',name:'饼类',sort:3},
    {id:'c4',name:'蛋糕类',sort:4},
    {id:'c5',name:'生粉',sort:5}
  ],
  products:[
    {id:'p1',name:'小煎堆',categoryId:'c1',price:0,recipeYield:500,lossRate:0,enabled:true,recipe:[]},
    {id:'p2',name:'糖煎堆',categoryId:'c1',price:0,recipeYield:400,lossRate:0,enabled:true,recipe:[]},
    {id:'p3',name:'味煎堆',categoryId:'c1',price:0,recipeYield:500,lossRate:0,enabled:true,recipe:[]},
    {id:'p4',name:'芝麻煎堆',categoryId:'c1',price:0,recipeYield:350,lossRate:0,enabled:true,recipe:[]},
    {id:'p5',name:'特大煎堆',categoryId:'c1',price:0,recipeYield:200,lossRate:0,enabled:true,recipe:[]},
    {id:'p6',name:'莲蓉煎堆',categoryId:'c1',price:0,recipeYield:300,lossRate:0,enabled:true,recipe:[]},
    {id:'p7',name:'糖糍粑',categoryId:'c2',price:0,recipeYield:500,lossRate:0,enabled:true,recipe:[]},
    {id:'p8',name:'味糍粑',categoryId:'c2',price:0,recipeYield:500,lossRate:0,enabled:true,recipe:[]},
    {id:'p9',name:'双喜饼',categoryId:'c3',price:0,recipeYield:300,lossRate:0,enabled:true,recipe:[]},
    {id:'p10',name:'大饼',categoryId:'c3',price:0,recipeYield:200,lossRate:0,enabled:true,recipe:[]},
    {id:'p11',name:'蛋糕仔',categoryId:'c4',price:0,recipeYield:300,lossRate:0,enabled:true,recipe:[]},
    {id:'p12',name:'三色大生粉',categoryId:'c5',price:0,recipeYield:200,lossRate:0,enabled:true,recipe:[]},
    {id:'p13',name:'双色大生粉',categoryId:'c5',price:0,recipeYield:200,lossRate:0,enabled:true,recipe:[]},
    {id:'p14',name:'小生粉',categoryId:'c5',price:0,recipeYield:200,lossRate:0,enabled:true,recipe:[]}
  ],
  orders:[],
  productionPlans:{},
  settings:{},
  todayPlan:{}
};

var LS_KEY='food_factory_app_data_v1';
var OLD_KEY='peiliao_data_v1';
var LS_PLAN_DATE='peiliao_plan_date_v1';
var state=loadData();

function migrateOld(raw){
  // 旧结构：{categories,products(standardYield),todayPlan}
  var d=JSON.parse(JSON.stringify(DEFAULT_DATA));
  if(raw.categories) d.categories=raw.categories.map(function(c,i){return {id:c.id||genId('c'),name:c.name,sort:i+1};});
  if(raw.products){
    d.products=raw.products.map(function(p){
      return {
        id:p.id||genId('p'),
        name:p.name,
        categoryId:p.categoryId||(d.categories[0]&&d.categories[0].id),
        price:0,
        recipeYield:parseFloat(p.standardYield)||0,
        lossRate:parseFloat(p.lossRate)||0,
        enabled:true,
        recipe:(p.recipe||[]).map(function(m){return {name:m.name,amount:m.amount,unit:m.unit||'kg'};})
      };
    });
  }
  if(raw.todayPlan) d.todayPlan=raw.todayPlan;
  return d;
}
function loadData(){
  try{
    var raw=localStorage.getItem(LS_KEY);
    if(raw){
      var d=JSON.parse(raw);
      if(d&&d.categories&&d.products){
        if(!d.orders)d.orders=[];if(!d.productionPlans)d.productionPlans={};if(!d.settings)d.settings={};
        if(!d.todayPlan)d.todayPlan={};
        if(!d.dataVersion)d.dataVersion=1;
        return d;
      }
    }
    // 兼容旧版 key
    var old=localStorage.getItem(OLD_KEY);
    if(old){
      var od=JSON.parse(old);
      if(od&&od.categories&&od.products){
        var nd=migrateOld(od);
        try{localStorage.setItem(LS_KEY,JSON.stringify(nd));}
        catch(storageError){alert('升级数据暂未保存，请导出备份。旧版数据仍然保留。');}
        // 保留旧版数据作为升级备份，新版后续只写入 LS_KEY。
        return nd;
      }
    }
  }catch(e){}
  return JSON.parse(JSON.stringify(DEFAULT_DATA));
}
var localCacheTimer=null;
function persistLocalCache(){
  clearTimeout(localCacheTimer);localCacheTimer=null;
  try{localStorage.setItem(LS_KEY,JSON.stringify(state));}catch(e){
    if(window.sharedSession)sharedStatus('本机备份不可用，请保持页面打开直到同步完成',false);
    else alert('保存失败：'+e.message);
  }
}
function saveData(localOnly){
  invalidateDataIndex();
  clearTimeout(localCacheTimer);localCacheTimer=setTimeout(persistLocalCache,120);
  if(window.sharedSession&&!localOnly)queueSharedSave();
}
window.addEventListener('pagehide',persistLocalCache);

/* =================================================================
 *  数据访问辅助
 * ================================================================= */
// Build once per mutation; calendars and product lookups reuse O(1) maps.
var dataIndex=null;
function invalidateDataIndex(){dataIndex=null;}
function getDataIndex(){
  if(dataIndex&&dataIndex.source===state&&dataIndex.productSource===state.products&&dataIndex.orderSource===state.orders&&dataIndex.productCount===state.products.length&&dataIndex.orderCount===state.orders.length)return dataIndex;
  var index={source:state,productSource:state.products,orderSource:state.orders,productCount:state.products.length,orderCount:state.orders.length,
    products:new Map(),categories:new Map(),orders:new Map(),byCategory:new Map(),byDate:new Map(),validByDate:new Map(),enabled:[]};
  state.categories.forEach(function(c){index.categories.set(c.id,c);});
  state.products.forEach(function(p){index.products.set(p.id,p);if(p.enabled!==false)index.enabled.push(p);if(!index.byCategory.has(p.categoryId))index.byCategory.set(p.categoryId,[]);index.byCategory.get(p.categoryId).push(p);});
  state.orders.forEach(function(o){index.orders.set(o.id,o);if(!index.byDate.has(o.orderDate))index.byDate.set(o.orderDate,[]);index.byDate.get(o.orderDate).push(o);if(!o.cancelled){if(!index.validByDate.has(o.orderDate))index.validByDate.set(o.orderDate,[]);index.validByDate.get(o.orderDate).push(o);}});
  dataIndex=index;return index;
}
function findProd(id){return getDataIndex().products.get(id);}
function findCat(id){return getDataIndex().categories.get(id);}
function findOrder(id){return getDataIndex().orders.get(id);}
function productsOfCategory(id){return getDataIndex().byCategory.get(id)||[];}
function enabledProducts(){return getDataIndex().enabled;}
function ordersOfDate(dateStr){return getDataIndex().byDate.get(dateStr)||[];}
function validOrdersOfDate(dateStr){return getDataIndex().validByDate.get(dateStr)||[];}

// Skip identical markup and keep the user's keyboard position during list updates.
function replaceHTML(root,html){
  if(root.__lastHTML===html)return false;
  var active=document.activeElement,focus=null;
  if(active&&root.contains(active))focus={id:active.id,act:active.dataset.act,record:active.dataset.id,tab:active.dataset.tab,filter:active.dataset.filter,more:active.dataset.moreOrders,date:active.dataset.date,cal:active.dataset.cal};
  root.innerHTML=html;root.__lastHTML=html;
  if(focus){var replacement=Array.from(root.querySelectorAll('button,input,a')).find(function(el){return focus.id?el.id===focus.id:focus.act?(el.dataset.act===focus.act&&el.dataset.id===focus.record):focus.tab?el.dataset.tab===focus.tab:focus.filter?el.dataset.filter===focus.filter:focus.more?el.dataset.moreOrders===focus.more:focus.date?el.dataset.date===focus.date:focus.cal?el.dataset.cal===focus.cal:false;});if(replacement)replacement.focus({preventScroll:true});}
  return true;
}
var overlayReturnFocus=null;
function prepareOverlay(root){
  if(!root.contains(document.activeElement))overlayReturnFocus=document.activeElement;
  root.setAttribute('role','dialog');root.setAttribute('aria-modal','true');
  var title=root.querySelector('h2');if(title){title.id=root.id+'-title';root.setAttribute('aria-labelledby',title.id);}
  var first=root.querySelector('button,input');if(first)first.focus({preventScroll:true});
}
document.addEventListener('keydown',function(event){
  var datePicker=document.getElementById('modal-datepicker');
  var root=!datePicker.classList.contains('hidden')?datePicker:Array.from(document.querySelectorAll('.overlay')).find(function(el){return !el.classList.contains('hidden');});
  if(!root)return;
  if(event.key==='Escape'){event.preventDefault();if(root===datePicker)closeDatePicker();else closeOverlays();return;}
  if(event.key!=='Tab')return;
  var controls=Array.from(root.querySelectorAll('button,input,textarea,select,a[href]')).filter(function(el){return !el.disabled&&!el.closest('.pe-group.collapsed .pe-group-products');});
  if(!controls.length)return;var first=controls[0],last=controls[controls.length-1];
  if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
});

/* =================================================================
 *  视图切换
 * ================================================================= */
function showView(name){
  document.getElementById('view-calc').classList.toggle('hidden',name!=='calc');
  document.getElementById('view-orders').classList.toggle('hidden',name!=='orders');
  document.getElementById('view-recipe').classList.toggle('hidden',name!=='recipe');
  document.getElementById('navCalc').classList.toggle('active',name==='calc'||name==='recipe');
  document.getElementById('navOrders').classList.toggle('active',name==='orders');
  window.scrollTo(0,0);
}

/* =================================================================
 *  订单模块
 * ================================================================= */
var orderTab='today';      // 'today' | 'tomorrow' | 'all'
var calYear,calMonth;      // 月历当前显示年月
var dayOrdersDate=null;    // 所有订单中点击某日期后查看的日期
var orderFilters={today:'all',tomorrow:'all'};
var orderPageSize=60,orderVisibleLimit=60,orderPageKey='';
var orderNumberCompare=new Intl.Collator(undefined,{numeric:true}).compare;
function tomorrowStr(){var d=new Date();d.setDate(d.getDate()+1);return d.getFullYear()+'-'+pad2(d.getMonth()+1)+'-'+pad2(d.getDate());}

function renderOrders(){
  invalidateDataIndex();
  var root=document.getElementById('view-orders');
  var html='';
  html+='<div class="order-top"><div class="order-tabs">'+
    '<button class="order-tab'+(orderTab==='today'?' active':'')+'" data-tab="today">今日订单</button>'+
    '<button class="order-tab'+(orderTab==='tomorrow'?' active':'')+'" data-tab="tomorrow">明日订单</button>'+
    '<button class="order-tab'+(orderTab==='all'?' active':'')+'" data-tab="all">所有订单</button>'+
    '</div></div>';
  html+='<div class="view" style="padding-top:12px;">';
  if(orderTab==='today'||orderTab==='tomorrow') html+=renderDayOrdersInner(orderTab==='today'?todayStr():tomorrowStr(),true);
  else html+=renderAllOrdersInner();
  html+='</div>';
  replaceHTML(root,html);
}

function renderAllOrdersInner(){
  if(!calYear){var d=new Date();calYear=d.getFullYear();calMonth=d.getMonth()+1;}
  var html='<div class="cal-top">'+
    '<button class="cal-nav-btn" data-cal="prev" style="border:none;background:var(--orange-50);color:var(--orange-700);font-weight:800;width:38px;height:38px;border-radius:10px;cursor:pointer;font-size:18px;">‹</button>'+
    '<div class="cal-title">'+calYear+'年'+calMonth+'月</div>'+
    '<div class="cal-nav"><button data-cal="today" style="border:none;background:var(--orange-50);color:var(--orange-700);font-weight:800;padding:0 12px;height:38px;border-radius:10px;cursor:pointer;font-size:13px;">今天</button>'+
    '<button data-cal="next" style="border:none;background:var(--orange-50);color:var(--orange-700);font-weight:800;width:38px;height:38px;border-radius:10px;cursor:pointer;font-size:18px;">›</button></div>'+
    '</div>';
  html+='<div class="cal-grid"><div class="cal-week"><span>一</span><span>二</span><span>三</span><span>四</span><span>五</span><span>六</span><span>日</span></div>';
  html+='<div class="cal-days">'+buildCalendarCells(calYear,calMonth)+'</div></div>';
  // 若已选中某天，列出当天订单
  if(dayOrdersDate){
    html+='<div class="section-bar"><button class="link-btn" data-backcal="1">← 返回月历</button><h2>'+dayOrdersDate+' 订单</h2></div>';
    html+=renderDayOrdersInner(dayOrdersDate,false);
  }
  return html;
}
function buildCalendarCells(y,m){
  var first=new Date(y,m-1,1);
  var startOffset=(first.getDay()+6)%7; // 周一为首列
  var daysInMonth=new Date(y,m,0).getDate();
  var cells='';
  var i;
  // 上月补位
  var prevDays=new Date(y,m-1,0).getDate();
  for(i=startOffset-1;i>=0;i--){cells+='<div class="cal-cell out"><div class="d">'+(prevDays-i)+'</div></div>';}
  var t=todayStr();
  for(i=1;i<=daysInMonth;i++){
    var ds=y+'-'+pad2(m)+'-'+pad2(i);
    var L=lunarText(y,m,i);
    var isToday=(ds===t);
    var cnt=validOrdersOfDate(ds).length;
    var cls='cal-cell'+(isToday?' today':'')+(cnt>0?' has':'');
    cells+='<button type="button" class="'+cls+'" data-date="'+ds+'" aria-label="'+ds+'，'+cnt+'笔有效订单"><span class="d">'+i+'</span>'+
      '<div class="l">'+(L.fest?L.fest:L.monthDay)+'</div>'+
      (cnt>0?'<div class="n">'+cnt+'单</div>':'')+'</button>';
  }
  // 下月补位
  var total=startOffset+daysInMonth;
  var rem=(7-(total%7))%7;
  for(i=1;i<=rem;i++){cells+='<div class="cal-cell out"><div class="d">'+i+'</div></div>';}
  return cells;
}

function renderDayOrdersInner(dateStr,isTodayHeader){
  var orders=ordersOfDate(dateStr).slice().sort(function(a,b){return Number(!!b.earlyPickup)-Number(!!a.earlyPickup)||orderNumberCompare(String(a.orderNo),String(b.orderNo));});
  var filter=isTodayHeader?(orderFilters[orderTab]||'all'):'all';
  if(filter!=='all')orders=orders.filter(function(o){return !o.cancelled&&o.status===filter;});
  var pageKey=dateStr+'|'+filter;if(pageKey!==orderPageKey){orderPageKey=pageKey;orderVisibleLimit=orderPageSize;}
  var dayLabel=orderTab==='tomorrow'?'明日':'今日';
  var p=parseDate(dateStr);var L=lunarText(p.y,p.m,p.d);
  var valid=validOrdersOfDate(dateStr);
  var totalCount=0,unpicked=0,picked=0;
  valid.forEach(function(o){o.items.forEach(function(it){totalCount+=it.quantity;});if(o.status==='picked')picked++;else unpicked++;});
  var html='';
  if(isTodayHeader){
    html+='<div class="stat-card">'+
      '<div class="stat-date">'+dateStr+'　'+weekdayCn(dateStr)+'</div>'+
      '<div class="stat-lunar">农历 '+L.full+'　'+L.ganzhi+'</div>'+
      '<div class="stat-grid">'+
        '<div class="stat-cell"><div class="v">'+(valid.length)+'</div><div class="k">'+dayLabel+'订单</div></div>'+
        '<div class="stat-cell"><div class="v">'+fmtCount(totalCount)+'</div><div class="k">产品总数</div></div>'+
        '<div class="stat-cell"><div class="v gray">'+unpicked+'</div><div class="k">未取</div></div>'+
        '<div class="stat-cell"><div class="v green">'+picked+'</div><div class="k">已取货</div></div>'+
      '</div></div>';
    html+='<div class="action-bar"><button class="btn btn-primary" id="btnNewOrder">＋ 新增订单</button>'+
      '<button class="btn btn-secondary" id="btnProduction">📊 '+dayLabel+'生产汇总</button>'+
      '<button class="btn btn-ghost" id="btnOrderPrices">单价设置</button></div>';
  }else{
    html+='<div class="action-bar"><button class="btn btn-secondary" id="btnNewOrderD">＋ 新增订单</button>'+
      '<button class="btn btn-info" id="btnProductionD">📊 当天生产汇总</button>'+
      '<button class="btn btn-ghost" id="btnOrderPrices">单价设置</button></div>';
  }
  if(isTodayHeader)html+='<div class="status-filters" aria-label="取货状态筛选">'+[{value:'all',label:'全部'},{value:'unpicked',label:'未取'},{value:'picked',label:'已取货'}].map(function(f){return '<button class="status-filter'+(filter===f.value?' active':'')+'" data-filter="'+f.value+'">'+f.label+'</button>';}).join('')+'</div>';
  if(orders.length===0){
    html+='<div class="empty-tip">该日暂无订单。<br>点击上方「新增订单」创建。'+(!isTodayHeader?'':'' )+'</div>';
  }else{
    orders.slice(0,orderVisibleLimit).forEach(function(o){html+=orderCardHTML(o);});
    if(orders.length>orderVisibleLimit)html+='<div class="load-more"><p>已展示 '+orderVisibleLimit+' / '+orders.length+' 笔订单</p><button type="button" class="btn btn-secondary" data-more-orders="1">加载更多订单</button></div>';
  }
  return html;
}
function orderCardHTML(o){
  var totalQty=0;o.items.forEach(function(it){totalQty+=it.quantity;});
  var statusBadge=o.cancelled?'<span class="badge cancelled">已取消</span>':
    (o.status==='picked'?'<span class="badge picked">已取货</span>':'<span class="badge unpicked">未取</span>');
  var itemsHtml=o.items.map(function(it){
    return '<div class="oc-item"><span class="nm">'+escapeHtml(it.productName)+'</span><span class="qty">'+fmtCount(it.quantity)+' 个</span></div>';
  }).join('');
  var moneyHtml=o.cancelled?'':
    '<div class="oc-money">'+
      '<div class="row"><span class="lbl">订单金额</span><span class="val amt">'+fmtMoney(o.orderAmount)+'</span></div>'+
      '<div class="row"><span class="lbl">定金</span><span class="val">¥'+Math.round(o.deposit/100)+'</span></div>'+
      '<div class="row"><span class="lbl">还需支付</span><span class="val rem">'+fmtMoney(o.remainingAmount)+'</span></div>'+
    '</div>';
  var noteHtml=(o.note&&o.note.trim())?'<div class="oc-note">'+escapeHtml(o.note)+'</div>':'';
  return '<div class="order-card'+(o.status==='picked'?' picked':'')+(o.cancelled?' cancelled':'')+(o.earlyPickup?' early-pickup':'')+'" data-order-id="'+escapeHtml(o.id)+'">'+
    '<div class="oc-head"><span class="oc-no">'+escapeHtml(o.orderNo)+'</span>'+(o.earlyPickup?'<span class="early-label">★ 早取</span>':'')+statusBadge+'</div>'+
    '<div class="oc-items">'+(itemsHtml||'<div class="detail-empty">（无产品）</div>')+'</div>'+
    moneyHtml+noteHtml+
    '<div class="oc-actions">'+
      '<button class="btn btn-ghost btn-sm" data-act="star" data-id="'+escapeHtml(o.id)+'">'+(o.earlyPickup?'★ 取消早取':'☆ 早取置顶')+'</button>'+
      '<button class="btn btn-ghost btn-sm" data-act="detail" data-id="'+escapeHtml(o.id)+'">查看</button>'+
      '<button class="btn btn-secondary btn-sm" data-act="edit" data-id="'+escapeHtml(o.id)+'">编辑</button>'+
      '<button class="btn btn-secondary btn-sm" data-act="copy" data-id="'+escapeHtml(o.id)+'">复制</button>'+
      '<button class="btn btn-ghost btn-sm" data-act="toggle" data-id="'+escapeHtml(o.id)+'">'+(o.status==='picked'?'改为未取':'设为已取货')+'</button>'+
      '<button class="btn btn-ghost btn-sm" data-act="cancel" data-id="'+escapeHtml(o.id)+'">取消</button>'+
      '<button class="btn btn-danger btn-sm" data-act="del" data-id="'+escapeHtml(o.id)+'">删除</button>'+
    '</div></div>';
}

/* ---- 订单列表内的卡片操作（事件委托，绑定在 view-orders 上） ---- */
document.getElementById('view-orders').addEventListener('click',function(e){
  var control=e.target.closest('[data-tab],[data-filter],[data-cal],[data-date],[data-backcal],[data-more-orders],#btnOrderPrices,#btnNewOrder,#btnProduction,#btnNewOrderD,#btnProductionD');
  if(control){
    if(control.dataset.tab){orderTab=control.dataset.tab;renderOrders();}
    else if(control.dataset.filter){orderFilters[orderTab]=control.dataset.filter;renderOrders();}
    else if(control.dataset.cal){var action=control.dataset.cal;if(action==='prev'){calMonth--;if(calMonth<1){calMonth=12;calYear--;}}else if(action==='next'){calMonth++;if(calMonth>12){calMonth=1;calYear++;}}else{var now=new Date();calYear=now.getFullYear();calMonth=now.getMonth()+1;dayOrdersDate=todayStr();}renderOrders();}
    else if(control.dataset.date){dayOrdersDate=control.dataset.date;renderOrders();}
    else if(control.dataset.backcal){dayOrdersDate=null;renderOrders();}
    else if(control.dataset.moreOrders){orderVisibleLimit+=orderPageSize;renderOrders();}
    else if(control.id==='btnOrderPrices')openPriceSettings();
    else if(control.id==='btnNewOrder'||control.id==='btnNewOrderD')openNewOrder(control.id==='btnNewOrderD'?dayOrdersDate:(orderTab==='tomorrow'?tomorrowStr():todayStr()));
    else openProduction(control.id==='btnProductionD'?dayOrdersDate:(orderTab==='tomorrow'?tomorrowStr():todayStr()));
    return;
  }
  var btn=e.target.closest('[data-act]');
  if(!btn)return;
  var id=btn.dataset.id,act=btn.dataset.act,o=findOrder(id);
  if(!o)return;
  if(act==='detail') openOrderDetail(id);
  else if(act==='edit') openEditOrder(id);
  else if(act==='copy') openCopyOrder(id);
  else if(act==='toggle') toggleStatus(o);
  else if(act==='cancel') cancelOrder(o);
  else if(act==='del') deleteOrder(o);
  else if(act==='star'){o.earlyPickup=!o.earlyPickup;o.updatedAt=nowISO();saveData();renderOrders();}
});
function toggleStatus(o){
  if(o.status==='picked'){
    if(confirm('该订单当前状态为「已取货」。\n确认要修改为「未取」吗？')){o.status='unpicked';o.updatedAt=nowISO();saveData();renderOrders();}
  }else{
    o.status='picked';o.updatedAt=nowISO();saveData();renderOrders();
  }
}
function cancelOrder(o){
  if(confirm('确定取消该订单吗？\n取消后不计入生产汇总与金额统计，但保留历史记录。')){
    o.cancelled=true;o.updatedAt=nowISO();markPlanDirty(o.orderDate);saveData();renderOrders();
  }
}
function deleteOrder(o){
  if(confirm('确定删除该订单吗？此操作不可撤销，仅用于删除明显录错的数据。')){
    state.orders=state.orders.filter(function(x){return x.id!==o.id;});
    markPlanDirty(o.orderDate);saveData();renderOrders();
  }
}
function nowISO(){return new Date().toISOString().slice(0,19);}
function markPlanDirty(dateStr){
  var pp=state.productionPlans[dateStr];
  if(pp) pp.dirty=true;
}

/* =================================================================
 *  新增 / 编辑 / 复制 订单
 * ================================================================= */
var editBuf=null; // {mode, id, orderDate, items:{pid:qty}, deposit, note}

function openNewOrder(dateStr){
  editBuf={mode:'new',id:null,orderDate:dateStr||todayStr(),items:Object.create(null),deposit:0,note:'',customerName:'',phone:'',expanded:Object.create(null)};
  renderOrderEdit();
}
function openEditOrder(id){
  var o=findOrder(id);if(!o)return;
  var items=Object.create(null);o.items.forEach(function(it){items[it.productId]=it.quantity;});
  editBuf={mode:'edit',id:id,orderDate:o.orderDate,items:items,deposit:Math.round(o.deposit/100)*100,note:o.note||'',customerName:o.customerName||'',phone:o.phone||'',expanded:Object.create(null),snapshots:JSON.parse(JSON.stringify(o.items))};
  renderOrderEdit();
}
function openCopyOrder(id){
  var o=findOrder(id);if(!o)return;
  var items=Object.create(null);o.items.forEach(function(it){items[it.productId]=it.quantity;});
  // 复制订单：重新读取当前产品价格（新订单用当前价），日期=今天，定金=0，状态=未取
  editBuf={mode:'copy',id:null,orderDate:todayStr(),items:items,deposit:0,note:o.note||'',customerName:o.customerName||'',phone:o.phone||'',expanded:Object.create(null)};
  renderOrderEdit();
}
function orderEditProduct(pid){
  var pr=findProd(pid);
  var snapshot=editBuf&&editBuf.mode==='edit'&&(editBuf.snapshots||[]).find(function(it){return it.productId===pid;});
  if(!snapshot)return pr;
  var category=pr&&state.categories.some(function(c){return c.id===pr.categoryId;})?pr.categoryId:'historical';
  return Object.assign({},pr||{id:pid}, {categoryId:category,name:snapshot.productName,price:snapshot.unitPrice});
}
function renderOrderEdit(){
  var b=editBuf;
  var p=parseDate(b.orderDate);var L=lunarText(p.y,p.m,p.d);
  var prods=enabledProducts().map(function(pr){return orderEditProduct(pr.id);});
  if(b.mode==='edit') (b.snapshots||[]).forEach(function(it){
    if(!prods.some(function(pr){return pr.id===it.productId;}))prods.push(orderEditProduct(it.productId));
  });
  var groups=state.categories.concat([{id:'historical',name:'历史订单产品'}]).map(function(cat){
    var ps=prods.filter(function(pr){return pr.categoryId===cat.id;});
    if(ps.length===0)return '';
    var rows=ps.map(function(pr){
      var q=b.items[pr.id]||0;
      var price=pr.price||0;
      var sub=q*(price/100);
      return '<div class="pe-card">'+
        '<div class="pe-head"><span class="pe-name">'+escapeHtml(pr.name)+'</span>'+
        '<span class="pe-price">'+(price>0?('¥'+(price/100).toFixed(2)+' /个'):'未设价')+'</span></div>'+
        '<div class="pe-row">'+
          '<div class="stepper">'+
            '<button data-step="-1" data-pid="'+escapeHtml(pr.id)+'">−</button>'+
            '<input type="number" inputmode="numeric" min="0" step="1" aria-label="'+escapeHtml(pr.name)+'数量" data-qty="'+escapeHtml(pr.id)+'" value="'+(q||'')+'">'+
            '<button data-step="1" data-pid="'+escapeHtml(pr.id)+'">＋</button>'+
          '</div>'+
          '<span class="pe-sub"><b data-sub="'+escapeHtml(pr.id)+'">'+fmtMoney(sub*100)+'</b></span>'+
        '</div></div>';
    }).join('');
    var expanded=!!(b.expanded&&b.expanded[cat.id]);
    return '<div class="pe-group'+(expanded?'':' collapsed')+'"><button type="button" class="pe-group-title" data-group="'+escapeHtml(cat.id)+'" aria-expanded="'+expanded+'"><span>'+escapeHtml(cat.name)+'</span><span class="group-chevron">▾</span></button><div class="pe-group-products">'+rows+'</div></div>';
  }).join('');

  var totalQty=0,totalCents=0;
  Object.keys(b.items).forEach(function(pid){var q=b.items[pid];if(q>0){var pr=orderEditProduct(pid);if(pr){totalQty+=q;totalCents+=q*(pr.price||0);}}});
  var depositCents=yuanToCents(b.deposit/100);
  var depYuan=String(Math.round(b.deposit/100));
  var remainingCents=totalCents-depositCents;

  var root=document.getElementById('view-order-edit');
  root.classList.remove('hidden');
  root.innerHTML='<div class="ov-top"><button class="ov-back" id="oeBack">← 返回</button><h2>'+(b.mode==='edit'?'编辑订单':(b.mode==='copy'?'复制订单':'新增订单'))+'</h2></div>'+
    '<div class="ov-body">'+
      '<div class="field"><label>订单日期 <span class="req">*</span></label>'+
        '<button type="button" class="date-pick" id="oeDate" aria-label="更改订单日期">'+
          '<div><div class="dp-main">'+b.orderDate+'　'+weekdayCn(b.orderDate)+'</div><div class="dp-lunar">农历 '+L.full+'　'+L.ganzhi+'</div></div>'+
          '<span class="dp-edit">更改日期 ›</span>'+
        '</button></div>'+
      '<div class="field"><label>产品数量（按「个」）</label><div class="prod-edit-list">'+groups+'</div></div>'+
      '<div class="amount-box">'+
        '<div class="amount-line"><span class="lbl">产品总数</span><span class="val" id="oeTotalQty">'+fmtCount(totalQty)+' 个</span></div>'+
        '<div class="amount-line total"><span class="lbl">订单金额</span><span class="val" id="oeTotalAmt">'+fmtMoney(totalCents)+'</span></div>'+
        '<div class="amount-line"><span class="lbl">定金金额</span>'+
          '<span class="deposit-input"><input type="number" inputmode="numeric" min="0" step="1" id="oeDeposit" value="'+depYuan+'"> 元</span></div>'+
        '<div class="amount-line"><span class="lbl">还需支付</span><span class="val rem" id="oeRemain">'+fmtMoney(remainingCents)+'</span></div>'+
      '</div>'+
      '<div class="customer-fields"><div class="field"><label for="oeCustomerName">姓名（选填）</label><input id="oeCustomerName" autocomplete="name" maxlength="100" value="'+escapeHtml(b.customerName||'')+'"></div><div class="field"><label for="oePhone">电话号码（选填）</label><input id="oePhone" type="tel" autocomplete="tel" maxlength="40" value="'+escapeHtml(b.phone||'')+'"></div></div>'+
      '<div class="field"><label>备注（取货时间 / 特殊要求等，可留空）</label>'+
        '<textarea id="oeNote" placeholder="例：早上6:30取货，优先生产。">'+escapeHtml(b.note)+'</textarea></div>'+
      '<div class="action-bar">'+
        '<button class="btn btn-primary" id="oeSave">保存订单</button>'+
        '<button class="btn btn-ghost" id="oeCancel">取消</button>'+
      '</div>'+
    '</div>';

  editInputs=new Map();editSubtotals=new Map();
  root.querySelectorAll('[data-qty]').forEach(function(el){editInputs.set(el.dataset.qty,el);});
  root.querySelectorAll('[data-sub]').forEach(function(el){editSubtotals.set(el.dataset.sub,el);});
  prepareOverlay(root);
}
var editInputs=new Map(),editSubtotals=new Map();
function updateEditTotals(){
    var b=editBuf;
    var tq=0,tc=0;
    Object.keys(b.items).forEach(function(pid){var q=b.items[pid];if(q>0){var pr=orderEditProduct(pid);if(pr){tq+=q;tc+=q*(pr.price||0);}}});
    var dep=yuanToCents(document.getElementById('oeDeposit').value);
    b.deposit=dep;
    document.getElementById('oeTotalQty').textContent=fmtCount(tq)+' 个';
    document.getElementById('oeTotalAmt').textContent=fmtMoney(tc);
    document.getElementById('oeRemain').textContent=fmtMoney(tc-dep);
    // 更新小计
    Object.keys(b.items).forEach(function(pid){var q=b.items[pid];var pr=orderEditProduct(pid);var subEl=editSubtotals.get(pid);if(subEl&&pr)subEl.textContent=fmtMoney(q*(pr.price||0));});
}
document.getElementById('view-order-edit').addEventListener('click',function(event){
  var button=event.target.closest('button');if(!button||!editBuf)return;var b=editBuf;
  if(button.id==='oeBack'||button.id==='oeCancel')closeOverlays();
  else if(button.id==='oeDate')openDatePicker(b.orderDate,function(date){b.orderDate=date;renderOrderEdit();});
  else if(button.id==='oeSave')saveOrder();
  else if(button.dataset.group){var id=button.dataset.group;b.expanded[id]=!b.expanded[id];button.parentElement.classList.toggle('collapsed',!b.expanded[id]);button.setAttribute('aria-expanded',String(b.expanded[id]));}
  else if(button.dataset.step){var pid=button.dataset.pid,input=editInputs.get(pid),value=Math.max(0,(parseInt(input.value,10)||0)+Number(button.dataset.step));input.value=value||'';b.items[pid]=value;updateEditTotals();}
});
document.getElementById('view-order-edit').addEventListener('input',function(event){
  if(!editBuf)return;var input=event.target,b=editBuf;
  if(input.dataset.qty){b.items[input.dataset.qty]=Math.max(0,parseInt(input.value,10)||0);updateEditTotals();}
  else if(input.id==='oeDeposit')updateEditTotals();
  else if(input.id==='oeNote')b.note=input.value;
  else if(input.id==='oeCustomerName')b.customerName=input.value.trim();
  else if(input.id==='oePhone')b.phone=input.value.trim();
});
function saveOrder(){
  var b=editBuf;
  // 校验
  if(!b.orderDate){alert('请选择订单日期');return;}
  var items=[];var has=false;
  Object.keys(b.items).forEach(function(pid){
    var q=parseInt(b.items[pid],10)||0;
    if(q>0){var pr=orderEditProduct(pid);if(pr){items.push({productId:pid,productName:pr.name,quantity:q,unitPrice:pr.price||0,subtotal:q*(pr.price||0)});has=true;}}
  });
  if(!has){alert('请至少录入 1 个产品数量（数量需 ≥ 1）。');return;}
  var totalCents=items.reduce(function(s,it){return s+it.subtotal;},0);
  var depositCents=yuanToCents(document.getElementById('oeDeposit').value);
  if(!Number.isInteger(Number(document.getElementById('oeDeposit').value))){alert('定金只能填写整数元');return;}
  if(depositCents<0){alert('定金不能为负数');return;}
  var previous=b.mode==='edit'&&findOrder(b.id);
  var historicalRounding=previous&&previous.deposit>previous.orderAmount&&depositCents===previous.deposit&&totalCents>=previous.orderAmount;
  if(depositCents>totalCents&&!historicalRounding){alert('定金不能大于订单金额（¥'+(totalCents/100).toFixed(2)+'）。');return;}

  if(b.mode==='edit'){
    var o=findOrder(b.id);
    markPlanDirty(o.orderDate);
    o.orderDate=b.orderDate;o.items=items;o.orderAmount=totalCents;o.deposit=depositCents;
    o.remainingAmount=totalCents-depositCents;o.note=b.note;o.updatedAt=nowISO();
    o.customerName=b.customerName||'';o.phone=b.phone||'';
    markPlanDirty(b.orderDate);saveData();renderOrders();closeOverlays();
  }else{
    // 正式订单号由服务器统一分配
    var orderNo=nextOrderNo(b.orderDate);
    var o2={id:genId('ord'),orderNo:orderNo,orderDate:b.orderDate,status:'unpicked',cancelled:false,
      deposit:depositCents,orderAmount:totalCents,remainingAmount:totalCents-depositCents,note:b.note,
      createdAt:nowISO(),updatedAt:nowISO(),items:items,customerName:b.customerName||'',phone:b.phone||'',earlyPickup:false};
    state.orders.push(o2);markPlanDirty(b.orderDate);saveData();
    // 保存后返回该日期对应页面
    orderTab=b.orderDate===todayStr()?'today':(b.orderDate===tomorrowStr()?'tomorrow':'all');
    dayOrdersDate=orderTab==='all'?b.orderDate:null;
    renderOrders();closeOverlays();
  }
}
function nextOrderNo(dateStr){
  if(window.sharedSession)return '保存中';
  state.orderSequence=(state.orderSequence||0)+1;
  return String(state.orderSequence).padStart(6,'0');
}

/* =================================================================
 *  订单详情
 * ================================================================= */
function openOrderDetail(id){
  var o=findOrder(id);if(!o)return;
  var p=parseDate(o.orderDate);var L=lunarText(p.y,p.m,p.d);
  var itemsHtml=o.items.map(function(it){
    return '<div class="prod-row"><span class="pr-name">'+escapeHtml(it.productName)+'</span>'+
      '<span class="pr-qty">'+fmtCount(it.quantity)+' 个 × '+(it.unitPrice/100).toFixed(2)+' = '+(it.subtotal/100).toFixed(2)+'</span></div>';
  }).join('');
  var statusBadge=o.cancelled?'<span class="badge cancelled">已取消</span>':
    (o.status==='picked'?'<span class="badge picked">已取货</span>':'<span class="badge unpicked">未取</span>');
  var moneyHtml=o.cancelled?'':
    '<div class="amount-box">'+
      '<div class="amount-line total"><span class="lbl">订单金额</span><span class="val">'+fmtMoney(o.orderAmount)+'</span></div>'+
      '<div class="amount-line"><span class="lbl">定金</span><span class="val">¥'+Math.round(o.deposit/100)+'</span></div>'+
      '<div class="amount-line"><span class="lbl">还需支付</span><span class="val rem">'+fmtMoney(o.remainingAmount)+'</span></div>'+
    '</div>';
  var noteHtml=(o.note&&o.note.trim())?'<div class="field"><label>备注</label><div class="oc-note">'+escapeHtml(o.note)+'</div></div>':'';
  var root=document.getElementById('view-order-detail');
  root.classList.remove('hidden');
  root.innerHTML='<div class="ov-top"><button class="ov-back" id="odBack">← 返回</button><h2>订单详情</h2></div>'+
    '<div class="ov-body">'+
      '<div class="stat-card"><div class="stat-date">'+escapeHtml(o.orderNo)+'</div>'+
        '<div class="stat-lunar">'+o.orderDate+'　'+weekdayCn(o.orderDate)+'　农历 '+L.full+'</div>'+
        '<div style="margin-top:8px;">'+statusBadge+'</div></div>'+
      '<div class="field"><label>产品明细</label>'+itemsHtml+'</div>'+
      moneyHtml+(o.customerName?'<div class="field"><label>姓名</label><div>'+escapeHtml(o.customerName)+'</div></div>':'')+(o.phone?'<div class="field"><label>电话号码</label><div>'+escapeHtml(o.phone)+'</div></div>':'')+noteHtml+
      '<div class="action-bar">'+
        (o.cancelled?'':
          '<button class="btn btn-success" id="odToggle">'+(o.status==='picked'?'改为未取':'设为已取货')+'</button>'+
          '<button class="btn btn-secondary" id="odEdit">编辑</button>'+
          '<button class="btn btn-ghost" id="odCopy">复制</button>'+
          '<button class="btn btn-ghost" id="odCancel">取消订单</button>')+
        '<button class="btn btn-danger" id="odDel">删除订单</button>'+
      '</div>'+
    '</div>';
  root.dataset.orderId=id;prepareOverlay(root);
  document.getElementById('odBack').addEventListener('click',closeOverlays);
  var t=document.getElementById('odToggle');if(t)t.addEventListener('click',function(){toggleStatus(o);openOrderDetail(id);});
  var ed=document.getElementById('odEdit');if(ed)ed.addEventListener('click',function(){closeOverlays();openEditOrder(id);});
  var cp=document.getElementById('odCopy');if(cp)cp.addEventListener('click',function(){closeOverlays();openCopyOrder(id);});
  var cn=document.getElementById('odCancel');if(cn)cn.addEventListener('click',function(){cancelOrder(o);openOrderDetail(id);});
  document.getElementById('odDel').addEventListener('click',function(){deleteOrder(o);closeOverlays();});
}

/* =================================================================
 *  价格设置
 * ================================================================= */
function openPriceSettings(){
  var prods=enabledProducts();
  var groups=state.categories.map(function(cat){
    var ps=prods.filter(function(pr){return pr.categoryId===cat.id;});
    if(ps.length===0)return '';
    var rows=ps.map(function(pr){
      return '<div class="price-card"><div class="price-row">'+
        '<span class="price-name">'+escapeHtml(pr.name)+'</span>'+
        '<input type="number" inputmode="decimal" min="0" step="0.01" class="price-input" data-pid="'+escapeHtml(pr.id)+'" value="'+((pr.price||0)/100).toFixed(2)+'">'+
        '<span class="price-unit">元/个</span></div></div>';
    }).join('');
    return '<div class="pe-group"><div class="pe-group-title">'+escapeHtml(cat.name)+'</div>'+rows+'</div>';
  }).join('');
  var root=document.getElementById('view-price');
  root.classList.remove('hidden');
  root.innerHTML='<div class="ov-top"><button class="ov-back" id="psBack">← 返回</button><h2>产品价格设置</h2></div>'+
    '<div class="ov-body"><p class="muted" style="font-size:13px;margin:0 0 8px;">价格仅影响新订单与后续新增产品；历史订单金额不受影响。</p>'+
    groups+
    '<div class="action-bar"><button class="btn btn-primary" id="psSave">保存价格设置</button></div></div>';
  prepareOverlay(root);
  document.getElementById('psBack').addEventListener('click',closeOverlays);
  document.getElementById('psSave').addEventListener('click',function(){
    root.querySelectorAll('.price-input').forEach(function(inp){
      var pid=inp.dataset.pid,pr=findProd(pid);if(pr)pr.price=yuanToCents(inp.value);
    });
    saveData();alert('价格设置已保存。');closeOverlays();
  });
}

/* =================================================================
 *  生产汇总（只读）
 * ================================================================= */
function orderSignature(dateStr){
  var orders=validOrdersOfDate(dateStr);
  return orders.map(function(o){return o.id+':'+o.items.map(function(i){return i.productId+'='+i.quantity;}).join(',');}).sort().join('|');
}
function openProduction(dateStr){
  // 计算当日订单数量
  var prodQty=Object.create(null);
  validOrdersOfDate(dateStr).forEach(function(o){
    o.items.forEach(function(it){prodQty[it.productId]=(prodQty[it.productId]||0)+it.quantity;});
  });
  var pids=Object.keys(prodQty);
  // 历史计划保留在数据中，当前汇总只读展示订单数量
  var saved=state.productionPlans[dateStr];
  var items=pids.map(function(pid){
    var pr=findProd(pid);
    var prodQ=prodQty[pid];
    var actual=prodQ;
    // 汇总只读，始终以当前有效订单数量展示。
    return {productId:pid,productName:pr?pr.name:'(已删除)',orderQuantity:prodQ,productionQuantity:actual};
  });
  var sig=orderSignature(dateStr);
  var dirty=saved? (saved.orderVersion!==sig):false;
  if(pids.length===0){
    var root=document.getElementById('view-production');root.classList.remove('hidden');
    root.innerHTML='<div class="ov-top"><button class="ov-back" id="prBack">← 返回</button><h2>生产汇总</h2></div>'+
      '<div class="ov-body"><div class="empty-tip">'+dateStr+' 没有有效订单，无法生成生产汇总。</div></div>';
    prepareOverlay(root);
    document.getElementById('prBack').addEventListener('click',closeOverlays);
    return;
  }
  renderProductionBody(dateStr,items,sig,dirty);
}
function renderProductionBody(dateStr,items,sig,dirty){
  var totalOrder=0,totalProd=0;
  items.forEach(function(it){totalOrder+=it.orderQuantity;totalProd+=it.productionQuantity;});
  var rows=items.map(function(it){
    return '<div class="prod-row"><span class="pr-name">'+escapeHtml(it.productName)+'</span>'+
      '<span class="pr-qty">订单 '+fmtCount(it.orderQuantity)+' 个</span>'+
      '<span class="production-value">'+fmtCount(it.orderQuantity)+' 个</span></div>';
  }).join('');
  var root=document.getElementById('view-production');
  root.classList.remove('hidden');
  root.innerHTML='<div class="ov-top"><button class="ov-back" id="prBack">← 返回</button><h2>生产汇总</h2></div>'+
    '<div class="ov-body">'+
      '<div class="stat-card"><div class="stat-date">'+dateStr+'　'+weekdayCn(dateStr)+'</div>'+
        '<div class="stat-lunar">只读汇总 · 按当前有效订单统计，不含已取消订单</div></div>'+
      '<div class="field"><label>各产品订单数量</label>'+rows+'</div>'+
      '<div class="amount-box"><div class="amount-line"><span class="lbl">订单总数量</span><span class="val" id="prOrder">'+fmtCount(totalOrder)+' 个</span></div>'+
        '<div class="amount-line total"><span class="lbl">产品总数量</span><span class="val" id="prProd">'+fmtCount(totalProd)+' 个</span></div></div>'+
    '</div>';
  prepareOverlay(root);
  document.getElementById('prBack').addEventListener('click',closeOverlays);
}

/* =================================================================
 *  日期选择器弹窗（公历 + 农历）
 * ================================================================= */
var dpSelYear,dpSelMonth,dpCallback;
function openDatePicker(initialDate,cb){
  var p=parseDate(initialDate||todayStr());
  dpSelYear=p.y;dpSelMonth=p.m;dpCallback=cb;
  renderDatePicker();
  document.getElementById('modal-datepicker').classList.remove('hidden');
  var mask=document.getElementById('modal-datepicker');mask.setAttribute('role','dialog');mask.setAttribute('aria-modal','true');mask.setAttribute('aria-label','选择订单日期');mask.querySelector('#dpClose').focus();
}
function closeDatePicker(){document.getElementById('modal-datepicker').classList.add('hidden');dpCallback=null;var button=document.getElementById('oeDate');if(button&&!document.getElementById('view-order-edit').classList.contains('hidden'))button.focus({preventScroll:true});}
function renderDatePicker(){
  var y=dpSelYear,m=dpSelMonth;
  var html='<div class="modal"><div class="modal-head"><h3>选择订单日期</h3><button class="modal-close" id="dpClose">×</button></div>'+
    '<div class="modal-body">'+
    '<div class="cal-top" style="margin-bottom:10px;">'+
      '<button id="dpPrev" style="border:none;background:var(--orange-50);color:var(--orange-700);font-weight:800;width:38px;height:38px;border-radius:10px;cursor:pointer;font-size:18px;">‹</button>'+
      '<div class="cal-title">'+y+'年'+m+'月</div>'+
      '<div class="cal-nav"><button id="dpToday" style="border:none;background:var(--orange-50);color:var(--orange-700);font-weight:800;padding:0 12px;height:38px;border-radius:10px;cursor:pointer;font-size:13px;">今天</button>'+
      '<button id="dpNext" style="border:none;background:var(--orange-50);color:var(--orange-700);font-weight:800;width:38px;height:38px;border-radius:10px;cursor:pointer;font-size:18px;">›</button></div>'+
    '</div>'+
    '<div class="cal-grid"><div class="cal-week"><span>一</span><span>二</span><span>三</span><span>四</span><span>五</span><span>六</span><span>日</span></div>'+
    '<div class="cal-days">'+buildCalendarCells(y,m)+'</div></div>'+
    '<div id="dpSelected" style="margin-top:12px;font-size:14px;color:var(--muted);"></div>'+
    '</div></div>';
  var mask=document.getElementById('modal-datepicker');
  mask.innerHTML=html;
  // 默认选中：若当前月份含 initialDate 则高亮 —— 简化：显示当前选择提示
  mask.querySelector('#dpClose').addEventListener('click',closeDatePicker);
  mask.querySelector('#dpPrev').addEventListener('click',function(){dpSelMonth--;if(dpSelMonth<1){dpSelMonth=12;dpSelYear--;}renderDatePicker();});
  mask.querySelector('#dpNext').addEventListener('click',function(){dpSelMonth++;if(dpSelMonth>12){dpSelMonth=1;dpSelYear++;}renderDatePicker();});
  mask.querySelector('#dpToday').addEventListener('click',function(){var d=new Date();dpSelYear=d.getFullYear();dpSelMonth=d.getMonth()+1;renderDatePicker();});
  mask.querySelectorAll('.cal-cell[data-date]').forEach(function(c){
    c.addEventListener('click',function(){
      var ds=c.dataset.date;var pp=parseDate(ds);var L=lunarText(pp.y,pp.m,pp.d);
      var sel=mask.querySelector('#dpSelected');
      sel.innerHTML='已选择<br>新历：'+ds+'　'+weekdayCn(ds)+'<br>农历：'+L.full+'　'+L.ganzhi;
      // 直接确认选择
      var cb=dpCallback;closeDatePicker();if(cb)cb(ds);
    });
  });
}

/* =================================================================
 *  配比计算（沿用既有引擎，整合今日生产计划）
 * ================================================================= */
function calcDateText(){var date=state.calcPlanDate||todayStr();return date+'　'+weekdayCn(date);}
function renderDateCalc(){document.getElementById('todayDate').textContent='日期：'+calcDateText();}
function updatePlanSummary(){
  var plan=state.todayPlan||{};var cnt=0,total=0;
  Object.keys(plan).forEach(function(id){var v=parseFloat(plan[id]);if(v>0){cnt++;total+=v;}});
  var el=document.getElementById('planSummary');if(!el)return;
  if(cnt===0)el.innerHTML='<span class="ps-hint">尚未录入生产数量</span>';
  else el.innerHTML='已录入 <b>'+cnt+'</b> 种产品 · 今日合计 <b>'+fmtCount(total)+'</b> 个';
}
var planRenderSignature='';
function renderPlan(){
  var signature=JSON.stringify([state.categories,state.products,state.todayPlan]);
  if(signature===planRenderSignature){updatePlanSummary();return;}
  planRenderSignature=signature;
  var wrap=document.getElementById('categoryList');wrap.innerHTML='';
  var isMobile=window.matchMedia('(max-width:768px)').matches;
  var fragment=document.createDocumentFragment();
  state.categories.forEach(function(cat){
    var prods=productsOfCategory(cat.id);
    if(prods.length===0)return;
    var section=document.createElement('div');section.className='cat-section'+(isMobile?' collapsed':'');
    var header=document.createElement('button');header.type='button';header.className='cat-header';header.setAttribute('aria-expanded',String(!isMobile));
    header.innerHTML='<span class="cat-arrow">▼</span><span class="cat-name">'+escapeHtml(cat.name)+'</span><span class="cat-count">'+prods.length+'</span>';
    var body=document.createElement('div');body.className='cat-body';
    var inner=document.createElement('div');inner.className='cat-inner';
    prods.forEach(function(p){inner.appendChild(buildProductInputCard(p));});
    body.appendChild(inner);
    header.addEventListener('click',function(){section.classList.toggle('collapsed');header.setAttribute('aria-expanded',String(!section.classList.contains('collapsed')));});
    section.appendChild(header);section.appendChild(body);fragment.appendChild(section);
  });
  wrap.appendChild(fragment);
  updatePlanSummary();
}
function buildProductInputCard(p){
  var card=document.createElement('div');card.className='prod-card';
  var val=state.todayPlan[p.id]||'';
  card.innerHTML='<div class="prod-name">'+escapeHtml(p.name)+'</div>'+
    '<div class="prod-input-row"><span class="prod-label">今日计划</span>'+
    '<div class="qty-box"><input type="number" inputmode="decimal" min="0" step="1" class="qty-input" data-id="'+escapeHtml(p.id)+'" value="'+escapeHtml(val)+'" placeholder="0">'+
    '<span class="unit-suffix">个</span><button class="clear-btn" data-id="'+escapeHtml(p.id)+'" title="清空" aria-label="清空">×</button></div></div>';
  var input=card.querySelector('.qty-input');
  input.addEventListener('input',function(e){var v=e.target.value;if(v===''||parseFloat(v)<=0)delete state.todayPlan[p.id];else state.todayPlan[p.id]=v;saveData(true);updatePlanSummary();});
  card.querySelector('.clear-btn').addEventListener('click',function(){delete state.todayPlan[p.id];input.value='';saveData(true);updatePlanSummary();});
  return card;
}
function calculate(){
  var plan=state.todayPlan||{};var results=[];var summary=Object.create(null);var hasPlan=false;
  state.products.forEach(function(p){
    var qty=parseFloat(plan[p.id]);if(!qty||qty<=0)return;hasPlan=true;
    var yield_=parseFloat(p.recipeYield)||0;var ratio=yield_>0?qty/yield_:0;var materials=[];
    (p.recipe||[]).forEach(function(m){
      var nm=(m.name||'').trim();if(!nm)return;
      var stdKg=toKg(m.amount,m.unit);var theoryKg=stdKg*ratio;var loss=(parseFloat(p.lossRate)||0)/100;
      var actualKg=theoryKg*(1+loss);
      materials.push({name:nm,theoryKg:theoryKg,actualKg:actualKg,lossApplied:loss>0});
      if(!summary[nm])summary[nm]={theory:0,actual:0};
      summary[nm].theory+=theoryKg;summary[nm].actual+=actualKg;
    });
    results.push({product:p,qty:qty,ratio:ratio,materials:materials,lossRate:parseFloat(p.lossRate)||0,noYield:yield_<=0});
  });
  return {results:results,summary:summary,hasPlan:hasPlan};
}
function buildResultHTML(r){
  if(!r.hasPlan)return '<div class="empty-tip">📭 请在上方输入今日各产品的生产数量，再点击「计算今日配料」。</div>';
  var html='<div class="result-block"><h2 class="result-title">今日产品配料明细</h2>';
  r.results.forEach(function(item){
    html+='<div class="detail-card"><div class="detail-head">'+escapeHtml(item.product.name)+'</div>'+
      '<div class="detail-meta">计划生产：'+fmtCount(item.qty)+' 个　|　配方倍率：'+fmtKg(item.ratio)+'</div>';
    if(item.noYield)html+='<div class="detail-empty">（该产品的「标准产量」未设置，无法计算，请在配方管理中设置）</div>';
    else if(item.materials.length===0)html+='<div class="detail-empty">（暂未设置配方，请在「配方管理」中录入原料）</div>';
    else{
      html+='<div class="detail-materials">';
      item.materials.forEach(function(m){
        html+='<div class="mat-line"><span class="mat-name">'+escapeHtml(m.name)+'</span><span class="mat-amt">'+fmtKg(m.actualKg)+' kg</span>';
        if(m.lossApplied)html+='<span class="mat-theory">（理论 '+fmtKg(m.theoryKg)+' kg）</span>';
        html+='</div>';
      });
      html+='</div>';
    }
    html+='</div>';
  });
  html+='</div>';
  var names=Object.keys(r.summary);
  if(names.length>0){
    var hasLoss=r.results.some(function(it){return it.lossRate>0;});
    html+='<div class="result-block"><h2 class="result-title">今日原料总需求</h2><div class="summary-card">';
    var totalTheory=0,totalActual=0;
    names.forEach(function(name){var s=r.summary[name];totalTheory+=s.theory;totalActual+=s.actual;
      html+='<div class="sum-line"><span class="mat-name">'+escapeHtml(name)+'</span><span class="mat-amt">'+fmtKg(s.actual)+' kg</span>';
      if(hasLoss)html+='<span class="mat-theory">（理论 '+fmtKg(s.theory)+' kg）</span>';
      html+='</div>';
    });
    html+='<div class="sum-total"><span>原料合计（'+names.length+' 种）</span><span>'+fmtKg(totalActual)+' kg</span></div></div></div>';
  }else html+='<div class="empty-tip">暂无可用配方数据，无法汇总原料。</div>';
  return html;
}
function buildPrintHTML(r){
  var html='<div class="print-sheet"><h1 class="print-title">生产配料单</h1><div class="print-date">生产日期：'+calcDateText()+'</div>'+
    '<div class="print-sub">今日生产计划</div><div class="print-plan">';
  r.results.forEach(function(it){html+='<div>'+escapeHtml(it.product.name)+'　'+fmtCount(it.qty)+' 个</div>';});
  html+='</div><hr>'+buildResultHTML(r)+'</div>';return html;
}
function onCalculate(){
  var r=calculate();
  document.getElementById('resultArea').innerHTML=buildResultHTML(r);
  document.getElementById('printArea').innerHTML=buildPrintHTML(r);
  document.getElementById('resultArea').scrollIntoView({behavior:'smooth',block:'start'});
}
function onClear(){
  if(!confirm('确定清空今日所有产品的生产数量吗？'))return;
  state.todayPlan=Object.create(null);saveData(true);renderPlan();document.getElementById('resultArea').innerHTML='';
}
function onPrint(){
  var r=calculate();if(!r.hasPlan){alert('请先输入生产数量。');return;}
  document.getElementById('printArea').innerHTML=buildPrintHTML(r);window.print();
}
function onExport(){
  var data=JSON.stringify(state,null,2);var blob=new Blob([data],{type:'application/json'});
  var url=URL.createObjectURL(blob);var a=document.createElement('a');a.href=url;a.download='配料系统备份_'+todayStr()+'.json';
  document.body.appendChild(a);a.click();document.body.removeChild(a);URL.revokeObjectURL(url);
}
function onImport(){document.getElementById('importFile').click();}
function handleImportFile(e){
  if(window.sharedSession){sharedImportFile(e);return;}
  var file=e.target.files[0];if(!file)return;
  var reader=new FileReader();
  reader.onload=function(){
    try{
      var d=JSON.parse(reader.result);
      if(!d||!d.categories||!d.products)throw new Error('文件格式不正确');
      // 兼容字段
      d.dataVersion=d.dataVersion||1;
      d.orders=d.orders||[];d.productionPlans=d.productionPlans||{};d.settings=d.settings||{};
      d.todayPlan=d.todayPlan||{};
      d.products=d.products.map(function(p){
        if(p.standardYield!==undefined&&p.recipeYield===undefined)p.recipeYield=p.standardYield;
        if(p.price===undefined)p.price=0;if(p.enabled===undefined)p.enabled=true;
        if(!p.recipe)p.recipe=[];
        return p;
      });
      state=d;saveData();localStorage.setItem(LS_PLAN_DATE,todayStr());
      renderPlan();renderRecipe();updatePlanSummary();renderOrders();
      alert('数据导入成功！');
    }catch(err){alert('导入失败：'+err.message);}
    e.target.value='';
  };
  reader.readAsText(file);
}

/* =================================================================
 *  配方管理
 * ================================================================= */
function openRecipe(){
  if(confirm('配方数据会影响生产计算，请确认是否进入配方管理。')){renderRecipe();showView('recipe');}
}
function renderRecipe(){
  var root=document.getElementById('recipeContent');
  var html='<div class="recipe-section"><h3 class="sec-title">产品分类管理</h3>';
  html+='<button class="btn btn-secondary" data-act="addCat">+ 新增分类</button>';
  state.categories.forEach(function(cat){
    var cnt=productsOfCategory(cat.id).length;
    html+='<div class="cat-manage-card"><div class="field-row"><label>分类名称</label>'+
      '<input class="cat-name-input" data-cat="'+escapeHtml(cat.id)+'" value="'+escapeHtml(cat.name)+'">'+
      '<button class="btn btn-danger sm" data-act="delCat" data-cat="'+escapeHtml(cat.id)+'">删除分类</button></div>'+
      '<div class="cat-sub">含 '+cnt+' 个产品</div></div>';
  });
  html+='</div>';
  html+='<div class="recipe-section"><h3 class="sec-title">产品与配方</h3>';
  state.categories.forEach(function(cat){
    var prods=productsOfCategory(cat.id);
    html+='<div class="cat-group"><div class="cat-group-head"><span>'+escapeHtml(cat.name)+'</span>'+
      '<button class="btn btn-secondary sm" data-act="addProd" data-cat="'+escapeHtml(cat.id)+'">+ 新增产品</button></div>';
    if(prods.length===0)html+='<div class="cat-sub">（暂无产品）</div>';
    prods.forEach(function(p){html+=buildProductEditCard(p);});
    html+='</div>';
  });
  html+='</div>';
  root.innerHTML=html;
}
function buildProductEditCard(p){
  var catOptions=state.categories.map(function(c){return '<option value="'+escapeHtml(c.id)+'"'+(c.id===p.categoryId?' selected':'')+'>'+escapeHtml(c.name)+'</option>';}).join('');
  var lossOptions=[0,1,2,3,5,8,10].map(function(v){return '<option value="'+v+'"'+(v===p.lossRate?' selected':'')+'>'+v+'%</option>';}).join('');
  var priceVal=((p.price||0)/100).toFixed(2);
  var matHtml='';
  (p.recipe||[]).forEach(function(m,i){
    matHtml+='<div class="mat-edit-row">'+
      '<input class="m-name" data-prod="'+escapeHtml(p.id)+'" data-mat="'+i+'" data-f="name" value="'+escapeHtml(m.name)+'" placeholder="原料名称">'+
      '<input class="m-amt" type="number" inputmode="decimal" min="0" step="0.1" data-prod="'+escapeHtml(p.id)+'" data-mat="'+i+'" data-f="amount" value="'+escapeHtml(m.amount)+'">'+
      '<select class="m-unit" data-prod="'+escapeHtml(p.id)+'" data-mat="'+i+'" data-f="unit">'+
        '<option value="kg"'+(m.unit==='kg'?' selected':'')+'>kg</option><option value="g"'+(m.unit==='g'?' selected':'')+'>g</option></select>'+
      '<button class="btn btn-danger sm" data-act="delMat" data-prod="'+escapeHtml(p.id)+'" data-mat="'+i+'">删</button></div>';
  });
  return '<div class="prod-edit-card"><div class="field-row"><label>产品名称</label><input class="p-name" data-prod="'+escapeHtml(p.id)+'" data-f="name" value="'+escapeHtml(p.name)+'"></div>'+
    '<div class="field-row"><label>所属分类</label><select class="p-cat" data-prod="'+escapeHtml(p.id)+'" data-f="cat">'+catOptions+'</select>'+
      '<label>标准产量</label><div class="mini-qty"><input type="number" min="0" step="1" data-prod="'+escapeHtml(p.id)+'" data-f="yield" value="'+escapeHtml(p.recipeYield)+'"><span>个</span></div>'+
      '<label>损耗率</label><select class="p-loss" data-prod="'+escapeHtml(p.id)+'" data-f="loss">'+lossOptions+'</select></div>'+
    '<div class="field-row"><label>默认单价</label><div class="mini-qty"><input type="number" min="0" step="0.01" data-prod="'+escapeHtml(p.id)+'" data-f="price" value="'+priceVal+'"><span>元/个</span></div>'+
      '<label>启用</label><select class="p-cat" data-prod="'+escapeHtml(p.id)+'" data-f="enabled"><option value="1"'+(p.enabled!==false?' selected':'')+'>是</option><option value="0"'+(p.enabled===false?' selected':'')+'>否</option></select></div>'+
    '<div class="recipe-head"><span>配方原料</span><button class="btn btn-secondary sm" data-act="addMat" data-prod="'+escapeHtml(p.id)+'">+ 新增原料</button></div>'+
    '<div class="mat-list">'+(matHtml||'<div class="cat-sub">（暂无原料，点击上方新增）</div>')+'</div>'+
    '<div style="margin-top:10px;"><button class="btn btn-danger sm" data-act="delProd" data-prod="'+escapeHtml(p.id)+'">删除该产品</button></div></div>';
}
function attachRecipeListeners(){
  var root=document.getElementById('recipeContent');
  function onField(e){
    var el=e.target;var prodId=el.dataset.prod,matIdx=el.dataset.mat,f=el.dataset.f;if(!prodId||!f)return;
    var p=findProd(prodId);if(!p)return;
    if(matIdx!==undefined){var m=p.recipe[parseInt(matIdx,10)];if(!m)return;
      if(f==='name')m.name=el.value;else if(f==='amount')m.amount=parseFloat(el.value)||0;else if(f==='unit')m.unit=el.value;
      saveData();return;}
    if(f==='name')p.name=el.value;
    else if(f==='yield')p.recipeYield=parseFloat(el.value)||0;
    else if(f==='loss')p.lossRate=parseFloat(el.value)||0;
    else if(f==='price')p.price=yuanToCents(el.value);
    else if(f==='enabled')p.enabled=(el.value==='1');
    else if(f==='cat'){p.categoryId=el.value;saveData();if(e.type==='change')renderRecipe();return;}
    saveData();
  }
  root.addEventListener('input',onField);root.addEventListener('change',onField);
  root.addEventListener('input',function(e){var inp=e.target;if(inp.classList.contains('cat-name-input')){var cat=findCat(inp.dataset.cat);if(cat){cat.name=inp.value;saveData();}}});
  root.addEventListener('click',function(e){
    var btn=e.target.closest('[data-act]');if(!btn)return;var act=btn.dataset.act;
    if(act==='addCat'){var name=prompt('请输入新分类名称：','新分类');if(name&&name.trim()){state.categories.push({id:genId('c'),name:name.trim(),sort:state.categories.length+1});saveData();renderRecipe();}}
    else if(act==='delCat'){var catId=btn.dataset.cat;var cnt=productsOfCategory(catId).length;var msg='确定删除该分类吗？';if(cnt>0)msg='该分类下有 '+cnt+' 个产品，删除后这些产品也会一并删除。确定？';if(confirm(msg)){state.products=state.products.filter(function(p){return p.categoryId!==catId;});state.categories=state.categories.filter(function(c){return c.id!==catId;});saveData();renderRecipe();}}
    else if(act==='addProd'){var cid=btn.dataset.cat;state.products.push({id:genId('p'),name:'新商品',categoryId:cid,price:0,recipeYield:500,lossRate:0,enabled:true,recipe:[]});saveData();renderRecipe();}
    else if(act==='delProd'){var pid=btn.dataset.prod;if(confirm('确定删除该产品吗？删除后其配方将丢失。')){state.products=state.products.filter(function(p){return p.id!==pid;});delete state.todayPlan[pid];saveData();renderRecipe();}}
    else if(act==='addMat'){var pp=findProd(btn.dataset.prod);pp.recipe.push({name:'',amount:0,unit:'kg'});saveData();renderRecipe();}
    else if(act==='delMat'){var pr=findProd(btn.dataset.prod);pr.recipe.splice(parseInt(btn.dataset.mat,10),1);saveData();renderRecipe();}
  });
}

/* =================================================================
 *  覆盖层关闭
 * ================================================================= */
function closeOverlays(){
  document.getElementById('view-order-edit').classList.add('hidden');
  document.getElementById('view-order-detail').classList.add('hidden');
  document.getElementById('view-price').classList.add('hidden');
  document.getElementById('view-production').classList.add('hidden');
  closeDatePicker();
  if(overlayReturnFocus&&overlayReturnFocus.isConnected)overlayReturnFocus.focus({preventScroll:true});
  overlayReturnFocus=null;
}

/* =================================================================
 *  初始化
 * ================================================================= */
function init(){
  var pd=localStorage.getItem(LS_PLAN_DATE);var today=todayStr();
  if(pd!==today){state.todayPlan={};state.calcPlanDate=today;saveData(true);localStorage.setItem(LS_PLAN_DATE,today);}
  state.todayPlan=Object.assign(Object.create(null),state.todayPlan||{});

  renderDateCalc();renderPlan();attachRecipeListeners();
  renderOrders();
  showView('orders'); // 默认进入 订单 → 今日订单

  document.getElementById('btnCalc').addEventListener('click',onCalculate);
  document.getElementById('btnClear').addEventListener('click',onClear);
  document.getElementById('btnPrint').addEventListener('click',onPrint);
  document.getElementById('btnRecipe').addEventListener('click',openRecipe);
  document.getElementById('btnExport').addEventListener('click',onExport);
  document.getElementById('btnImport').addEventListener('click',onImport);
  document.getElementById('importFile').addEventListener('change',handleImportFile);
  document.getElementById('recipeBack').addEventListener('click',function(){renderOrders();renderPlan();showView('orders');});
  document.getElementById('navCalc').addEventListener('click',function(){renderDateCalc();renderPlan();showView('calc');});
  document.getElementById('navOrders').addEventListener('click',function(){closeOverlays();renderOrders();showView('orders');});
}
if(window.__LOCAL_TEST__){document.body.classList.remove('auth-pending');document.getElementById('authPanel').classList.add('hidden');init();}
else bootShared();
