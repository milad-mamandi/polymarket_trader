#!/bin/bash

#############################################
# 🐋 Whale Scout - Unified Manager
# Supports both PM2 (development) and systemd (production) modes
# Default: systemd mode for production deployments
#############################################

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Configuration
PROJECT_NAME="whale-scout"
SYSTEMD_DIR="/opt/whale-scout"
SERVICE_NAME="whale-scout"
SERVICE_USER="whale-scout"
MIN_MEMORY_MB=2048
MIN_SWAP_MB=1024
MIN_DISK_MB=500

# Change to project directory
cd "$(dirname "$0")"
PROJECT_DIR=$(pwd)

# Mode detection
CURRENT_MODE=""
detect_mode() {
  # Check systemd first (production mode priority)
  if [ -d "$SYSTEMD_DIR" ] && [ -f "/etc/systemd/system/${SERVICE_NAME}.service" ]; then
    CURRENT_MODE="systemd"
    return
  fi
  
  # Check PM2
  if command -v pm2 &> /dev/null && pm2 list 2>/dev/null | grep -q "$PROJECT_NAME"; then
    CURRENT_MODE="pm2"
    return
  fi
  
  # Default to systemd for root, PM2 otherwise
  if [ "$EUID" -eq 0 ]; then
    CURRENT_MODE="systemd"
  else
    CURRENT_MODE="pm2"
  fi
}

# Initialize mode
detect_mode

# Helper Functions
print_header() {
  clear
  echo -e "${CYAN}╔════════════════════════════════════════════════╗${NC}"
  echo -e "${CYAN}║  🐋 Whale Scout Manager (${CURRENT_MODE} mode)        ║${NC}"
  echo -e "${CYAN}╚════════════════════════════════════════════════╝${NC}"
  echo ""
}

get_memory_mb() {
  free -m 2>/dev/null | awk '/^Mem:/{print $2}' || echo "0"
}

get_swap_mb() {
  free -m 2>/dev/null | awk '/^Swap:/{print $2}' || echo "0"
}

get_disk_mb() {
  df -m . 2>/dev/null | tail -1 | awk '{print $4}' || echo "0"
}

check_pm2() {
  command -v pm2 &> /dev/null
}

check_nodejs() {
  if ! command -v node &> /dev/null; then
    return 1
  fi
  
  NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
  if [ "$NODE_VERSION" -lt 22 ]; then
    return 1
  fi
  
  return 0
}

get_bot_status() {
  if [ "$CURRENT_MODE" = "systemd" ]; then
    if systemctl is-active --quiet "$SERVICE_NAME" 2>/dev/null; then
      echo "running"
    elif [ -f "/etc/systemd/system/${SERVICE_NAME}.service" ]; then
      echo "stopped"
    else
      echo "not-installed"
    fi
  else
    if check_pm2 && pm2 list 2>/dev/null | grep -q "$PROJECT_NAME"; then
      pm2 show "$PROJECT_NAME" 2>/dev/null | grep "status" | awk '{print $4}' || echo "unknown"
    else
      echo "stopped"
    fi
  fi
}

show_status() {
  local mem=$(get_memory_mb)
  local swap=$(get_swap_mb)
  local disk=$(get_disk_mb)
  local bot_status=$(get_bot_status)
  
  echo -e "${BLUE}System Status:${NC}"
  echo "  Memory: ${mem}MB $([ $mem -lt $MIN_MEMORY_MB ] && echo -e "${YELLOW}⚠️${NC}" || echo -e "${GREEN}✓${NC}")"
  echo "  Swap:   ${swap}MB $([ $swap -lt $MIN_SWAP_MB ] && echo -e "${YELLOW}⚠️${NC}" || echo -e "${GREEN}✓${NC}")"
  echo "  Disk:   ${disk}MB free $([ $disk -lt $MIN_DISK_MB ] && echo -e "${RED}⚠️${NC}" || echo -e "${GREEN}✓${NC}")"
  echo ""
  
  echo -e "${BLUE}Bot Status:${NC}"
  case "$bot_status" in
    "running"|"online")
      echo -e "  Running ${GREEN}✓${NC} ($CURRENT_MODE)"
      ;;
    "stopped")
      echo -e "  Stopped ${YELLOW}⚠${NC}"
      ;;
    "not-installed")
      echo -e "  Not installed ${YELLOW}⚠${NC}"
      ;;
    *)
      echo -e "  Status: $bot_status ${YELLOW}?${NC}"
      ;;
  esac
  echo ""
  
  # Warnings
  if [ $mem -lt $MIN_MEMORY_MB ] && [ $swap -lt $MIN_SWAP_MB ]; then
    echo -e "${YELLOW}⚠️  Warning: Low memory (${mem}MB) and insufficient swap (${swap}MB)${NC}"
    echo -e "${YELLOW}   Recommendation: Run Setup Environment (option 6)${NC}"
    echo ""
  fi
}

# Command Functions

# 1) Deploy/Update
cmd_deploy() {
  print_header
  echo -e "${BLUE}🚀 Deploy/Update${NC} - Pull, build & restart"
  echo ""
  
  local mem=$(get_memory_mb)
  local swap=$(get_swap_mb)
  
  # Check memory and offer swap
  if [ $mem -lt $MIN_MEMORY_MB ] && [ $swap -lt $MIN_SWAP_MB ]; then
    echo -e "${YELLOW}⚠️  Low memory detected (${mem}MB RAM, ${swap}MB swap)${NC}"
    read -p "Create 2GB swap file before building? (Y/n): " REPLY
    if [[ ! $REPLY =~ ^[Nn]$ ]]; then
      create_swap
    fi
  fi
  
  # Check disk space
  local disk=$(get_disk_mb)
  if [ $disk -lt $MIN_DISK_MB ]; then
    echo -e "${RED}❌ Insufficient disk space (${disk}MB free)${NC}"
    read -p "Continue anyway? (y/N): " REPLY
    [[ $REPLY =~ ^[Yy]$ ]] || return
  fi
  
  # Stop bot
  echo -e "${YELLOW}🛑 Stopping bot...${NC}"
  cmd_stop_silent
  
  # Pull changes
  echo -e "${YELLOW}⬇️  Pulling latest changes...${NC}"
  if [ -d ".git" ]; then
    git pull origin main || git pull origin master || echo "No remote updates"
  else
    echo -e "${YELLOW}⚠️  Not a git repository, skipping pull${NC}"
  fi
  
  # Install dependencies
  echo -e "${YELLOW}📦 Installing dependencies...${NC}"
  npm ci 2>/dev/null || npm install
  
  # Build
  echo -e "${YELLOW}🔨 Building project...${NC}"
  export NODE_OPTIONS="--max-old-space-size=1536"
  if npm run build; then
    echo -e "${GREEN}✅ Build successful${NC}"
  else
    echo -e "${RED}❌ Build failed${NC}"
    read -p "Press Enter to continue..."
    return 1
  fi
  
  # Deploy based on mode
  if [ "$CURRENT_MODE" = "systemd" ]; then
    echo -e "${YELLOW}📦 Deploying to systemd...${NC}"
    deploy_to_systemd
  fi
  
  # Start bot
  cmd_start
  
  echo -e "${GREEN}🎉 Deploy complete!${NC}"
  if [ "$CURRENT_MODE" = "systemd" ]; then
    echo -e "${CYAN}Dashboard: http://localhost:3000${NC}"
  fi
  read -p "Press Enter to continue..."
}

deploy_to_systemd() {
  if [ "$EUID" -ne 0 ]; then
    echo -e "${RED}❌ Root required for systemd deployment${NC}"
    echo "Run: sudo ./manage.sh"
    return 1
  fi
  
  # Create service user
  if ! id "$SERVICE_USER" &>/dev/null; then
    echo -e "${BLUE}Creating service user...${NC}"
    useradd -r -s /bin/false -d "$SYSTEMD_DIR" "$SERVICE_USER"
  fi
  
  # Create directories
  mkdir -p "$SYSTEMD_DIR/data" "$SYSTEMD_DIR/logs"
  
  # Backup database if exists
  if [ -f "$SYSTEMD_DIR/data/whale_bot.db" ]; then
    echo -e "${BLUE}Backing up database...${NC}"
    cp "$SYSTEMD_DIR/data/whale_bot.db" "$SYSTEMD_DIR/data/whale_bot.db.backup-$(date +%Y%m%d%H%M%S)"
  elif [ -f "data/whale_bot.db" ]; then
    echo -e "${BLUE}Migrating database from project...${NC}"
    cp "data/whale_bot.db" "$SYSTEMD_DIR/data/"
  fi
  
  # Copy files
  cp -r dist "$SYSTEMD_DIR/"
  cp -r node_modules "$SYSTEMD_DIR/"
  cp package.json package-lock.json "$SYSTEMD_DIR/"
  
  # Copy web dashboard
  if [ -d "src/web/client/dist" ]; then
    mkdir -p "$SYSTEMD_DIR/src/web/client"
    cp -r src/web/client/dist "$SYSTEMD_DIR/src/web/client/"
  fi
  
  # Copy or create .env
  if [ -f .env ]; then
    cp .env "$SYSTEMD_DIR/"
  elif [ -f .env.example ]; then
    cp .env.example "$SYSTEMD_DIR/.env"
    echo -e "${YELLOW}⚠️  Copied .env.example - EDIT THIS FILE!${NC}"
  fi
  
  # Set permissions
  chown -R "$SERVICE_USER:$SERVICE_USER" "$SYSTEMD_DIR"
  chmod 750 "$SYSTEMD_DIR"
  chmod 640 "$SYSTEMD_DIR/.env" 2>/dev/null || true
  
  # Install service file
  create_systemd_service
  
  # Setup logrotate
  setup_logrotate
  
  echo -e "${GREEN}✅ Deployed to $SYSTEMD_DIR${NC}"
}

create_systemd_service() {
  cat > "/etc/systemd/system/${SERVICE_NAME}.service" << EOF
[Unit]
Description=Polymarket Whale Scout Bot
After=network.target

[Service]
Type=simple
User=${SERVICE_USER}
Group=${SERVICE_USER}
WorkingDirectory=${SYSTEMD_DIR}
Environment="NODE_ENV=production"
ExecStart=/usr/bin/node ${SYSTEMD_DIR}/dist/cli/index.js start
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=${SERVICE_NAME}

# Resource limits
LimitNOFILE=65536
MemoryMax=512M

# Security hardening
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=${SYSTEMD_DIR}/data ${SYSTEMD_DIR}/logs

[Install]
WantedBy=multi-user.target
EOF
  
  chmod 644 "/etc/systemd/system/${SERVICE_NAME}.service"
  systemctl daemon-reload
}

setup_logrotate() {
  cat > "/etc/logrotate.d/${SERVICE_NAME}" << EOF
${SYSTEMD_DIR}/logs/*.log {
    daily
    rotate 14
    compress
    delaycompress
    notifempty
    missingok
    create 0640 ${SERVICE_USER} ${SERVICE_USER}
}
EOF
}

# 2) Restart
cmd_restart() {
  print_header
  echo -e "${BLUE}🔄 Restart${NC}"
  echo ""
  
  if [ "$CURRENT_MODE" = "systemd" ]; then
    if [ "$EUID" -ne 0 ]; then
      echo -e "${RED}❌ Root required for systemd${NC}"
      read -p "Press Enter to continue..."
      return
    fi
    systemctl restart "$SERVICE_NAME"
    echo -e "${GREEN}✅ Service restarted${NC}"
  else
    if ! check_pm2; then
      echo -e "${RED}❌ PM2 not installed${NC}"
      read -p "Press Enter to continue..."
      return
    fi
    if pm2 list 2>/dev/null | grep -q "$PROJECT_NAME"; then
      pm2 restart "$PROJECT_NAME"
      echo -e "${GREEN}✅ Bot restarted${NC}"
    else
      echo -e "${YELLOW}⚠️  Bot not running, starting...${NC}"
      cmd_start
      return
    fi
  fi
  
  read -p "Press Enter to continue..."
}

# 3) Stop
cmd_stop() {
  print_header
  echo -e "${BLUE}⏹️  Stop${NC}"
  echo ""
  cmd_stop_silent
  read -p "Press Enter to continue..."
}

cmd_stop_silent() {
  # Stop whale-scout CLI processes
  if command -v whale-scout &> /dev/null; then
    whale-scout stop --force --quiet 2>/dev/null || true
  fi
  
  if [ "$CURRENT_MODE" = "systemd" ]; then
    if [ "$EUID" -eq 0 ]; then
      systemctl stop "$SERVICE_NAME" 2>/dev/null || true
    fi
  else
    if check_pm2; then
      pm2 stop "$PROJECT_NAME" 2>/dev/null || true
    fi
  fi
  
  echo -e "${GREEN}✅ Bot stopped${NC}"
}

# 4) Start
cmd_start() {
  print_header
  echo -e "${BLUE}▶️  Start${NC}"
  echo ""
  
  if [ "$CURRENT_MODE" = "systemd" ]; then
    if [ "$EUID" -ne 0 ]; then
      echo -e "${RED}❌ Root required for systemd${NC}"
      read -p "Press Enter to continue..."
      return
    fi
    
    if [ ! -f "/etc/systemd/system/${SERVICE_NAME}.service" ]; then
      echo -e "${RED}❌ Service not installed${NC}"
      echo -e "${YELLOW}Run Deploy/Update first (option 1)${NC}"
      read -p "Press Enter to continue..."
      return
    fi
    
    systemctl start "$SERVICE_NAME"
    systemctl enable "$SERVICE_NAME" 2>/dev/null || true
    echo -e "${GREEN}✅ Service started${NC}"
    
    sleep 2
    if systemctl is-active --quiet "$SERVICE_NAME"; then
      echo -e "${GREEN}✓ Service is running${NC}"
    else
      echo -e "${RED}✗ Service failed to start${NC}"
      echo -e "${YELLOW}Check logs: sudo ./manage.sh → option 5${NC}"
    fi
  else
    if ! check_pm2; then
      echo -e "${RED}❌ PM2 not installed${NC}"
      echo -e "${YELLOW}Run Setup Environment (option 6)${NC}"
      read -p "Press Enter to continue..."
      return
    fi
    
    if pm2 list 2>/dev/null | grep -q "$PROJECT_NAME"; then
      pm2 start "$PROJECT_NAME"
      echo -e "${GREEN}✅ Bot started${NC}"
    else
      pm2 start npm --name "$PROJECT_NAME" -- start
      pm2 save
      echo -e "${GREEN}✅ Bot started and saved to PM2${NC}"
    fi
    
    pm2 status "$PROJECT_NAME"
  fi
  
  read -p "Press Enter to continue..."
}

# 5) Logs
cmd_logs() {
  print_header
  echo -e "${BLUE}📋 View Logs${NC}"
  echo ""
  
  if [ "$CURRENT_MODE" = "systemd" ]; then
    echo -e "${CYAN}Press Ctrl+C to exit logs${NC}"
    sleep 1
    if [ "$EUID" -eq 0 ]; then
      journalctl -u "$SERVICE_NAME" -f
    else
      echo -e "${YELLOW}Note: Showing logs without root (some entries may be missing)${NC}"
      journalctl -u "$SERVICE_NAME" -f --user 2>/dev/null || sudo journalctl -u "$SERVICE_NAME" -f
    fi
  else
    echo "Select log source:"
    echo "1) PM2 logs (live)"
    echo "2) File logs (app.log)"
    echo "3) Back"
    read -p "Select [1-3]: " LOG_CHOICE
    
    case $LOG_CHOICE in
      1)
        if check_pm2; then
          echo -e "${CYAN}Press Ctrl+C to exit${NC}"
          sleep 1
          pm2 logs "$PROJECT_NAME"
        else
          echo -e "${RED}❌ PM2 not installed${NC}"
          read -p "Press Enter to continue..."
        fi
        ;;
      2)
        if [ -f "logs/app.log" ]; then
          echo -e "${CYAN}Press Ctrl+C to exit${NC}"
          sleep 1
          tail -f logs/app.log
        else
          echo -e "${YELLOW}⚠️  No log file found${NC}"
          read -p "Press Enter to continue..."
        fi
        ;;
      3)
        return
        ;;
    esac
  fi
}

# 6) Setup Environment
cmd_setup() {
  print_header
  echo -e "${BLUE}💻 Setup Environment${NC}"
  echo ""
  
  echo -e "${CYAN}This will:${NC}"
  echo "  • Check/Install Node.js v22+"
  echo "  • Install PM2 (for dev mode)"
  echo "  • Install build tools"
  echo "  • Create swap space (if needed)"
  echo ""
  read -p "Continue? (Y/n): " REPLY
  [[ $REPLY =~ ^[Nn]$ ]] && return
  
  # Check/Install Node.js
  echo -e "${YELLOW}📦 Checking Node.js...${NC}"
  if check_nodejs; then
    echo -e "${GREEN}✓ Node.js $(node -v)${NC}"
  else
    echo -e "${YELLOW}⚠️  Node.js v22+ required${NC}"
    if [ "$EUID" -eq 0 ]; then
      read -p "Install Node.js v22? (Y/n): " INSTALL_NODE
      if [[ ! $INSTALL_NODE =~ ^[Nn]$ ]]; then
        install_nodejs
      fi
    else
      echo -e "${RED}❌ Run with sudo to install Node.js${NC}"
      echo "  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -"
      echo "  sudo apt-get install -y nodejs"
    fi
  fi
  
  # Install PM2
  echo -e "${YELLOW}📦 Installing PM2...${NC}"
  if ! check_pm2; then
    npm install -g pm2
    pm2 startup 2>/dev/null || true
    echo -e "${GREEN}✓ PM2 installed${NC}"
  else
    echo -e "${GREEN}✓ PM2 already installed${NC}"
  fi
  
  # Install build tools
  echo -e "${YELLOW}📦 Installing build tools...${NC}"
  if command -v apt-get &> /dev/null; then
    if [ "$EUID" -eq 0 ]; then
      apt-get update -qq
      apt-get install -y build-essential python3 sqlite3 curl git
    else
      echo -e "${YELLOW}⚠️  Run with sudo to install build tools${NC}"
    fi
  elif command -v yum &> /dev/null; then
    if [ "$EUID" -eq 0 ]; then
      yum groupinstall -y "Development Tools"
      yum install -y python3 sqlite curl git
    fi
  fi
  
  # Create swap
  create_swap
  
  # Install dependencies
  echo -e "${YELLOW}📦 Installing project dependencies...${NC}"
  npm install
  
  echo -e "${GREEN}✅ Setup complete!${NC}"
  echo -e "${CYAN}You can now deploy with option 1${NC}"
  read -p "Press Enter to continue..."
}

install_nodejs() {
  echo -e "${YELLOW}⬇️  Installing Node.js v22...${NC}"
  
  # Stop service if running
  local was_running=false
  if [ "$CURRENT_MODE" = "systemd" ] && systemctl is-active --quiet "$SERVICE_NAME"; then
    systemctl stop "$SERVICE_NAME"
    was_running=true
  fi
  
  # Remove old Node.js
  apt-get remove -y nodejs 2>/dev/null || true
  apt-get autoremove -y 2>/dev/null || true
  
  # Install Node.js v22
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
  
  echo -e "${GREEN}✓ Node.js $(node -v) installed${NC}"
  
  # Rebuild if needed
  if [ "$was_running" = true ] || [ -d "$SYSTEMD_DIR" ]; then
    echo -e "${YELLOW}🔧 Rebuilding application...${NC}"
    rm -rf node_modules package-lock.json
    npm install
    npm run build
    
    if [ "$was_running" = true ]; then
      systemctl start "$SERVICE_NAME"
    fi
  fi
}

create_swap() {
  local current_swap=$(get_swap_mb)
  
  if [ $current_swap -ge $MIN_SWAP_MB ]; then
    echo -e "${GREEN}✓ Swap already configured (${current_swap}MB)${NC}"
    return
  fi
  
  echo -e "${YELLOW}💾 Creating 2GB swap file...${NC}"
  
  if [ -f /swapfile ]; then
    echo -e "${YELLOW}⚠️  /swapfile already exists${NC}"
    read -p "Remove and recreate? (y/N): " REPLY
    if [[ $REPLY =~ ^[Yy]$ ]]; then
      swapoff /swapfile 2>/dev/null || true
      rm /swapfile
    else
      return
    fi
  fi
  
  fallocate -l 2G /swapfile 2>/dev/null || dd if=/dev/zero of=/swapfile bs=1M count=2048
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  
  if ! grep -q "/swapfile" /etc/fstab; then
    echo '/swapfile none swap sw 0 0' >> /etc/fstab
  fi
  
  echo -e "${GREEN}✅ Swap created (${current_swap}MB → $(get_swap_mb)MB)${NC}"
}

# 7) Configure
cmd_configure() {
  print_header
  echo -e "${BLUE}🔧 Configure${NC}"
  echo ""
  
  local config_file
  if [ "$CURRENT_MODE" = "systemd" ]; then
    config_file="$SYSTEMD_DIR/.env"
    if [ "$EUID" -ne 0 ]; then
      echo -e "${YELLOW}⚠️  Config file: $config_file${NC}"
      echo -e "${YELLOW}   Run with sudo to edit: sudo ./manage.sh${NC}"
      echo ""
      echo -e "${BLUE}Or edit manually:${NC}"
      echo "  sudo nano $config_file"
      echo "  sudo systemctl restart $SERVICE_NAME"
      read -p "Press Enter to continue..."
      return
    fi
  else
    config_file=".env"
    if [ ! -f "$config_file" ] && [ -f ".env.example" ]; then
      cp .env.example .env
    fi
  fi
  
  if [ -f "$config_file" ]; then
    echo -e "${CYAN}Opening $config_file...${NC}"
    sleep 1
    ${EDITOR:-nano} "$config_file"
    
    echo -e "${GREEN}✅ Configuration updated${NC}"
    
    if [ "$CURRENT_MODE" = "systemd" ]; then
      echo -e "${YELLOW}Restart service to apply changes?${NC}"
      read -p "Restart now? (Y/n): " REPLY
      if [[ ! $REPLY =~ ^[Nn]$ ]]; then
        systemctl restart "$SERVICE_NAME"
        echo -e "${GREEN}✅ Service restarted${NC}"
      fi
    fi
  else
    echo -e "${RED}❌ No configuration file found${NC}"
    echo -e "${YELLOW}Expected: $config_file${NC}"
  fi
  
  read -p "Press Enter to continue..."
}

# 8) System Status
cmd_system_status() {
  print_header
  echo -e "${BLUE}📊 System Status${NC}"
  echo ""
  
  show_status
  
  if [ "$CURRENT_MODE" = "pm2" ] && check_pm2; then
    echo ""
    pm2 status
  elif [ "$CURRENT_MODE" = "systemd" ]; then
    echo ""
    if [ "$EUID" -eq 0 ]; then
      systemctl status "$SERVICE_NAME" --no-pager || true
    else
      echo -e "${YELLOW}Run with sudo for detailed status${NC}"
    fi
  fi
  
  read -p "Press Enter to continue..."
}

# 9) Database Tools
cmd_database() {
  print_header
  echo -e "${BLUE}🗄️  Database Tools${NC}"
  echo ""
  
  local db_path
  if [ "$CURRENT_MODE" = "systemd" ]; then
    db_path="$SYSTEMD_DIR/data/whale_bot.db"
  else
    db_path="data/whale_bot.db"
  fi
  
  echo "Database: $db_path"
  echo ""
  
  if [ ! -f "$db_path" ]; then
    echo -e "${YELLOW}⚠️  Database not found${NC}"
    read -p "Press Enter to continue..."
    return
  fi
  
  # Show stats
  local open_trades=$(sqlite3 "$db_path" "SELECT COUNT(*) FROM paper_trades WHERE status='OPEN';" 2>/dev/null || echo "0")
  local total_trades=$(sqlite3 "$db_path" "SELECT COUNT(*) FROM paper_trades;" 2>/dev/null || echo "0")
  local wallets=$(sqlite3 "$db_path" "SELECT COUNT(*) FROM wallets;" 2>/dev/null || echo "0")
  
  echo "Statistics:"
  echo "  Open trades:    $open_trades"
  echo "  Total trades:   $total_trades"
  echo "  Wallets:        $wallets"
  echo ""
  
  echo "Options:"
  echo "1) Reset database (clear paper trades)"
  echo "2) Backup database"
  echo "3) Restore database"
  echo "4) Open SQLite console"
  echo "5) Back"
  echo ""
  read -p "Select [1-5]: " DB_CHOICE
  
  case $DB_CHOICE in
    1)
      echo -e "${RED}⚠️  WARNING: This will delete all paper trades!${NC}"
      read -p "Type 'RESET' to confirm: " CONFIRM
      if [ "$CONFIRM" = "RESET" ]; then
        sqlite3 "$db_path" < scripts/reset_paper_trades.sql
        echo -e "${GREEN}✅ Database reset${NC}"
      else
        echo -e "${YELLOW}Cancelled${NC}"
      fi
      ;;
    2)
      local backup_file="${db_path}.backup-$(date +%Y%m%d%H%M%S)"
      cp "$db_path" "$backup_file"
      echo -e "${GREEN}✅ Backup created: $backup_file${NC}"
      ;;
    3)
      echo "Available backups:"
      ls -lh "${db_path}.backup-"* 2>/dev/null || echo "  No backups found"
      echo ""
      read -p "Enter backup file path (or 'cancel'): " BACKUP_FILE
      if [ "$BACKUP_FILE" != "cancel" ] && [ -f "$BACKUP_FILE" ]; then
        # Stop bot first
        cmd_stop_silent
        cp "$BACKUP_FILE" "$db_path"
        chown "$SERVICE_USER:$SERVICE_USER" "$db_path" 2>/dev/null || true
        echo -e "${GREEN}✅ Database restored${NC}"
        echo -e "${YELLOW}Start bot to continue${NC}"
      else
        echo -e "${YELLOW}Cancelled or file not found${NC}"
      fi
      ;;
    4)
      echo -e "${CYAN}Opening SQLite console...${NC}"
      echo -e "${CYAN}Type '.tables' for tables, '.quit' to exit${NC}"
      sqlite3 "$db_path"
      ;;
    5)
      return
      ;;
  esac
  
  read -p "Press Enter to continue..."
}

# 10) Switch to PM2 Mode
cmd_switch_to_pm2() {
  print_header
  echo -e "${BLUE}🔧 Switch to PM2 Mode${NC}"
  echo ""
  
  if [ "$CURRENT_MODE" = "pm2" ]; then
    echo -e "${YELLOW}⚠️  Already in PM2 mode${NC}"
    read -p "Press Enter to continue..."
    return
  fi
  
  echo -e "${YELLOW}This will:${NC}"
  echo "  1. Stop systemd service"
  echo "  2. Backup database"
  echo "  3. Copy database to project directory"
  echo "  4. Disable systemd service"
  echo ""
  echo -e "${CYAN}You can switch back to systemd anytime with option 11${NC}"
  echo ""
  read -p "Continue? (y/N): " REPLY
  [[ $REPLY =~ ^[Yy]$ ]] || return
  
  if [ "$EUID" -ne 0 ]; then
    echo -e "${RED}❌ Root required to switch modes${NC}"
    read -p "Press Enter to continue..."
    return
  fi
  
  # Stop service
  echo -e "${YELLOW}Stopping systemd service...${NC}"
  systemctl stop "$SERVICE_NAME" 2>/dev/null || true
  systemctl disable "$SERVICE_NAME" 2>/dev/null || true
  
  # Backup and migrate database
  if [ -f "$SYSTEMD_DIR/data/whale_bot.db" ]; then
    echo -e "${YELLOW}Migrating database to project...${NC}"
    mkdir -p data
    cp "$SYSTEMD_DIR/data/whale_bot.db" data/whale_bot.db
    chown $(whoami):$(whoami) data/whale_bot.db 2>/dev/null || true
    echo -e "${GREEN}✅ Database migrated${NC}"
  fi
  
  # Switch mode
  CURRENT_MODE="pm2"
  
  echo -e "${GREEN}✅ Switched to PM2 mode${NC}"
  echo -e "${YELLOW}You can now start the bot with option 4${NC}"
  echo ""
  echo -e "${BLUE}Note: Systemd files remain at $SYSTEMD_DIR${NC}"
  echo -e "${BLUE}      (not deleted for safety)${NC}"
  
  read -p "Press Enter to continue..."
}

# 11) Migration Guide
cmd_migration_guide() {
  print_header
  echo -e "${BLUE}📖 Migration Guide${NC}"
  echo ""
  
  cat << 'EOF'
Migration Between PM2 and systemd Modes
═══════════════════════════════════════

PM2 Mode (Development):
  ✓ Easier setup, no root required
  ✓ Good for development and testing
  ✓ Logs via PM2 or file
  ✗ Less secure, runs as current user
  ✗ No auto-restart on system boot
  ✗ No resource limits

systemd Mode (Production):
  ✓ Production-ready security
  ✓ Auto-start on boot
  ✓ Resource limits (memory, files)
  ✓ Dedicated service user
  ✓ Systemd journal logging
  ✓ Log rotation
  ✗ Requires root for setup
  ✗ Installed to /opt/whale-scout/

Switching Modes:
  • Option 10: Switch PM2 → systemd
  • Database auto-transfers between modes
  • Original files are backed up

Migration Checklist:
  □ Stop bot before switching
  □ Verify database transferred
  □ Update configuration if needed
  □ Start bot in new mode
  □ Check logs for errors

Command Equivalents:
  PM2                systemd
  ─────────────────────────────
  pm2 start          systemctl start
  pm2 stop           systemctl stop
  pm2 logs           journalctl -u
  pm2 status         systemctl status

EOF
  
  read -p "Press Enter to continue..."
}

# 12) Clean & Rebuild
cmd_clean_rebuild() {
  print_header
  echo -e "${BLUE}🧹 Clean & Rebuild${NC}"
  echo ""
  
  echo -e "${YELLOW}This will:${NC}"
  echo "  1. Stop bot"
  echo "  2. Remove node_modules/"
  echo "  3. Remove dist/"
  echo "  4. Reinstall dependencies"
  echo "  5. Rebuild project"
  echo ""
  read -p "Continue? (y/N): " REPLY
  [[ $REPLY =~ ^[Yy]$ ]] || return
  
  # Stop bot
  echo -e "${YELLOW}Stopping bot...${NC}"
  cmd_stop_silent
  
  # Clean
  echo -e "${YELLOW}Cleaning build artifacts...${NC}"
  rm -rf node_modules dist package-lock.json
  
  # Reinstall
  echo -e "${YELLOW}Reinstalling dependencies...${NC}"
  npm install
  
  # Build
  echo -e "${YELLOW}Rebuilding...${NC}"
  export NODE_OPTIONS="--max-old-space-size=1536"
  if npm run build; then
    echo -e "${GREEN}✅ Rebuild successful${NC}"
    
    if [ "$CURRENT_MODE" = "systemd" ]; then
      echo -e "${YELLOW}Deploy to systemd?${NC}"
      read -p "Deploy now? (Y/n): " DEPLOY
      if [[ ! $DEPLOY =~ ^[Nn]$ ]]; then
        deploy_to_systemd
      fi
    fi
  else
    echo -e "${RED}❌ Build failed${NC}"
  fi
  
  read -p "Press Enter to continue..."
}

# 13) Uninstall
cmd_uninstall() {
  print_header
  echo -e "${BLUE}🗑️  Uninstall${NC}"
  echo ""
  
  echo -e "${RED}⚠️  This will remove the bot and associated data${NC}"
  echo ""
  echo "Select uninstall type:"
  echo ""
  echo "1) Soft Uninstall"
  echo "   Stop bot and remove from process manager only"
  echo ""
  echo "2) Hard Uninstall"
  echo "   Stop bot + delete node_modules & dist"
  echo ""
  echo "3) Full Wipe"
  echo "   Everything above + database & logs (IRREVERSIBLE)"
  echo ""
  echo "4) Cancel"
  echo ""
  read -p "Select [1-4]: " UNINSTALL_TYPE
  
  case $UNINSTALL_TYPE in
    1)
      echo -e "${YELLOW}Stopping bot...${NC}"
      cmd_stop_silent
      
      if [ "$CURRENT_MODE" = "systemd" ] && [ "$EUID" -eq 0 ]; then
        systemctl disable "$SERVICE_NAME" 2>/dev/null || true
      fi
      
      echo -e "${GREEN}✅ Bot stopped${NC}"
      ;;
    2)
      echo -e "${YELLOW}Stopping bot...${NC}"
      cmd_stop_silent
      
      if [ "$CURRENT_MODE" = "systemd" ] && [ "$EUID" -eq 0 ]; then
        systemctl disable "$SERVICE_NAME" 2>/dev/null || true
      fi
      
      echo -e "${YELLOW}Removing build files...${NC}"
      rm -rf node_modules dist package-lock.json
      echo -e "${GREEN}✅ Build files deleted${NC}"
      ;;
    3)
      echo -e "${RED}⚠️  FULL WIPE - ALL DATA WILL BE LOST${NC}"
      read -p "Type 'WIPE' to confirm: " CONFIRM
      if [ "$CONFIRM" = "WIPE" ]; then
        echo -e "${YELLOW}Stopping bot...${NC}"
        cmd_stop_silent
        
        if [ "$CURRENT_MODE" = "systemd" ] && [ "$EUID" -eq 0 ]; then
          systemctl disable "$SERVICE_NAME" 2>/dev/null || true
        fi
        
        echo -e "${YELLOW}Removing all data...${NC}"
        rm -rf node_modules dist data logs package-lock.json
        
        if [ "$EUID" -eq 0 ] && [ -d "$SYSTEMD_DIR" ]; then
          echo -e "${YELLOW}Removing systemd installation...${NC}"
          rm -rf "$SYSTEMD_DIR"
          rm -f "/etc/systemd/system/${SERVICE_NAME}.service"
          rm -f "/etc/logrotate.d/${SERVICE_NAME}"
          systemctl daemon-reload 2>/dev/null || true
        fi
        
        echo -e "${GREEN}✅ Full wipe complete${NC}"
      else
        echo -e "${YELLOW}Cancelled${NC}"
      fi
      ;;
    4)
      echo -e "${YELLOW}Cancelled${NC}"
      ;;
    *)
      echo -e "${YELLOW}Invalid option${NC}"
      ;;
  esac
  
  read -p "Press Enter to continue..."
}

# 14) Help & Docs
cmd_help() {
  print_header
  echo -e "${BLUE}❓ Help & Documentation${NC}"
  echo ""
  
  cat << 'EOF'
Quick Start Commands:
═════════════════════

First Time Setup:
  ./manage.sh           # Run interactive manager
  Select option 6       # Setup environment
  Select option 1       # Deploy

Daily Operations:
  ./manage.sh → 1       # Deploy/Update
  ./manage.sh → 4       # Start bot
  ./manage.sh → 3       # Stop bot
  ./manage.sh → 5       # View logs

Configuration:
  PM2 mode:     Edit .env in project directory
  systemd mode: sudo nano /opt/whale-scout/.env

Logs:
  PM2 mode:     ./manage.sh → 5 → 1 (PM2 logs)
  systemd mode: ./manage.sh → 5 (journalctl)
  File logs:    tail -f logs/app.log

Database:
  Location: data/whale_bot.db (PM2)
           /opt/whale-scout/data/whale_bot.db (systemd)
  Reset:    ./manage.sh → 9
  Backup:   ./manage.sh → 9 → 2

Troubleshooting:
════════════════

Bot won't start:
  1. Check logs: ./manage.sh → 5
  2. Verify Node.js v22+: node -v
  3. Rebuild: ./manage.sh → 12
  4. Check database permissions

Build fails with "killed":
  → Create swap space: ./manage.sh → 6
  → Low memory causes OOM killer

Database errors:
  → Reset database: ./manage.sh → 9 → 1
  → Restore from backup: ./manage.sh → 9 → 3

Permission denied:
  → For systemd mode, run with sudo
  → Check file ownership in /opt/whale-scout/

Switching modes:
  → PM2 → systemd: ./manage.sh → 10
  → Database auto-transfers

Useful CLI Commands:
═══════════════════

View stats:
  whale-scout stats

View trades:
  whale-scout trades --limit 20

Export trades:
  whale-scout trades export

Reset data:
  whale-scout reset

Dashboard only:
  whale-scout dashboard

For More Help:
  • Check logs: ./manage.sh → 5
  • GitHub Issues: https://github.com/your-repo/whale-scout
  • README.md in project root

EOF
  
  read -p "Press Enter to continue..."
}

# Main Menu
show_menu() {
  print_header
  show_status
  
  echo -e "${CYAN}Quick Actions:${NC}"
  echo ""
  echo " 1) 🚀 Deploy/Update      - Pull, build & restart"
  echo " 2) 🔄 Restart            - Quick restart"
  echo " 3) ⏹️  Stop               - Stop bot"
  echo " 4) ▶️  Start              - Start bot"
  echo " 5) 📋 Logs               - View live logs"
  echo ""
  echo -e "${CYAN}Management:${NC}"
  echo ""
  echo " 6) 💻 Setup Environment  - Node.js, swap, build tools"
  echo " 7) 🔧 Configure          - Edit .env settings"
  echo " 8) 📊 System Status      - Resources & health"
  echo " 9) 🗄️  Database Tools     - Reset, backup, restore"
  echo ""
  echo -e "${CYAN}Deployment Mode:${NC}"
  echo ""
  if [ "$CURRENT_MODE" = "systemd" ]; then
    echo "10) 🔧 Switch to PM2 Mode    - Dev mode (user process)"
  else
    echo "10) 🚀 Switch to systemd Mode - Production (system service)"
  fi
  echo "11) 📖 Migration Guide        - Help switching modes"
  echo ""
  echo -e "${CYAN}Maintenance:${NC}"
  echo ""
  echo "12) 🧹 Clean & Rebuild       - Fresh build"
  echo "13) ⚠️  Uninstall             - Remove service & data"
  echo "14) ❓ Help & Docs            - Documentation"
  echo "15) 🚪 Exit                   - Quit manager"
  echo ""
}

# Main Loop
main() {
  # Check if running with command-line args
  if [ $# -gt 0 ]; then
    case "$1" in
      start)
        CURRENT_MODE="${2:-$CURRENT_MODE}"
        cmd_start
        exit 0
        ;;
      stop)
        cmd_stop
        exit 0
        ;;
      restart)
        cmd_restart
        exit 0
        ;;
      deploy|update)
        cmd_deploy
        exit 0
        ;;
      status)
        cmd_system_status
        exit 0
        ;;
      logs)
        cmd_logs
        exit 0
        ;;
      *)
        echo "Usage: $0 [start|stop|restart|deploy|status|logs]"
        exit 1
        ;;
    esac
  fi
  
  # Interactive menu
  while true; do
    show_menu
    read -p "Select option [1-15]: " CHOICE
    
    case $CHOICE in
      1) cmd_deploy ;;
      2) cmd_restart ;;
      3) cmd_stop ;;
      4) cmd_start ;;
      5) cmd_logs ;;
      6) cmd_setup ;;
      7) cmd_configure ;;
      8) cmd_system_status ;;
      9) cmd_database ;;
      10) 
        if [ "$CURRENT_MODE" = "systemd" ]; then
          cmd_switch_to_pm2
        else
          # Switch to systemd (deploy)
          print_header
          echo -e "${BLUE}🚀 Switch to systemd Mode${NC}"
          echo ""
          echo -e "${CYAN}This will deploy to systemd production mode.${NC}"
          echo ""
          read -p "Continue? (y/N): " REPLY
          if [[ $REPLY =~ ^[Yy]$ ]]; then
            CURRENT_MODE="systemd"
            cmd_deploy
          fi
        fi
        ;;
      11) cmd_migration_guide ;;
      12) cmd_clean_rebuild ;;
      13) cmd_uninstall ;;
      14) cmd_help ;;
      15) 
        echo -e "${GREEN}Goodbye! 👋${NC}"
        exit 0
        ;;
      *)
        echo -e "${RED}Invalid option. Please select 1-15.${NC}"
        sleep 1
        ;;
    esac
  done
}

# Run main
main "$@"
