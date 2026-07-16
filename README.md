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

### Production deployment

The production script deploys with systemd while keeping runtime secrets out of
Git. Install `.env.example` as `/etc/headpanel/headpanel.env` on the server,
replace its values, and set its mode to `600`. Values must be compatible with
systemd's `EnvironmentFile` format; quote values that contain spaces or special
characters.

After updating a checkout, run this from the project directory:

```bash
git pull --ff-only origin main
sudo HEADPANEL_BIND_HOST=127.0.0.1 HEADPANEL_PORT=3000 \
  bash scripts/deploy-production.sh
```

Customize the deployment with `HEADPANEL_APP_DIR`, `HEADPANEL_ENV_FILE`,
`HEADPANEL_SERVICE_NAME`, `HEADPANEL_SERVICE_USER`, `HEADPANEL_BIND_HOST`, and
`HEADPANEL_PORT`. The script verifies Node.js 24, installs from the lockfile,
rebuilds for `HEADPANEL_BASE_PATH`, updates the systemd service, and performs a
local health check after restart. Reverse proxy and TLS configuration remain the
deployer's responsibility.

Inspect service state and logs with:

```bash
systemctl status headpanel
journalctl -u headpanel -f
```

## License

[MIT](https://opensource.org/licenses/MIT) © tlyboy
