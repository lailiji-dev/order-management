#!/usr/bin/env node
// 健康检查脚本
// 用法: node scripts/healthcheck.mjs <url>
// 示例: node scripts/healthcheck.mjs https://peiliao.pages.dev
// 退出码: 0=全部通过, 1=存在失败项, 2=参数缺失
//
// 检查项覆盖静态站点可运行性的关键信号：
//   1) HTTP 状态 200
//   2) Content-Type 为 text/html（防止被当附件下载）
//   3) 页面标题/关键文案存在（确认部署的是正确版本）
//   4) 主交互入口存在（计算按钮）
//   5) 本地存储 key 存在（确认业务逻辑脚本已加载）

import { execSync } from 'node:child_process';

const url = process.argv[2] || process.env.DEPLOY_URL;
if (!url) {
  console.error('用法: node scripts/healthcheck.mjs <url>');
  process.exit(2);
}

let res, html;
try {
  res = await fetch(url, { redirect: 'follow' });
  html = await res.text();
} catch (e) {
  console.error('❌ 无法访问 ' + url + ' ：' + e.message);
  process.exit(1);
}

const ct = res.headers.get('content-type') || '';
const checks = {
  'HTTP 状态码为 200': res.status === 200,
  'Content-Type 含 text/html': /text\/html/i.test(ct),
  '页面标题含「生产配料计算系统」': html.includes('生产配料计算系统'),
  '主按钮「计算今日配料」存在': html.includes('计算今日配料'),
  '统一数据层 (food_factory_app_data_v1) 已加载': html.includes('food_factory_app_data_v1'),
};

let pass = true;
console.log('健康检查目标: ' + url + '\n');
for (const [name, ok] of Object.entries(checks)) {
  console.log((ok ? '  ✅ ' : '  ❌ ') + name);
  if (!ok) pass = false;
}
console.log('\n状态码: ' + res.status + ' | Content-Type: ' + ct + ' | 响应大小: ' + html.length + ' bytes');

process.exit(pass ? 0 : 1);
