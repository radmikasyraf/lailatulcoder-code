#!/usr/bin/env pwsh
# LailatulCoder Ai - Windows Installer
# Usage: irm https://raw.githubusercontent.com/radmikasyraf/lailatulcoder-code/main/install.ps1 | iex
#
# 1. Checks for Node.js. Installs it if missing.
# 2. Checks the version. Upgrades it if below the minimum.
# 3. Installs lailatulcoder globally via npm.

$ErrorActionPreference = "Stop"
$MIN_NODE_MAJOR = 22

Write-Host ""
Write-Host "  LailatulCoder Ai - Installer" -ForegroundColor Cyan
Write-Host "  =============================" -ForegroundColor Cyan
Write-Host ""

function Get-NodeMajorVersion {
    try {
        $v = (& node --version) 2>$null
        if ($v -match '^v(\d+)\.') {
            return [int]$Matches[1]
        }
    } catch {
        return $null
    }
    return $null
}

function Get-LatestNodeMsiUrl {
    # Pull the official release index and pick the newest LTS release that
    # satisfies MIN_NODE_MAJOR, rather than hardcoding a version that will
    # go stale.
    $index = Invoke-RestMethod -Uri "https://nodejs.org/dist/index.json" -UseBasicParsing
    $candidate = $index |
        Where-Object { $_.lts -and ([int]($_.version -replace '^v(\d+)\..*', '$1')) -ge $MIN_NODE_MAJOR } |
        Sort-Object { [version]($_.version -replace '^v', '') } -Descending |
        Select-Object -First 1
    if (-not $candidate) {
        # No LTS yet on this major — fall back to the newest release of it, LTS or not.
        $candidate = $index |
            Where-Object { ([int]($_.version -replace '^v(\d+)\..*', '$1')) -ge $MIN_NODE_MAJOR } |
            Sort-Object { [version]($_.version -replace '^v', '') } -Descending |
            Select-Object -First 1
    }
    if (-not $candidate) {
        throw "Could not find a Node.js v$MIN_NODE_MAJOR+ release in the official index."
    }
    $arch = if ([Environment]::Is64BitOperatingSystem) { "x64" } else { "x86" }
    return "https://nodejs.org/dist/$($candidate.version)/node-$($candidate.version)-$arch.msi"
}

function Install-OrUpgrade-Node {
    param([string]$Reason)
    Write-Host $Reason -ForegroundColor Yellow

    $winget = Get-Command winget -ErrorAction SilentlyContinue
    if ($winget) {
        Write-Host "Installing Node.js via winget..." -ForegroundColor Yellow
        try {
            winget install --id OpenJS.NodeJS.LTS --silent --accept-package-agreements --accept-source-agreements
        } catch {
            Write-Host "winget install failed, falling back to direct MSI download..." -ForegroundColor Yellow
            Install-NodeViaMsi
        }
    } else {
        Install-NodeViaMsi
    }

    # Refresh PATH in this session so node/npm resolve without reopening the terminal.
    $machinePath = [System.Environment]::GetEnvironmentVariable("Path", "Machine")
    $userPath = [System.Environment]::GetEnvironmentVariable("Path", "User")
    $env:Path = "$machinePath;$userPath"
}

function Install-NodeViaMsi {
    $msiUrl = Get-LatestNodeMsiUrl
    $installerPath = "$env:TEMP\lailatulcoder-node-installer.msi"
    Write-Host "Downloading Node.js installer from $msiUrl ..." -ForegroundColor Yellow
    Invoke-WebRequest -Uri $msiUrl -OutFile $installerPath -UseBasicParsing
    Write-Host "Installing Node.js (may prompt for administrator permission)..." -ForegroundColor Yellow
    Start-Process msiexec.exe -ArgumentList "/i", "`"$installerPath`"", "/quiet", "/norestart" -Wait
    Remove-Item $installerPath -Force -ErrorAction SilentlyContinue
}

# 1 & 2: check Node.js, install or upgrade as needed.
$nodeMajor = Get-NodeMajorVersion

if ($null -eq $nodeMajor) {
    Install-OrUpgrade-Node -Reason "Node.js not found. Installing Node.js LTS..."
    $nodeMajor = Get-NodeMajorVersion
    if ($null -eq $nodeMajor) {
        Write-Host "ERROR: Node.js installation did not complete. Install it manually from https://nodejs.org/en/download, then re-run this script." -ForegroundColor Red
        exit 1
    }
    Write-Host "Node.js v$nodeMajor installed." -ForegroundColor Green
} elseif ($nodeMajor -lt $MIN_NODE_MAJOR) {
    Install-OrUpgrade-Node -Reason "Node.js v$nodeMajor found, but v$MIN_NODE_MAJOR+ is required. Upgrading..."
    $nodeMajor = Get-NodeMajorVersion
    if ($null -eq $nodeMajor -or $nodeMajor -lt $MIN_NODE_MAJOR) {
        Write-Host "ERROR: Node.js upgrade did not complete. Upgrade it manually from https://nodejs.org/en/download, then re-run this script." -ForegroundColor Red
        exit 1
    }
    Write-Host "Node.js upgraded to v$nodeMajor." -ForegroundColor Green
} else {
    Write-Host "Node.js v$nodeMajor found (meets the v$MIN_NODE_MAJOR+ requirement)." -ForegroundColor Green
}

# 3: install lailatulcoder.
Write-Host ""
Write-Host "Installing LailatulCoder Ai..." -ForegroundColor Yellow
& npm install -g lailatulcoder
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: npm install failed (exit code $LASTEXITCODE)." -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "  Installation complete!" -ForegroundColor Green
Write-Host ""
Write-Host "  Run: lailatulcoder" -ForegroundColor Cyan
Write-Host "  Then type /auth to configure your API key" -ForegroundColor Cyan
Write-Host ""
