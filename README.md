# 订单管理

食品生产订单管理与配比计算系统。原生 HTML、CSS、JavaScript 前端通过同源 API 使用 Python 和 SQLite 共享保存数据。

支持今日／明日／全部订单、手机号码搜索、取货筛选、早取置顶、手动唯一订单号、整数定金、员工账号与后台单价设置。配比计算按斤显示并受员工权限控制，生产汇总只读。

## 环境

- Python 3.10+；后端运行不需要第三方 Python 包。
- Node.js 24+ 和 npm，仅用于构建前端。
- 生产部署使用 Nginx、HTTPS 和 systemd。

## 本地运行

在 PowerShell 7 中，首次启动前输入管理员密码（至少 15 位）：

```powershell
$env:PEILIAO_ADMIN_PASSWORD = Read-Host '首次管理员密码' -MaskInput
npm run dev
```

打开 `http://127.0.0.1:43500`，管理员账号为 `root`。数据库保存在 `.local/data/peiliao.sqlite3`；重启保留已有订单和账号，已有数据库无需再次提供初始化密码。本地服务仅监听回环地址，不用于公网部署。

Linux 可运行 `python3 scripts/serve.py`，先通过 `PEILIAO_ADMIN_PASSWORD` 环境变量提供初始化密码。

## 构建

```powershell
npm ci
npm run build
npm run preview
```

构建生成 `dist/site/` 和 `dist/order-management.zip`。资源经过压缩、内容指纹和 gzip 处理；同一源码重复构建产生相同内容，旧构建文件自动清理。Linux 也可直接运行 `python3 scripts/build.py`。

## 目录

| 目录／文件 | 内容 |
| --- | --- |
| `frontend/` | 唯一一套前端源码，包含用户端和管理员后台 |
| `backend/` | 共享 API、SQLite 备份和产品种子数据 |
| `scripts/` | 统一构建打包入口和本地同源运行入口 |
| `deploy/` | Nginx、API 服务和定时备份配置模板 |
| `.env.example` | 环境变量名称及占位示例 |
| `DEPLOY.md` | 生产部署、升级和恢复说明 |
| `SANITIZATION-REPORT.md` | 保留源码的脱敏说明 |

前端页面与后台通过同一个 API 管理订单和账号。管理员后台为 `/admin.html`；旧 `/peiliao.html` 地址由生成的兼容入口继续支持。数据库、密钥、本地配置、依赖和构建产物均不提交到 Git。

生产部署见 [DEPLOY.md](DEPLOY.md)。此仓库为已有系统的脱敏副本，未设置新的开源许可。
