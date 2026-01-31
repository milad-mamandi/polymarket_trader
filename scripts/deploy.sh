#!/bin/bash

#############################################
# Polymarket Whale Scout - Deployment Script
# Pulls latest changes and restarts the bot
#############################################

set -e  # Exit on error

echo "🚀 Starting deployment..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Change to project directory
cd "$(dirname "$0")/.."
PROJECT_DIR=$(pwd)
echo "📁 Project directory: $PROJECT_DIR"

# Check if git repo
if [ ! -d ".git" ]; then
  echo -e "${RED}❌ Error: Not a git repository${NC}"
  exit 1
fi

# Stop the bot if running (PM2)
echo -e "\n${YELLOW}🛑 Stopping bot...${NC}"
if command -v pm2 &> /dev/null; then
  pm2 stop whale-scout || echo "Bot not running in PM2"
else
  echo "⚠️  PM2 not found - skipping stop"
fi

# Stash any local changes
echo -e "\n${YELLOW}💾 Stashing local changes...${NC}"
git stash

# Pull latest changes
echo -e "\n${YELLOW}⬇️  Pulling latest changes from main...${NC}"
git pull origin main

# Install/update dependencies
echo -e "\n${YELLOW}📦 Installing dependencies...${NC}"
npm install

# Rebuild native modules (fixes better-sqlite3 bindings issues on Node.js version changes)
echo -e "\n${YELLOW}🔧 Rebuilding native modules...${NC}"
npm rebuild || {
  echo -e "${YELLOW}⚠️  Rebuild failed, attempting clean install...${NC}"
  rm -rf node_modules package-lock.json
  npm install
}

# Build TypeScript and client
echo -e "\n${YELLOW}🔨 Building project...${NC}"
npm run build

# Check if database reset is needed
echo -e "\n${YELLOW}🗄️  Database Check${NC}"
if [ -f "data/whale_bot.db" ]; then
  OPEN_TRADES=$(sqlite3 data/whale_bot.db "SELECT COUNT(*) FROM paper_trades WHERE status = 'OPEN';" 2>/dev/null || echo "0")
  echo "Current open positions: $OPEN_TRADES"
  
  if [ "$OPEN_TRADES" -gt 50 ]; then
    echo -e "${YELLOW}⚠️  Warning: High number of open positions ($OPEN_TRADES)${NC}"
    read -p "Reset paper trades database? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
      echo -e "${YELLOW}🔄 Resetting paper trades...${NC}"
      sqlite3 data/whale_bot.db < scripts/reset_paper_trades.sql
      echo -e "${GREEN}✅ Database reset complete${NC}"
    fi
  fi
else
  echo "No database found - will be created on first run"
fi

# Restart the bot
echo -e "\n${YELLOW}▶️  Starting bot...${NC}"
if command -v pm2 &> /dev/null; then
  # Check if PM2 process exists
  if pm2 list | grep -q "whale-scout"; then
    pm2 restart whale-scout
  else
    # First time setup with PM2
    pm2 start npm --name "whale-scout" -- start
    pm2 save
  fi
  
  echo -e "\n${GREEN}✅ Bot restarted with PM2${NC}"
  pm2 status whale-scout
else
  echo -e "${YELLOW}⚠️  PM2 not installed - starting in foreground${NC}"
  echo -e "${YELLOW}💡 Install PM2 for background process: npm install -g pm2${NC}"
  npm start
fi

echo -e "\n${GREEN}🎉 Deployment complete!${NC}"
echo -e "\n📊 Monitor logs:"
echo -e "  ${YELLOW}tail -f logs/app.log${NC}     (File logs)"
echo -e "  ${YELLOW}pm2 logs whale-scout${NC}    (PM2 logs)"
echo -e "\n🌐 Dashboard: http://localhost:3000"
