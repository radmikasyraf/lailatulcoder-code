#!/usr/bin/env bash
# LailatulCoder Ai - macOS / Linux Installer
# Usage: curl -fsSL https://raw.githubusercontent.com/radmikasyraf/lailatulcoder-code/main/install.sh | bash
#
# 1. Checks for Node.js. Installs it if missing.
# 2. Checks the version. Upgrades it if below the minimum.
# 3. Installs lailatulcoder globally via npm.

set -e

MIN_NODE_MAJOR=22
NVM_DIR="${NVM_DIR:-$HOME/.nvm}"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

echo ""
echo -e "${CYAN}  LailatulCoder Ai - Installer${NC}"
echo -e "${CYAN}  =============================${NC}"
echo ""

get_node_major() {
  if command -v node >/dev/null 2>&1; then
    node --version | sed -E 's/^v([0-9]+)\..*/\1/'
  else
    echo ""
  fi
}

install_or_upgrade_node() {
  reason="$1"
  echo -e "${YELLOW}${reason}${NC}"

  OS="$(uname -s)"
  if [ "$OS" = "Darwin" ] && command -v brew >/dev/null 2>&1; then
    # macOS with Homebrew available: simplest, most standard path.
    echo -e "${YELLOW}Installing Node.js via Homebrew...${NC}"
    brew install node
    return
  fi

  # Universal fallback (works on any Linux distro and on macOS without
  # Homebrew, no root required): nvm, installing into the user's home dir.
  if [ ! -s "$NVM_DIR/nvm.sh" ]; then
    echo -e "${YELLOW}Installing nvm (Node Version Manager)...${NC}"
    curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
  fi
  # shellcheck disable=SC1091
  \. "$NVM_DIR/nvm.sh"
  echo -e "${YELLOW}Installing Node.js LTS via nvm...${NC}"
  nvm install --lts
  nvm alias default 'lts/*'
}

# 1 & 2: check Node.js, install or upgrade as needed.
NODE_MAJOR="$(get_node_major)"

if [ -z "$NODE_MAJOR" ]; then
  install_or_upgrade_node "Node.js not found. Installing Node.js LTS..."
  NODE_MAJOR="$(get_node_major)"
  if [ -z "$NODE_MAJOR" ]; then
    echo -e "${RED}ERROR: Node.js installation did not complete. Install it manually from https://nodejs.org/en/download, then re-run this script.${NC}"
    exit 1
  fi
  echo -e "${GREEN}Node.js v${NODE_MAJOR} installed.${NC}"
elif [ "$NODE_MAJOR" -lt "$MIN_NODE_MAJOR" ]; then
  install_or_upgrade_node "Node.js v${NODE_MAJOR} found, but v${MIN_NODE_MAJOR}+ is required. Upgrading..."
  NODE_MAJOR="$(get_node_major)"
  if [ -z "$NODE_MAJOR" ] || [ "$NODE_MAJOR" -lt "$MIN_NODE_MAJOR" ]; then
    echo -e "${RED}ERROR: Node.js upgrade did not complete. Upgrade it manually from https://nodejs.org/en/download, then re-run this script.${NC}"
    exit 1
  fi
  echo -e "${GREEN}Node.js upgraded to v${NODE_MAJOR}.${NC}"
else
  echo -e "${GREEN}Node.js v${NODE_MAJOR} found (meets the v${MIN_NODE_MAJOR}+ requirement).${NC}"
fi

# 3: install lailatulcoder.
echo ""
echo -e "${YELLOW}Installing LailatulCoder Ai...${NC}"
npm install -g lailatulcoder

echo ""
echo -e "${GREEN}  Installation complete!${NC}"
echo ""
echo -e "${CYAN}  Run: lailatulcoder${NC}"
echo -e "${CYAN}  Then type /auth to configure your API key${NC}"
echo ""
