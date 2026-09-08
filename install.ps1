# LailatulCoder Ai - Windows Install Script
# Usage: irm https://raw.githubusercontent.com/radmikasyraf/lailatulcoder-code/main/install.ps1 | iex

$RELEASE_URL = "https://github.com/radmikasyraf/lailatulcoder-code/releases/latest/download/lailatulcoder-ai-v0.21.14.zip"
$INSTALL_DIR = "$env:USERPROFILE\.lailatulcoder-install"
$MIN_NODE_VERSION = 22

Write-Host ""
Write-Host "  LailatulCoder Ai - Installer" -ForegroundColor Cyan
Write-Host "  =============================" -ForegroundColor Cyan
Write-Host ""

# Check Node.js
Write-Host "Checking Node.js..." -ForegroundColor Yellow
$nodeVersion = $null
try { $nodeVersion = (node --version 2>&1) } catch {}

if (-not $nodeVersion -or $nodeVersion -notmatch 'v\d+') {
    Write-Host "ERROR: Node.js not found. Please install Node.js v$MIN_NODE_VERSION+" -ForegroundColor Red
    Write-Host "Download from: https://nodejs.org/en/download" -ForegroundColor Yellow
    exit 1
}

$nodeMajor = [int]($nodeVersion -replace 'v(\d+)\..*', '$1')
if ($nodeMajor -lt $MIN_NODE_VERSION) {
    Write-Host "ERROR: Node.js v$MIN_NODE_VERSION+ required. Found $nodeVersion" -ForegroundColor Red
    exit 1
}
Write-Host "Node.js $nodeVersion OK" -ForegroundColor Green

# Download release
Write-Host "Downloading LailatulCoder Ai (20.1 MB)..." -ForegroundColor Yellow
$zipPath = "$env:TEMP\lailatulcoder.zip"

try {
    Invoke-WebRequest -Uri $RELEASE_URL -OutFile $zipPath -UseBasicParsing
    Write-Host "Download complete" -ForegroundColor Green
} catch {
    Write-Host "ERROR: Failed to download." -ForegroundColor Red
    exit 1
}

# Extract
Write-Host "Extracting..." -ForegroundColor Yellow
if (Test-Path $INSTALL_DIR) { Remove-Item -Recurse -Force $INSTALL_DIR }
New-Item -ItemType Directory -Path $INSTALL_DIR -Force | Out-Null
Expand-Archive -Path $zipPath -DestinationPath $INSTALL_DIR -Force
Remove-Item $zipPath -Force
Write-Host "Extracted" -ForegroundColor Green

# Install dependencies
Write-Host "Installing dependencies (this may take a few minutes)..." -ForegroundColor Yellow
Push-Location $INSTALL_DIR
cmd /c "npm install > nul 2>&1"
Pop-Location
Write-Host "Dependencies installed" -ForegroundColor Green

# Copy workspace packages to node_modules
Write-Host "Setting up workspace packages..." -ForegroundColor Yellow
$lailatulDir = "$INSTALL_DIR\node_modules\@lailatul-coder"
New-Item -ItemType Directory -Path $lailatulDir -Force | Out-Null

$workspaceMap = @{
    'packages\core' = 'lailatul-coder-core'
    'packages\web-templates' = 'web-templates'
    'packages\acp-bridge' = 'acp-bridge'
    'packages\channels\base' = 'channel-base'
    'packages\channels\weixin' = 'channel-weixin'
    'packages\channels\dingtalk' = 'channel-dingtalk'
    'packages\channels\telegram' = 'channel-telegram'
    'packages\channels\wecom' = 'channel-wecom'
    'packages\channels\feishu' = 'channel-feishu'
    'packages\channels\github' = 'channel-github'
    'packages\channels\gitlab' = 'channel-gitlab'
    'packages\channels\qqbot' = 'channel-qqbot'
}

foreach ($ws in $workspaceMap.GetEnumerator()) {
    $src = "$INSTALL_DIR\$($ws.Key)"
    $dest = "$lailatulDir\$($ws.Value)"
    if (Test-Path $src) {
        if (Test-Path $dest) { Remove-Item -Recurse -Force $dest }
        Copy-Item -Recurse -Force $src $dest
        Write-Host "  ✓ @lailatul-coder/$($ws.Value)" -ForegroundColor Gray
    }
}
Write-Host "Workspace packages ready" -ForegroundColor Green

# Link CLI command
Write-Host "Setting up lailatulcoder command..." -ForegroundColor Yellow
Push-Location "$INSTALL_DIR\packages\cli"
cmd /c "npm link > nul 2>&1"
Pop-Location
Write-Host "Command linked" -ForegroundColor Green

Write-Host ""
Write-Host "  Installation complete!" -ForegroundColor Green
Write-Host ""
Write-Host "  Run: lailatulcoder" -ForegroundColor Cyan
Write-Host "  Then type /auth to configure your API key" -ForegroundColor Cyan
Write-Host ""

