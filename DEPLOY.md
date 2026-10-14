# 部署说明

部署包只包含站点、后端、配置模板和说明；不包含数据库、私钥、证书或实际密码。以下用于配置目标环境，不会自动连接原有服务器。

## 准备

1. 本机运行 `npm ci`、`npm run build`，上传 `dist/order-management.zip` 并解压到临时发布目录。
2. 目标 Linux 安装 Python 3.10+、支持 SSL 和 gzip_static 的 Nginx，以及 systemd。
3. 配置目标域名的 HTTPS 证书；将 `deploy/nginx.conf` 中 `YOUR_APP_DOMAIN`、`YOUR_CERTIFICATE_PATH` 和 `YOUR_PRIVATE_KEY_PATH` 换成目标环境的实际值。

模板使用固定安装目录 `/opt/order-management`、API 回环端口 `4188`、非登录服务用户 `peiliao`，便于沿用既有服务身份。若调整路径或用户，应同步修改两个服务文件和 Nginx 配置。

## 首次安装

以管理员身份创建非登录系统用户 `peiliao` 和以下目录：

| 目录 | 用途／权限 |
| --- | --- |
| `/opt/order-management/backend` | 部署包 `backend/`，root 拥有，服务用户可读 |
| `/opt/order-management/public` | 部署包 `site/`，root 拥有，Nginx 可读 |
| `/opt/order-management/config` | 部署包 `deploy/proxy.conf`，root 拥有，Nginx 可读 |
| `/opt/order-management/data` | `peiliao` 拥有，权限 `0700`，保存数据库 |
| `/opt/order-management/backups` | `peiliao` 拥有，权限 `0700`，保存备份 |

建立 `/etc/order-management.env`，仅 root 可读（`0600`），配置：

```ini
PEILIAO_ORIGIN=https://YOUR_APP_DOMAIN
PEILIAO_DB=/opt/order-management/data/peiliao.sqlite3
```

首次初始化另外加入 `PEILIAO_ADMIN_PASSWORD`，值为自行设置的强密码，至少 15 位。不要使用演示值，也不要提交此文件。已有数据库直接复用其账号；初始化完成后可从环境文件移除初始化密码。

将 `deploy/order-management.service`、`deploy/order-management-backup.service`、`deploy/order-management-backup.timer` 安装到 `/etc/systemd/system/`，然后运行：

```bash
systemctl daemon-reload
systemctl enable --now order-management.service order-management-backup.timer
curl --fail http://127.0.0.1:4188/api/health
```

后端只监听 `127.0.0.1:4188`，无需对外开放此端口；应用不使用 MySQL。

## Nginx

`deploy/nginx.conf` 是放在 `http {}` 内的完整站点模板，包含 HTTP 到 HTTPS 跳转、API 代理、安全响应头、静态文件白名单与缓存规则。将配置加入目标站点的 Nginx 配置树；在宝塔中应按其配置结构放置，先检查现有同名域名，避免重复添加监听或覆盖其他站点。

保持 `/opt/order-management/config/proxy.conf` 与模板包含路径一致。检查配置后再重载：

```bash
nginx -t
nginx -s reload
```

通过实际域名验证主页、`/admin.html`、`/api/health`、登录和订单保存。未登录的 `/api/state` 应返回 `401`；`.env`、源码及未知文件路由应返回 `404`。

## 升级与恢复

- 升级前保存当前站点、后端、环境与代理配置，并对现有数据库做一致性备份。备份工具：`python3 backend/backup.py DATABASE_PATH BACKUP_DIRECTORY`；压缩 SQL 备份仅服务用户可读，保留最近 14 份。
- 只替换 `backend/`、站点和已审核的配置；禁止用发布包覆盖 `data/` 或 `backups/`。更新站点时先复制指纹资源，再切换 HTML，保留服务器已有指纹资源供旧页面使用。
- 备份定时器每天按服务器本地时间约 03:00 运行；可按业务需要修改 timer。
- 从旧安装目录迁移时，停止旧 API 写入，复制 SQLite 一致性快照至新的数据目录，并核对账号、订单、权限与金额；不要为已有数据重新创建空数据库。
- 代码回滚和数据库恢复分别处理。上线后已有新订单时，不得直接覆盖为旧数据库；应先停止写入并核对、合并新增数据。

本仓库未执行实际服务器安装、证书配置或生产数据迁移。
