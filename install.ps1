# LailatulCoder Ai - Windows Install Script
# Usage: irm https://raw.githubusercontent.com/radmikasyraf/lailatulcoder-code/main/install.ps1 | iex

$ErrorActionPreference = "Stop"

$RELEASE_URL = "https://github.com/radmikasyraf/lailatulcoder-code/releases/latest/download/lailatulcoder-ai-v0.21.14.zip"
$INSTALL_DIR = "$env:USERPROFILE\.lailatulcoder-install"
$MIN_NODE_VERSION = 22

Write-Host ""
Write-Host "  LailatulCoder Ai - Installer" -ForegroundColor Cyan
Write-Host "  =============================" -ForegroundColor Cyan
Write-Host ""

# Check Node.js
Write-Host "Checking Node.js..." -ForegroundColor Yellow
try {
    $nodeVersion = node --version 2>$null
    if ($nodeVersion) {
        $nodeMajor = [int]($nodeVersion -replace 'v(\d+)\..*', '$1')
        if ($nodeMajor -lt $MIN_NODE_VERSION) {
            Write-Host "ERROR: Node.js v$MIN_NODE_VERSION+ required. Found $nodeVersion" -ForegroundColor Red
            Write-Host "Download from: https://nodejs.org/en/download" -ForegroundColor Yellow
            exit 1
        }
        Write-Host "Node.js $nodeVersion OK" -ForegroundColor Green
    }
} catch {
    Write-Host "ERROR: Node.js not found. Please install Node.js v$MIN_NODE_VERSION+" -ForegroundColor Red
    Write-Host "Download from: https://nodejs.org/en/download" -ForegroundColor Yellow
    exit 1
}

# Download release
Write-Host "Downloading LailatulCoder Ai (13.6 MB)..." -ForegroundColor Yellow
$zipPath = "$env:TEMP\lailatulcoder.zip"

try {
    Invoke-WebRequest -Uri $RELEASE_URL -OutFile $zipPath -UseBasicParsing
    Write-Host "Download complete" -ForegroundColor Green
} catch {
    Write-Host "ERROR: Failed to download. Check your internet connection." -ForegroundColor Red
    exit 1
}

# Extract
Write-Host "Extracting..." -ForegroundColor Yellow
if (Test-Path $INSTALL_DIR) {
    Remove-Item -Recurse -Force $INSTALL_DIR
}
New-Item -ItemType Directory -Path $INSTALL_DIR -Force | Out-Null
Expand-Archive -Path $zipPath -DestinationPath $INSTALL_DIR -Force
Remove-Item $zipPath -Force
Write-Host "Extracted to $INSTALL_DIR" -ForegroundColor Green

# Install dependencies
Write-Host "Installing dependencies (this may take a few minutes)..." -ForegroundColor Yellow
Set-Location $INSTALL_DIR
npm install 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: npm install failed" -ForegroundColor Red
    exit 1
}
Write-Host "Dependencies installed" -ForegroundColor Green

# Link CLI
Write-Host "Setting up lailatulcoder command..." -ForegroundColor Yellow
Set-Location "$INSTALL_DIR\packages\cli"
npm link 2>&1 | Out-Null
Write-Host "Command linked" -ForegroundColor Green

Write-Host ""
Write-Host "  Installation complete!" -ForegroundColor Green
Write-Host ""
Write-Host "  Run: lailatulcoder" -ForegroundColor Cyan
Write-Host "  Then type /auth to configure your API key" -ForegroundColor Cyan
Write-Host ""

