# Headscale and Headpanel Deployment Guide

This guide deploys Headscale and Headpanel on one Debian/Ubuntu server with
Caddy terminating HTTPS. Replace every example value, especially:

- `headscale.example.com`: the Headscale control-server domain
- `panel.example.com`: the Headpanel domain
- `/opt/headpanel`: the Headpanel checkout

Separate subdomains are recommended. They keep Headscale on the root path and
avoid compiling a Next.js `basePath` into Headpanel.

## 1. Architecture

```text
Tailscale clients ──HTTPS──> Caddy ──> Headscale 127.0.0.1:8080
Admin browser     ──HTTPS──> Caddy ──> Headpanel  127.0.0.1:3000
                                           │
                                           └──REST API──> Headscale
```

The default is API-only mode. Headpanel manages nodes, users, and pre-auth keys
through the Headscale REST API without editing host configuration. Enable host
control only if the panel must change Headscale network prefixes and restart the
service.

### Requirements

- Ubuntu 22.04+ or Debian 12+
- An account with `sudo`
- Two domains resolving to the server
- TCP ports 80 and 443 open
- UDP 3478 when the configured embedded DERP/STUN service requires it

## 2. Install Headscale

Headscale recommends its DEB release on Debian and Ubuntu. Select a stable
version from [Headscale Releases](https://github.com/juanfont/headscale/releases)
and enter the version without the leading `v`:

```bash
HEADSCALE_VERSION="<VERSION_WITHOUT_V>"
HEADSCALE_ARCH="$(dpkg --print-architecture)"

curl -fL -o /tmp/headscale.deb \
  "https://github.com/juanfont/headscale/releases/download/v${HEADSCALE_VERSION}/headscale_${HEADSCALE_VERSION}_linux_${HEADSCALE_ARCH}.deb"
sudo apt install /tmp/headscale.deb
```

Edit the complete configuration installed by the package. Do not replace it
with the partial snippet below:

```bash
sudoedit /etc/headscale/config.yaml
```

Confirm these values while retaining the other required fields from the
version-matched example:

```yaml
server_url: https://headscale.example.com
listen_addr: 127.0.0.1:8080
metrics_listen_addr: 127.0.0.1:9090
grpc_listen_addr: 127.0.0.1:50443

trusted_proxies:
  - 127.0.0.1/32
  - ::1/128

tls_cert_path: ''
tls_key_path: ''
```

The full packaged example is normally available at
`/usr/share/doc/headscale/examples/config-example.yaml`.

```bash
sudo systemctl enable --now headscale
sudo systemctl status headscale --no-pager
curl -fsS http://127.0.0.1:8080/health
```

A warning about listening without TLS is expected when `server_url` uses HTTPS
and Caddy terminates TLS.

## 3. Create a Headscale API key

```bash
sudo headscale apikeys create
```

The key is shown once. Store it in a password manager and test it without adding
it directly to shell history:

```bash
read -rsp "Headscale API key: " HEADSCALE_API_KEY
echo
curl -fsS \
  -H "Authorization: Bearer ${HEADSCALE_API_KEY}" \
  http://127.0.0.1:8080/api/v1/user
unset HEADSCALE_API_KEY
```

```bash
sudo headscale apikeys list
sudo headscale apikeys expire --prefix <KEY_PREFIX>
```

## 4. Install Node.js 24 and Headpanel

Headpanel requires Node.js 24 and builds with the pnpm version pinned by the
project. This example installs Node for root through fnm. A system installation
also works if root can access Node.js 24 and Corepack.

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

```bash
sudo git clone https://github.com/tlyboy/headpanel.git /opt/headpanel
sudo install -d -m 700 /etc/headpanel /var/lib/headpanel
sudo install -m 600 /opt/headpanel/.env.example /etc/headpanel/headpanel.env
openssl rand -hex 32
openssl rand -hex 16
sudoedit /etc/headpanel/headpanel.env
```

Recommended same-host, separate-subdomain, API-only configuration:

```dotenv
NODE_ENV=production
DATABASE_URL=file:/var/lib/headpanel/headpanel.db
SESSION_SECRET=<64_HEX_CHARACTERS_FROM_OPENSSL>
ADMIN_USERNAME=admin
ADMIN_PASSWORD=<32_HEX_CHARACTERS_FROM_OPENSSL>

HEADSCALE_API_URL=http://127.0.0.1:8080
HEADSCALE_API_KEY=<HEADSCALE_API_KEY>
HEADPANEL_BASE_PATH=

HEADSCALE_HOST_CONTROL=false
HEADSCALE_CONFIG_PATH=
HEADSCALE_BIN=
SYSTEMCTL_BIN=
```

```bash
sudo chmod 600 /etc/headpanel/headpanel.env
cd /opt/headpanel
sudo HEADPANEL_APP_DIR=/opt/headpanel \
  HEADPANEL_BIND_HOST=127.0.0.1 \
  HEADPANEL_PORT=3000 \
  bash scripts/deploy-production.sh
sudo systemctl status headpanel --no-pager
curl -fsSL http://127.0.0.1:3000/login >/dev/null
```

### Optional host control

Host control lets the panel edit `/etc/headscale/config.yaml` and restart
Headscale. Enable it only when this privilege is required:

```dotenv
HEADSCALE_HOST_CONTROL=true
HEADSCALE_CONFIG_PATH=/etc/headscale/config.yaml
HEADSCALE_BIN=/usr/bin/headscale
SYSTEMCTL_BIN=/usr/bin/systemctl
```

The deployment script runs the panel as root by default to support these local
operations. Keep remote panel deployments in API-only mode.

## 5. Configure Caddy and HTTPS (recommended)

Caddy automatically obtains and renews TLS certificates and supports upgraded
reverse-proxy connections. Install the stable official Debian/Ubuntu package:

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
sudoedit /etc/caddy/Caddyfile
```

Recommended separate-subdomain Caddyfile:

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

```bash
sudo caddy fmt --overwrite /etc/caddy/Caddyfile
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
sudo systemctl status caddy --no-pager
curl -fsS https://headscale.example.com/health
curl -IL https://panel.example.com/login
```

Caddy automatically obtains publicly trusted certificates when DNS points to
the server and TCP 80/443 are reachable. Headscale uses a custom Tailscale
Control Protocol; Caddy's `reverse_proxy` supports upgraded connections, and the
example follows Headscale's Caddy guidance. Do not place Headscale behind the
Cloudflare orange-cloud proxy or a Cloudflare Tunnel.

### Optional `/panel` deployment

For `https://headscale.example.com/panel`, set this before rebuilding:

```dotenv
HEADPANEL_BASE_PATH=/panel
```

Run the deployment script again after changing the base path, then replace the
two separate HTTPS site blocks with:

```caddyfile
headscale.example.com {
  redir /panel /panel/ 308

  handle /panel/* {
    # Use handle, not handle_path, to preserve the /panel prefix.
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

Keep the earlier `http://headscale.example.com` block so `/generate_204` returns
204 and other HTTP requests redirect to HTTPS.

## 6. First login and node registration

Open `https://panel.example.com/login` and use `ADMIN_USERNAME` and
`ADMIN_PASSWORD`. The initial administrator is seeded only while the panel
database is empty.

```bash
sudo headscale users create alice
sudo headscale users list
```

On a Tailscale client:

```bash
sudo tailscale up --login-server https://headscale.example.com
```

Approve the displayed Auth ID on the server:

```bash
sudo headscale auth register --user alice --auth-id <AUTH_ID>
sudo headscale nodes list
```

Alternatively, create a pre-auth key in Headpanel and use its generated install
command.

## 7. Updates and backups

### Update Headpanel

```bash
cd /opt/headpanel
sudo git pull --ff-only origin main
sudo HEADPANEL_APP_DIR=/opt/headpanel \
  HEADPANEL_BIND_HOST=127.0.0.1 \
  HEADPANEL_PORT=3000 \
  bash scripts/deploy-production.sh
```

### Update Headscale

Back up configuration and state, review the official upgrade notes, compare the
new `config-example.yaml`, and install the target DEB:

```bash
sudo install -d -m 700 /var/backups/headscale
sudo cp -a /etc/headscale /var/backups/headscale/
sudo cp -a /var/lib/headscale /var/backups/headscale/
sudo apt install /tmp/headscale.deb
sudo systemctl restart headscale
```

Back up at least:

- `/etc/headscale/config.yaml`
- `/var/lib/headscale/`
- `/etc/headpanel/headpanel.env`
- `/var/lib/headpanel/headpanel.db`
- `/etc/caddy/Caddyfile` and a certificate recovery method

Never commit environment files, API keys, or SQLite databases to Git.

## 8. Troubleshooting

### `GET /node -> 404`

The REST API prefix is `/api/v1`; the node endpoint is
`https://headscale.example.com/api/v1/node`. Set `HEADSCALE_API_URL` to either
the server URL or the URL ending in `/api/v1`, never to a URL ending in `/node`.

### API returns 401 or 403

- Check expiry with `headscale apikeys list`.
- Remove accidental whitespace or line breaks from the key.
- Test Bearer authentication directly against `/api/v1/user`.
- A lost key cannot be retrieved; expire it and create another one.

### Panel returns 502

```bash
sudo systemctl status headpanel --no-pager
sudo journalctl -u headpanel -n 100 --no-pager
curl -IL http://127.0.0.1:3000/login
```

Check Node.js 24, environment-file permissions, proxy/base-path agreement, and
whether the panel was rebuilt after changing `HEADPANEL_BASE_PATH`.

### Tailscale clients cannot connect

Check `headscale` and Caddy logs plus the public `/health` endpoint, and ensure no
incompatible CDN proxy sits in front of Headscale.

```bash
sudo journalctl -u caddy -n 100 --no-pager
```

### The group list is empty

Headpanel groups are local permission mappings; Headscale users are not imported
as groups automatically. Create the Headscale user first, then create its group
mapping in Headpanel.

## 9. Official references

- [Official Headscale installation](https://headscale.net/stable/setup/install/official/)
- [Headscale configuration](https://headscale.net/stable/ref/configuration/)
- [Headscale API](https://headscale.net/stable/ref/api/)
- [Headscale reverse proxy](https://headscale.net/stable/ref/integration/reverse-proxy/)
- [Getting started and node registration](https://headscale.net/stable/usage/getting-started/)
- [Official Caddy installation](https://caddyserver.com/docs/install)
- [Caddy reverse_proxy](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy)
