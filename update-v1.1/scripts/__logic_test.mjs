// 逻辑自测：在 Node 中用 vm 加载 peiliao.html 的主脚本（剥离 init() 调用，桩化 DOM/localStorage）
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';

const html = readFileSync(new URL('../site/peiliao.html', import.meta.url), 'utf8');
const m = html.match(/<script>([\s\S]*)<\/script>/);
if (!m) { console.error('未找到 <script> 块'); process.exit(1); }
let code = m[1];
// 移除底部的 init(); 调用，避免 DOM 重逻辑执行；函数声明仍保留
code = code.replace(/\binit\(\);/g, '/* init() 调用已在测试中跳过 */');

// ---- 桩化浏览器环境 ----
const fakeEl = new Proxy({}, {
  get: (_t, prop) => {
    if (prop === 'style') return {};
    if (prop === 'classList') return { add(){}, remove(){}, toggle(){} };
    if (prop === 'addEventListener') return () => {};
    if (prop === 'appendChild') return () => {};
    if (prop === 'querySelector' || prop === 'querySelectorAll') return () => fakeEl;
    if (prop === 'dataset') return {};
    return () => fakeEl;
  },
  set: () => true,
});
const sandbox = {
  console,
  window: {},
  document: { getElementById: () => fakeEl, querySelector: () => fakeEl, querySelectorAll: () => [], addEventListener: () => {}, createElement: () => fakeEl },
  localStorage: { _s: {}, getItem(k){ return this._s[k] ?? null; }, setItem(k,v){ this._s[k]=String(v); }, removeItem(k){ delete this._s[k]; } },
  prompt: () => null,
  alert: () => {},
  confirm: () => true,
  parseInt, parseFloat, Math, JSON, Date, isNaN, RegExp, Object, Array, String, Number,
};
sandbox.window = sandbox; // 部分代码用 window.xxx
const ctx = createContext(sandbox);
try {
  runInContext(code, ctx, { filename: 'peiliao-inline.js' });
} catch (e) {
  console.error('❌ 脚本加载失败:', e.message);
  process.exit(1);
}

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ ' + name + (extra ? '  → ' + extra : '')); }
}
function eq(name, got, want) { ok(name + ' (得到=' + JSON.stringify(got) + ', 期望=' + JSON.stringify(want) + ')', JSON.stringify(got) === JSON.stringify(want), '得到 ' + JSON.stringify(got)); }

// ===================== 1. 农历算法 =====================
console.log('\n[农历算法]');
eq('2026-10-02 → 八月廿二', ctx.lunarText(2026,10,2).full, '八月廿二');
eq('2026-02-17 → 正月初一', ctx.lunarText(2026,2,17).full, '正月初一');
eq('2024-02-10 → 正月初一', ctx.lunarText(2024,2,10).full, '正月初一');
eq('2025-01-29 → 正月初一', ctx.lunarText(2025,1,29).full, '正月初一');
ok('2000-01-01 → 冬月廿五 (十一月即冬月)', ctx.lunarText(2000,1,1).full.includes('冬月廿五'), ctx.lunarText(2000,1,1).full);
eq('2026-10-02 monthDay', ctx.lunarText(2026,10,2).monthDay, '廿二');
ok('2026-10-02 干支', /年$/.test(ctx.lunarText(2026,10,2).ganzhi), ctx.lunarText(2026,10,2).ganzhi);

// ===================== 2. 金额工具 =====================
console.log('\n[金额工具]');
eq('yuanToCents(12.34)', ctx.yuanToCents('12.34'), 1234);
eq('yuanToCents(0.1)', ctx.yuanToCents('0.1'), 10);
eq('yuanToCents(99.999)', ctx.yuanToCents('99.999'), 10000);
eq('centsToYuan(1234)', ctx.centsToYuan(1234), 12.34);
eq('fmtMoney(1234)', ctx.fmtMoney(1234), '¥12.34');
eq('fmtMoney(0)', ctx.fmtMoney(0), '¥0.00');

// ===================== 3. 订单号 =====================
console.log('\n[订单号生成]');
ctx.state.orders = [];
eq('空订单首号 2026-02-17 → 20260217-001', ctx.nextOrderNo('2026-02-17'), '20260217-001');
ctx.state.orders = [{ orderDate:'2026-02-17', orderNo:'20260217-001' }];
eq('已有001 → 002', ctx.nextOrderNo('2026-02-17'), '20260217-002');
ctx.state.orders = [{ orderDate:'2026-02-17', orderNo:'20260217-003' }, { orderDate:'2026-02-17', orderNo:'20260217-001' }];
eq('取最大+1 → 004', ctx.nextOrderNo('2026-02-17'), '20260217-004');
ctx.state.orders = [];

// ===================== 4. 计算引擎 =====================
console.log('\n[配料计算引擎]');
// 小煎堆：标准产量 500 个，糯米粉 20kg、白砂糖 3kg；损耗 5%
const pid = 'p_test';
ctx.state.products = [{ id: pid, name:'小煎堆', categoryId:'c1', price:0, recipeYield:500, lossRate:5, enabled:true,
  recipe:[{name:'糯米粉',amount:20,unit:'kg'},{name:'白砂糖',amount:3,unit:'kg'}] }];
ctx.state.todayPlan = {}; ctx.state.todayPlan[pid] = 1250; // 1250/500 = 2.5 倍
const r = ctx.calculate();
ok('hasPlan=true', r.hasPlan === true);
const sm = r.summary;
const nFen = sm['糯米粉'] ? sm['糯米粉'].actual : null;
const sugar = sm['白砂糖'] ? sm['白砂糖'].actual : null;
// 理论 20*2.5=50，损耗5% → 52.5kg；白砂糖 3*2.5=7.5，损耗5% → 7.875
ok('小煎堆 1250个 → 糯米粉实际≈52.5kg', Math.abs(nFen - 52.5) < 1e-6, nFen);
ok('小煎堆 1250个 → 白砂糖实际≈7.875kg', Math.abs(sugar - 7.875) < 1e-6, sugar);
// 理论值
ok('糯米粉理论=50kg', Math.abs(sm['糯米粉'].theory - 50) < 1e-6, sm['糯米粉'].theory);

// ===================== 5. 订单签名 / 变更检测 =====================
console.log('\n[订单签名与变更检测]');
ctx.state.orders = [
  { id:'o1', cancelled:false, orderDate:'2026-02-17', items:[{productId:'p1',quantity:10},{productId:'p2',quantity:5}] },
  { id:'o2', cancelled:false, orderDate:'2026-02-17', items:[{productId:'p1',quantity:3}] },
];
const sig1 = ctx.orderSignature('2026-02-17');
ok('订单签名非空', typeof sig1 === 'string' && sig1.length > 0, sig1);
// 改数量
ctx.state.orders[0].items[0].quantity = 20;
const sig2 = ctx.orderSignature('2026-02-17');
ok('改数量后签名变化', sig1 !== sig2);
// 取消的订单不计入
ctx.state.orders = [
  { id:'o1', cancelled:false, orderDate:'2026-02-17', items:[{productId:'p1',quantity:10}] },
  { id:'o3', cancelled:true, orderDate:'2026-02-17', items:[{productId:'pX',quantity:99}] },
];
const sig3 = ctx.orderSignature('2026-02-17');
ok('取消订单不计入签名', !sig3.includes('o3') && !sig3.includes('pX'), sig3);

// ===================== 6. 旧数据迁移 =====================
console.log('\n[旧数据迁移]');
const oldRaw = { categories:[{id:'c1',name:'饼'}], products:[{id:'p1',name:'月饼',standardYield:300,lossRate:10,recipe:[{name:'面粉',amount:5,unit:'kg'}]}], todayPlan:{p1:100} };
const migrated = ctx.migrateOld(oldRaw);
ok('迁移后保留分类', migrated.categories.length === 1 && migrated.categories[0].name === '饼');
ok('迁移后 product 用 recipeYield', migrated.products[0].recipeYield === 300);
ok('迁移后 recipe 保留原料', migrated.products[0].recipe[0].name === '面粉');
ok('迁移后包含新结构字段 orders', Array.isArray(migrated.orders) && migrated.orders.length === 0);
ok('迁移后包含 productionPlans', typeof migrated.productionPlans === 'object');

// ===================== 7. loadData 行为 =====================
console.log('\n[loadData]');
ctx.localStorage.setItem('food_factory_app_data_v1', JSON.stringify(migrated));
const loaded = ctx.loadData();
ok('loadData 读回迁移数据', loaded.products[0].recipeYield === 300 && loaded.categories[0].name === '饼');
// 无存储时回退默认
ctx.localStorage.removeItem('food_factory_app_data_v1');
const def = ctx.loadData();
ok('无存储回退默认数据', def.products.length > 0 && Array.isArray(def.orders));

// ===================== 结果 =====================
console.log('\n========================================');
console.log('通过 ' + pass + ' / 失败 ' + fail);
if (fail > 0) { console.log('❌ 存在失败项'); process.exit(1); }
else { console.log('✅ ALL_LOGIC_OK'); process.exit(0); }
