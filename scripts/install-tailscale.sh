#!/usr/bin/env bash
#
# Join a new machine to a Headscale tailnet
# Usage:
#   sudo ./install-tailscale.sh <authkey> [hostname]
#   or: sudo TAILSCALE_AUTHKEY=xxx ./install-tailscale.sh
#
# Steps:
#   1. Detect OS (Ubuntu/Debian/Raspbian) and architecture
#   2. Add the official Tailscale apt repository and install
#   3. Join the specified Headscale server with a preauthkey
#   4. Ensure tailscaled is ready; restore /etc/default/tailscaled and enable the service if needed
#      Network stack modes: kernel / missing conntrack -> netfilter-off / no netfilter -> userspace
#   5. Verify that the embedded DERP region is visible after joining
#
# Requirements: bash, curl, apt-get (deb-based systems)

set -euo pipefail

# ============================================================
# Configuration
# ============================================================
HEADSCALE_URL="${HEADSCALE_URL:-}"

# ============================================================
# Internals
# ============================================================
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
BOLD='\033[1m'
NC='\033[0m'

log()  { echo -e "${GREEN}[+]${NC} $*"; }
warn() { echo -e "${YELLOW}[!]${NC} $*"; }
err()  { echo -e "${RED}[x]${NC} $*" >&2; }
hdr()  { echo -e "\n${BOLD}=== $* ===${NC}"; }

usage() {
    cat <<EOF
Usage: sudo $0 <authkey> [hostname]
   or: sudo TAILSCALE_AUTHKEY=<authkey> HEADSCALE_URL=<url> $0 [hostname]

Arguments:
  authkey   Headscale preauthkey (hskey-auth-...)
            Generate it with 'headscale preauthkeys create --user <id> --reusable --expiration 24h'
  hostname  Node name after joining (default: $(hostname))

Environment:
  HEADSCALE_URL  Headscale URL, for example https://headscale.example.com

Examples:
  sudo HEADSCALE_URL=https://headscale.example.com ./install-tailscale.sh hskey-auth-xxxxx my-laptop
EOF
    exit 1
}

# ============================================================
# Parse arguments
# ============================================================
AUTHKEY="${TAILSCALE_AUTHKEY:-${1:-}}"
[ -n "$AUTHKEY" ] || usage
[ -n "$HEADSCALE_URL" ] || {
    err "HEADSCALE_URL is missing. Example: sudo HEADSCALE_URL=https://headscale.example.com $0 <authkey>"
    usage
}

# If the authkey comes from an argument, hostname is $2; if it comes from the environment, hostname is $1
if [ -n "${TAILSCALE_AUTHKEY:-}" ]; then
    HOST="${1:-$(hostname)}"
else
    HOST="${2:-$(hostname)}"
fi

# ============================================================
# Preflight checks
# ============================================================
hdr "Preflight checks"

[ "$(id -u)" -eq 0 ] || { err "Root privileges are required: sudo $0 ..."; exit 1; }
log "Root privileges OK"

command -v curl >/dev/null || { err "curl is missing; install it first with apt"; exit 1; }
log "curl OK"

# Detect OS
# macOS uses separate instructions; this script is for deb-based Linux systems
if [ "$(uname -s 2>/dev/null)" = "Darwin" ]; then
    err "macOS is not supported by this script; it uses apt-get and only supports Debian/Ubuntu/Raspbian Linux"
    cat >&2 <<EOF

macOS one-shot join (no Homebrew/App Store required; uses built-in curl and installer):

  P=\$(curl -fsSL https://pkgs.tailscale.com/stable/ | grep -oE 'Tailscale-[0-9.]+-macos\.pkg' | head -1) && curl -fsSL "https://pkgs.tailscale.com/stable/\$P" -o /tmp/ts.pkg && sudo installer -pkg /tmp/ts.pkg -target / && sudo ln -sf "/Applications/Tailscale.app/Contents/MacOS/Tailscale" /usr/local/bin/tailscale && sudo tailscale up --login-server=$HEADSCALE_URL --authkey=$AUTHKEY
If Homebrew is available:
  brew install --cask tailscale && sudo ln -sf "/Applications/Tailscale.app/Contents/MacOS/Tailscale" /usr/local/bin/tailscale && sudo tailscale up --login-server=$HEADSCALE_URL --authkey=$AUTHKEY
EOF
    exit 1
fi
[ -r /etc/os-release ] || { err "/etc/os-release is missing; cannot detect OS"; exit 1; }
# shellcheck disable=SC1091
. /etc/os-release
DISTRO_ID="${ID:-unknown}"
CODENAME="${VERSION_CODENAME:-${UBUNTU_CODENAME:-}}"
ARCH="$(dpkg --print-architecture 2>/dev/null || uname -m)"
log "System: $DISTRO_ID $CODENAME ($ARCH)"

case "$DISTRO_ID" in
    ubuntu)   REPO_PATH="ubuntu/$CODENAME" ;;
    debian)   REPO_PATH="debian/$CODENAME" ;;
    raspbian) REPO_PATH="raspbian/$CODENAME" ;;
    *)
        err "Unsupported distribution: $DISTRO_ID"
        err "Install manually from https://pkgs.tailscale.com, then run tailscale up"
        exit 1
        ;;
esac

# Detect ZeroTier; warn only, do not uninstall automatically
if command -v zerotier-cli >/dev/null 2>&1; then
    warn "ZeroTier is installed"
    warn "If needed, uninstall ZeroTier separately"
    warn "Or run separately: apt purge -y zerotier-one && rm -rf /var/lib/zerotier-one"
    echo "  Press Ctrl-C to abort, or continue in 3 seconds..." >&2
    sleep 3
fi

# Check Headscale health
log "Checking Headscale health: $HEADSCALE_URL/health"
HTTP_CODE=$(curl -fsS -o /dev/null --max-time 10 -w "%{http_code}" "$HEADSCALE_URL/health" 2>/dev/null || echo "fail")
[ "$HTTP_CODE" = "200" ] || {
    err "Cannot reach $HEADSCALE_URL/health (HTTP $HTTP_CODE)"
    err "Check DNS, outbound firewall rules, and Headscale service status"
    exit 1
}
log "headscale healthy"

# ============================================================
# Install Tailscale
# ============================================================
hdr "Install Tailscale"

if command -v tailscale >/dev/null 2>&1; then
    warn "Tailscale is already installed: $(tailscale version | head -1)"
    warn "Skipping installation and continuing to join flow"
else
    log "Adding Tailscale apt repository: $REPO_PATH"
    curl -fsSL "https://pkgs.tailscale.com/stable/${REPO_PATH}.noarmor.gpg" \
        -o /usr/share/keyrings/tailscale-archive-keyring.gpg
    curl -fsSL "https://pkgs.tailscale.com/stable/${REPO_PATH}.tailscale-keyring.list" \
        -o /etc/apt/sources.list.d/tailscale.list

    # DPkg::Lock::Timeout: when packagekitd or unattended-upgrades holds the dpkg lock,
    # apt waits for the lock instead of failing immediately. Debian/Ubuntu apt 2.x supports this.
    APT_LOCKWAIT="-o DPkg::Lock::Timeout=300"
    log "apt-get update (waits up to 5 minutes if the package lock is busy)"
    DEBIAN_FRONTEND=noninteractive apt-get $APT_LOCKWAIT update -y 2>&1 | tail -5

    log "apt-get install tailscale"
    DEBIAN_FRONTEND=noninteractive apt-get $APT_LOCKWAIT install -y tailscale 2>&1 | tail -5

    log "Installed: $(tailscale version | head -1)"
fi

# ============================================================
# Ensure the tailscaled daemon is ready
# ============================================================
hdr "Ensure tailscaled is ready"

DEFAULT_FILE=/etc/default/tailscaled
SOCK=/run/tailscale/tailscaled.sock

# tailscaled.service depends on EnvironmentFile=/etc/default/tailscaled, including PORT and FLAGS.
# Manual install/uninstall leftovers can remove this file and prevent the service from starting. Restore standard content if missing.
write_default() { # $1=FLAGS value
    cat > "$DEFAULT_FILE" <<EOF
# Port to listen on for incoming VPN packets.
PORT="41641"
# Extra flags you might want to pass to tailscaled.
FLAGS="$1"
EOF
}
if [ ! -f "$DEFAULT_FILE" ]; then
    warn "$DEFAULT_FILE is missing; restoring the default so the service can start"
    write_default ""
fi

wait_sock() { # Wait for the tailscaled socket, up to about 15s
    for _ in $(seq 1 15); do
        [ -S "$SOCK" ] && return 0
        sleep 1
    done
    return 1
}

HAS_SYSTEMD=false
if command -v systemctl >/dev/null 2>&1 && \
   systemctl cat tailscaled.service >/dev/null 2>&1; then
    HAS_SYSTEMD=true
    systemctl enable --now tailscaled 2>&1 | tail -1 || true
fi
if wait_sock; then
    log "tailscaled is ready"
else
    warn "tailscaled socket is not ready; it will be restarted if needed"
fi

# ============================================================
# Detect netfilter and choose join mode (kernel/userspace)
# ============================================================
hdr "Detect network stack"

# Check whether kernel iptables/nftables is actually usable
NF_MODE=kernel
if iptables -L -n >/dev/null 2>&1 || nft list tables >/dev/null 2>&1; then
    NF_MODE=kernel
else
    NF_MODE=userspace
fi

CONNTRACK_OK=true
if [ "$NF_MODE" = "kernel" ]; then
    # Use a here-string instead of a pipe: with set -o pipefail, lsmod | grep -q can SIGPIPE
    # and produce a false negative for conntrack. Capture full output first, then grep.
    if ! grep -q nf_conntrack <<<"$(lsmod 2>/dev/null)" && \
       ! modprobe -n -q nf_conntrack 2>/dev/null && \
       ! [ -e /proc/net/nf_conntrack ]; then
        CONNTRACK_OK=false
    fi
fi

if [ "$NF_MODE" = "userspace" ]; then
    warn "Kernel iptables/nftables is unavailable; switching to userspace-networking mode"
    warn "Side effect: outbound tailnet access from this host needs SOCKS5; inbound/admin access still works"
    write_default "--tun=userspace-networking"
    if [ "$HAS_SYSTEMD" = "true" ]; then
        systemctl restart tailscaled 2>&1 | tail -1 || true
    fi
    wait_sock || { err "tailscaled is still not ready in userspace mode; check journalctl -u tailscaled"; exit 1; }
    log "Switched to userspace-networking mode"
elif [ "$CONNTRACK_OK" = "false" ]; then
    warn "nf_conntrack is missing; joining with --netfilter-mode=off"
    warn "Side effect: this node cannot be a subnet router or exit node; its own traffic is fine"
fi

# ============================================================
# Join Headscale
# ============================================================
hdr "Join Headscale"

# Stale local state or an expired server-side node can leave the client stuck in NodeKeyExpired regeneration
# loops. tailscale up --authkey alone may not recover it. If stale/logged-out state is detected, logout first
# to clear local identity, then use --force-reauth to authenticate again.
RELOGIN=false
if command -v tailscale >/dev/null 2>&1; then
    TS_STATUS="$(tailscale status 2>&1 || true)"
    if grep -Eqi 'Logged out|NeedsLogin|Stopped|NodeKeyExpired' <<<"$TS_STATUS"; then
        warn "Client is stale or logged out; logging out first and forcing re-auth to avoid NodeKeyExpired"
        timeout 15 tailscale logout 2>/dev/null || true
        RELOGIN=true
    fi
fi

log "tailscale up (hostname=$HOST, mode=$NF_MODE)"
UP_ARGS=(
    --login-server="$HEADSCALE_URL"
    --authkey="$AUTHKEY"
    --hostname="$HOST"
)
if [ "$NF_MODE" = "kernel" ] && [ "$CONNTRACK_OK" = "false" ]; then
    UP_ARGS+=(--netfilter-mode=off)
fi
if [ "$RELOGIN" = "true" ]; then
    UP_ARGS+=(--force-reauth)
fi

timeout 60 tailscale up "${UP_ARGS[@]}"

if [ "$NF_MODE" = "kernel" ] && [ "$CONNTRACK_OK" = "false" ]; then
    tailscale set --netfilter-mode=off 2>/dev/null || true
fi

# ============================================================
# Verify DERP and latency
# ============================================================
hdr "Verify embedded DERP"

# Wait for tailscaled to sync before netcheck
sleep 4

NETCHECK_OUT="$(tailscale netcheck 2>&1 || true)"
# netcheck output example "    - headscale: 1.1ms  (Headscale Embedded DERP)"
# Fields:$1='-' $2='headscale:' $3='1.1ms' ...
HEADSCALE_LATENCY=$(echo "$NETCHECK_OUT" | awk '/- headscale:/ {print $3; exit}')
NEAREST=$(echo "$NETCHECK_OUT" | awk -F': ' '/Nearest DERP:/ {gsub(/^ +| +$/,"",$2); print $2}')

if [ -n "$HEADSCALE_LATENCY" ]; then
    log "Headscale embedded DERP latency: ${HEADSCALE_LATENCY}"
    log "Nearest DERP: ${NEAREST:-N/A}"
    if [ "${NEAREST:-}" != "Headscale Embedded DERP" ]; then
        warn "Nearest DERP is not Headscale; UDP 3478/STUN may be blocked"
        warn "Check firewall or NAT rules so UDP 3478 can reach the Headscale DERP service"
    fi
else
    warn "Headscale region was not found in netcheck"
    warn "New nodes should pick it up automatically; older nodes may need 'tailscale logout && tailscale up ...' to refresh the DERP map"
fi

# ============================================================
# Result
# ============================================================
hdr "Done"

echo
tailscale status
echo
echo "Local tailnet IP: $(tailscale ip -4 2>/dev/null) / $(tailscale ip -6 2>/dev/null)"
echo
log "Done. You can ping $(tailscale ip -4 2>/dev/null) from another node to test connectivity"
echo
echo "If ping latency is still high (>50ms across networks), run this on the machine:"
echo "  tailscale debug derp-map | grep -A2 'RegionCode\":\"headscale'"
echo "  Confirm region 999 is visible; if not, run 'tailscale logout && tailscale up ...'"
