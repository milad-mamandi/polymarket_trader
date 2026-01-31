#!/bin/bash

###############################################
# Push to GitHub and Deploy to Server
# Commits, pushes, and triggers deployment
###############################################

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}📤 Push and Deploy Script${NC}\n"

# Change to project directory
cd "$(dirname "$0")/.."

# Check if there are changes
if git diff-index --quiet HEAD --; then
  echo -e "${YELLOW}No changes to commit${NC}"
else
  # Show changed files
  echo -e "${YELLOW}Changed files:${NC}"
  git status --short
  
  # Ask for commit message
  echo -e "\n${CYAN}Enter commit message (or press Enter to skip):${NC}"
  read -r COMMIT_MSG
  
  if [ -n "$COMMIT_MSG" ]; then
    # Stage and commit
    echo -e "\n${YELLOW}📝 Committing changes...${NC}"
    git add .
    git commit -m "$COMMIT_MSG"
  else
    echo -e "${YELLOW}Skipping commit${NC}"
  fi
fi

# Push to GitHub
echo -e "\n${YELLOW}⬆️  Pushing to GitHub...${NC}"
git push origin main
echo -e "${GREEN}✅ Pushed to GitHub${NC}"

# Ask if should deploy to server
echo -e "\n${CYAN}Deploy to server now? (y/N):${NC}"
read -r -n 1 DEPLOY
echo

if [[ $DEPLOY =~ ^[Yy]$ ]]; then
  echo -e "\n${YELLOW}🚀 Deploying to server...${NC}"
  
  # Check if SERVER_HOST is set in .env
  if [ -f ".env" ] && grep -q "SERVER_HOST" .env; then
    SERVER_HOST=$(grep "^SERVER_HOST=" .env | cut -d '=' -f2)
    SERVER_USER=$(grep "^SERVER_USER=" .env | cut -d '=' -f2 || echo "root")
    SERVER_PATH=$(grep "^SERVER_PATH=" .env | cut -d '=' -f2 || echo "/opt/polymarket_trader")
    
    echo -e "${CYAN}Server: $SERVER_USER@$SERVER_HOST:$SERVER_PATH${NC}"
    
    # SSH and deploy
    ssh "$SERVER_USER@$SERVER_HOST" "cd $SERVER_PATH && ./scripts/deploy.sh"
    
    echo -e "\n${GREEN}✅ Deployment complete!${NC}"
  else
    echo -e "${YELLOW}⚠️  SERVER_HOST not configured in .env${NC}"
    echo -e "${CYAN}Add to .env:${NC}"
    echo "SERVER_HOST=your.server.com"
    echo "SERVER_USER=your-username"
    echo "SERVER_PATH=/path/to/project"
    echo ""
    echo -e "${YELLOW}Or deploy manually:${NC}"
    echo "ssh your-server"
    echo "cd /path/to/project"
    echo "./scripts/deploy.sh"
  fi
else
  echo -e "${YELLOW}Deploy manually when ready:${NC}"
  echo "ssh your-server"
  echo "cd /path/to/project"
  echo "./scripts/deploy.sh"
fi

echo -e "\n${GREEN}🎉 Done!${NC}"
