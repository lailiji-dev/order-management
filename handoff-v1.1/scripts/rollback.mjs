#!/usr/bin/env node
// 回滚脚本（Cloudflare Pages）
// 用法:
//   列出部署记录: node scripts/rollback.mjs
//   回滚到指定版本: node scripts/rollback.mjs <deployment-id>
//
// 前置环境变量: CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID
// Cloudflare Pages 会保留每次部署的历史版本，回滚即把线上指向某个旧部署，
// 不会删除任何版本，可再次回滚，安全可逆。

import { execSync } from 'node:child_process';

const token = process.env.CLOUDFLARE_API_TOKEN;
const account = process.env.CLOUDFLARE_ACCOUNT_ID;
if (!token || !account) {
  console.error('❌ 请先设置环境变量 CLOUDFLARE_API_TOKEN 与 CLOUDFLARE_ACCOUNT_ID');
  process.exit(2);
}

const project = process.env.CF_PAGES_PROJECT || 'peiliao';
const id = process.argv[2];

if (!id) {
  console.log('📜 可用部署记录（最新在前）：\n');
  try {
    execSync(`npx wrangler pages deployment list --project-name=${project}`, { stdio: 'inherit', env: { ...process.env } });
  } catch (e) {
    process.exit(1);
  }
  console.log('\n🔁 回滚用法: node scripts/rollback.mjs <deployment-id>');
  process.exit(0);
}

console.log('🔁 正在回滚项目 ' + project + ' 到部署 ' + id + ' ...');
try {
  execSync(`npx wrangler pages deployment rollback ${id} --project-name=${project}`, {
    stdio: 'inherit',
    env: { ...process.env },
  });
} catch (e) {
  console.error('\n❌ 回滚失败，请确认 deployment-id 是否正确、Token 是否有权限。');
  process.exit(1);
}

const url = `https://${project}.pages.dev`;
console.log('\n✅ 已回滚。请运行健康检查确认:');
console.log('   node scripts/healthcheck.mjs ' + url);
