# ============================================================
# Install Tailscale on Windows and join a Headscale tailnet
# Run PowerShell as Administrator on Windows
#
# Usage:
#   1. Right-click Windows PowerShell and choose Run as Administrator
#   2. Temporarily allow script execution:
#        Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
#   3. Run:
#        .\install-tailscale.ps1 -AuthKey "hskey-auth-xxxxx"
#        .\install-tailscale.ps1 -AuthKey "hskey-auth-xxxxx" -HostName "my-laptop"
#
# Steps:
#   1. Detect Windows version and architecture
#   2. Download and silently install the Tailscale .msi
#   3. Start the Tailscale service
#   4. Join the specified Headscale server with a preauthkey
#   5. Verify DERP region visibility
# ============================================================

[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)]
    [string]$AuthKey,

    [Parameter(Mandatory=$false)]
    [string]$HostName = $env:COMPUTERNAME,

    [Parameter(Mandatory=$false)]
    [string]$HeadscaleUrl = $env:HEADSCALE_URL,

    [Parameter(Mandatory=$false)]
    [string]$MsiUrl = "https://pkgs.tailscale.com/stable/tailscale-setup-latest-amd64.msi"
)

$ErrorActionPreference = "Stop"

# ============================================================
# Helpers
# ============================================================
function Log    ([string]$msg) { Write-Host "[+] $msg" -ForegroundColor Green }
function Warn   ([string]$msg) { Write-Host "[!] $msg" -ForegroundColor Yellow }
function Err    ([string]$msg) { Write-Host "[x] $msg" -ForegroundColor Red }
function Header ([string]$msg) { Write-Host "`n=== $msg ===" -ForegroundColor Cyan }

if ([string]::IsNullOrWhiteSpace($HeadscaleUrl)) {
    Err "HeadscaleUrl is missing. Pass -HeadscaleUrl 'https://headscale.example.com' or set the HEADSCALE_URL environment variable."
    exit 1
}

# Find tailscale.exe; used before and after installation
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
# Preflight checks
# ============================================================
Header "Preflight checks"

# 1. Administrator privileges
$currentPrincipal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $currentPrincipal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Err "Administrator privileges are required. Right-click PowerShell, choose Run as Administrator, and try again."
    exit 1
}
Log "Administrator privileges OK"

# 2. OS version
$os = Get-CimInstance Win32_OperatingSystem
Log "System: $($os.Caption) ($($os.OSArchitecture))"

# 3. Check Headscale health
Log "Checking Headscale health: $HeadscaleUrl/health"
try {
    $resp = Invoke-WebRequest -Uri "$HeadscaleUrl/health" -UseBasicParsing -TimeoutSec 10
    if ($resp.StatusCode -ne 200) { throw "HTTP $($resp.StatusCode)" }
    Log "headscale healthy"
} catch {
    Err "Cannot reach $HeadscaleUrl/health: $_"
    Err "Check DNS and outbound firewall rules"
    exit 1
}

# ============================================================
# Install Tailscale
# ============================================================
Header "Install Tailscale"

$tsExe = Get-TailscaleExe

if ($tsExe) {
    $existingVer = & $tsExe version | Select-Object -First 1
    Warn "Tailscale is already installed: $existingVer"
    Warn "Skipping download/install and continuing to join flow"
} else {
    $msiPath = "$env:TEMP\tailscale-setup.msi"
    Log "Downloading MSI: $MsiUrl"
    try {
        # Use BitsTransfer when available; otherwise fall back to Invoke-WebRequest
        if (Get-Command Start-BitsTransfer -ErrorAction SilentlyContinue) {
            Start-BitsTransfer -Source $MsiUrl -Destination $msiPath -ErrorAction Stop
        } else {
            Invoke-WebRequest -Uri $MsiUrl -OutFile $msiPath -UseBasicParsing
        }
    } catch {
        Err "Download failed: $_"
        Err "If the network is unstable, download $MsiUrl manually, place it at $msiPath, then comment out the download section and rerun"
        exit 1
    }

    $msiSize = (Get-Item $msiPath).Length
    Log "Download complete: $([math]::Round($msiSize/1MB, 1)) MB"

    Log "Silent MSI install (msiexec /qn)"
    $proc = Start-Process msiexec.exe -ArgumentList "/i `"$msiPath`" /qn /norestart" -Wait -PassThru
    if ($proc.ExitCode -ne 0) {
        Err "msiexec exit code $($proc.ExitCode)"
        exit 1
    }

    Remove-Item $msiPath -Force -ErrorAction SilentlyContinue

    $tsExe = Get-TailscaleExe
    if (-not $tsExe) {
        Err "tailscale.exe was not found after installation"
        exit 1
    }
    Log "Installed: $(& $tsExe version | Select-Object -First 1)"
}

# ============================================================
# Start service
# ============================================================
Header "Start the Tailscale service"

$svc = Get-Service -Name Tailscale -ErrorAction SilentlyContinue
if (-not $svc) {
    Err "Tailscale service was not found; installation may not have completed"
    exit 1
}

if ($svc.Status -ne "Running") {
    Log "Starting Tailscale service"
    Start-Service -Name Tailscale
    Start-Sleep -Seconds 3
} else {
    Log "Service is already running"
}

# ============================================================
# Join Headscale
# ============================================================
Header "Join Headscale"

Log "tailscale up (hostname=$HostName)"

$upArgs = @(
    "up",
    "--login-server=$HeadscaleUrl",
    "--auth-key=$AuthKey",
    "--hostname=$HostName",
    "--unattended"           # Avoid interactive login prompts on Windows
)

# Timeout: 60s
$job = Start-Job -ScriptBlock {
    param($exe, $arguments)
    & $exe @arguments 2>&1
} -ArgumentList $tsExe, $upArgs

if (Wait-Job $job -Timeout 60) {
    $output = Receive-Job $job
    Write-Host $output
    Remove-Job $job
} else {
    Stop-Job $job
    Remove-Job $job
    Err "tailscale up timed out after 60s"
    Err "Troubleshooting: check $env:ProgramFiles\Tailscale\tailscaled.log.txt"
    exit 1
}

# ============================================================
# Verify DERP and latency
# ============================================================
Header "Verify embedded DERP"

Start-Sleep -Seconds 4

try {
    $netcheck = & $tsExe netcheck 2>&1 | Out-String
    $nearest = ($netcheck | Select-String -Pattern 'Nearest DERP:\s*(.+)').Matches.Groups[1].Value
    $latencyLine = ($netcheck | Select-String -Pattern '\-\s+headscale:\s*(\S+)').Matches.Groups[1].Value

    if ($latencyLine) {
        Log "Headscale embedded DERP latency: $latencyLine"
    }
    if ($nearest) {
        Log "Nearest DERP: $nearest"
        if ($nearest.Trim() -ne "Headscale Embedded DERP") {
            Warn "Nearest DERP is not Headscale; UDP 3478/STUN may be blocked"
        }
    } else {
        Warn "Headscale region was not found in netcheck"
        Warn "New nodes should pick it up automatically; older nodes may need to rerun 'tailscale logout && tailscale up ...'"
    }
} catch {
    Warn "netcheck failed: $_"
}

# ============================================================
# Result
# ============================================================
Header "Done"

Write-Host
& $tsExe status
Write-Host
$ip4 = & $tsExe ip -4 2>$null
$ip6 = & $tsExe ip -6 2>$null
Write-Host "Local tailnet IP: $ip4 / $ip6"
Write-Host

Log "Done. You can ping $ip4 from another node to test connectivity"
Write-Host
Write-Host "If ping latency is still high (>50ms across networks), run:"
Write-Host "  tailscale debug derp-map | findstr /C:headscale"
Write-Host "  Confirm region 999 is visible; if not, run 'tailscale logout' and then tailscale up again"
