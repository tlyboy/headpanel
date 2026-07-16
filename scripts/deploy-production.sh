#!/usr/bin/env bash

set -Eeuo pipefail

readonly SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
readonly PROJECT_DIR="$(cd -- "${SCRIPT_DIR}/.." && pwd)"

HEADPANEL_APP_DIR="${HEADPANEL_APP_DIR:-${PROJECT_DIR}}"
HEADPANEL_ENV_FILE="${HEADPANEL_ENV_FILE:-/etc/headpanel/headpanel.env}"
HEADPANEL_SERVICE_NAME="${HEADPANEL_SERVICE_NAME:-headpanel}"
HEADPANEL_SERVICE_USER="${HEADPANEL_SERVICE_USER:-root}"
HEADPANEL_BIND_HOST="${HEADPANEL_BIND_HOST:-127.0.0.1}"
HEADPANEL_PORT="${HEADPANEL_PORT:-3000}"

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run this deployment script as root." >&2
  exit 1
fi

if [[ "$(cd -- "${HEADPANEL_APP_DIR}" 2>/dev/null && pwd)" != "${PROJECT_DIR}" ]]; then
  echo "HEADPANEL_APP_DIR must point to this checkout: ${PROJECT_DIR}" >&2
  exit 1
fi

if [[ ! -f "${HEADPANEL_ENV_FILE}" ]]; then
  echo "Runtime environment file not found: ${HEADPANEL_ENV_FILE}" >&2
  exit 1
fi

chmod 600 "${HEADPANEL_ENV_FILE}"

if [[ -x /root/.local/share/fnm/fnm ]]; then
  export PATH="/root/.local/share/fnm:${PATH}"
  eval "$(/root/.local/share/fnm/fnm env --shell bash --use-on-cd --version-file-strategy=recursive --corepack-enabled --resolve-engines)"
fi

if command -v corepack >/dev/null 2>&1; then
  corepack enable pnpm
fi

node_command="$(command -v node || true)"
pnpm_command="$(command -v pnpm || true)"
if [[ -z "${node_command}" || -z "${pnpm_command}" ]]; then
  echo "Node.js and pnpm must be available to root." >&2
  exit 1
fi

node_bin="$(readlink -f "${node_command}")"
pnpm_entry="$(readlink -f "${pnpm_command}")"
node_major="$(${node_bin} --version | sed -E 's/^v([0-9]+).*/\1/')"
if [[ "${node_major}" != "24" ]]; then
  echo "Node.js 24 is required; found $(${node_bin} --version)." >&2
  exit 1
fi

base_path="$({ sed -n -E 's/^[[:space:]]*HEADPANEL_BASE_PATH=(.*)$/\1/p' "${HEADPANEL_ENV_FILE}" || true; } | tail -n 1)"
base_path="${base_path%\"}"
base_path="${base_path#\"}"
base_path="${base_path%\'}"
base_path="${base_path#\'}"

cd "${HEADPANEL_APP_DIR}"
CI=1 "${pnpm_command}" install --frozen-lockfile
HEADPANEL_BASE_PATH="${base_path}" "${pnpm_command}" build

runtime_path="$(dirname -- "${node_bin}"):/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
unit_file="/etc/systemd/system/${HEADPANEL_SERVICE_NAME}.service"
unit_tmp="$(mktemp)"
trap 'rm -f "${unit_tmp}"' EXIT

cat >"${unit_tmp}" <<EOF
[Unit]
Description=Headpanel
After=network-online.target headscale.service
Wants=network-online.target

[Service]
Type=simple
User=${HEADPANEL_SERVICE_USER}
WorkingDirectory=${HEADPANEL_APP_DIR}
EnvironmentFile=${HEADPANEL_ENV_FILE}
Environment=PATH=${runtime_path}
ExecStart=${node_bin} ${pnpm_entry} exec next start -H ${HEADPANEL_BIND_HOST} -p ${HEADPANEL_PORT}
Restart=always
RestartSec=3
TimeoutStopSec=30
UMask=0077

[Install]
WantedBy=multi-user.target
EOF

install -m 644 "${unit_tmp}" "${unit_file}"
systemctl daemon-reload
systemctl enable "${HEADPANEL_SERVICE_NAME}.service" >/dev/null
systemctl restart "${HEADPANEL_SERVICE_NAME}.service"

health_host="${HEADPANEL_BIND_HOST}"
if [[ "${health_host}" == "0.0.0.0" ]]; then
  health_host="127.0.0.1"
fi
health_url="http://${health_host}:${HEADPANEL_PORT}${base_path}/"

for attempt in {1..20}; do
  if curl --fail --silent --show-error --location --max-time 5 --output /dev/null "${health_url}"; then
    systemctl --quiet is-active "${HEADPANEL_SERVICE_NAME}.service"
    echo "Headpanel deployed successfully: ${health_url}"
    exit 0
  fi
  sleep 1
done

systemctl status "${HEADPANEL_SERVICE_NAME}.service" --no-pager >&2 || true
journalctl -u "${HEADPANEL_SERVICE_NAME}.service" -n 80 --no-pager >&2 || true
echo "Deployment health check failed: ${health_url}" >&2
exit 1
