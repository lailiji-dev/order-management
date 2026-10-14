# 生产配料计算系统 · 部署与上线指南（Cloudflare Pages）

> 项目类型：**纯静态单页应用**，技术栈为原生 HTML + CSS + JavaScript，全部代码在单个文件 `peiliao.html` 中。
> 无后端、无数据库、无构建步骤。部署本质 = 把 `peiliao.html` 托管到静态 CDN。
> 目标环境：**Cloudflare Pages**，使用平台默认域名（如 `https://peiliao.pages.dev`），暂未绑定自定义域名。
>
> ⚠️ **入口文件名说明**：静态站点的默认首页是 `index.html`，而本应用文件名为 `peiliao.html`。
> 已在站点目录 `site/_redirects` 把根路径 `/` 301 重定向到 `/peiliao.html`，
> 因此线上访问 `https://peiliao.pages.dev/` 会自动打开应用。本地双击 `site/peiliao.html` 不受影响。
> 站点需发布的文件统一放在 `site/` 目录（`pages_build_output_dir = "site"`）。

---

## 一、前置条件

| 项目 | 要求 |
| --- | --- |
| 账号 | 一个 Cloudflare 账号（免费版即可） |
| 运行时 | 本地 Node.js ≥ 18（用于 `wrangler` CLI） |
| 凭证 | `CLOUDFLARE_API_TOKEN`（需含 **Pages: Edit** 权限）<br>`CLOUDFLARE_ACCOUNT_ID`（账户 ID） |
| 网络 | 发布与回滚需可访问 Cloudflare |

> 凭证**绝不能**写入代码或提交到仓库。只在本地终端 / CI Secrets 中设置。

---

## 二、本地验证（发布前必做，无需凭证）

先确认页面在本地能正常被当作静态站点提供：

```bash
# 任选一种方式启动本地静态服务（在项目根目录）
npx serve .                 # 或
python -m http.server 4173  # 或
npm run dev                 # wrangler pages dev（需先 npm i）

# 另开一个终端运行健康检查（站点文件位于 site/peiliao.html）
node scripts/healthcheck.mjs http://127.0.0.1:4173/site/peiliao.html
```

健康检查会校验：HTTP 200、Content-Type 为 text/html、关键文案与脚本存在。全部 ✅ 即代表产物可运行。

---

## 三、正式部署（首次 / 日常更新）

### 方式 A：本地 CLI 直接发布（推荐，最简单）

```bash
npm i                                  # 安装 wrangler（已锁定版本 ^3.78.0）

# 设置凭证（仅当前终端会话有效）
# Windows PowerShell:
$env:CLOUDFLARE_API_TOKEN="YOUR_CLOUDFLARE_API_TOKEN"
$env:CLOUDFLARE_ACCOUNT_ID="YOUR_CLOUDFLARE_ACCOUNT_ID"
# macOS / Linux:
export CLOUDFLARE_API_TOKEN=<你的token>
export CLOUDFLARE_ACCOUNT_ID=<你的账户id>

npm run deploy         # 等价于 node scripts/deploy.mjs
```

发布成功后控制台会给出默认地址 `https://peiliao.pages.dev`，约 1–2 分钟全球生效。

### 方式 B：Git 仓库自动发布（适合团队协作）

1. 把本目录推送到 GitHub 仓库。
2. Cloudflare Pages 控制台「连接 Git 仓库」→ 选择该仓库。
3. 构建设置：**构建命令留空**、**输出目录填 `.`**（与 `wrangler.toml` 的 `pages_build_output_dir` 一致）。
4. 在仓库 **Settings → Secrets** 中添加 `CLOUDFLARE_API_TOKEN` 与 `CLOUDFLARE_ACCOUNT_ID`。
5. 此后每次 `git push` 到 `main` 即自动部署，并自动跑健康检查（见 `.github/workflows/deploy.yml`）。

---

## 四、上线后验证（Verification）

部署生效后，运行：

```bash
node scripts/healthcheck.mjs https://peiliao.pages.dev
```

人工抽检清单：
- [ ] 浏览器打开默认域名，标题显示「生产配料计算系统」。
- [ ] 底部导航「配比计算」高亮，点击「订单」显示「功能开发中」。
- [ ] 在任一产品输入数量 → 点「计算今日配料」→ 出现「今日产品配料明细」与「今日原料总需求」。
- [ ] 刷新页面后输入数据仍在（localStorage 已保存）。
- [ ] 手机浏览器打开，卡片式布局、分类可折叠、底部导航正常。
- [ ] 点「打印配料单」预览仅含生产信息。

---

## 五、健康检查机制

- 脚本：`scripts/healthcheck.mjs`
- 检查项：HTTP 200、Content-Type=text/html、标题/主按钮/存储逻辑关键字符串存在。
- 退出码：`0` 通过、`1` 失败、`2` 参数缺失，可直接接入 CI 或监控告警。
- CI：`.github/workflows/deploy.yml` 在每次部署后自动执行该检查。

---

## 六、回滚机制（Rollback）

Cloudflare Pages 保留每一次部署的历史版本，回滚**安全可逆**（不会删除任何版本）。

```bash
# 1) 设置凭证后，列出部署记录（最新在前），复制目标 deployment-id
npm run rollback

# 2) 回滚到指定版本
npm run rollback <deployment-id>
```

也可在 Cloudflare Pages 控制台 → 该项目 → **Deployments** 中点击某次部署 →「Rollback to this deployment」。

GitHub Actions 方式回滚：在仓库 Actions → Deploy 工作流 → 「Run workflow」→ 填入 `rollback_id` 即可。

---

## 七、发布检查清单（Go-Live Checklist）

- [ ] `npm run dev` + `healthcheck` 本地通过
- [ ] 已设置 `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID`（未硬编码）
- [ ] `npm run deploy` 成功，控制台给出默认域名
- [ ] `healthcheck <线上域名>` 全部 ✅
- [ ] 人工抽检通过（见第四节）
- [ ] 已知回滚命令可用

---

## 八、后续可选（本次未做）

- **自定义域名 + HTTPS**：在 Cloudflare Pages 控制台「Custom domains」添加你的域名，按提示配置 DNS（CNAME 到 `peiliao.pages.dev`），免费自动签发证书。
- **订单模块打通**：后续开发「订单」后，把订单数量写入同一份 `localStorage`（key `peiliao_data_v1` 的 `todayPlan`），配比计算即可自动读取。
- **访问控制**：当前为公开只读静态页，无需登录；若需限制车间访问，可叠加 Cloudflare Access（零信任）或自定义域名 + 基础鉴权。
