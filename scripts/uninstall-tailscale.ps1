# ============================================================
# Cleanly uninstall the Tailscale client on Windows
#
# Usage:
#   1. Right-click Windows PowerShell and choose Run as Administrator
#   2. Temporarily allow script execution:
#        Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
#   3. Run:
#        .\uninstall-tailscale.ps1
#
# Behavior (idempotent):
#   1. tailscale logout if still online
#   2. Stop-Service Tailscale
#   3. Uninstall MSI, preferring Get-Package and falling back to registry UninstallString
#   4. Remove leftover directories, user state, and registry keys
# ============================================================

[CmdletBinding()]
param()

$ErrorActionPreference = "Continue"

function Log    ([string]$msg) { Write-Host "[+] $msg" -ForegroundColor Green }
function Warn   ([string]$msg) { Write-Host "[!] $msg" -ForegroundColor Yellow }
function Err    ([string]$msg) { Write-Host "[x] $msg" -ForegroundColor Red }
function Header ([string]$msg) { Write-Host "`n=== $msg ===" -ForegroundColor Cyan }

function Get-TailscaleExe {
    # Do not expand ProgramFiles(x86) directly inside a double-quoted string; Windows PowerShell 5.x can be confused by
    # the parentheses in the path, even with a $() subexpression.
    # Use the .NET API first, store the value, then interpolate it.
    $pf86 = [Environment]::GetFolderPath('ProgramFilesX86')
    $candidates = @(
        "$env:ProgramFiles\Tailscale\tailscale.exe",
        "$pf86\Tailscale\tailscale.exe"
    )
    foreach ($p in $candidates) {
        if (Test-Path $p) { return $p }
    }
    return $null
}

# ============================================================
# Preflight: administrator check
# ============================================================
$currentPrincipal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $currentPrincipal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Err "Administrator privileges are required. Run PowerShell as Administrator and try again."
    exit 1
}
Log "Administrator privileges OK"

$tsExe = Get-TailscaleExe
$svc   = Get-Service -Name Tailscale -ErrorAction SilentlyContinue

if (-not $tsExe -and -not $svc) {
    Warn "Tailscale was not detected; leftover directories will still be removed"
}

# ============================================================
# 1. logout
# ============================================================
Header "1. logout"
if ($tsExe -and $svc -and $svc.Status -eq "Running") {
    try {
        $status = & $tsExe status 2>&1 | Out-String
        if ($status -match "Logged out|NeedsLogin") {
            Warn "Tailscale is not logged in; skipping logout"
        } else {
            Log "tailscale logout"
            & $tsExe logout 2>&1 | Out-Null
        }
    } catch {
        Warn "logout failed; continuing: $_"
    }
} else {
    Warn "Tailscale is not running; skipping logout"
}

# ============================================================
# 2. Stop service
# ============================================================
Header "2. Stop Tailscale service"
if ($svc) {
    if ($svc.Status -eq "Running") {
        Stop-Service -Name Tailscale -Force -ErrorAction SilentlyContinue
        Log "Tailscale service stopped"
    } else {
        Warn "Current service status: $($svc.Status)"
    }
    # Disable the service so it is not started again while files still exist
    Set-Service -Name Tailscale -StartupType Disabled -ErrorAction SilentlyContinue
} else {
    Warn "Tailscale service was not found"
}

# ============================================================
# 3. Uninstall MSI
# ============================================================
Header "3. Uninstall Tailscale package"

$uninstalled = $false

# Option A: Get-Package
try {
    $pkg = Get-Package -Name "Tailscale*" -ErrorAction SilentlyContinue
    if ($pkg) {
        Log "Uninstalling via Get-Package: $($pkg.Name) $($pkg.Version)"
        $pkg | Uninstall-Package -Force -ErrorAction Stop | Out-Null
        $uninstalled = $true
    }
} catch {
    Warn "Get-Package uninstall failed: $_"
}

# Option B: registry UninstallString
if (-not $uninstalled) {
    $uninstKey = "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*",
                 "HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*"
    $entries = Get-ItemProperty $uninstKey -ErrorAction SilentlyContinue |
               Where-Object { $_.DisplayName -like "Tailscale*" }
    foreach ($e in $entries) {
        Log "Uninstalling from registry: $($e.DisplayName) [$($e.PSChildName)]"
        if ($e.PSChildName -match '^\{[0-9A-F-]+\}$') {
            $proc = Start-Process msiexec.exe -ArgumentList "/x $($e.PSChildName) /qn /norestart" -Wait -PassThru
            if ($proc.ExitCode -eq 0) { $uninstalled = $true }
            else { Warn "msiexec exit code $($proc.ExitCode)" }
        } elseif ($e.UninstallString) {
            Warn "Non-MSI uninstall entry; run manually: $($e.UninstallString)"
        }
    }
}

if (-not $uninstalled) {
    Warn "Package manager uninstall did not run; it may be absent or already removed. Removing leftovers only."
}

# ============================================================
# 4. Remove leftovers
# ============================================================
Header "4. Remove leftovers"

$pf86 = [Environment]::GetFolderPath('ProgramFilesX86')
$residues = @(
    "$env:ProgramFiles\Tailscale",
    "$pf86\Tailscale",
    "$env:ProgramData\Tailscale",
    "$env:LOCALAPPDATA\Tailscale"
)
foreach ($p in $residues) {
    if (Test-Path $p) {
        try {
            Remove-Item -Path $p -Recurse -Force -ErrorAction Stop
            Log "Removed $p"
        } catch {
            Warn "Failed to remove ${p}: $_"
        }
    }
}

# Registry
$regKeys = @(
    "HKLM:\SOFTWARE\Tailscale",
    "HKLM:\SOFTWARE\WOW6432Node\Tailscale"
)
foreach ($k in $regKeys) {
    if (Test-Path $k) {
        Remove-Item -Path $k -Recurse -Force -ErrorAction SilentlyContinue
        Log "Removed registry key $k"
    }
}

# ============================================================
# 5. Verify
# ============================================================
Header "5. Verify"

if (Get-TailscaleExe) {
    Err "tailscale.exe still exists"
} else {
    Log "tailscale.exe is gone"
}

if (Get-Service -Name Tailscale -ErrorAction SilentlyContinue) {
    Warn "Tailscale service is still registered; a reboot may clear it"
} else {
    Log "Tailscale service is cleared"
}

if (Get-Package -Name "Tailscale*" -ErrorAction SilentlyContinue) {
    Warn "Get-Package still finds Tailscale"
} else {
    Log "Tailscale is gone from the package manager"
}

$leftovers = $residues | Where-Object { Test-Path $_ }
if ($leftovers) {
    Warn "Remaining leftover directories:$leftovers"
} else {
    Log "Leftover directories are cleared"
}

Write-Host
Log "Uninstall complete"
