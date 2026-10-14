import {inlineAssets} from './frontend-assets.mjs';
import {JSDOM,VirtualConsole,jsdomVersion,jsdomSource} from './test-dom.mjs';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {tmpdir} from 'node:os';
import assert from 'node:assert/strict';

let passed=0;function check(label,fn){fn();passed++;console.log('PASS '+label);}
for(const directory of ['site','release-site']){
  for(const page of ['peiliao.html','admin.html']){
    const errors=[],vc=new VirtualConsole();vc.on('jsdomError',error=>errors.push(error));
    const html=inlineAssets(new URL('../'+directory+'/'+page,import.meta.url));
    const dom=new JSDOM(html,{url:'https://isolated.invalid/',runScripts:'dangerously',pretendToBeVisual:true,virtualConsole:vc,beforeParse(w){w.__LOCAL_TEST__=true;w.alert=()=>{};w.confirm=()=>true;w.matchMedia=()=>({matches:false});w.scrollTo=()=>{};w.HTMLElement.prototype.scrollIntoView=()=>{};w.fetch=async()=>({ok:false,status:401,json:async()=>({error:'请登录'})});}});
    try{
      await new Promise(resolve=>setTimeout(resolve,10));
      check(directory+'/'+page+' resolves source and hashed assets',()=>{assert.deepEqual(errors,[]);assert.equal(dom.window.document.querySelectorAll('script[src],link[rel="stylesheet"]').length,0);if(page==='peiliao.html')assert.equal(typeof dom.window.renderOrders,'function');else assert.equal(typeof dom.window.fetchOrders,'function');});
    }finally{dom.window.close();}
  }
}
const folder=mkdtempSync(path.join(tmpdir(),'peiliao-test-assets-'));
try{
  mkdirSync(path.join(folder,'assets'));mkdirSync(path.join(folder,'pages'));
  writeFileSync(path.join(folder,'assets','app.abc.js'),"window.fixtureLoaded=document.getElementById('probe').textContent;");
  writeFileSync(path.join(folder,'assets','style.abc.css'),'#probe{color:rgb(255, 0, 0)}');
  writeFileSync(path.join(folder,'pages','fixture.html'),"<html><head><link href='../assets/style.abc.css?v=1' rel='stylesheet'><script src='/assets/app.abc.js?v=1' defer></script></head><body><div id='probe'>ready</div></body></html>");
  const html=inlineAssets(pathToFileURL(path.join(folder,'pages','fixture.html')),{siteRoot:folder}),dom=new JSDOM(html,{runScripts:'dangerously'});
  try{check('Nested relative assets, absolute hashed assets and deferred execution preserve paths/order',()=>{assert.equal(dom.window.fixtureLoaded,'ready');assert.equal(dom.window.getComputedStyle(dom.window.document.getElementById('probe')).color,'rgb(255, 0, 0)');});}
  finally{dom.window.close();}
}finally{rmSync(folder,{recursive:true,force:true});}
console.log('PASS '+passed+' asset tool checks; jsdom '+jsdomVersion+' via '+jsdomSource);
