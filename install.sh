#!/bin/bash
# LailatulCoder Ai - macOS/Linux Install Script
# Usage: curl -fsSL https://raw.githubusercontent.com/radmikasyraf/lailatulcoder-code/main/install.sh | bash

set -e

REPO="radmikasyraf/lailatulcoder-code"
INSTALL_DIR="$HOME/.lailatulcoder-install"
MIN_NODE_VERSION=22

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

echo ""
echo -e "  ${CYAN}LailatulCoder Ai - Installer${NC}"
echo -e "  ${CYAN}=============================${NC}"
echo ""

# Check Node.js
echo -e "${YELLOW}Checking Node.js...${NC}"
if ! command -v node &> /dev/null; then
    echo -e "${RED}ERROR: Node.js not found. Please install Node.js v${MIN_NODE_VERSION}+${NC}"
    echo "Download from: https://nodejs.org/en/download"
    exit 1
fi

NODE_VERSION=$(node --version | sed 's/v//' | cut -d. -f1)
if [ "$NODE_VERSION" -lt "$MIN_NODE_VERSION" ]; then
    echo -e "${RED}ERROR: Node.js v${MIN_NODE_VERSION}+ required. Found v${NODE_VERSION}${NC}"
    echo "Download from: https://nodejs.org/en/download"
    exit 1
fi
echo -e "${GREEN}Node.js v${NODE_VERSION} OK${NC}"

# Download repo
echo -e "${YELLOW}Downloading LailatulCoder Ai...${NC}"
ZIP_URL="https://github.com/$REPO/archive/refs/heads/main.zip"
ZIP_PATH="/tmp/lailatulcoder.zip"

if command -v curl &> /dev/null; then
    curl -fsSL "$ZIP_URL" -o "$ZIP_PATH"
elif command -v wget &> /dev/null; then
    wget -q "$ZIP_URL" -O "$ZIP_PATH"
else
    echo -e "${RED}ERROR: curl or wget required${NC}"
    exit 1
fi
echo -e "${GREEN}Download complete${NC}"

# Extract
echo -e "${YELLOW}Extracting...${NC}"
rm -rf "$INSTALL_DIR"
unzip -q "$ZIP_PATH" -d /tmp
mv "/tmp/lailatulcoder-code-main" "$INSTALL_DIR"
rm "$ZIP_PATH"
echo -e "${GREEN}Extracted to $INSTALL_DIR${NC}"

# Install dependencies
echo -e "${YELLOW}Installing dependencies (this may take a few minutes)...${NC}"
cd "$INSTALL_DIR"
npm install --ignore-scripts > /dev/null 2>&1
echo -e "${GREEN}Dependencies installed${NC}"

# Link
echo -e "${YELLOW}Setting up lailatulcoder command...${NC}"
cd "$INSTALL_DIR/packages/cli"
npm link > /dev/null 2>&1
echo -e "${GREEN}Command linked${NC}"

echo ""
echo -e "  ${GREEN}Installation complete!${NC}"
echo ""
echo -e "  Run: ${CYAN}lailatulcoder${NC}"
echo -e "  Then type ${CYAN}/auth${NC} to configure your API key"
echo ""
