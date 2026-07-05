# ============================================================
# Cleanly uninstall ZeroTier One on Windows
#
# Usage:
#   1. Right-click Windows PowerShell and choose Run as Administrator
#   2. Temporarily allow script execution:
#        Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
#   3. Run:
#        .\uninstall-zerotier.ps1
#
# Behavior (idempotent):
#   1. Leave all joined ZeroTier networks
#   2. Stop-Service ZeroTierOneService
#   3. Uninstall MSI, preferring Get-Package and falling back to registry UninstallString
#   4. Remove leftovers: identity, networks, directories
# ============================================================

[CmdletBinding()]
param()

$ErrorActionPreference = "Continue"

function Log    ([string]$msg) { Write-Host "[+] $msg" -ForegroundColor Green }
function Warn   ([string]$msg) { Write-Host "[!] $msg" -ForegroundColor Yellow }
function Err    ([string]$msg) { Write-Host "[x] $msg" -ForegroundColor Red }
function Header ([string]$msg) { Write-Host "`n=== $msg ===" -ForegroundColor Cyan }

function Get-ZeroTierCli {
    # Do not expand ProgramFiles(x86) directly inside a double-quoted string; Windows PowerShell 5.x can be confused by
    # the parentheses in the path, even with a $() subexpression.
    # Use the .NET API first, store the value, then interpolate it.
    $pf86 = [Environment]::GetFolderPath('ProgramFilesX86')
    $candidates = @(
        "$env:ProgramFiles\ZeroTier\One\zerotier-cli.bat",
        "$pf86\ZeroTier\One\zerotier-cli.bat"
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

$ztCli = Get-ZeroTierCli
$svc   = Get-Service -Name ZeroTierOneService -ErrorAction SilentlyContinue

if (-not $ztCli -and -not $svc) {
    Warn "ZeroTier was not detected; leftover directories will still be removed"
}

# ============================================================
# 1. Leave all networks
# ============================================================
Header "1. Leave all ZeroTier networks"

if ($ztCli -and $svc -and $svc.Status -eq "Running") {
    try {
        $output = & $ztCli listnetworks 2>&1 | Out-String
        # Output format: "200 listnetworks <nwid> <name> <mac> <status> <type> <dev> <ips>"
        $nwids = ($output -split "`n") |
                 ForEach-Object {
                     if ($_ -match '^200 listnetworks\s+([0-9a-f]{16})\s') { $matches[1] }
                 } | Where-Object { $_ }
        if ($nwids) {
            foreach ($id in $nwids) {
                Log "leave $id"
                & $ztCli leave $id 2>&1 | Out-Null
            }
        } else {
            Warn "No joined networks"
        }
    } catch {
        Warn "leave failed; continuing: $_"
    }
} else {
    Warn "ZeroTier service is not running; skipping leave"
}

# ============================================================
# 2. Stop service
# ============================================================
Header "2. Stop ZeroTierOneService"
if ($svc) {
    if ($svc.Status -eq "Running") {
        Stop-Service -Name ZeroTierOneService -Force -ErrorAction SilentlyContinue
        Log "Service stopped"
    } else {
        Warn "Current service status: $($svc.Status)"
    }
    Set-Service -Name ZeroTierOneService -StartupType Disabled -ErrorAction SilentlyContinue
} else {
    Warn "ZeroTierOneService was not found"
}

# ============================================================
# 3. Uninstall MSI
# ============================================================
Header "3. Uninstall ZeroTier package"

$uninstalled = $false

try {
    $pkg = Get-Package -Name "ZeroTier*" -ErrorAction SilentlyContinue
    if ($pkg) {
        Log "Uninstalling via Get-Package: $($pkg.Name) $($pkg.Version)"
        $pkg | Uninstall-Package -Force -ErrorAction Stop | Out-Null
        $uninstalled = $true
    }
} catch {
    Warn "Get-Package uninstall failed: $_"
}

if (-not $uninstalled) {
    $uninstKey = "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*",
                 "HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*"
    $entries = Get-ItemProperty $uninstKey -ErrorAction SilentlyContinue |
               Where-Object { $_.DisplayName -like "ZeroTier*" }
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
    "$env:ProgramFiles\ZeroTier",
    "$pf86\ZeroTier",
    "$env:ProgramData\ZeroTier",
    "$env:LOCALAPPDATA\ZeroTier"
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
    "HKLM:\SOFTWARE\ZeroTier",
    "HKLM:\SOFTWARE\WOW6432Node\ZeroTier",
    "HKLM:\SYSTEM\CurrentControlSet\Services\ZeroTierOneService"
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

if (Get-ZeroTierCli) {
    Err "zerotier-cli.bat still exists"
} else {
    Log "zerotier-cli is gone"
}

if (Get-Service -Name ZeroTierOneService -ErrorAction SilentlyContinue) {
    Warn "ZeroTierOneService is still registered; a reboot may clear it"
} else {
    Log "ZeroTierOneService is cleared"
}

if (Get-Package -Name "ZeroTier*" -ErrorAction SilentlyContinue) {
    Warn "Get-Package still finds ZeroTier"
} else {
    Log "ZeroTier is gone from the package manager"
}

$leftovers = $residues | Where-Object { Test-Path $_ }
if ($leftovers) {
    Warn "Remaining leftover directories:$leftovers"
} else {
    Log "Leftover directories are cleared"
}

Write-Host
Log "Uninstall complete"
