# Headpanel

🌐 A modern Headscale admin console

| Category | Stack |
| --- | --- |
| Framework | Next.js 16 |
| UI | React 19, Tailwind CSS, shadcn/ui |
| I18n | next-intl |
| Data | SQLite, Drizzle ORM |

## Install

### Requirements

- Node.js 24
- pnpm
- A reachable Headscale server and API key

### Configuration

Copy `.env.example` to `.env.local` and fill every value explicitly. Headpanel does not provide runtime defaults for deployment-specific settings.

`ADMIN_USERNAME` and `ADMIN_PASSWORD` are used only when the local admin table is empty, to create the first super admin account.

```bash
pnpm install
```

## Usage

### Development

```bash
pnpm dev
```

### Build

```bash
pnpm build
```

## License

[MIT](https://opensource.org/licenses/MIT) © Headpanel contributors
