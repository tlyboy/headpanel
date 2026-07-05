# Headpanel

🌐 现代化 Headscale 管理控制台

| 分类 | 技术栈 |
| --- | --- |
| 框架 | Next.js 16 |
| UI | React 19, Tailwind CSS, shadcn/ui |
| 国际化 | next-intl |
| 数据 | SQLite, Drizzle ORM |

## 安装

### 环境要求

- Node.js 24
- pnpm
- 可访问的 Headscale 服务和 API key

### 配置

复制 `.env.example` 为 `.env.local`，并显式填写所有值。Headpanel 不为部署相关配置提供运行时默认值。

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
