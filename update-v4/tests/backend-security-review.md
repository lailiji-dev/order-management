# 后端安全评估与修复

评估对象为 `update-v3/server/app.py`，修复版本为 `update-v4/server/app.py`、`backup.py`。所有攻击载荷与账户测试仅运行在隔离临时 SQLite 数据库，不向生产库写入测试订单或账户。服务器端口、SSH、宝塔、系统补丁、服务 UID 及上线状态由主任务单独评估。

## 已确认问题

| 风险 | 原因与影响 | v4 修复 |
| --- | --- | --- |
| 登录限流绕过与并发计数丢失 | 限流身份为 IP+用户名组合，轮换用户名避开 IP 总量；先读后写可丢失并发失败计数 | 事务原子预留次数；每 IP 30 次、每账号 15 次/15 分钟；账号大小写归一计数；最多 5,000 条有效限制记录 |
| 弱密码策略 | 创建员工、重置、个人改密仅要求 7 位 | 新密码 15～200 位，接受长短语/Unicode/空格，拒绝明显弱模式和包含账号；现有密码不自动修改 |
| 账号枚举与密码计算耗尽 | 未知账号跳过密码计算；最多 32 请求线程均可进行昂贵校验 | 未知/停用账号同样校验；旧 300k 格式补齐计算量；独立密码计算池最多 2 并发，不占满所有 API 工作槽 |
| 个人改密可反复猜测当前密码 | 当前密码校验无独立失败次数限制 | 每账号 8 次/15 分钟；成功改密撤销其他设备会话，新增审计记录 |
| 并发凭证更新竞争 | 校验旧密码后直接更新，旧请求可能覆盖另一请求的新密码 | 密码更新使用旧哈希 CAS；登录计算后重新检查账号启用状态与当前哈希 |
| 会话明文保存在数据库/备份 | 只读泄漏可直接重放未过期 token | SQLite 保存 token 的 SHA-256；cookie 中仍为 256-bit 随机 token，存储哈希本身不能用于登录；单账号最多 20 个有效会话 |
| 请求边界不足 | 重复 JSON 键、过深/过多节点、lone surrogate、控制字符 ID 可造成歧义、500 或无法通过 UI 操作的记录；Python 3.6 超长整数字面量可在校验前占用 CPU | 重复键/深度>48/节点>100k/非法 Unicode/控制 ID 拒绝 400；整数字面量在 `int()` 转换前限 16 位并检查 JS 安全范围；导入 ID 在 SQL 绑定前验证；登录请求限 4KB，密码/员工操作限 8KB，业务同步/迁移仍限 4MB |
| 请求格式与错误处理 | JSON MIME 前缀匹配接受 jsonp，非 ASCII CSRF 可触发 TypeError，默认错误暴露 Python 版本 | 精确 JSON MIME，拒绝重复 Content-Length/Transfer-Encoding，CSRF 使用恒时 bytes 比较，错误统一 JSON，隐藏解释器 banner，URL/查询字段有界 |
| 响应与备份的敏感内容留存 | 条件响应 private/no-cache 可存入 HTTP 缓存；备份写完才 chmod | API private/no-store 仍支持手动 ETag/304；备份目录 0700，临时文件从创建起 0600 |

## 未发现可利用缺陷的已检查边界

- 所有数据库值查询使用参数绑定；搜索通配符作为字面内容处理，SQL 注入载荷不会改变查询结构。
- 未认证访问业务数据返回 401；员工请求后台和历史导入返回 403；禁用账号现有会话失效。
- 订单编号、创建者、角色、密码等不能通过普通订单载荷覆盖；公共用户字段白名单不返回密码哈希。
- POST 要求 CSRF token，校验 Origin，额外拒绝浏览器 `Sec-Fetch-Site: cross-site`；cookie 维持 Secure/HttpOnly/SameSite=Lax，无开放 CORS。
- XSS 的 HTML 输出与本地导入数据由前端安全任务检查；后端保存文本本身并不能证明前端输出安全。

## 数据与兼容性

- 数据库 `user_version` 从 3 升级为 4，唯一有意变更为 `sessions.token` 哈希。业务状态、编号计数、用户身份/现有密码、订单创建者、审计及迁移记录不改变。
- 旧 cookie 可透明验证，SQL dump 恢复缺失 `user_version` 时也不会重复哈希。仍支持 v2 文档库升级与 Python 3.6/SQLite 3.26。
- 新密码使用带算法/次数标记的 PBKDF2-HMAC-SHA256 600,000 次，旧盐:摘要 300,000 次可继续验证。现有弱/已公开密码须由主任务执行轮换，不能仅靠新建密码策略消除。
- **回滚须同时恢复原版代码与数据库备份**：v3 不识别 v4 会话哈希。

## 验证

本机完整 14 项业务回归和 18 项安全回归通过。安全回归覆盖 10,000 位正负整数字面量在调用 `int()` 前拒绝，以及 JS 安全整数上下边界。目标服务器 Python 3.6/SQLite 3.26 运行、生产数据校验与上线结果由主任务记录，不能把本机通过当作已上线。

运行：`python update-v4/tests/api-test.py` 与 `python update-v4/tests/security-api-test.py`。这两个文件名含连字符，请直接运行脚本，避免 unittest discover 将其跳过。

参考：[OWASP Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)、[OWASP Password Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)、[OWASP Session Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)。这些指导支持长密码、账号限流、通用认证错误、密码哈希与会话标识保护；本次结果仅代表检查覆盖范围，不是无漏洞保证。
