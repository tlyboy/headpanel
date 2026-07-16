# Headpanel

🌐 A modern Headscale admin console

| Category  | Stack                             |
| --------- | --------------------------------- |
| Framework | Next.js 16                        |
| UI        | React 19, Tailwind CSS, shadcn/ui |
| I18n      | next-intl                         |
| Data      | SQLite, Drizzle ORM               |

## Install

### Requirements

- Node.js 24
- pnpm
- A reachable Headscale server and API key

### Configuration

Copy `.env.example` to `.env.local`. Remote/API-only mode requires
`HEADSCALE_API_URL`, `HEADSCALE_API_KEY`, and the panel's database, session,
and administrator variables. The API URL may be the Headscale server URL or a
full URL ending in `/api/v1`. The API key remains server-only and is never sent
to the browser.

Leave `HEADPANEL_BASE_PATH` empty for a root deployment, or set it to a subpath
such as `/panel`. This value is compiled into Next.js routing, so changing it
requires a rebuild.

With `HEADSCALE_HOST_CONTROL=false`, Headpanel uses only the Headscale REST API
and hides network settings that require host access. Set it to `true` only when
Headpanel runs on the Headscale host and should edit its configuration and
restart its service; then also set `HEADSCALE_CONFIG_PATH`, `HEADSCALE_BIN`, and
`SYSTEMCTL_BIN`. For compatibility, an unset switch is treated as enabled when
all three host paths are configured.

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
