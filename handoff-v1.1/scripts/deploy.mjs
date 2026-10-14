#!/usr/bin/env node
// 发布脚本（Cloudflare Pages）
// 用法: node scripts/deploy.mjs
//
// 前置环境变量（需自行在本地/CI 中设置，切勿写入代码或提交）：
//   CLOUDFLARE_API_TOKEN    具有 Pages 编辑权限的 API Token
//   CLOUDFLARE_ACCOUNT_ID   账户 ID
// 可选覆盖：
//   CF_PAGES_PROJECT  项目名（默认 peiliao）
//   CF_BRANCH         分支（默认 main）
//
// 说明：本项目无需构建，直接把 site/ 目录（含 peiliao.html 与 _redirects）部署为静态站点。

import { execSync } from 'node:child_process';

const token = process.env.CLOUDFLARE_API_TOKEN;
const account = process.env.CLOUDFLARE_ACCOUNT_ID;
if (!token || !account) {
  console.error('❌ 请先设置环境变量 CLOUDFLARE_API_TOKEN 与 CLOUDFLARE_ACCOUNT_ID');
  console.error('   本地示例(Windows PowerShell):');
  console.error('     $env:CLOUDFLARE_API_TOKEN="YOUR_CLOUDFLARE_API_TOKEN"; $env:CLOUDFLARE_ACCOUNT_ID="YOUR_CLOUDFLARE_ACCOUNT_ID"');
  console.error('   本地示例(macOS/Linux):');
  console.error('     export CLOUDFLARE_API_TOKEN=<你的token>; export CLOUDFLARE_ACCOUNT_ID=<你的账户id>');
  process.exit(2);
}

const project = process.env.CF_PAGES_PROJECT || 'peiliao';
const branch = process.env.CF_BRANCH || 'main';

console.log('🚀 开始部署到 Cloudflare Pages 项目: ' + project + ' (分支 ' + branch + ')');
try {
  execSync(
    `npx wrangler pages deploy site --project-name=${project} --branch=${branch}`,
    { stdio: 'inherit', env: { ...process.env } }
  );
} catch (e) {
  console.error('\n❌ 部署失败，请检查 Token 权限、账户 ID 与网络。');
  process.exit(1);
}

const url = `https://${project}.pages.dev`;
console.log('\n✅ 部署已提交。默认访问地址: ' + url);
console.log('   稍候 1-2 分钟生效后，运行健康检查:');
console.log('   node scripts/healthcheck.mjs ' + url);
