# Headpanel

🌐 现代化 Headscale 管理控制台

| 分类   | 技术栈                            |
| ------ | --------------------------------- |
| 框架   | Next.js 16                        |
| UI     | React 19, Tailwind CSS, shadcn/ui |
| 国际化 | next-intl                         |
| 数据   | SQLite, Drizzle ORM               |

## 功能

- **节点** —— 批准、拒绝、重命名、打标签、备注、删除，支持搜索与筛选。面板能读到
  Headscale 数据库时，还会在 tailnet IP 旁显示该节点的局域网地址。
- **子网路由** —— 批准或撤销节点宣告的网段；同一网段有多台宣告时，可以指定由哪台承载。
- **预授权密钥** —— 签发、置为过期、删除；每个密钥附带可直接粘贴到目标机器的安装命令。
- **分组** —— 一个组对应一个 Headscale user 和一个 ACL tag，组内节点只能互相访问。
  超级管理员可以切换到任一组的视角，看到的与该组管理员完全一致。
- **ACL 策略** —— 增删组是在基线文件之上合并，而不是整份替换，手写的规则不会丢。
- **审计日志** —— 记录面板上的每一次操作，可搜索、可筛选，并按操作性质分色。
- **概览** —— 在线节点、子网承载情况、待批准节点、有效密钥，以及最近 30 天的操作趋势。
- **中英双语。**

## 安装

### 环境要求

- Node.js 24
- pnpm
- 可访问的 Headscale 服务和 API key

### 配置

复制 `.env.example` 为 `.env.local`。远程/API-only 模式至少配置
`HEADSCALE_API_URL`、`HEADSCALE_API_KEY` 和面板自身的数据库、会话、管理员变量。
API URL 可以填写 Headscale 服务地址，也可以填写以 `/api/v1` 结尾的完整地址；
API key 始终只在服务端使用，不会发送到浏览器。

根路径部署保持 `HEADPANEL_BASE_PATH` 为空；挂载到子路径时填写例如 `/panel`。
该值会在构建期写入 Next.js 路由，因此修改后需要重新构建。

`HEADSCALE_HOST_CONTROL=false` 时，面板只使用 Headscale REST API，并隐藏需要
本机权限的网段设置。只有面板与 Headscale 同机部署且确实需要修改配置、重启服务时，
才将其设为 `true`，并填写 `HEADSCALE_CONFIG_PATH`、`HEADSCALE_BIN` 和
`SYSTEMCTL_BIN`。为兼容旧部署，未设置该开关但三个本机路径均已配置时仍会启用。

`HEADPANEL_POLICY_BASELINE` 指向面板合并组规则时所依据的 ACL 基线文件，默认
`/etc/headpanel/policy-baseline.json`。文件里的内容 —— 不归面板管理的 `tagOwners`、
`dst` 中的子网网段等 —— 会在每次增删组时重新写回。不配置该文件面板依然可用，但第一次
增删组就会把 policy 重写成只剩面板管理的那部分，手写规则会丢失。参见
[部署文档](docs/deployment.zh.md#acl-策略基线)。

`HEADSCALE_DB_PATH` 是可选项，只在面板与 Headscale 同机时有意义。Headscale 的 REST API
不返回节点的局域网地址，只能直接读它的 SQLite 才能拿到。未填写时依次回退到
`HEADSCALE_CONFIG_PATH` 中配置的路径和 `/var/lib/headscale/db.sqlite`；读不到就留空，
不影响其他功能。

`ADMIN_USERNAME` 和 `ADMIN_PASSWORD` 只在本地管理员表为空时使用，用于创建第一个超级管理员账号。

```bash
pnpm install
```

## 使用说明

### 开发

```bash
pnpm dev
```

### 构建

```bash
pnpm build
```

### 生产部署

完整教程：[部署 Headscale 与 Headpanel](docs/deployment.zh.md)。

生产部署脚本使用 systemd，运行时密钥不进入 Git。将 `.env.example` 安装到服务器上的
`/etc/headpanel/headpanel.env`，填写真实配置并设置权限为 `600`。环境文件值需要兼容
systemd `EnvironmentFile` 格式，包含空格或特殊字符时请使用双引号。

代码更新后，在服务器的项目目录运行：

```bash
git pull --ff-only origin main
sudo HEADPANEL_BIND_HOST=127.0.0.1 HEADPANEL_PORT=3000 \
  bash scripts/deploy-production.sh
```

可通过 `HEADPANEL_APP_DIR`、`HEADPANEL_ENV_FILE`、`HEADPANEL_SERVICE_NAME`、
`HEADPANEL_SERVICE_USER`、`HEADPANEL_BIND_HOST` 和 `HEADPANEL_PORT` 调整部署参数。
脚本会检查 Node.js 24、使用锁文件安装依赖、按 `HEADPANEL_BASE_PATH` 重新构建、更新
systemd 服务，并在重启后完成本机健康检查。反向代理及 TLS 由部署者自行配置。

查看服务状态和日志：

```bash
systemctl status headpanel
journalctl -u headpanel -f
```

## 使用许可

[MIT](https://opensource.org/licenses/MIT) © tlyboy
