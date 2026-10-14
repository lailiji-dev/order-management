# 生产订单与配比计算系统

食品生产场景的订单管理和配比计算系统。前端采用原生 HTML、CSS、JavaScript；共享订单、员工账号与权限由 Python API 和 SQLite 提供。

当前维护版本为 `update-v4/`。历史版本源码仍保留，用于兼容性验证和理解升级过程。

## 功能

- 今日、明日、全部订单与手机号码搜索，取货状态筛选和早取置顶。
- 手动唯一订单号、选填客户信息、整数定金和产品价格快照。
- 员工独立账号、管理员后台、员工管理与单价配置。
- 配比计算访问权限，重量统一按斤展示，并兼容历史重量数据。
- 只读生产汇总、操作记录、共享保存和本机备份兼容。

## 开发环境

- Node.js 24 或以上。
- Python 3.10 或以上用于本地开发和测试。部署端兼容性以项目中的目标环境验证脚本为准。
- npm。

安装依赖：

```powershell
npm install
```

## 本地预览

运行隔离预览环境：

```powershell
npm run build:secured
npm run dev
```

打开 `http://127.0.0.1:43500`。该预览使用临时数据库和代码中明确标识的测试账号，与生产环境分离；测试账号配置见 `update-v4/tests/qa-server.py`。关闭预览服务后临时数据库会被清理。

## 运行共享 API

首次初始化需要通过环境变量提供管理员密码。以下均为占位示例，运行前自行配置：

```powershell
$env:PEILIAO_ADMIN_PASSWORD = 'YOUR_ADMIN_PASSWORD'
python update-v4/server/app.py --data .local/peiliao.sqlite3 --seed update-v4/server/seed.json --port 4188
```

正式环境应使用独立的持久数据目录和 HTTPS 反向代理，将静态站点与 `/api/` 置于同一来源。密码从环境或本地私有配置传入，数据库、密钥和本地配置不应提交到 Git。

## 验证

```powershell
npm run test:api
npm run test:security
npm run test:ui
npm run test:frontend-security
npm run test:connected
node update-v4/tests/jin-calculation-test.mjs
```

浏览器预览和自动测试使用隔离数据，不应向生产数据库写入测试订单。

## 构建与部署模板

```powershell
npm run build:secured
```

构建输出位于 `update-v4/release-site/`，打包文件为 `update-v4/secured-v4.zip`。这些可重新生成的产物已被 `.gitignore` 排除。

`scripts/` 中保留部署、检查和备份工具的源码；`update-v4/server/` 中保留服务与反向代理配置模板。实际主机、业务域名、私钥引用和个人路径已经使用 `YOUR_SERVER_HOST`、`YOUR_APP_DOMAIN`、`YOUR_SSH_KEY`、`YOUR_LOCAL_PATH` 等占位符替代。使用部署工具之前应审阅并配置这些占位项，不可直接照搬到现有业务服务器。

SSH 工具需要 Paramiko，可选安装：

```powershell
python -m pip install paramiko
```

## 目录

| 路径 | 用途 |
| --- | --- |
| `update-v4/site/` | 当前版本前端源码 |
| `update-v4/server/` | API、种子数据和部署配置模板 |
| `update-v4/tests/` | 当前版本测试、构建及隔离预览工具 |
| `update-v1.1/`、`update-v2/`、`update-v3/` | 历史版本源码和兼容性测试 |
| `site/`、`baota-site/` | 保留的静态站点源码副本 |
| `handoff-v1.1/` | 历史交付源码 |
| `scripts/` | 运维与发布工具模板 |
| `SANITIZATION-REPORT.md` | 原相对位置、占位符及替换原因清单 |

本仓库不包含实际部署凭证、生产数据库或原项目 Git 历史。首次提交采用通用作者信息，未设置新的开源许可。
