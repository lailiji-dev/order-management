# 已替换项清单

本清单仅记录原相对路径、原行号、占位符类别和原因，不记录原始敏感值。原始项目保持不变。

## 已完成的明确敏感项替换

| 原相对位置 | 原行号 | 占位符风格 | 替换原因 |
| --- | --- | --- | --- |
| `DEPLOY.md` | 55 | `YOUR_CLOUDFLARE_ACCOUNT_ID` | 统一凭证配置示例的占位符风格 |
| `DEPLOY.md` | 54 | `YOUR_CLOUDFLARE_API_TOKEN` | 统一凭证配置示例的占位符风格 |
| `grill-order-display.md` | 25 | `YOUR_APP_DOMAIN` | 实际业务站点域名 |
| `handoff-v1.1/DEPLOY.md` | 55 | `YOUR_CLOUDFLARE_ACCOUNT_ID` | 统一凭证配置示例的占位符风格 |
| `handoff-v1.1/DEPLOY.md` | 54 | `YOUR_CLOUDFLARE_API_TOKEN` | 统一凭证配置示例的占位符风格 |
| `handoff-v1.1/scripts/deploy.mjs` | 21 | `YOUR_CLOUDFLARE_ACCOUNT_ID` | 统一凭证配置示例的占位符风格 |
| `handoff-v1.1/scripts/deploy.mjs` | 21 | `YOUR_CLOUDFLARE_API_TOKEN` | 统一凭证配置示例的占位符风格 |
| `panel-ssl-tutorial.md` | 63, 82 | `YOUR_SERVER_HOST` | 服务器地址或历史审计来源地址 |
| `scripts/Deploy-SecuredWebsite.ps1` | 1 | `YOUR_SSH_KEY` | 专用私钥文件引用 |
| `scripts/Initialize-SecurityCredentials.ps1` | 18 | `YOUR_APP_DOMAIN` | 实际业务站点域名 |
| `scripts/Initialize-SecurityCredentials.ps1` | 17 | `YOUR_SERVER_HOST` | 实际部署服务器地址 |
| `scripts/Initialize-SecurityCredentials.ps1` | 3 | `YOUR_SSH_KEY` | 专用私钥文件引用 |
| `scripts/backup-orders-upgrade.sh` | 4, 5, 9, 10, 13 | `YOUR_APP_DOMAIN` | 实际业务站点域名 |
| `scripts/check-panel-https.sh` | 6, 16 | `YOUR_SERVER_HOST` | 实际部署服务器地址 |
| `scripts/check-panel-https.sh` | 6, 16 | `/YOUR_PANEL_ENTRY` | 实际管理面板入口 |
| `scripts/deploy.mjs` | 21 | `YOUR_CLOUDFLARE_ACCOUNT_ID` | 统一凭证配置示例的占位符风格 |
| `scripts/deploy.mjs` | 21 | `YOUR_CLOUDFLARE_API_TOKEN` | 统一凭证配置示例的占位符风格 |
| `scripts/diagnose-panel-runtime.sh` | 12 | `YOUR_SERVER_HOST` | 实际部署服务器地址 |
| `scripts/diagnose-panel-runtime.sh` | 12 | `/YOUR_PANEL_ENTRY` | 实际管理面板入口 |
| `scripts/employee-password-release-preflight.sh` | 17 | `YOUR_APP_DOMAIN` | 实际业务站点域名 |
| `scripts/fix-api-proxy-cache.sh` | 3 | `YOUR_APP_DOMAIN` | 实际业务站点域名 |
| `scripts/inspect-panel-route.sh` | 6 | `YOUR_SERVER_HOST` | 实际部署服务器地址 |
| `scripts/inspect-panel-route.sh` | 6 | `/YOUR_PANEL_ENTRY` | 实际管理面板入口 |
| `scripts/inspect-security-deployment.sh` | 6, 8, 15, 16 | `YOUR_APP_DOMAIN` | 实际业务站点域名 |
| `scripts/inspect-v4-public-status.sh` | 5, 7 | `YOUR_APP_DOMAIN` | 实际业务站点域名 |
| `scripts/install-panel-ip-ssl.sh` | 5 | `YOUR_SERVER_HOST` | 实际部署服务器地址 |
| `scripts/install-panel-ip-ssl.sh` | 4 | `YOUR_EMAIL` | 个人账号邮箱 |
| `scripts/optimization-preflight.sh` | 26, 30, 33 | `YOUR_APP_DOMAIN` | 实际业务站点域名 |
| `scripts/panel-ip-challenge.sh` | 4, 11, 12, 29 | `YOUR_SERVER_HOST` | 实际部署服务器地址 |
| `scripts/panel-ssl-preflight.sh` | 23 | `YOUR_APP_DOMAIN` | 实际业务站点域名 |
| `scripts/panel-ssl-preflight.sh` | 23 | `YOUR_SERVER_HOST` | 实际部署服务器地址 |
| `scripts/panel-upgrade-compat.sh` | 45 | `/YOUR_PANEL_ENTRY` | 实际管理面板入口 |
| `scripts/panel-upgrade-login-code.sh` | 28 | `YOUR_SERVER_HOST` | 实际部署服务器地址 |
| `scripts/panel-upgrade-runtime-read.sh` | 25 | `/YOUR_PANEL_ENTRY` | 实际管理面板入口 |
| `scripts/prepare-server.sh` | 7, 8 | `YOUR_APP_DOMAIN` | 实际业务站点域名 |
| `scripts/prepare-shared-deploy.sh` | 3, 11, 12, 13 | `YOUR_APP_DOMAIN` | 实际业务站点域名 |
| `scripts/publish-client-recovery.sh` | 3 | `YOUR_APP_DOMAIN` | 实际业务站点域名 |
| `scripts/publish-optimized-v3.sh` | 5, 6, 108 | `YOUR_APP_DOMAIN` | 实际业务站点域名 |
| `scripts/publish-order-display.py` | 17 | `YOUR_APP_DOMAIN` | 实际业务站点域名 |
| `scripts/publish-orders-upgrade.sh` | 3, 15 | `YOUR_APP_DOMAIN` | 实际业务站点域名 |
| `scripts/publish-secured-v4.sh` | 6, 7, 8, 136 | `YOUR_APP_DOMAIN` | 实际业务站点域名 |
| `scripts/publish-server.sh` | 3, 13 | `YOUR_APP_DOMAIN` | 实际业务站点域名 |
| `scripts/publish-shared-deploy.sh` | 5, 6, 83 | `YOUR_APP_DOMAIN` | 实际业务站点域名 |
| `scripts/restore-live-reload.sh` | 18 | `YOUR_APP_DOMAIN` | 实际业务站点域名 |
| `scripts/rotate-approved-credentials.py` | 70 | `YOUR_APP_DOMAIN` | 实际业务站点域名 |
| `scripts/security-credential-transport.py` | 15 | `YOUR_SERVER_HOST` | 实际部署服务器地址 |
| `scripts/security-credential-transport.py` | 15 | `YOUR_SSH_KEY` | 专用私钥文件引用 |
| `scripts/security-independent-audit.sh` | 5, 19 | `YOUR_APP_DOMAIN` | 实际业务站点域名 |
| `scripts/security-maintenance-preflight.sh` | 23 | `YOUR_AUTHORIZED_KEYS_PATH` | 服务器 SSH 授权密钥路径 |
| `scripts/security-preflight.sh` | 48 | `YOUR_APP_DOMAIN` | 实际业务站点域名 |
| `scripts/shared-server-preflight.sh` | 8, 12 | `YOUR_APP_DOMAIN` | 实际业务站点域名 |
| `scripts/ssh_ops.py` | 22 | `YOUR_SERVER_HOST` | 实际部署服务器地址 |
| `scripts/verify-account-length-release.sh` | 11 | `YOUR_APP_DOMAIN` | 实际业务站点域名 |
| `scripts/verify-account-management-release.sh` | 10, 13 | `YOUR_APP_DOMAIN` | 实际业务站点域名 |
| `scripts/verify-employee-password-release.sh` | 16 | `YOUR_APP_DOMAIN` | 实际业务站点域名 |
| `scripts/verify-panel-ssl.sh` | 12 | `YOUR_APP_DOMAIN` | 实际业务站点域名 |
| `scripts/verify-panel-ssl.sh` | 8, 15 | `YOUR_SERVER_HOST` | 实际部署服务器地址 |
| `scripts/verify-public-security.py` | 63 | `YOUR_APP_DOMAIN` | 实际业务站点域名 |
| `scripts/verify-public-security.py` | 98 | `YOUR_SERVER_HOST` | 实际部署服务器地址 |
| `scripts/verify-renewal-and-isolation.sh` | 4, 9 | `YOUR_APP_DOMAIN` | 实际业务站点域名 |
| `scripts/verify-security-reboot.sh` | 48 | `YOUR_APP_DOMAIN` | 实际业务站点域名 |
| `scripts/verify-security-reboot.sh` | 55 | `YOUR_SERVER_HOST` | 实际部署服务器地址 |
| `scripts/verify-security-reboot.sh` | 48 | `YOUR_OTHER_SITE_DOMAIN` | 同一部署环境中的其他业务域名 |
| `scripts/verify-security-reboot.sh` | 55 | `/YOUR_PANEL_ENTRY` | 实际管理面板入口 |
| `scripts/wait-security-reboot.py` | 11 | `YOUR_SERVER_HOST` | 实际部署服务器地址 |
| `scripts/wait-security-reboot.py` | 11 | `YOUR_SSH_KEY` | 专用私钥文件引用 |
| `update-v2/server/app.py` | 455 | `YOUR_APP_DOMAIN` | 实际业务站点域名 |
| `update-v2/tests/connected-test.mjs` | 18 | `YOUR_APP_DOMAIN` | 实际业务站点域名 |
| `update-v2/tests/live-verify.py` | 10, 44 | `YOUR_APP_DOMAIN` | 实际业务站点域名 |
| `update-v2/tests/public-verify.py` | 7 | `YOUR_APP_DOMAIN` | 实际业务站点域名 |
| `update-v3/server/app.py` | 759 | `YOUR_APP_DOMAIN` | 实际业务站点域名 |
| `update-v3/tests/connected-test.mjs` | 17 | `YOUR_APP_DOMAIN` | 实际业务站点域名 |
| `update-v3/tests/frontend-connected-test.mjs` | 18 | `YOUR_APP_DOMAIN` | 实际业务站点域名 |
| `update-v3/tests/release-verify.py` | 11, 93 | `YOUR_APP_DOMAIN` | 实际业务站点域名 |
| `update-v4/server/app.py` | 1177 | `YOUR_APP_DOMAIN` | 实际业务站点域名 |
| `update-v4/server/peiliao-shared.conf` | 5 | `YOUR_APP_DOMAIN` | 实际业务站点域名 |
| `update-v4/server/proxy-api.conf` | 9 | `YOUR_APP_DOMAIN` | 实际业务站点域名 |
| `update-v4/tests/security-connected-test.mjs` | 19 | `YOUR_APP_DOMAIN` | 实际业务站点域名 |
| `上线记录.md` | 7, 8, 39 | `YOUR_APP_DOMAIN` | 实际业务站点域名 |
| `上线记录.md` | 18, 20, 31 | `YOUR_SERVER_HOST` | 实际部署服务器地址 |
| `上线记录.md` | 18 | `/YOUR_PANEL_ENTRY` | 实际管理面板入口 |
| `全面优化上线记录.md` | 3 | `YOUR_APP_DOMAIN` | 实际业务站点域名 |
| `安全评估与修复记录.md` | 3, 72 | `YOUR_APP_DOMAIN` | 实际业务站点域名 |
| `安全评估与修复记录.md` | 3 | `YOUR_SERVER_HOST` | 实际部署服务器地址 |
| `安全评估与修复记录.md` | 72 | `YOUR_OTHER_SITE_DOMAIN` | 同一部署环境中的其他业务域名 |
| `安全评估与修复记录.md` | 116 | `YOUR_LOCAL_PATH` | 个人电脑绝对路径 |
| `安全评估与修复记录.md` | 33 | `YOUR_AUDIT_SOURCE_IP` | 服务器地址或历史审计来源地址 |
| `订单v2上线说明.md` | 5, 7, 45, 49 | `YOUR_APP_DOMAIN` | 实际业务站点域名 |
| `订单模块升级记录.md` | 7, 44 | `YOUR_APP_DOMAIN` | 实际业务站点域名 |
| `订单模块升级记录.md` | 5 | `YOUR_LOCAL_PATH` | 个人电脑绝对路径 |

## 扫描及提交边界

- 完整复制后逐文件 SHA-256 校验通过，保留全部业务源码和历史版本源码；新仓库不继承原项目 Git 元数据。
- 已处理真实部署地址、业务域名、账号邮箱、个人绝对路径、私钥引用、管理面板入口和历史审计地址。
- 各 tests/ 内的明确虚构测试密码与手机号仅用于隔离测试，不是生产凭据或客户数据；127.0.0.1、localhost 和 0.0.0.0 为运行/监听地址。保留这些非敏感测试输入与功能常量。
- 日志、截图、浏览器记录、历史压缩包、依赖、构建产物和下载的第三方教程快照只保留在本机，由 .gitignore 排除；没有擅自删除原文件，也不会上传这些内容。
- GitHub Actions 配置中只包含 secrets 的变量引用，没有实际 Token 或账号 ID。
- Chrome 用户代理中的版本号不是服务器 IP 地址。
- 部署脚本中的 YOUR_* 为配置模板，使用前需自行配置。

## 已运行的验证

- 34 个 Python 源文件和当前前端脚本的语法检查通过。
- 16 项接口测试、32 项后端安全测试通过。
- 15 项界面检查、45 项前端安全检查、8 项重量单位检查通过。
- 原项目全部文件和 Git 元数据校验一致，均未改动。

## 发布配置

- 独立仓库：公开，首次提交，无原有提交历史。
- 通用作者：Project Maintainer / maintainer@example.invalid，仅设置在副本仓库中。
- 发布状态以实际 GitHub 推送和回读结果为准。
