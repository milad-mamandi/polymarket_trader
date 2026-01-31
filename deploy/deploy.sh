#!/bin/bash

#############################################
# Polymarket Whale Scout - Automated Deploy
# Builds and installs the bot on Ubuntu VPS
#############################################

set -e  # Exit on any error

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

echo -e "${BLUE}╔════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  Polymarket Whale Scout - Deployer    ║${NC}"
echo -e "${BLUE}║  Automated Build & Installation       ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════╝${NC}\n"

#############################################
# Step 1: Pre-flight Checks
#############################################

echo -e "${CYAN}[1/7] Pre-flight Checks${NC}"
echo -e "${BLUE}────────────────────────────────────────${NC}\n"

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo -e "${RED}❌ Error: This script must be run as root${NC}"
    echo "Usage: sudo bash deploy/deploy.sh"
    exit 1
fi
echo -e "${GREEN}✓ Running as root${NC}"

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Error: Node.js is not installed${NC}"
    echo "Please install Node.js v22 LTS or higher first:"
    echo "  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -"
    echo "  sudo apt-get install -y nodejs"
    echo ""
    echo "Or use the automated upgrade script:"
    echo "  sudo bash deploy/upgrade-nodejs.sh"
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 22 ]; then
    echo -e "${RED}❌ Error: Node.js version 22+ required (found v$NODE_VERSION)${NC}"
    echo ""
    echo -e "${YELLOW}This bot requires Node.js v22 LTS for ES2022+ syntax support.${NC}"
    echo ""
    echo "To upgrade Node.js on Ubuntu/Debian:"
    echo "  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -"
    echo "  sudo apt-get install -y nodejs"
    echo ""
    echo "Or use the automated upgrade script:"
    echo "  sudo bash deploy/upgrade-nodejs.sh"
    exit 1
fi
echo -e "${GREEN}✓ Node.js $(node -v) detected${NC}"

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo -e "${RED}❌ Error: npm is not installed${NC}"
    exit 1
fi
echo -e "${GREEN}✓ npm $(npm -v) detected${NC}"

# Navigate to project root
cd "$PROJECT_ROOT"
echo -e "${GREEN}✓ Working directory: $PROJECT_ROOT${NC}"

# Check if package.json exists
if [ ! -f "package.json" ]; then
    echo -e "${RED}❌ Error: package.json not found${NC}"
    echo "Are you in the project root directory?"
    exit 1
fi
echo -e "${GREEN}✓ package.json found${NC}\n"

#############################################
# Step 2: Install Dependencies
#############################################

echo -e "${CYAN}[2/7] Installing Dependencies${NC}"
echo -e "${BLUE}────────────────────────────────────────${NC}\n"

echo -e "${BLUE}Installing root dependencies (including devDependencies for build)...${NC}"
npm install

if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Error: Failed to install dependencies${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Root dependencies installed${NC}\n"

#############################################
# Step 3: Build Backend
#############################################

echo -e "${CYAN}[3/7] Building Backend${NC}"
echo -e "${BLUE}────────────────────────────────────────${NC}\n"

echo -e "${BLUE}Running TypeScript compiler...${NC}"
npm run build

if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Error: Backend build failed${NC}"
    exit 1
fi

# Verify dist directory was created
if [ ! -d "dist" ]; then
    echo -e "${RED}❌ Error: 'dist' directory was not created${NC}"
    exit 1
fi

# Check for main entry point
if [ ! -f "dist/main.js" ]; then
    echo -e "${YELLOW}⚠  Warning: dist/main.js not found${NC}"
fi

# Check for CLI entry point
if [ ! -f "dist/cli/index.js" ]; then
    echo -e "${RED}❌ Error: dist/cli/index.js not found${NC}"
    echo -e "${YELLOW}   CLI entry point is missing. Build may have failed.${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Backend built successfully${NC}"
echo -e "${BLUE}  Build output: dist/${NC}\n"

#############################################
# Step 4: Build Frontend
#############################################

echo -e "${CYAN}[4/7] Building Frontend${NC}"
echo -e "${BLUE}────────────────────────────────────────${NC}\n"

if [ ! -d "src/web/client" ]; then
    echo -e "${YELLOW}⚠  Warning: Frontend directory not found, skipping...${NC}\n"
else
    echo -e "${BLUE}Installing frontend dependencies...${NC}"
    cd src/web/client
    
    npm install
    
    if [ $? -ne 0 ]; then
        echo -e "${RED}❌ Error: Failed to install frontend dependencies${NC}"
        exit 1
    fi
    
    echo -e "${BLUE}Building frontend with Vite...${NC}"
    npm run build
    
    if [ $? -ne 0 ]; then
        echo -e "${RED}❌ Error: Frontend build failed${NC}"
        exit 1
    fi
    
    # Verify frontend dist was created
    if [ ! -d "dist" ]; then
        echo -e "${RED}❌ Error: Frontend 'dist' directory was not created${NC}"
        exit 1
    fi
    
    if [ ! -f "dist/index.html" ]; then
        echo -e "${YELLOW}⚠  Warning: dist/index.html not found${NC}"
    fi
    
    cd "$PROJECT_ROOT"
    
    echo -e "${GREEN}✓ Frontend built successfully${NC}"
    echo -e "${BLUE}  Build output: src/web/client/dist/${NC}\n"
fi

#############################################
# Step 5: Validate Build Artifacts
#############################################

echo -e "${CYAN}[5/7] Validating Build Artifacts${NC}"
echo -e "${BLUE}────────────────────────────────────────${NC}\n"

BACKEND_SIZE=$(du -sh dist 2>/dev/null | cut -f1)
echo -e "${GREEN}✓ Backend build: $BACKEND_SIZE${NC}"

if [ -d "src/web/client/dist" ]; then
    FRONTEND_SIZE=$(du -sh src/web/client/dist 2>/dev/null | cut -f1)
    echo -e "${GREEN}✓ Frontend build: $FRONTEND_SIZE${NC}"
else
    echo -e "${YELLOW}⚠  Frontend not built (dashboard will be unavailable)${NC}"
fi

echo -e "\n${GREEN}✓ All build artifacts validated${NC}\n"

#############################################
# Step 6: Run Installation Script
#############################################

echo -e "${CYAN}[6/7] Installing as System Service${NC}"
echo -e "${BLUE}────────────────────────────────────────${NC}\n"

if [ ! -f "deploy/install.sh" ]; then
    echo -e "${RED}❌ Error: deploy/install.sh not found${NC}"
    exit 1
fi

echo -e "${BLUE}Running install.sh...${NC}\n"

# Make install.sh executable
chmod +x deploy/install.sh

# Run the installer
bash deploy/install.sh

if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Error: Installation failed${NC}"
    exit 1
fi

#############################################
# Step 7: Post-Install Summary
#############################################

echo -e "\n${CYAN}[7/7] Deployment Complete${NC}"
echo -e "${BLUE}────────────────────────────────────────${NC}\n"

echo -e "${GREEN}╔════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║     Deployment Successful! ✓           ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════╝${NC}\n"

echo -e "${BLUE}What was deployed:${NC}"
echo -e "  ${GREEN}✓${NC} Backend build (TypeScript compiled)"
if [ -d "src/web/client/dist" ]; then
    echo -e "  ${GREEN}✓${NC} Frontend build (React dashboard)"
else
    echo -e "  ${YELLOW}⚠${NC} Frontend not built"
fi
echo -e "  ${GREEN}✓${NC} Systemd service installed"
echo -e "  ${GREEN}✓${NC} Log rotation configured"
echo -e "  ${GREEN}✓${NC} Service user created\n"

echo -e "${YELLOW}⚠  NEXT STEPS:${NC}\n"

echo -e "${BLUE}1. Configure your bot:${NC}"
echo -e "   ${CYAN}sudo nano /opt/whale-scout/.env${NC}"
echo -e "   → Set TELEGRAM_BOT_TOKEN (optional)"
echo -e "   → Set WHALE_THRESHOLD_USD"
echo -e "   → Set DASHBOARD_PASSWORD"
echo -e "   → Set TRADING_MODE (paper/real)\n"

echo -e "${BLUE}2. Start the service:${NC}"
echo -e "   ${CYAN}sudo systemctl start whale-scout${NC}\n"

echo -e "${BLUE}3. Enable auto-start on boot:${NC}"
echo -e "   ${CYAN}sudo systemctl enable whale-scout${NC}\n"

echo -e "${BLUE}4. Check service status:${NC}"
echo -e "   ${CYAN}sudo systemctl status whale-scout${NC}\n"

echo -e "${BLUE}5. View live logs:${NC}"
echo -e "   ${CYAN}sudo journalctl -u whale-scout -f${NC}\n"

if [ -d "src/web/client/dist" ]; then
    echo -e "${BLUE}6. Access web dashboard:${NC}"
    echo -e "   ${CYAN}http://$(hostname -I | awk '{print $1}'):3000${NC}"
    echo -e "   (Password set in /opt/whale-scout/.env)\n"
fi

echo -e "${BLUE}Useful Commands:${NC}"
echo -e "  ${GREEN}sudo systemctl restart whale-scout${NC}  # Restart bot"
echo -e "  ${GREEN}sudo systemctl stop whale-scout${NC}     # Stop bot"
echo -e "  ${GREEN}cd /opt/whale-scout${NC}                 # Navigate to install dir"
echo -e "  ${GREEN}sudo -u whale-scout node dist/cli/index.js stats${NC}  # View stats\n"

echo -e "${BLUE}Installation Details:${NC}"
echo -e "  Location: ${CYAN}/opt/whale-scout${NC}"
echo -e "  Service:  ${CYAN}/etc/systemd/system/whale-scout.service${NC}"
echo -e "  Logs:     ${CYAN}/opt/whale-scout/logs/${NC}"
echo -e "  Data:     ${CYAN}/opt/whale-scout/data/${NC}\n"

echo -e "${GREEN}Happy whale hunting! 🐋${NC}\n"
