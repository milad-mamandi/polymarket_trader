#!/bin/bash

#############################################
# Node.js Upgrade Script for Ubuntu/Debian
# Upgrades from Node.js v18/v20 to v22 LTS
#############################################

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

echo -e "${BLUE}╔════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  Node.js Upgrade to v22 LTS           ║${NC}"
echo -e "${BLUE}║  Polymarket Whale Scout Bot            ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════╝${NC}\n"

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo -e "${RED}❌ Error: This script must be run as root${NC}"
    echo "Usage: sudo bash deploy/upgrade-nodejs.sh"
    exit 1
fi

# Check current Node.js version
echo -e "${CYAN}[1/6] Checking Current Node.js Version${NC}"
echo -e "${BLUE}────────────────────────────────────────${NC}\n"

if ! command -v node &> /dev/null; then
    echo -e "${YELLOW}⚠  Node.js is not currently installed${NC}"
    CURRENT_VERSION="none"
else
    CURRENT_VERSION=$(node -v)
    echo -e "${BLUE}Current Node.js version: ${CURRENT_VERSION}${NC}"
    
    NODE_MAJOR=$(echo "$CURRENT_VERSION" | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$NODE_MAJOR" -ge 22 ]; then
        echo -e "${GREEN}✓ Node.js v22+ is already installed!${NC}"
        echo -e "${YELLOW}No upgrade needed. Exiting...${NC}\n"
        exit 0
    fi
fi

echo ""

# Stop whale-scout service if running
echo -e "${CYAN}[2/6] Stopping Services${NC}"
echo -e "${BLUE}────────────────────────────────────────${NC}\n"

if systemctl is-active --quiet whale-scout; then
    echo -e "${BLUE}Stopping whale-scout service...${NC}"
    systemctl stop whale-scout
    echo -e "${GREEN}✓ Service stopped${NC}"
    SERVICE_WAS_RUNNING=true
else
    echo -e "${YELLOW}⚠  whale-scout service is not running${NC}"
    SERVICE_WAS_RUNNING=false
fi

echo ""

# Remove old Node.js
echo -e "${CYAN}[3/6] Removing Old Node.js${NC}"
echo -e "${BLUE}────────────────────────────────────────${NC}\n"

if [ "$CURRENT_VERSION" != "none" ]; then
    echo -e "${BLUE}Removing Node.js $CURRENT_VERSION...${NC}"
    apt-get remove nodejs -y > /dev/null 2>&1
    apt-get autoremove -y > /dev/null 2>&1
    echo -e "${GREEN}✓ Old Node.js removed${NC}"
else
    echo -e "${YELLOW}⚠  No previous Node.js installation to remove${NC}"
fi

echo ""

# Install Node.js v22 LTS
echo -e "${CYAN}[4/6] Installing Node.js v22 LTS${NC}"
echo -e "${BLUE}────────────────────────────────────────${NC}\n"

echo -e "${BLUE}Adding NodeSource repository...${NC}"
curl -fsSL https://deb.nodesource.com/setup_22.x | bash - > /dev/null 2>&1

echo -e "${BLUE}Installing Node.js v22...${NC}"
apt-get install -y nodejs > /dev/null 2>&1

# Verify installation
NEW_VERSION=$(node -v)
NPM_VERSION=$(npm -v)

echo -e "${GREEN}✓ Node.js $NEW_VERSION installed${NC}"
echo -e "${GREEN}✓ npm $NPM_VERSION installed${NC}"

echo ""

# Rebuild native modules if project exists
echo -e "${CYAN}[5/6] Rebuilding Application${NC}"
echo -e "${BLUE}────────────────────────────────────────${NC}\n"

PROJECT_DIR="/opt/whale-scout"
if [ -d "$PROJECT_DIR" ]; then
    echo -e "${BLUE}Found installation at $PROJECT_DIR${NC}"
    echo -e "${BLUE}Rebuilding native modules...${NC}"
    
    cd "$PROJECT_DIR"
    
    # Remove old node_modules and package-lock.json
    if [ -d "node_modules" ]; then
        rm -rf node_modules package-lock.json
        echo -e "${GREEN}✓ Cleaned old dependencies${NC}"
    fi
    
    # Reinstall dependencies
    echo -e "${BLUE}Installing dependencies (this may take a few minutes)...${NC}"
    npm install --silent > /dev/null 2>&1
    
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✓ Dependencies installed successfully${NC}"
    else
        echo -e "${RED}❌ Failed to install dependencies${NC}"
        echo -e "${YELLOW}   You may need to reinstall manually:${NC}"
        echo -e "${YELLOW}     cd $PROJECT_DIR && npm install${NC}"
    fi
else
    echo -e "${YELLOW}⚠  No existing installation found at $PROJECT_DIR${NC}"
    echo -e "${YELLOW}   You'll need to run the deployment script:${NC}"
    echo -e "${YELLOW}     sudo bash deploy/deploy.sh${NC}"
fi

echo ""

# Restart service if it was running
echo -e "${CYAN}[6/6] Restarting Services${NC}"
echo -e "${BLUE}────────────────────────────────────────${NC}\n"

if [ "$SERVICE_WAS_RUNNING" = true ]; then
    echo -e "${BLUE}Starting whale-scout service...${NC}"
    systemctl start whale-scout
    
    # Wait a moment for service to start
    sleep 2
    
    if systemctl is-active --quiet whale-scout; then
        echo -e "${GREEN}✓ Service started successfully${NC}"
    else
        echo -e "${RED}❌ Failed to start service${NC}"
        echo -e "${YELLOW}   Check status with: sudo systemctl status whale-scout${NC}"
        echo -e "${YELLOW}   View logs with: sudo journalctl -u whale-scout -n 50${NC}"
    fi
else
    echo -e "${YELLOW}⚠  Service was not running before upgrade${NC}"
    echo -e "${YELLOW}   Start it manually with: sudo systemctl start whale-scout${NC}"
fi

echo ""

# Summary
echo -e "${GREEN}╔════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║     Node.js Upgrade Complete! ✓        ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════╝${NC}\n"

echo -e "${BLUE}Summary:${NC}"
echo -e "  ${GREEN}✓${NC} Node.js upgraded: ${CURRENT_VERSION} → ${NEW_VERSION}"
echo -e "  ${GREEN}✓${NC} npm version: ${NPM_VERSION}"

if [ -d "$PROJECT_DIR" ]; then
    echo -e "  ${GREEN}✓${NC} Native modules rebuilt"
fi

echo ""

echo -e "${BLUE}Verification:${NC}"
echo -e "  ${CYAN}node -v${NC}    # Check Node.js version"
echo -e "  ${CYAN}npm -v${NC}     # Check npm version"
echo ""

if [ "$SERVICE_WAS_RUNNING" = true ]; then
    echo -e "${BLUE}Service Status:${NC}"
    echo -e "  ${CYAN}sudo systemctl status whale-scout${NC}      # Check service status"
    echo -e "  ${CYAN}sudo journalctl -u whale-scout -f${NC}      # View live logs"
    echo ""
fi

echo -e "${YELLOW}Next Steps:${NC}"
if [ ! -d "$PROJECT_DIR" ]; then
    echo -e "  1. Deploy your application:"
    echo -e "     ${CYAN}cd ~/polymarket_trader${NC}"
    echo -e "     ${CYAN}npm install && npm run build${NC}"
    echo -e "     ${CYAN}sudo bash deploy/deploy.sh${NC}"
elif [ "$SERVICE_WAS_RUNNING" = false ]; then
    echo -e "  1. Start the service:"
    echo -e "     ${CYAN}sudo systemctl start whale-scout${NC}"
else
    echo -e "  1. Verify the bot is running correctly:"
    echo -e "     ${CYAN}sudo journalctl -u whale-scout -n 50${NC}"
fi

echo ""
echo -e "${GREEN}Happy whale hunting! 🐋${NC}\n"
