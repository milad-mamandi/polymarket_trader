#!/bin/bash

#############################################
# Polymarket Whale Scout - Interactive Manager
# All-in-one script for deployment and management
#############################################

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Config
MIN_MEMORY_MB=2048
MIN_SWAP_MB=1024
MIN_DISK_MB=500
PROJECT_NAME="whale-scout"

# Change to project directory
cd "$(dirname "$0")/.."
PROJECT_DIR=$(pwd)

# Helper Functions
print_header() {
  clear
  echo -e "${CYAN}╔════════════════════════════════════════════════╗${NC}"
  echo -e "${CYAN}║      🐋 Polymarket Whale Scout Manager         ║${NC}"
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

get_bot_status() {
  if check_pm2; then
    if pm2 list 2>/dev/null | grep -q "$PROJECT_NAME"; then
      pm2 show "$PROJECT_NAME" 2>/dev/null | grep "status" | awk '{print $4}' || echo "unknown"
    else
      echo "stopped"
    fi
  else
    echo "pm2-not-installed"
  fi
}

show_status() {
  local mem=$(get_memory_mb)
  local swap=$(get_swap_mb)
  local disk=$(get_disk_mb)
  local bot_status=$(get_bot_status)
  
  echo -e "${BLUE}Server Status:${NC}"
  echo "  Memory: ${mem}MB $([ $mem -lt $MIN_MEMORY_MB ] && echo -e "${YELLOW}⚠️${NC}" || echo -e "${GREEN}✓${NC}")"
  echo "  Swap:   ${swap}MB $([ $swap -lt $MIN_SWAP_MB ] && echo -e "${YELLOW}⚠️${NC}" || echo -e "${GREEN}✓${NC}")"
  echo "  Disk:   ${disk}MB free $([ $disk -lt $MIN_DISK_MB ] && echo -e "${RED}⚠️${NC}" || echo -e "${GREEN}✓${NC}")"
  echo ""
  
  echo -e "${BLUE}Bot Status:${NC}"
  case "$bot_status" in
    "online")
      echo -e "  Running ${GREEN}✓${NC} (PM2)"
      ;;
    "stopped")
      echo -e "  Stopped ${YELLOW}⚠${NC}"
      ;;
    "pm2-not-installed")
      echo -e "  PM2 not installed ${RED}✗${NC}"
      ;;
    *)
      echo -e "  Status: $bot_status ${YELLOW}?${NC}"
      ;;
  esac
  echo ""
  
  # Warnings
  if [ $mem -lt $MIN_MEMORY_MB ] && [ $swap -lt $MIN_SWAP_MB ]; then
    echo -e "${YELLOW}⚠️  Warning: Low memory (${mem}MB) and insufficient swap (${swap}MB)${NC}"
    echo -e "${YELLOW}   Recommendation: Run option 3 (Setup Server) to create swap space${NC}"
    echo ""
  fi
}

# Command Functions
cmd_deploy() {
  print_header
  echo -e "${BLUE}🚀 Deploy${NC} - Full deployment with restart"
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
  if check_pm2; then
    pm2 stop "$PROJECT_NAME" 2>/dev/null || echo "Bot not running"
  fi
  
  # Pull changes
  echo -e "${YELLOW}⬇️  Pulling latest changes...${NC}"
  if [ -d ".git" ]; then
    git pull origin main
  else
    echo -e "${RED}❌ Not a git repository${NC}"
    return 1
  fi
  
  # Install dependencies
  echo -e "${YELLOW}📦 Installing dependencies...${NC}"
  npm ci || npm install
  
  # Rebuild native modules
  echo -e "${YELLOW}🔧 Rebuilding native modules...${NC}"
  if ! npm rebuild 2>/dev/null; then
    echo -e "${YELLOW}⚠️  Rebuild failed, cleaning and reinstalling...${NC}"
    rm -rf node_modules package-lock.json
    npm install
  fi
  
  # Build with memory limit
  echo -e "${YELLOW}🔨 Building project...${NC}"
  export NODE_OPTIONS="--max-old-space-size=1536"
  if npm run build; then
    echo -e "${GREEN}✅ Build successful${NC}"
  else
    echo -e "${RED}❌ Build failed${NC}"
    echo -e "${YELLOW}💡 If 'killed', run Setup (option 3) to create swap${NC}"
    read -p "Press Enter to continue..."
    return 1
  fi
  
  # Check database
  echo -e "${YELLOW}🗄️  Checking database...${NC}"
  if [ -f "data/whale_bot.db" ]; then
    local open_trades=$(sqlite3 data/whale_bot.db "SELECT COUNT(*) FROM paper_trades WHERE status = 'OPEN';" 2>/dev/null || echo "0")
    echo "  Open positions: $open_trades"
    if [ "$open_trades" -gt 50 ]; then
      echo -e "${YELLOW}⚠️  High number of open positions${NC}"
      read -p "Reset database? (y/N): " REPLY
      if [[ $REPLY =~ ^[Yy]$ ]]; then
        sqlite3 data/whale_bot.db < scripts/reset_paper_trades.sql
        echo -e "${GREEN}✅ Database reset${NC}"
      fi
    fi
  fi
  
  # Start bot
  cmd_start
  
  echo -e "${GREEN}🎉 Deployment complete!${NC}"
  echo -e "${CYAN}Dashboard: http://localhost:3000${NC}"
  read -p "Press Enter to continue..."
}

cmd_update() {
  print_header
  echo -e "${BLUE}⚡ Quick Update${NC} - Pull & build (no restart)"
  echo ""
  
  echo -e "${YELLOW}⬇️  Pulling changes...${NC}"
  git pull origin main
  
  echo -e "${YELLOW}📦 Installing dependencies...${NC}"
  npm ci || npm install
  
  echo -e "${YELLOW}🔨 Building...${NC}"
  export NODE_OPTIONS="--max-old-space-size=1536"
  npm run build
  
  echo -e "${GREEN}✅ Update complete!${NC}"
  echo -e "${YELLOW}Restart bot with option 6 when ready${NC}"
  read -p "Press Enter to continue..."
}

cmd_setup() {
  print_header
  echo -e "${BLUE}⚙️  Server Setup${NC}"
  echo ""
  
  echo -e "${CYAN}This will:${NC}"
  echo "  • Check/install Node.js"
  echo "  • Install PM2 globally"
  echo "  • Create swap space (if needed)"
  echo "  • Install build tools"
  echo ""
  read -p "Continue? (Y/n): " REPLY
  [[ $REPLY =~ ^[Nn]$ ]] && return
  
  # Check Node.js
  echo -e "${YELLOW}📦 Checking Node.js...${NC}"
  if command -v node &> /dev/null; then
    local node_version=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$node_version" -ge 18 ]; then
      echo -e "${GREEN}✓ Node.js $(node --version)${NC}"
    else
      echo -e "${YELLOW}⚠️  Node.js $(node --version) - version 18+ recommended${NC}"
    fi
  else
    echo -e "${RED}❌ Node.js not found${NC}"
    echo -e "${YELLOW}Install Node.js 18+ from https://nodejs.org${NC}"
    read -p "Press Enter to continue..."
    return
  fi
  
  # Install PM2
  echo -e "${YELLOW}📦 Installing PM2...${NC}"
  if ! check_pm2; then
    npm install -g pm2
    pm2 startup
  else
    echo -e "${GREEN}✓ PM2 already installed${NC}"
  fi
  
  # Install build tools
  echo -e "${YELLOW}📦 Installing build tools...${NC}"
  if command -v apt-get &> /dev/null; then
    sudo apt-get update
    sudo apt-get install -y build-essential python3
  elif command -v yum &> /dev/null; then
    sudo yum groupinstall -y "Development Tools"
    sudo yum install -y python3
  else
    echo -e "${YELLOW}⚠️  Please install build tools manually${NC}"
  fi
  
  # Create swap
  create_swap
  
  # Install project dependencies
  echo -e "${YELLOW}📦 Installing project dependencies...${NC}"
  npm install
  
  echo -e "${GREEN}✅ Setup complete!${NC}"
  echo -e "${CYAN}You can now deploy with option 1${NC}"
  read -p "Press Enter to continue..."
}

create_swap() {
  local current_swap=$(get_swap_mb)
  
  if [ $current_swap -ge $MIN_SWAP_MB ]; then
    echo -e "${GREEN}✓ Swap already configured (${current_swap}MB)${NC}"
    return
  fi
  
  echo -e "${YELLOW}💾 Creating 2GB swap file...${NC}"
  
  # Check if swapfile already exists
  if [ -f /swapfile ]; then
    echo -e "${YELLOW}⚠️  /swapfile already exists${NC}"
    read -p "Remove and recreate? (y/N): " REPLY
    if [[ $REPLY =~ ^[Yy]$ ]]; then
      sudo swapoff /swapfile 2>/dev/null || true
      sudo rm /swapfile
    else
      return
    fi
  fi
  
  # Create swap
  sudo fallocate -l 2G /swapfile || sudo dd if=/dev/zero of=/swapfile bs=1M count=2048
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile
  sudo swapon /swapfile
  
  # Add to fstab if not present
  if ! grep -q "/swapfile" /etc/fstab; then
    echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
  fi
  
  echo -e "${GREEN}✅ Swap created and activated${NC}"
  echo "  Current swap: $(get_swap_mb)MB"
}

cmd_start() {
  print_header
  echo -e "${BLUE}▶️  Start Bot${NC}"
  echo ""
  
  if ! check_pm2; then
    echo -e "${RED}❌ PM2 not installed${NC}"
    echo -e "${YELLOW}Run Setup (option 3) first${NC}"
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
  read -p "Press Enter to continue..."
}

cmd_stop() {
  print_header
  echo -e "${BLUE}⏹️  Stop Bot${NC}"
  echo ""
  
  if check_pm2; then
    pm2 stop "$PROJECT_NAME" 2>/dev/null || echo "Bot not running"
    echo -e "${GREEN}✅ Bot stopped${NC}"
  else
    echo -e "${YELLOW}⚠️  PM2 not installed${NC}"
  fi
  
  read -p "Press Enter to continue..."
}

cmd_restart() {
  print_header
  echo -e "${BLUE}🔄 Restart Bot${NC}"
  echo ""
  
  if ! check_pm2; then
    echo -e "${RED}❌ PM2 not installed${NC}"
    read -p "Press Enter to continue..."
    return
  fi
  
  if pm2 list 2>/dev/null | grep -q "$PROJECT_NAME"; then
    pm2 restart "$PROJECT_NAME"
    echo -e "${GREEN}✅ Bot restarted${NC}"
    pm2 status "$PROJECT_NAME"
  else
    echo -e "${YELLOW}⚠️  Bot not running, starting...${NC}"
    cmd_start
    return
  fi
  
  read -p "Press Enter to continue..."
}

cmd_logs() {
  print_header
  echo -e "${BLUE}📋 View Logs${NC}"
  echo ""
  
  echo "Select log source:"
  echo "1) PM2 logs (live)"
  echo "2) File logs (app.log)"
  echo "3) Back"
  echo ""
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
        echo -e "${CYAN}Press Ctrl+C to exit, scroll with arrow keys${NC}"
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
}

cmd_status() {
  print_header
  echo -e "${BLUE}ℹ️  Server Status${NC}"
  echo ""
  
  show_status
  
  if check_pm2; then
    echo ""
    pm2 status
  fi
  
  read -p "Press Enter to continue..."
}

cmd_reset_db() {
  print_header
  echo -e "${BLUE}🗄️  Reset Database${NC}"
  echo ""
  
  if [ ! -f "data/whale_bot.db" ]; then
    echo -e "${YELLOW}⚠️  No database found${NC}"
    read -p "Press Enter to continue..."
    return
  fi
  
  echo -e "${RED}⚠️  WARNING: This will delete all paper trades!${NC}"
  echo ""
  
  local open_trades=$(sqlite3 data/whale_bot.db "SELECT COUNT(*) FROM paper_trades WHERE status = 'OPEN';" 2>/dev/null || echo "0")
  local total_trades=$(sqlite3 data/whale_bot.db "SELECT COUNT(*) FROM paper_trades;" 2>/dev/null || echo "0")
  
  echo "Current trades:"
  echo "  Open: $open_trades"
  echo "  Total: $total_trades"
  echo ""
  
  read -p "Type 'RESET' to confirm: " CONFIRM
  
  if [ "$CONFIRM" = "RESET" ]; then
    sqlite3 data/whale_bot.db < scripts/reset_paper_trades.sql
    echo -e "${GREEN}✅ Database reset complete${NC}"
  else
    echo -e "${YELLOW}Cancelled${NC}"
  fi
  
  read -p "Press Enter to continue..."
}

cmd_uninstall() {
  print_header
  echo -e "${BLUE}🗑️  Uninstall${NC}"
  echo ""
  
  echo -e "${RED}⚠️  This will remove the bot and associated data${NC}"
  echo ""
  echo "Select uninstall type:"
  echo ""
  echo "1) Soft Uninstall"
  echo "   Stop bot and remove from PM2 only"
  echo ""
  echo "2) Hard Uninstall"
  echo "   Stop bot + remove PM2 + delete node_modules & dist"
  echo ""
  echo "3) Full Wipe"
  echo "   Everything above + database & logs (IRREVERSIBLE)"
  echo ""
  echo "4) Cancel"
  echo ""
  read -p "Select [1-4]: " UNINSTALL_TYPE
  
  case $UNINSTALL_TYPE in
    1)
      echo -e "${YELLOW}Stopping bot and removing from PM2...${NC}"
      if check_pm2; then
        pm2 stop "$PROJECT_NAME" 2>/dev/null || true
        pm2 delete "$PROJECT_NAME" 2>/dev/null || true
      fi
      echo -e "${GREEN}✅ Bot stopped and removed from PM2${NC}"
      ;;
    2)
      echo -e "${YELLOW}Removing bot and build files...${NC}"
      if check_pm2; then
        pm2 stop "$PROJECT_NAME" 2>/dev/null || true
        pm2 delete "$PROJECT_NAME" 2>/dev/null || true
      fi
      rm -rf node_modules dist package-lock.json
      echo -e "${GREEN}✅ Bot removed, build files deleted${NC}"
      ;;
    3)
      echo -e "${RED}⚠️  FULL WIPE - ALL DATA WILL BE LOST${NC}"
      read -p "Type 'WIPE' to confirm: " CONFIRM
      if [ "$CONFIRM" = "WIPE" ]; then
        echo -e "${YELLOW}Removing all data...${NC}"
        if check_pm2; then
          pm2 stop "$PROJECT_NAME" 2>/dev/null || true
          pm2 delete "$PROJECT_NAME" 2>/dev/null || true
        fi
        rm -rf node_modules dist data logs package-lock.json
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

# Main Menu
show_menu() {
  print_header
  show_status
  
  echo -e "${CYAN}Options:${NC}"
  echo ""
  echo " 1) 🚀 Deploy          - Pull, build & restart"
  echo " 2) ⚡ Update          - Pull & build (no restart)"
  echo " 3) ⚙️  Setup Server    - Install Node, PM2, swap"
  echo " 4) ▶️  Start Bot       - Start with PM2"
  echo " 5) ⏹️  Stop Bot        - Stop bot"
  echo " 6) 🔄 Restart Bot      - Quick restart"
  echo " 7) 📋 View Logs        - Show live logs"
  echo " 8) ℹ️  Server Status   - Check memory, disk, bot"
  echo " 9) 🗄️  Reset Database  - Clear paper trades"
  echo "10) 🗑️  Uninstall       - Remove bot and data"
  echo "11) 🚪 Exit"
  echo ""
}

# Main Loop
main() {
  while true; do
    show_menu
    read -p "Select option [1-11]: " CHOICE
    
    case $CHOICE in
      1) cmd_deploy ;;
      2) cmd_update ;;
      3) cmd_setup ;;
      4) cmd_start ;;
      5) cmd_stop ;;
      6) cmd_restart ;;
      7) cmd_logs ;;
      8) cmd_status ;;
      9) cmd_reset_db ;;
      10) cmd_uninstall ;;
      11) 
        echo -e "${GREEN}Goodbye! 👋${NC}"
        exit 0
        ;;
      *)
        echo -e "${RED}Invalid option. Please select 1-11.${NC}"
        sleep 1
        ;;
    esac
  done
}

# Run main
main
