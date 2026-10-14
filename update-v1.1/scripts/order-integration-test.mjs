import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {JSDOM,VirtualConsole}=require('../../.tools/ui/node_modules/jsdom');
const html=readFileSync(new URL('../site/peiliao.html',import.meta.url),'utf8');
const errors=[];
const alerts=[];
function app(seed={}){
  const vc=new VirtualConsole();
  vc.on('jsdomError',e=>{errors.push(e);console.error(e.cause?.stack||e.stack);});
  return new JSDOM(html,{url:'https://isolated-test.invalid/',runScripts:'dangerously',virtualConsole:vc,beforeParse(w){
    w.alert=message=>alerts.push(message);w.confirm=()=>true;w.scrollTo=()=>{};
    w.matchMedia=()=>({matches:false});w.HTMLElement.prototype.scrollIntoView=()=>{};
    for(const [key,value] of Object.entries(seed))w.localStorage.setItem(key,value);
  }});
}
let checks=0;
function check(name,fn){fn();checks++;console.log('PASS',name);}
function input(w,selector,value){const el=w.document.querySelector(selector);assert.ok(el,selector);el.value=String(value);el.dispatchEvent(new w.Event('input',{bubbles:true}));}
const original={categories:[{id:'c1',name:'煎堆'}],products:[{id:'p1',name:'小煎堆',categoryId:'c1',standardYield:500,lossRate:5,recipe:[{name:'糯米粉',amount:20,unit:'kg'}]}],todayPlan:{p1:50}};
const originalJSON=JSON.stringify(original);
let initial=app();const date=initial.window.todayStr();initial.window.close();
let dom=app({peiliao_data_v1:originalJSON,peiliao_plan_date_v1:date});
let w=dom.window;
check('Full initialization and migration preserve recipe, quantity and original backup',()=>{
  assert.equal(w.state.products[0].recipeYield,500);assert.equal(w.state.products[0].recipe[0].amount,20);
  assert.equal(w.state.todayPlan.p1,50);assert.equal(w.localStorage.getItem('peiliao_data_v1'),originalJSON);
  assert.equal(w.state.orders.length,0);assert.ok(!w.document.querySelector('#view-orders').classList.contains('hidden'));
});
w.document.querySelector('#btnOrderPrices').click();
input(w,'.price-input[data-pid="p1"]',1.25);w.document.querySelector('#psSave').click();
check('Price settings are reachable and save cents',()=>{assert.equal(w.state.products[0].price,125);});
w.document.querySelector('#btnNewOrder').click();
input(w,'[data-qty="p1"]',100);input(w,'#oeDeposit',50);input(w,'#oeNote','本地隔离测试订单');
w.renderOrderEdit();
check('Changing date or re-rendering form retains entered deposit',()=>{assert.equal(w.document.querySelector('#oeDeposit').value,'50.00');});
check('Order form computes 100 x 1.25, deposit and balance',()=>{
  assert.equal(w.document.querySelector('#oeTotalAmt').textContent,'¥125.00');
  assert.equal(w.document.querySelector('#oeRemain').textContent,'¥75.00');
});
w.document.querySelector('#oeSave').click();
check('Order save persists amounts as integer cents and product snapshot',()=>{
  const o=w.state.orders[0];assert.equal(o.orderAmount,12500);assert.equal(o.deposit,5000);assert.equal(o.remainingAmount,7500);
  assert.equal(o.items[0].unitPrice,125);assert.ok(w.document.querySelector('.order-card'));
});
const saved=w.localStorage.getItem('food_factory_app_data_v1');dom.window.close();
dom=app({food_factory_app_data_v1:saved,peiliao_plan_date_v1:date});w=dom.window;
check('Reload keeps real order quantities, deposit and recipe',()=>{assert.equal(w.state.orders[0].items[0].quantity,100);assert.equal(w.state.orders[0].deposit,5000);assert.equal(w.state.products[0].recipe[0].amount,20);});
w.state.products[0].price=200;
w.openEditOrder(w.state.orders[0].id);input(w,'#oeNote','备注已更新');w.document.querySelector('#oeSave').click();
check('Changing current prices and editing notes preserves historical unit price',()=>{assert.equal(w.state.orders[0].orderAmount,12500);assert.equal(w.state.orders[0].items[0].unitPrice,125);});
w.openCopyOrder(w.state.orders[0].id);w.document.querySelector('#oeSave').click();
check('Copied orders use current price and a distinct order number',()=>{assert.equal(w.state.orders[1].orderAmount,20000);assert.equal(w.state.orders[1].deposit,0);assert.notEqual(w.state.orders[1].orderNo,w.state.orders[0].orderNo);});
w.openProduction(date);
check('Production summary totals multiple orders',()=>{assert.equal(w.document.querySelector('#prOrder').textContent,'200 个');});
input(w,'.pr-input[data-pid="p1"]',250);w.document.querySelector('#prSend').click();
check('Production adjustment sends to ingredients and applies loss',()=>{
  assert.equal(w.state.todayPlan.p1,250);assert.equal(w.state.productionPlans[date].items[0].productionQuantity,250);
  assert.equal(w.calculate().summary['糯米粉'].actual,10.5);
});
const otherDate=date==='2026-10-03'?'2026-10-04':'2026-10-03';
w.sendToCalc(otherDate,[{productId:'p1',orderQuantity:100,productionQuantity:120}], 'test-signature');
check('Selected production date is shown in calculation and print',()=>{
  assert.ok(w.document.querySelector('#todayDate').textContent.includes(otherDate));
  assert.ok(w.document.querySelector('#printArea').textContent.includes(otherDate));
});
w.openEditOrder(w.state.orders[0].id);w.editBuf.orderDate=otherDate;w.document.querySelector('#oeSave').click();
check('Moving order dirties both old and new production dates',()=>{assert.equal(w.state.productionPlans[date].dirty,true);assert.equal(w.state.productionPlans[otherDate].dirty,true);});
w.state.products=[];w.openEditOrder(w.state.orders[0].id);
check('Deleted product remains editable through historical snapshot',()=>{assert.ok(w.document.querySelector('[data-qty="p1"]'));});
input(w,'[data-qty="p1"]',80);w.document.querySelector('#oeSave').click();
check('Editing archived item preserves its price and adjusts amount',()=>{assert.equal(w.state.orders[0].items[0].unitPrice,125);assert.equal(w.state.orders[0].orderAmount,10000);});
w.cancelOrder(w.state.orders[0]);
check('Cancelled orders excluded from production totals',()=>{assert.equal(w.validOrdersOfDate(otherDate).length,0);});
w.openRecipe();
check('Recipe management opens and returns to order module',()=>{
  assert.ok(w.document.querySelector('#recipeContent'));w.document.querySelector('#recipeBack').click();
  assert.ok(!w.document.querySelector('#view-orders').classList.contains('hidden'));
});
check('No initialization or DOM event errors',()=>{assert.deepEqual(errors,[]);});
dom.window.close();
console.log(`PASS ${checks} integration checks; all test data stayed in isolated memory.`);
