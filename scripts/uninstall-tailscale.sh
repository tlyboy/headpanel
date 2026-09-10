#!/usr/bin/env bash
#
# Cleanly uninstall the Tailscale client on Linux
#
# Usage:
#   sudo ./uninstall-tailscale.sh
#
# Behavior (idempotent):
#   1. tailscale logout if still online
#   2. systemctl stop + disable tailscaled
#   3. apt purge (deb) or dnf/yum remove (rpm) tailscale
#   4. Remove leftovers: state directory, repo/keyring files, static install, interface
#
# Requirements: bash, and apt-get (Debian/Ubuntu/Raspbian) or dnf/yum
#               (Huawei Cloud EulerOS / EulerOS / openEuler / RHEL family).
#               Without either, only leftover files are cleaned up.

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

# Detect the package manager by command availability so RPM distros work as well
if command -v apt-get >/dev/null 2>&1; then
    PKG=apt
elif command -v dnf >/dev/null 2>&1; then
    PKG=dnf
elif command -v yum >/dev/null 2>&1; then
    PKG=yum
else
    PKG=none
fi
log "Package manager: $PKG"

INSTALLED=false
if command -v tailscale >/dev/null 2>&1; then
    INSTALLED=true
    log "Detected tailscale: $(tailscale version | head -1)"
else
    warn "tailscale command not found; leftover files will still be removed"
fi

# ============================================================
# 1. logout if logged in
# ============================================================
hdr "1. logout"
if $INSTALLED; then
    STATUS=$(tailscale status 2>&1 || true)
    if grep -qi "Logged out\|NeedsLogin" <<<"$STATUS"; then
        warn "Tailscale is not logged in; skipping logout"
    elif grep -qi "stopped\|tailscaled.*not running" <<<"$STATUS"; then
        warn "tailscaled is not running; skipping logout"
    else
        log "tailscale logout so Headscale can clean up the session"
        timeout 15 tailscale logout 2>&1 || warn "logout failed or timed out; continuing"
    fi
fi

# ============================================================
# 2. stop + disable systemd service
# ============================================================
hdr "2. Stop and disable tailscaled service"
if systemctl cat tailscaled.service >/dev/null 2>&1; then
    systemctl stop tailscaled 2>&1 || true
    systemctl disable tailscaled 2>&1 | tail -2 || true
    log "Service stopped and disabled"
else
    warn "tailscaled.service was not found"
fi

# ============================================================
# 3. Remove the package
# ============================================================
hdr "3. Remove the tailscale package"
case "$PKG" in
    apt)
        # Avoid `dpkg -l | grep -q`: with set -o pipefail, grep -q can close the pipe early and make dpkg
        # exit 141 on SIGPIPE, causing a false "not installed" result and skipping purge.
        # dpkg-query checks a single package and avoids SIGPIPE.
        if [ "$(dpkg-query -W -f='${db:Status-Status}' tailscale 2>/dev/null)" = installed ]; then
            # Wait up to 5 minutes if packagekitd or unattended-upgrades holds the apt lock.
            # Otherwise purge can fail on the lock and be swallowed by || true.
            APT_LOCKWAIT="-o DPkg::Lock::Timeout=300"
            DEBIAN_FRONTEND=noninteractive apt-get $APT_LOCKWAIT purge -y tailscale tailscale-archive-keyring 2>&1 | tail -5 || true
            DEBIAN_FRONTEND=noninteractive apt-get $APT_LOCKWAIT autoremove -y 2>&1 | tail -3 || true
        else
            warn "tailscale package is not installed"
        fi
        ;;
    dnf|yum)
        # rpm -q queries a single package, so it has no SIGPIPE problem either.
        # The rpm build has no keyring package and nothing depends on it, so plain remove is enough.
        if rpm -q tailscale >/dev/null 2>&1; then
            $PKG remove -y tailscale 2>&1 | tail -5 || true
        else
            warn "tailscale package is not installed"
        fi
        ;;
    *)
        warn "No package manager found; only leftover files will be removed"
        ;;
esac

# ============================================================
# 4. Remove leftovers
# ============================================================
hdr "4. Remove leftover files and config"

RESIDUE=(
    /var/lib/tailscale
    /etc/default/tailscaled
    /etc/apt/sources.list.d/tailscale.list
    /usr/share/keyrings/tailscale-archive-keyring.gpg
    /etc/apt/trusted.gpg.d/tailscale.gpg
    /etc/yum.repos.d/tailscale.repo
)
for path in "${RESIDUE[@]}"; do
    if [ -e "$path" ]; then
        rm -rf "$path"
        log "Removed $path"
    fi
done

# Files from a static tarball install: the package managers above own these paths when
# tailscale came from a repo, so whatever survives the removal step was placed by hand.
STATIC_LEFTOVER=false
for path in /usr/bin/tailscale /usr/sbin/tailscaled /usr/lib/systemd/system/tailscaled.service; do
    if [ -e "$path" ]; then
        rm -f "$path"
        STATIC_LEFTOVER=true
        log "Removed $path (static install)"
    fi
done
if [ "$STATIC_LEFTOVER" = "true" ] && command -v systemctl >/dev/null 2>&1; then
    systemctl daemon-reload 2>/dev/null || true
fi

# apt cached .deb files
shopt -s nullglob
for deb in /var/cache/apt/archives/tailscale_*.deb; do
    rm -f "$deb"
    log "Removed $deb"
done
shopt -u nullglob

# Remove leftover virtual interfaces
if ip link show tailscale0 >/dev/null 2>&1; then
    ip link delete tailscale0 2>&1 || warn "tailscale0 interface deletion failed; it may already be gone"
    log "Removed tailscale0 interface"
fi

# Clean the package cache. For rpm, only the downloaded packages: `clean all` would also
# drop the system repo metadata and slow down the next dnf run for no reason.
case "$PKG" in
    apt)     apt-get clean 2>/dev/null || true ;;
    dnf|yum) $PKG clean packages >/dev/null 2>&1 || true ;;
esac

# ============================================================
# 5. Verify
# ============================================================
hdr "5. Verify"

if command -v tailscale >/dev/null 2>&1; then
    err "tailscale command still exists: $(which tailscale)"
else
    log "tailscale command is gone"
fi

if systemctl cat tailscaled.service >/dev/null 2>&1; then
    warn "tailscaled service unit is still registered in systemd; daemon-reload may clear it"
    systemctl daemon-reload 2>/dev/null || true
else
    log "tailscaled service is cleared"
fi

REMAIN=$(find /etc /var/lib /usr/share/keyrings -iname "*tailscale*" 2>/dev/null || true)
if [ -n "$REMAIN" ]; then
    warn "Remaining tailscale-related files:"
    echo "$REMAIN"
else
    log "No leftover files"
fi

if grep -q tailscale <<<"$(ip link show 2>/dev/null)"; then
    warn "Tailscale virtual interface still exists"
else
    log "No leftover interfaces"
fi

echo
log "Uninstall complete"
echo
warn "Note: if this machine joined Headscale before, the control plane may still have an expired node with the same name."
warn "      On the Headscale server, find it with 'headscale nodes list' and delete it with 'headscale nodes delete -i <id>'."
warn "      Otherwise reinstalling with the same identity may hit NodeKeyExpired. This client-side uninstall script cannot modify the server."
