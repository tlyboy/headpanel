# Headpanel

🌐 A modern Headscale admin console

| Category  | Stack                             |
| --------- | --------------------------------- |
| Framework | Next.js 16                        |
| UI        | React 19, Tailwind CSS, shadcn/ui |
| I18n      | next-intl                         |
| Data      | SQLite, Drizzle ORM               |

- **Nodes** — approve, reject, rename, tag, annotate and delete, with search and
  filters. Each node's LAN address is shown next to its tailnet IP when the panel
  can read Headscale's database.
- **Subnet routes** — approve or revoke advertised routes, and choose which node
  serves a prefix when several advertise the same one.
- **Pre-auth keys** — issue, expire and delete keys; each comes with a
  ready-to-paste install command for the target machine.
- **Groups** — a group maps to one Headscale user and one ACL tag, so its nodes
  only reach each other. A super admin can switch into any group's view to see
  exactly what that group's operator sees.
- **ACL policy** — creating or deleting a group edits the policy through a
  baseline file rather than replacing it, so rules you wrote by hand survive.
- **Audit log** — every panel action, searchable, filterable and banded by what
  the action does.
- **Overview** — online nodes, subnet coverage, pending approvals and valid keys,
  over 30 days of activity.
- **English and 简体中文.**

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

`HEADPANEL_POLICY_BASELINE` points at the ACL policy the panel merges group
rules into, `/etc/headpanel/policy-baseline.json` by default. Whatever it holds —
`tagOwners` for tags the panel doesn't manage, subnet CIDRs in `dst` — is
re-applied every time a group is created or deleted. Without the file the panel
still runs, but the first group change rewrites the policy with only the rules
the panel manages, dropping hand-written ones. See
[the deployment guide](docs/deployment.md#acl-policy-baseline).

`HEADSCALE_DB_PATH` is optional and only useful when the panel runs on the
Headscale host. Headscale's REST API does not expose a node's LAN address, so
reading its SQLite directly is the only way to show one. It falls back to the
path in `HEADSCALE_CONFIG_PATH`, then to `/var/lib/headscale/db.sqlite`; if the
file can't be read those columns are simply left empty.

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

Complete guide: [Deploy Headscale and Headpanel](docs/deployment.md).

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
