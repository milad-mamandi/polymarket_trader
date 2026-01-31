#!/bin/bash

###############################################
# Quick Update Script (No Database Reset)
# For minor updates without stopping the bot
###############################################

set -e

echo "⚡ Quick update (no restart)..."

# Change to project directory
cd "$(dirname "$0")/.."

# Pull latest changes
echo "⬇️  Pulling changes..."
git stash
git pull origin main

# Install dependencies (only if package.json changed)
if git diff HEAD@{1} --name-only | grep -q "package.json"; then
  echo "📦 Installing dependencies..."
  npm install
fi

# Build
echo "🔨 Building..."
npm run build

echo "✅ Update complete! Restart bot when ready:"
echo "   pm2 restart whale-scout"
echo "   OR: npm run dev"
