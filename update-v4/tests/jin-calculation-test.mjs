import assert from 'node:assert/strict';
import {inlineAssets} from '../../update-v3/tests/frontend-assets.mjs';
import {JSDOM,VirtualConsole} from '../../update-v3/tests/test-dom.mjs';
const errors=[];
function browser(version='update-v4'){
  const console=new VirtualConsole();console.on('jsdomError',e=>errors.push(e));
  return new JSDOM(inlineAssets(new URL('../../'+version+'/site/peiliao.html',import.meta.url)),{
    url:'https://isolated.invalid/',runScripts:'dangerously',pretendToBeVisual:true,virtualConsole:console,
    beforeParse(w){w.__LOCAL_TEST__=true;w.alert=()=>{};w.confirm=()=>true;w.scrollTo=()=>{};w.matchMedia=()=>({matches:false});w.HTMLElement.prototype.scrollIntoView=()=>{};}
  });
}
function near(actual,expected){assert.ok(Math.abs(actual-expected)<=Math.max(1,Math.abs(expected))*1e-12,`${actual} != ${expected}`);}
let passed=0;function check(name,fn){fn();passed++;console.log('PASS '+name);}
const legacy=browser('update-v3'),modern=browser(),old=legacy.window,w=modern.window;
const products=[
  {id:'p1',name:'配方甲',categoryId:'c1',price:125,recipeYield:500,lossRate:5,enabled:true,recipe:[{name:'粉',amount:20.123456,unit:'kg'},{name:'盐',amount:123.456,unit:'g'},{name:'水',amount:1.234567}]},
  {id:'p2',name:'配方乙',categoryId:'c1',price:125,recipeYield:333,lossRate:3,enabled:true,recipe:[{name:'粉',amount:0.0001234,unit:'kg'},{name:'盐',amount:300.123456,unit:'g'}]}
];
for(const app of [old,w]){app.state.products=JSON.parse(JSON.stringify(products));app.state.todayPlan={p1:123,p2:111};app.invalidateDataIndex();}
const original=JSON.stringify(w.state.products),before=old.calculate(),after=w.calculate();
check('Legacy kg/default and grams preserve physical weights, ratios, losses and repeated-material sums',()=>{
  for(let i=0;i<before.results.length;i++){
    assert.equal(after.results[i].ratio,before.results[i].ratio);
    for(let j=0;j<before.results[i].materials.length;j++){
      near(after.results[i].materials[j].actualJin,before.results[i].materials[j].actualKg*2);
      near(after.results[i].materials[j].theoryJin,before.results[i].materials[j].theoryKg*2);
    }
  }
  for(const name of Object.keys(before.summary)){near(after.summary[name].actual,before.summary[name].actual*2);near(after.summary[name].theory,before.summary[name].theory*2);}
  assert.equal(JSON.stringify(w.state.products),original);
});
const transfer=w.weightStateForTransfer(w.state);
w.state.products=transfer.products;
const normalized=w.calculate();
check('Explicit jin recipes, normalized backups and repeated conversions never double twice',()=>{
  assert.equal(transfer.products[0].recipe[0].unit,'斤');near(transfer.products[0].recipe[0].amount,40.246912);
  assert.equal(transfer.products[0].recipe[1].unit,'g');
  assert.equal(JSON.stringify(w.weightStateForTransfer(transfer)),JSON.stringify(transfer));
  for(const name of Object.keys(after.summary)){near(normalized.summary[name].actual,after.summary[name].actual);near(normalized.summary[name].theory,after.summary[name].theory);}
});
check('Detailed output, theoretical quantities, summary totals and printing use jin exclusively',()=>{
  for(const html of [w.buildResultHTML(normalized),w.buildPrintHTML(normalized)]){
    assert.ok(html.includes(' 斤'));assert.ok(html.includes('（理论 '));assert.ok(html.includes('原料合计'));
    assert.ok(!/\bkg\b|公斤|千克/.test(html));
  }
  assert.equal(w.fmtJin(1.234567),'1.235');
  assert.equal(w.toKg,undefined);assert.equal(w.fmtKg,undefined);
  assert.ok(!('actualKg' in normalized.results[0].materials[0]));
  near(w.toJin(500,'g'),1);near(w.toJin(1,'斤'),1);near(w.toJin(1,'kg'),2);
});
w.state.products=JSON.parse(original);w.renderRecipe();
check('Legacy editing shows converted jin values without rewriting data or truncating input precision',()=>{
  const amount=w.document.querySelector('[data-prod="p1"][data-mat="0"][data-f="amount"]');
  const unit=w.document.querySelector('[data-prod="p1"][data-mat="0"][data-f="unit"]');
  near(Number(amount.value),40.246912);assert.equal(amount.step,'any');assert.equal(unit.value,'斤');assert.equal(unit.querySelector('[value="kg"]'),null);
  assert.equal(JSON.stringify(w.state.products),original);
  amount.value='1.23456789';amount.dispatchEvent(new w.Event('input',{bubbles:true}));
  assert.equal(w.state.products[0].recipe[0].amount,1.23456789);assert.equal(w.state.products[0].recipe[0].unit,'斤');
});
check('Changing jin/gram input units preserves physical weight across input and change events',()=>{
  const unit=w.document.querySelector('[data-prod="p1"][data-mat="0"][data-f="unit"]');
  const amount=w.document.querySelector('[data-prod="p1"][data-mat="0"][data-f="amount"]');
  unit.value='g';for(const type of ['input','change'])unit.dispatchEvent(new w.Event(type,{bubbles:true}));
  near(Number(amount.value),617.283945);near(w.state.products[0].recipe[0].amount,617.283945);assert.equal(w.state.products[0].recipe[0].unit,'g');
  unit.value='斤';for(const type of ['input','change'])unit.dispatchEvent(new w.Event(type,{bubbles:true}));
  near(Number(amount.value),1.23456789);near(w.state.products[0].recipe[0].amount,1.23456789);
});
check('New material uses jin and missing-yield/empty-plan behavior is retained',()=>{
  w.document.querySelector('[data-act="addMat"][data-prod="p1"]').click();assert.equal(w.state.products[0].recipe.at(-1).unit,'斤');
  w.state.products[0].recipeYield=0;assert.ok(w.buildResultHTML(w.calculate()).includes('标准产量'));
  w.state.todayPlan={};assert.equal(w.calculate().hasPlan,false);
});
check('Legacy local recipe migration converts default/kg units and preserves grams',()=>{
  const result=w.migrateOld({products:[{id:'p1',name:'旧产品',standardYield:500,recipe:products[0].recipe}]});
  assert.equal(result.products[0].recipe[0].unit,'斤');near(result.products[0].recipe[0].amount,40.246912);
  assert.equal(result.products[0].recipe[1].unit,'g');assert.equal(result.products[0].recipe[1].amount,123.456);
  assert.equal(result.products[0].recipe[2].unit,'斤');near(result.products[0].recipe[2].amount,2.469134);
});
check('No script errors',()=>assert.deepEqual(errors,[]));
legacy.window.close();modern.window.close();console.log('PASS '+passed+' weight-unit regression checks');
