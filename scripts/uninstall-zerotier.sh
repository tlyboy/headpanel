#!/usr/bin/env bash
#
# Cleanly uninstall ZeroTier One on Linux
#
# Usage:
#   sudo ./uninstall-zerotier.sh
#
# Behavior (idempotent):
#   1. Leave all joined ZeroTier networks
#   2. systemctl stop + disable zerotier-one
#   3. apt purge zerotier-one + autoremove
#   4. Remove leftovers: identity, config, apt source, GPG key, interfaces, user/group
#
# Requirements: bash, apt-get (deb-based systems)

set -euo pipefail

GREEN='\033[0;32m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
BOLD='\033[1m'
NC='\033[0m'
log()  { echo -e "${GREEN}[+]${NC} $*"; }
warn() { echo -e "${YELLOW}[!]${NC} $*"; }
err()  { echo -e "${RED}[x]${NC} $*" >&2; }
hdr()  { echo -e "\n${BOLD}=== $* ===${NC}"; }

# ============================================================
# Preflight checks
# ============================================================
[ "$(id -u)" -eq 0 ] || { err "Root privileges are required: sudo $0"; exit 1; }

INSTALLED=false
if command -v zerotier-cli >/dev/null 2>&1; then
    INSTALLED=true
    log "Detected zerotier-cli"
else
    warn "zerotier-cli command not found; leftover files will still be removed"
fi

# ============================================================
# 1. Leave all networks
# ============================================================
hdr "1. Leave all ZeroTier networks"
if $INSTALLED && systemctl is-active --quiet zerotier-one 2>/dev/null; then
    # listnetworks output example:
    #   200 listnetworks <header line>
    #   200 listnetworks <nwid> <name> <mac> <status> <type> <dev> <ips>
    NWIDS=$(zerotier-cli listnetworks 2>/dev/null | awk '/^200 listnetworks/ && NF>=3 && $3 !~ /^</ {print $3}' || true)
    if [ -n "$NWIDS" ]; then
        while IFS= read -r nwid; do
            log "leave $nwid"
            zerotier-cli leave "$nwid" 2>&1 | head -1 || true
        done <<<"$NWIDS"
    else
        warn "No joined networks"
    fi
else
    warn "zerotier-one service is not running; skipping leave"
fi

# ============================================================
# 2. stop + disable
# ============================================================
hdr "2. Stop and disable zerotier-one service"
if systemctl list-unit-files 2>/dev/null | grep -q '^zerotier-one\.service'; then
    systemctl stop zerotier-one 2>&1 || true
    systemctl disable zerotier-one 2>&1 | tail -2 || true
    log "Service stopped and disabled"
else
    warn "zerotier-one.service was not found"
fi

# ============================================================
# 3. apt purge
# ============================================================
hdr "3. apt purge zerotier-one"
if dpkg -l 2>/dev/null | grep -q '^ii  zerotier-one '; then
    DEBIAN_FRONTEND=noninteractive apt-get purge -y zerotier-one 2>&1 | tail -5 || true
    DEBIAN_FRONTEND=noninteractive apt-get autoremove -y 2>&1 | tail -3 || true
else
    warn "zerotier-one package is not installed"
fi

# ============================================================
# 4. Remove leftovers
# ============================================================
hdr "4. Remove leftover files and config"

RESIDUE=(
    /var/lib/zerotier-one
    /etc/zerotier-one
    /etc/apt/sources.list.d/zerotier.list
    /etc/apt/trusted.gpg.d/zerotier-debian-package-key.gpg
    /usr/share/keyrings/zerotier-archive-keyring.gpg
    /usr/share/keyrings/zerotier-debian-package-key.gpg
)
for path in "${RESIDUE[@]}"; do
    if [ -e "$path" ]; then
        rm -rf "$path"
        log "Removed $path"
    fi
done

# apt cache
shopt -s nullglob
for f in /var/cache/apt/archives/zerotier-one_*.deb /var/lib/apt/lists/download.zerotier.com_*; do
    rm -f "$f"
    log "Removed $f"
done
shopt -u nullglob

# Remove leftover virtual interfaces (ZeroTier interfaces look like zt<10 hex chars>)
for iface in $(ip -o link show 2>/dev/null | awk -F': ' '$2 ~ /^zt/ {print $2}' | cut -d'@' -f1); do
    ip link delete "$iface" 2>&1 || warn "$iface deletion failed"
    log "Removed $iface interface"
done

# Remove user/group if still present
if getent passwd zerotier-one >/dev/null 2>&1; then
    userdel zerotier-one 2>&1 || warn "userdel zerotier-one failed"
    log "Removed user zerotier-one"
fi
if getent group zerotier-one >/dev/null 2>&1; then
    groupdel zerotier-one 2>&1 || warn "groupdel zerotier-one failed"
    log "Removed group zerotier-one"
fi

apt-get clean 2>/dev/null || true

# ============================================================
# 5. Verify
# ============================================================
hdr "5. Verify"

if command -v zerotier-cli >/dev/null 2>&1; then
    err "zerotier-cli command still exists: $(which zerotier-cli)"
else
    log "zerotier-cli command is gone"
fi

if systemctl list-units --all 2>/dev/null | grep -q zerotier-one; then
    warn "zerotier-one service unit is still registered in systemd"
    systemctl daemon-reload 2>/dev/null || true
else
    log "zerotier-one service is cleared"
fi

REMAIN=$(find /etc /var/lib /usr/share/keyrings -iname "*zerotier*" 2>/dev/null || true)
if [ -n "$REMAIN" ]; then
    warn "Remaining zerotier-related files:"
    echo "$REMAIN"
else
    log "No leftover files"
fi

if ip -o link show 2>/dev/null | awk -F': ' '{print $2}' | grep -q '^zt'; then
    warn "zt* virtual interfaces still exist"
else
    log "No leftover interfaces"
fi

if getent passwd zerotier-one >/dev/null 2>&1 || getent group zerotier-one >/dev/null 2>&1; then
    warn "zerotier-one user/group still exists"
else
    log "User and group are cleared"
fi

echo
log "Uninstall complete"
