#!/usr/bin/env bash
#
# Deploy Tailscale to a target Linux machine from local macOS/Linux
# Copies install-tailscale.sh to the target and runs it over SSH
#
# Usage:
#   ./deploy-tailscale-linux.sh <ssh-target> <authkey> [hostname]
#
# Examples:
#   ./deploy-tailscale-linux.sh server.example.com hskey-auth-xxx
#   ./deploy-tailscale-linux.sh root@server.example.com hskey-auth-xxx my-server
#   ./deploy-tailscale-linux.sh pi@raspberry.local hskey-auth-xxx

set -euo pipefail

# ============================================================
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTALL_SCRIPT="${SCRIPT_DIR}/install-tailscale.sh"

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
Usage: $0 <ssh-target> <authkey> [hostname]

Arguments:
  ssh-target  SSH target (user@host or host; host can be an IP address, domain, or .local name)
  authkey     headscale preauthkey (hskey-auth-...)
  hostname    Node name after joining (defaults to the target hostname)

Requirements:
  - install-tailscale.sh must be in the same directory
  - ssh/scp must be able to log in to the target (ssh-copy-id is recommended)
  - The target needs root privileges; this script uses sudo when needed

Examples:
  $0 server.example.com hskey-auth-xxxxx
  $0 root@server.example.com hskey-auth-xxxxx ai-server-5
  $0 pi@raspberry.local hskey-auth-xxxxx
EOF
    exit 1
}

# ============================================================
# Arguments and preflight checks
# ============================================================
[ $# -ge 2 ] || usage

TARGET="$1"
AUTHKEY="$2"
HOSTNAME_ARG="${3:-}"

[ -r "$INSTALL_SCRIPT" ] || {
    err "install-tailscale.sh not found: $INSTALL_SCRIPT"
    err "Make sure both scripts are in the same directory"
    exit 1
}

# Test SSH connectivity
hdr "Testing SSH connectivity: $TARGET"
if ssh -o ConnectTimeout=10 -o BatchMode=yes "$TARGET" 'echo "connected as: $(whoami) @ $(hostname)"' 2>&1; then
    log "ssh OK"
else
    err "SSH failed or requires a password. Check:"
    err "  1. The target is reachable: ping $TARGET"
    err "  2. The SSH key is installed: ssh-copy-id $TARGET"
    exit 1
fi

# Check whether the remote login is root
REMOTE_USER=$(ssh -o BatchMode=yes "$TARGET" 'whoami' 2>/dev/null || echo "")
if [ "$REMOTE_USER" = "root" ]; then
    SUDO=""
    log "Remote user is root; sudo is not needed"
else
    SUDO="sudo"
    log "Remote user is $REMOTE_USER; sudo will be used (NOPASSWD or an interactive password may be required)"
fi

# ============================================================
# Upload script
# ============================================================
hdr "Uploading install-tailscale.sh to $TARGET:/tmp/"
scp -q "$INSTALL_SCRIPT" "$TARGET:/tmp/install-tailscale.sh"
ssh "$TARGET" 'chmod +x /tmp/install-tailscale.sh'
log "Upload complete"

# ============================================================
# Remote execution
# ============================================================
hdr "Running installation on $TARGET"
echo

# shellcheck disable=SC2029
ssh -t "$TARGET" "$SUDO bash /tmp/install-tailscale.sh '$AUTHKEY' ${HOSTNAME_ARG:+'$HOSTNAME_ARG'}"
RC=$?

# ============================================================
# Cleanup
# ============================================================
ssh "$TARGET" 'rm -f /tmp/install-tailscale.sh' 2>/dev/null || true

hdr "Done"
if [ $RC -eq 0 ]; then
    log "Deployment succeeded"
    # Fetch the remote Tailscale IP
    REMOTE_IP=$(ssh "$TARGET" "$SUDO tailscale ip -4 2>/dev/null" || echo "?")
    log "Remote node tailnet IP: $REMOTE_IP"
else
    err "The script exited with code $RC. Check the logs above."
    exit $RC
fi
