#!/bin/bash

#############################################
# Polymarket Whale Scout - Server Install
# Installs bot as systemd service
#############################################

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SERVICE_NAME="whale-scout"
INSTALL_DIR="/opt/whale-scout"
SERVICE_USER="whale-scout"
SERVICE_FILE="/etc/systemd/system/whale-scout.service"

echo -e "${BLUE}╔════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  Polymarket Whale Scout - Installer   ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════╝${NC}\n"

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo -e "${RED}❌ Error: This script must be run as root${NC}"
    echo "Usage: sudo ./install.sh"
    exit 1
fi

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Error: Node.js is not installed${NC}"
    echo "Please install Node.js v18 or higher first:"
    echo "  curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -"
    echo "  sudo apt-get install -y nodejs"
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo -e "${RED}❌ Error: Node.js version 18+ required (found v$NODE_VERSION)${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Node.js $(node -v) detected${NC}\n"

# Create service user
if id "$SERVICE_USER" &>/dev/null; then
    echo -e "${YELLOW}⚠  User '$SERVICE_USER' already exists${NC}"
else
    echo -e "${BLUE}Creating service user...${NC}"
    useradd -r -s /bin/false -d "$INSTALL_DIR" "$SERVICE_USER"
    echo -e "${GREEN}✓ Created user: $SERVICE_USER${NC}"
fi

# Create installation directory
echo -e "\n${BLUE}Setting up installation directory...${NC}"
mkdir -p "$INSTALL_DIR"
mkdir -p "$INSTALL_DIR/data"
mkdir -p "$INSTALL_DIR/logs"

# Copy files
echo -e "${BLUE}Copying files...${NC}"
cp -r dist "$INSTALL_DIR/"
cp -r node_modules "$INSTALL_DIR/"
cp package.json "$INSTALL_DIR/"
cp package-lock.json "$INSTALL_DIR/"

# Copy web dashboard files
if [ -d "src/web/client/dist" ]; then
    echo -e "${BLUE}Copying web dashboard...${NC}"
    mkdir -p "$INSTALL_DIR/src/web/client"
    cp -r src/web/client/dist "$INSTALL_DIR/src/web/client/"
    echo -e "${GREEN}✓ Copied web dashboard files${NC}"
else
    echo -e "${YELLOW}⚠  Warning: Web dashboard not built${NC}"
    echo -e "${YELLOW}   Run 'cd src/web/client && npm install && npm run build' before installing${NC}"
fi

# Copy .env if it exists, otherwise copy example
if [ -f .env ]; then
    cp .env "$INSTALL_DIR/"
    echo -e "${GREEN}✓ Copied existing .env file${NC}"
else
    cp .env.example "$INSTALL_DIR/.env"
    echo -e "${YELLOW}⚠  Copied .env.example - EDIT THIS FILE!${NC}"
fi

# Set permissions
echo -e "${BLUE}Setting permissions...${NC}"
chown -R "$SERVICE_USER:$SERVICE_USER" "$INSTALL_DIR"
chmod 750 "$INSTALL_DIR"
chmod 750 "$INSTALL_DIR/data"
chmod 750 "$INSTALL_DIR/logs"
chmod 640 "$INSTALL_DIR/.env"

echo -e "${GREEN}✓ Set ownership to $SERVICE_USER${NC}"

# Install systemd service
echo -e "\n${BLUE}Installing systemd service...${NC}"
cp deploy/whale-scout.service "$SERVICE_FILE"
chmod 644 "$SERVICE_FILE"
systemctl daemon-reload

echo -e "${GREEN}✓ Installed service: $SERVICE_NAME${NC}"

# Setup logrotate
echo -e "\n${BLUE}Setting up log rotation...${NC}"
cat > /etc/logrotate.d/whale-scout << EOF
$INSTALL_DIR/logs/*.log {
    daily
    rotate 14
    compress
    delaycompress
    notifempty
    missingok
    create 0640 $SERVICE_USER $SERVICE_USER
}
EOF

echo -e "${GREEN}✓ Configured logrotate${NC}"

# Final instructions
echo -e "\n${GREEN}╔════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║        Installation Complete! ✓        ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════╝${NC}\n"

echo -e "${YELLOW}⚠  IMPORTANT: Configure your bot before starting!${NC}"
echo -e "   Edit: ${BLUE}$INSTALL_DIR/.env${NC}\n"

echo -e "${BLUE}Quick Start Commands:${NC}"
echo -e "  ${GREEN}sudo systemctl start $SERVICE_NAME${NC}     # Start bot"
echo -e "  ${GREEN}sudo systemctl enable $SERVICE_NAME${NC}    # Auto-start on boot"
echo -e "  ${GREEN}sudo systemctl status $SERVICE_NAME${NC}    # Check status"
echo -e "  ${GREEN}sudo journalctl -u $SERVICE_NAME -f${NC}    # View logs"
echo -e "  ${GREEN}sudo systemctl stop $SERVICE_NAME${NC}      # Stop bot\n"

echo -e "${BLUE}CLI Commands (run as user):${NC}"
echo -e "  ${GREEN}cd $INSTALL_DIR${NC}"
echo -e "  ${GREEN}sudo -u $SERVICE_USER node dist/cli/index.js stats${NC}"
echo -e "  ${GREEN}sudo -u $SERVICE_USER node dist/cli/index.js trades${NC}"
echo -e "  ${GREEN}sudo -u $SERVICE_USER node dist/cli/index.js config${NC}"
echo -e "  ${GREEN}sudo -u $SERVICE_USER node dist/cli/index.js dashboard${NC}\n"

echo -e "${BLUE}Web Dashboard:${NC}"
echo -e "  Start: ${GREEN}sudo -u $SERVICE_USER node dist/cli/index.js dashboard${NC}"
echo -e "  Access: ${BLUE}http://your-server:3000${NC}"
echo -e "  Password: ${YELLOW}Set in .env (DASHBOARD_PASSWORD)${NC}\n"

echo -e "${BLUE}Installation Location:${NC} $INSTALL_DIR"
echo -e "${BLUE}Service File:${NC} $SERVICE_FILE"
echo -e "${BLUE}Data Directory:${NC} $INSTALL_DIR/data"
echo -e "${BLUE}Logs Directory:${NC} $INSTALL_DIR/logs\n"

echo -e "${YELLOW}Remember to:${NC}"
echo -e "  1. Edit ${BLUE}$INSTALL_DIR/.env${NC} with your configuration"
echo -e "  2. Test with: ${GREEN}sudo systemctl start $SERVICE_NAME${NC}"
echo -e "  3. Enable auto-start: ${GREEN}sudo systemctl enable $SERVICE_NAME${NC}\n"
