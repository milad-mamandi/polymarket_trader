#!/bin/bash

echo "🔍 Testing Polymarket Whale Scout Bot"
echo "======================================="
echo ""

# Clean up old data
echo "Cleaning old data..."
rm -f data/whale_bot.db
rm -f logs/*.log

# Run for 60 seconds
echo "Starting bot for 60 seconds..."
echo ""

timeout 60 npm run dev || true

echo ""
echo "======================================="
echo "Test complete! Checking results..."
echo ""

# Check database
if [ -f "data/whale_bot.db" ]; then
  echo "✅ Database created"
  sqlite3 data/whale_bot.db "SELECT COUNT(*) as wallets FROM wallets;" | xargs echo "   Wallets tracked:"
  sqlite3 data/whale_bot.db "SELECT COUNT(*) as trades FROM wallet_trades;" | xargs echo "   Trades recorded:"
  sqlite3 data/whale_bot.db "SELECT COUNT(*) as paper_trades FROM paper_trades;" | xargs echo "   Paper trades:"
else
  echo "❌ Database not created"
fi

echo ""

# Check logs
if [ -f "logs/app.log" ]; then
  echo "✅ Log files created"
  echo "   Total log lines:" $(wc -l < logs/app.log)
  echo "   Errors:" $(grep -c "ERROR" logs/app.log || echo "0")
  echo "   Whales detected:" $(grep -c "Detected wallet" logs/app.log || echo "0")
else
  echo "❌ Log files not created"
fi

echo ""
echo "Test complete! ✨"
