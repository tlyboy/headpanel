# Headscale 与 Headpanel 部署指南

本文介绍如何在一台 Debian/Ubuntu 服务器上部署 Headscale 和 Headpanel，并使用
Caddy 提供 HTTPS。示例使用以下占位符，请全部替换为自己的值：

- `headscale.example.com`：Headscale 控制服务域名
- `panel.example.com`：Headpanel 管理面板域名
- `/opt/headpanel`：Headpanel 代码目录

推荐为 Headscale 和 Headpanel 使用两个独立子域名。这样 Headscale 独占根路径，
Headpanel 也不需要设置 Next.js `basePath`。

## 1. 部署结构

```text
Tailscale 客户端 ──HTTPS──> Caddy ──> Headscale 127.0.0.1:8080
管理员浏览器   ──HTTPS──> Caddy ──> Headpanel  127.0.0.1:3000
                                      │
                                      └──REST API──> Headscale
```

本教程默认使用 API-only 模式：Headpanel 通过 Headscale REST API 管理节点、用户和
预授权密钥，不直接修改 Headscale 主机配置。只有确实需要在面板中修改 Headscale
网段并重启服务时，才启用主机控制模式。

### 环境要求

- Ubuntu 22.04+ 或 Debian 12+
- 一个可使用 `sudo` 的账号
- 两个已解析到服务器公网 IP 的域名
- 防火墙开放 TCP 80/443
- 若启用 Headscale 内置 DERP/STUN，按实际配置开放 UDP 3478

## 2. 安装 Headscale

Headscale 官方推荐 Debian/Ubuntu 使用发布页提供的 DEB 包。先在
[Headscale Releases](https://github.com/juanfont/headscale/releases) 找到稳定版本，版本号填写时不要带 `v`：

```bash
HEADSCALE_VERSION="<VERSION_WITHOUT_V>"
HEADSCALE_ARCH="$(dpkg --print-architecture)"

curl -fL -o /tmp/headscale.deb \
  "https://github.com/juanfont/headscale/releases/download/v${HEADSCALE_VERSION}/headscale_${HEADSCALE_VERSION}_linux_${HEADSCALE_ARCH}.deb"
sudo apt install /tmp/headscale.deb
```

DEB 包会安装 Headscale 用户、示例配置和 systemd 服务。不要用下面的片段覆盖完整配置；
请编辑包内提供的配置，并保留当前版本示例中的其他必需字段：

```bash
sudoedit /etc/headscale/config.yaml
```

确认或调整以下字段：

```yaml
server_url: https://headscale.example.com
listen_addr: 127.0.0.1:8080
metrics_listen_addr: 127.0.0.1:9090
grpc_listen_addr: 127.0.0.1:50443

trusted_proxies:
  - 127.0.0.1/32
  - ::1/128

# TLS 由 Caddy 终止
tls_cert_path: ''
tls_key_path: ''
```

包内最新完整示例通常位于：

```text
/usr/share/doc/headscale/examples/config-example.yaml
```

启动并检查 Headscale：

```bash
sudo systemctl enable --now headscale
sudo systemctl status headscale --no-pager
curl -fsS http://127.0.0.1:8080/health
```

当 `server_url` 是 HTTPS、Headscale 自身未配置证书时，日志可能提示正在无 TLS 监听；
如果 TLS 确实由 Caddy 终止，这是预期行为。

## 3. 创建 Headscale API key

Headpanel 需要 Headscale API key。API key 默认有效期由当前 Headscale 版本决定；
生成后只显示一次，请立即保存到密码管理器：

```bash
sudo headscale apikeys create
```

先在本机验证 key。不要把真实 key 写入 shell 历史，可临时交互读取：

```bash
read -rsp "Headscale API key: " HEADSCALE_API_KEY
echo
curl -fsS \
  -H "Authorization: Bearer ${HEADSCALE_API_KEY}" \
  http://127.0.0.1:8080/api/v1/user
unset HEADSCALE_API_KEY
```

管理 API key：

```bash
sudo headscale apikeys list
sudo headscale apikeys expire --prefix <KEY_PREFIX>
```

## 4. 安装 Node.js 24 和 Headpanel

Headpanel 需要 Node.js 24，并通过项目锁定的 pnpm 版本构建。下面使用 fnm 安装到
root 账号；也可以使用系统包或其他 Node.js 版本管理器，只要 root 运行部署脚本时能找到
Node.js 24 和 Corepack。

```bash
sudo -i
curl -fsSL https://fnm.vercel.app/install | bash
export PATH="/root/.local/share/fnm:$PATH"
eval "$(fnm env --shell bash)"
fnm install 24
fnm use 24
corepack enable pnpm
node --version
pnpm --version
exit
```

克隆项目并创建外置配置、数据目录：

```bash
sudo git clone https://github.com/tlyboy/headpanel.git /opt/headpanel
sudo install -d -m 700 /etc/headpanel /var/lib/headpanel
sudo install -m 600 /opt/headpanel/.env.example /etc/headpanel/headpanel.env
```

生成面板会话密钥和初始管理员密码：

```bash
openssl rand -hex 32
openssl rand -hex 16
```

编辑运行时环境文件：

```bash
sudoedit /etc/headpanel/headpanel.env
```

同机、独立子域名、API-only 模式的推荐配置：

```dotenv
NODE_ENV=production
DATABASE_URL=file:/var/lib/headpanel/headpanel.db
SESSION_SECRET=<OPENSSL_生成的_64位十六进制字符串>
ADMIN_USERNAME=admin
ADMIN_PASSWORD=<OPENSSL_生成的_32位十六进制字符串>

HEADSCALE_API_URL=http://127.0.0.1:8080
HEADSCALE_API_KEY=<HEADSCALE_API_KEY>

# 独立 panel.example.com 使用根路径，保持为空
HEADPANEL_BASE_PATH=

HEADSCALE_HOST_CONTROL=false
HEADSCALE_CONFIG_PATH=
HEADSCALE_BIN=
SYSTEMCTL_BIN=
```

确保只有 root 可以读取：

```bash
sudo chmod 600 /etc/headpanel/headpanel.env
```

构建、安装 systemd 服务并执行本机健康检查：

```bash
cd /opt/headpanel
sudo HEADPANEL_APP_DIR=/opt/headpanel \
  HEADPANEL_BIND_HOST=127.0.0.1 \
  HEADPANEL_PORT=3000 \
  bash scripts/deploy-production.sh
```

检查服务：

```bash
sudo systemctl status headpanel --no-pager
curl -fsSL http://127.0.0.1:3000/login >/dev/null
```

### 可选：启用同机主机控制

主机控制允许面板修改 `/etc/headscale/config.yaml` 并执行 `systemctl restart headscale`，
权限明显高于 API-only 模式。只有确实需要“网段设置”功能时才启用：

```dotenv
HEADSCALE_HOST_CONTROL=true
HEADSCALE_CONFIG_PATH=/etc/headscale/config.yaml
HEADSCALE_BIN=/usr/bin/headscale
SYSTEMCTL_BIN=/usr/bin/systemctl
```

当前部署脚本默认以 root 运行面板服务，能满足这些本机操作。远程部署的面板应保持
`HEADSCALE_HOST_CONTROL=false`。

## 5. 配置 Caddy 与 HTTPS（推荐）

Caddy 会自动申请、续期 TLS 证书，并原生支持反向代理升级连接。使用官方 Debian/Ubuntu
软件源安装稳定版：

```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
  | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
  | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo chmod o+r /usr/share/keyrings/caddy-stable-archive-keyring.gpg
sudo chmod o+r /etc/apt/sources.list.d/caddy-stable.list
sudo apt update
sudo apt install caddy
```

编辑 Caddyfile：

```bash
sudoedit /etc/caddy/Caddyfile
```

独立子域名的推荐配置：

```caddyfile
http://headscale.example.com {
  # Tailscale captive portal detection
  handle /generate_204 {
    respond 204
  }

  handle * {
    redir https://{host}{uri}
  }
}

headscale.example.com {
  reverse_proxy 127.0.0.1:8080 {
    header_up True-Client-IP {remote_host}
    header_up X-Real-IP {remote_host}
  }
}

panel.example.com {
  reverse_proxy 127.0.0.1:3000
}
```

格式化、校验并平滑加载：

```bash
sudo caddy fmt --overwrite /etc/caddy/Caddyfile
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
sudo systemctl status caddy --no-pager
```

只要域名已经解析到服务器并且 TCP 80/443 可访问，Caddy 会自动获取公开受信任的证书。

验证公网入口：

```bash
curl -fsS https://headscale.example.com/health
curl -IL https://panel.example.com/login
```

Headscale 使用自定义的 Tailscale Control Protocol。Caddy `reverse_proxy` 支持升级连接，
上面的 Headscale 配置来自官方 Caddy 示例。不要把 Headscale 放在 Cloudflare 橙云代理
或 Cloudflare Tunnel 后面。

### 可选：把面板挂载到 `/panel`

独立子域名更简单。如果必须使用 `https://headscale.example.com/panel`，先修改环境文件：

```dotenv
HEADPANEL_BASE_PATH=/panel
```

`HEADPANEL_BASE_PATH` 会在构建期写入 Next.js 路由，修改后必须重新执行部署脚本。将
Caddyfile 中两个独立 HTTPS 站点替换为：

```caddyfile
headscale.example.com {
  redir /panel /panel/ 308

  handle /panel/* {
    # 使用 handle 而不是 handle_path，保留 /panel 前缀
    reverse_proxy 127.0.0.1:3000
  }

  handle {
    reverse_proxy 127.0.0.1:8080 {
      header_up True-Client-IP {remote_host}
      header_up X-Real-IP {remote_host}
    }
  }
}
```

保留前面的 `http://headscale.example.com` 块，以便 `/generate_204` 返回 204 并将其他
HTTP 请求重定向到 HTTPS。

## 6. 首次登录与连接节点

访问 `https://panel.example.com/login`，使用环境文件中的 `ADMIN_USERNAME` 和
`ADMIN_PASSWORD` 登录。管理员只会在面板数据库为空时自动创建。

创建第一个 Headscale 用户：

```bash
sudo headscale users create alice
sudo headscale users list
```

在客户端安装 Tailscale 后发起注册：

```bash
sudo tailscale up --login-server https://headscale.example.com
```

终端或浏览器会显示 Auth ID，在服务器审批：

```bash
sudo headscale auth register --user alice --auth-id <AUTH_ID>
sudo headscale nodes list
```

也可以在 Headpanel 中创建预授权密钥，并使用面板生成的安装命令连接节点。

## 7. 更新与备份

### 更新 Headpanel

```bash
cd /opt/headpanel
sudo git pull --ff-only origin main
sudo HEADPANEL_APP_DIR=/opt/headpanel \
  HEADPANEL_BIND_HOST=127.0.0.1 \
  HEADPANEL_PORT=3000 \
  bash scripts/deploy-production.sh
```

### 更新 Headscale

升级前备份配置和数据，然后安装目标版本的新 DEB 包。务必阅读对应版本的官方升级说明，
并将现有配置与新版本 `config-example.yaml` 对比：

```bash
sudo install -d -m 700 /var/backups/headscale
sudo cp -a /etc/headscale /var/backups/headscale/
sudo cp -a /var/lib/headscale /var/backups/headscale/
sudo apt install /tmp/headscale.deb
sudo systemctl restart headscale
```

### 建议备份内容

- `/etc/headscale/config.yaml`
- `/var/lib/headscale/`
- `/etc/headpanel/headpanel.env`
- `/var/lib/headpanel/headpanel.db`
- `/etc/caddy/Caddyfile` 和证书恢复方案

环境文件、API key 和 SQLite 数据库都不应提交到 Git。

## 8. 常见问题

### `GET /node -> 404`

Headscale REST API 前缀是 `/api/v1`。测试节点接口应使用：

```text
https://headscale.example.com/api/v1/node
```

`HEADSCALE_API_URL` 可以填写 `https://headscale.example.com`，也可以填写完整的
`https://headscale.example.com/api/v1`，不要填写以 `/node` 结尾的地址。

### API 返回 401 或 403

- 重新执行 `headscale apikeys list` 检查 key 是否过期。
- 确认 API key 没有多余引号、空格或换行。
- 使用 Bearer 请求直接测试 `/api/v1/user`。
- API key 丢失后无法重新读取，应使旧 key 过期并创建新 key。

### 面板返回 502

```bash
sudo systemctl status headpanel --no-pager
sudo journalctl -u headpanel -n 100 --no-pager
curl -IL http://127.0.0.1:3000/login
```

重点检查 Node.js 是否为 24、环境文件权限、`HEADPANEL_BASE_PATH` 是否与代理路径一致，
以及修改 basePath 后是否重新构建。

### Headscale 客户端无法连接

```bash
sudo systemctl status headscale --no-pager
sudo journalctl -u headscale -n 100 --no-pager
curl -fsS https://headscale.example.com/health
```

同时检查 Caddy 日志，并确认请求没有经过不支持 Tailscale Control Protocol POST 升级的
CDN 代理：

```bash
sudo journalctl -u caddy -n 100 --no-pager
```

### 组管理列表为空

Headpanel 的“组”是面板本地的权限映射，不会自动把所有 Headscale 用户导入为组。
先在 Headscale 创建用户，再在 Headpanel 的组管理页面创建对应组。

## 9. 官方参考

- [Headscale 官方安装](https://headscale.net/stable/setup/install/official/)
- [Headscale 配置参考](https://headscale.net/stable/ref/configuration/)
- [Headscale API](https://headscale.net/stable/ref/api/)
- [Headscale 反向代理](https://headscale.net/stable/ref/integration/reverse-proxy/)
- [Headscale 入门与节点注册](https://headscale.net/stable/usage/getting-started/)
- [Caddy 官方安装](https://caddyserver.com/docs/install)
- [Caddy reverse_proxy](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy)
