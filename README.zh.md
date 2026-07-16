# Headpanel

🌐 现代化 Headscale 管理控制台

| 分类   | 技术栈                            |
| ------ | --------------------------------- |
| 框架   | Next.js 16                        |
| UI     | React 19, Tailwind CSS, shadcn/ui |
| 国际化 | next-intl                         |
| 数据   | SQLite, Drizzle ORM               |

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

## 使用许可

[MIT](https://opensource.org/licenses/MIT) © Headpanel contributors
