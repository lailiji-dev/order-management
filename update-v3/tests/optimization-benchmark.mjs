import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {JSDOM,VirtualConsole,localResources,jsdomVersion} from './test-dom.mjs';
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
const project=fileURLToPath(new URL('../../',import.meta.url));
const iterations=Number(process.env.BENCH_ITERATIONS||3);
const versions=process.argv.slice(2).length?process.argv.slice(2):['update-v2','update-v3'];
const seed=JSON.parse(readFileSync(path.join(project,'update-v2/server/seed.json'),'utf8'));
const scenarios=[{name:'100 orders on one day',count:100,days:1},{name:'1000 orders on one day',count:1000,days:1},{name:'10000 orders across 30 days',count:10000,days:30}];
function dataFor({count,days}){
  const state=structuredClone(seed),today=new Date(),date=(d)=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  state.orders=Array.from({length:count},(_,i)=>{
    const d=new Date(today);d.setDate(d.getDate()+i%days);
    return {id:'benchmark-order-'+i,orderNo:String(i+1).padStart(6,'0'),orderDate:date(d),status:i%2?'picked':'unpicked',cancelled:false,earlyPickup:i%13===0,deposit:1000,orderAmount:12500,remainingAmount:11500,customerName:'',phone:'',note:'基准测试订单',createdAt:'2026-10-01T00:00:00',updatedAt:'2026-10-01T00:00:00',items:[{productId:'p1',productName:'小煎堆',quantity:100,unitPrice:125,subtotal:12500}]};
  });state.todayPlan={};return state;
}
class LocalAssets{
  constructor(site){this.site=site;this.bytes=0;this.requests=0;this.options=localResources(url=>this.fetch(url));}
  fetch(url){const u=new URL(url),file=path.resolve(this.site,'.'+u.pathname);assert.ok(file.startsWith(this.site+path.sep),'Asset escaped local site');assert.ok(existsSync(file),'Missing local asset '+file);const contents=readFileSync(file);this.bytes+=contents.length;this.requests++;return contents;}
}
const median=(numbers)=>numbers.slice().sort((a,b)=>a-b)[Math.floor(numbers.length/2)];
const round=(n)=>Math.round(n*100)/100;
async function load(version,state){
  const site=path.join(project,version,'site'),html=readFileSync(path.join(site,'peiliao.html'),'utf8'),assets=new LocalAssets(site),errors=[],vc=new VirtualConsole();vc.on('jsdomError',error=>errors.push(error));
  const started=performance.now(),dom=new JSDOM(html,{url:'https://benchmark.invalid/',resources:assets.options,runScripts:'dangerously',pretendToBeVisual:true,virtualConsole:vc,beforeParse(w){
    w.__LOCAL_TEST__=true;w.alert=()=>{};w.confirm=()=>true;w.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});w.scrollTo=()=>{};w.HTMLElement.prototype.scrollIntoView=()=>{};w.localStorage.setItem('food_factory_app_data_v1',JSON.stringify(state));
  }});
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Local page load timeout')),20000);dom.window.addEventListener('load',()=>{clearTimeout(timer);resolve();},{once:true});});
  assert.deepEqual(errors,[],version+' JavaScript/DOM errors');assert.equal(typeof dom.window.renderOrders,'function');assert.equal(dom.window.state.orders.length,state.orders.length);
  return {dom,loadMs:performance.now()-started,resourceBytes:Buffer.byteLength(html)+assets.bytes,requests:1+assets.requests};
}
async function measure(version,scenario){
  const state=dataFor(scenario),rows=[];
  for(let i=0;i<iterations;i++){
    const {dom,loadMs,resourceBytes,requests}=await load(version,state),w=dom.window,root=w.document.getElementById('view-orders');
    const beforeNodes=root.querySelectorAll('*').length,cards=root.querySelectorAll('.order-card').length,firstCard=root.querySelector('.order-card');assert.ok(firstCard&&firstCard.classList.contains('early-pickup'),'Early pickup remains first');
    let observed=0;const observer=new w.MutationObserver(records=>observed+=records.length);observer.observe(root,{childList:true,subtree:true});
    let started=performance.now();w.renderOrders();const noOpRenderMs=performance.now()-started;await Promise.resolve();observer.disconnect();
    const noOpPreservedFirstCard=firstCard===root.querySelector('.order-card');
    w.orderTab='all';w.dayOrdersDate=null;started=performance.now();w.renderOrders();const calendarMs=performance.now()-started;assert.equal(root.querySelectorAll('.cal-cell[data-date]').length,new Date(w.calYear,w.calMonth,0).getDate());
    w.orderTab='today';w.renderOrders();
    w.sharedSession={user:{id:1,username:'benchmark',role:'admin'},csrf:'benchmark'};w.sharedBaseline=w.sharedCopy(w.state);w.sharedBusy=false;w.sharedFailed=false;
    const raw=JSON.stringify({state:w.sharedCopy(w.state),revision:42,initialized:true});let networkBytes=0,jsonParses=0,fetches=0,conditionalRequests=0;
    w.fetch=async(_url,options={})=>{fetches++;const headers=options.headers||{},etag=headers['If-None-Match']||headers['if-none-match'];if(etag){conditionalRequests++;return {ok:false,status:304,headers:{get:()=>null},json:async()=>{throw new Error('304 must not parse JSON');}};}networkBytes+=Buffer.byteLength(raw);return {ok:true,status:200,headers:{get:(name)=>name.toLowerCase()==='etag'?'"state-42"':null},json:async()=>{jsonParses++;return JSON.parse(raw);}};};
    // Warm the client validator using a full response, then measure unchanged polls.
    await w.sharedRefresh();networkBytes=0;jsonParses=0;fetches=0;conditionalRequests=0;
    const pollTimes=[];for(let n=0;n<3;n++){started=performance.now();await w.sharedRefresh();pollTimes.push(performance.now()-started);}
    assert.equal(fetches,3,'Three unchanged poll requests must run');
    rows.push({loadMs,noOpRenderMs,calendarMs,noOpPollMs:median(pollTimes),renderedCards:cards,domNodes:beforeNodes,mutationRecords:observed,noOpPreservedFirstCard,resourceBytes,requests,unchangedPollBytes:networkBytes/3,unchangedPollJsonParses:jsonParses/3,conditionalRequests});
    dom.window.close();
  }
  const result={version,scenario:scenario.name,totalOrders:scenario.count,iterations};for(const key of Object.keys(rows[0])){const values=rows.map(row=>row[key]);result[key]=typeof values[0]==='number'?round(median(values)):values.every(Boolean);}return result;
}
export {load,dataFor};
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const results=[];
  for(const version of versions){for(const scenario of scenarios){const result=await measure(version,scenario);results.push(result);console.log(JSON.stringify(result));}}
  const report={generatedAt:new Date().toISOString(),runtime:process.version,jsdomVersion,note:'Isolated jsdom, synthetic data, local assets and mocked network. Medians measure application work; they are not real browser paint or internet latency. API body bytes are uncompressed.',results};
  writeFileSync(new URL('./optimization-benchmark-results.json',import.meta.url),JSON.stringify(report,null,2));
  console.table(results.map(row=>({version:row.version,orders:row.totalOrders,load_ms:row.loadMs,noop_render_ms:row.noOpRenderMs,calendar_ms:row.calendarMs,cards:row.renderedCards,poll_ms:row.noOpPollMs,poll_bytes:row.unchangedPollBytes})));
}
