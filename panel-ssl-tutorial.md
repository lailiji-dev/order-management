---
title: "使用 acme.sh 为宝塔面板配置免费 IP HTTPS 证书（面板 SSL）"
description: "完整教程：在 Linux 服务器上通过 acme.sh 为宝塔面板申请与续签基于 IP 地址（无需域名）的免费 HTTPS 证书，并自动写入面板 SSL 配置，全面提升面板登录链路的安全性。"
---

> Documentation Index
> Fetch the complete documentation index at: https://docs.bt.cn/llms.txt
> Use this file to discover all available pages before exploring further.

# 使用 acme.sh 为宝塔面板配置免费 IP HTTPS 证书（面板 SSL）

长期以来，宝塔面板自身提供的 HTTPS 访问默认使用的是自签名证书。这种证书虽然可以实现加密传输，但由于并未被浏览器和操作系统的信任根所收录，在访问面板时通常会出现「证书不受信任」「连接不安全」等安全提示，需要手动确认后才能继续访问。在实际运维场景中，这类提示比较影响使用体验，随着 Let’s Encrypt 正式支持免费 IP HTTPS 证书，即使不具备域名条件，也可以为基于 IP 访问的服务签发浏览器可信的证书。这使得为宝塔面板本身配置一个受信任的 HTTPS 证书成为可能。

本文将介绍如何通过 acme.sh 为宝塔面板自动申请并部署 免费的 IP HTTPS 证书，替换默认的自签名证书，从而实现浏览器可信的面板 HTTPS 访问。

:::warning 注意
- Let’s Encrypt申请的 IP 证书有效期最长仅有 160 小时，具体请参考 [Let’s Encrypt 官方说明](https://letsencrypt.org/2025/07/01/issuing-our-first-ip-address-certificate)
- 面板后期也会支持从面板直接申请Let’s Encrypt IP 证书，敬请期待。如您动手能力较差，建议等待官方功能发布
:::

## 操作步骤
### 安装 acme.sh
1. 通过 SSH 或面板终端登录到您的服务器，执行以下命令安装 acme.sh：

```bash
curl https://get.acme.sh | sh -s email=my@example.com
```
请将 `my@example.com` 替换为您的真实邮箱地址。

2. 安装完成后，执行以下命令使 acme.sh 生效，也可重新进入终端使其生效：

```bash
source ~/.bashrc
```
![使 acme.sh 生效](/img/practical-tutorials/acme-sh-panel-ssl/acme-sh-source.png)

3. 执行以下命令，确认 acme.sh 安装成功，预期可以看到版本号输出：

```bash
acme.sh --version
```
![确认 acme.sh 安装成功](/img/practical-tutorials/acme-sh-panel-ssl/acme-sh-version.png)

4. 执行以下命令，切换 acme.sh 默认 的 CA 为 Let’s Encrypt：

```bash
acme.sh --set-default-ca --server letsencrypt
```

5. 至此，acme.sh 安装完成。

### 申请 IP 证书
1. 在宝塔面板中创建一个新的站点，域名填写服务器的公网 IP 地址，其他选项根据需要配置，完成后点击【确定】。
![创建 IP 站点](/img/practical-tutorials/acme-sh-panel-ssl/create-ip-site.png)

2. 在终端中执行以下命令，使用 acme.sh 申请 IP 证书，请将 `YOUR_IP_ADDRESS` 替换为您的服务器公网 IP 地址：

```bash
acme.sh --issue --cert-profile shortlived --days 3 -d YOUR_IP_ADDRESS --webroot /www/wwwroot/YOUR_IP_ADDRESS/
```
例如：
```bash
acme.sh --issue --cert-profile shortlived --days 3 -d YOUR_SERVER_HOST --webroot /www/wwwroot/YOUR_SERVER_HOST/
```
![申请 IP 证书](/img/practical-tutorials/acme-sh-panel-ssl/issue-ip-cert.png)

3. 申请成功后，执行以下命令为面板部署SSL证书:

:::warning 注意
请使用独立的 SSH 终端窗口执行以下命令，不要使用面板终端，否则面板会因重启而中断当前操作。
:::

```bash
acme.sh --install-cert -d YOUR_IP_ADDRESS \
--key-file /www/server/panel/ssl/privateKey.pem \
--fullchain-file /www/server/panel/ssl/certificate.pem \
--reloadcmd "service bt restart"
```
请将 `YOUR_IP_ADDRESS` 替换为您的服务器公网 IP 地址，例如：

```bash
acme.sh --install-cert -d YOUR_SERVER_HOST \
--key-file /www/server/panel/ssl/privateKey.pem \
--fullchain-file /www/server/panel/ssl/certificate.pem \
--reloadcmd "service bt restart"
```

:::info 提示
- 使用前述命令前请确保已经在面板设置中开启了面板 SSL 功能（新安装面板通常已经默认开启），[如何开启宝塔面板 SSL 功能？](/user-guide/config/common/panel-ssl)
- `--reloadcmd "service bt restart"` 参数用于在证书更新后自动重启宝塔面板服务，使新证书生效。
:::

![部署 IP 证书到面板](/img/practical-tutorials/acme-sh-panel-ssl/install-ip-cert.png)

4. 至此，IP 证书已成功部署到宝塔面板，效果如下图所示：
![面板 SSL 证书部署成功](/img/practical-tutorials/acme-sh-panel-ssl/panel-ssl-success.png)

Source: https://docs.bt.cn/practical-tutorials/acme-sh-panel-ssl/index.mdx

