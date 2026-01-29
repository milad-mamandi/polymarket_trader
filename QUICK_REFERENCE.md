# Quick Reference Card

## 🚀 Run Commands

```bash
# Development (recommended)
npm run dev

# Production
npm run build
npm start

# Test (60 second run)
./test.sh
```

## 📁 Key Files

```
src/index.ts                 # Entry point
src/config/settings.ts       # Configuration
src/core/monitor.ts          # Main loop
src/services/walletScanner.ts   # Whale detection
src/services/walletAnalyzer.ts  # Scoring
src/services/betRater.ts     # Confidence rating
src/services/tradeEngine.ts  # Paper trading
```

## 🔧 Configuration (.env)

```env
WHALE_THRESHOLD_USD=50000           # Min trade size
NEW_WALLET_HOURS=24                 # Suspicious age
MIN_CONFIDENCE_FOR_TRADE=70         # Auto-trade threshold
INITIAL_PAPER_BALANCE=10000         # Starting $
MAX_POSITION_SIZE_PERCENT=10        # Max % per trade
TRADE_POLL_INTERVAL_MS=30000        # Scan interval (30s)
```

## 📊 Database Queries

```bash
# View wallets
sqlite3 data/whale_bot.db "SELECT * FROM wallets LIMIT 10;"

# View trades
sqlite3 data/whale_bot.db "SELECT * FROM wallet_trades ORDER BY timestamp DESC LIMIT 10;"

# View paper trades
sqlite3 data/whale_bot.db "SELECT * FROM paper_trades;"

# View performance
sqlite3 data/whale_bot.db "SELECT * FROM performance;"

# Count records
sqlite3 data/whale_bot.db "SELECT 
  (SELECT COUNT(*) FROM wallets) as wallets,
  (SELECT COUNT(*) FROM wallet_trades) as trades,
  (SELECT COUNT(*) FROM paper_trades) as paper_trades;"
```

## 🐛 Debugging

```bash
# Check logs
tail -f logs/app.log

# Check recent errors
grep ERROR logs/app.log | tail -20

# Check database
ls -lh data/whale_bot.db

# Clean start (removes data)
rm -rf data/ logs/
npm run dev
```

## 📈 Scoring Algorithm

### Wallet Score (0-100)
- Wallet age: 25% (newer = more suspicious)
- Trade size: 20% (larger = higher signal)
- Win rate: 20% (historical accuracy)
- Market selection: 15% (quality)
- Bet timing: 10% (when placed)
- Concentration: 10% (focus)

### Bet Rating (0-100)
- Wallet score: 40%
- Size signal: 25%
- Market quality: 20%
- Timing: 10%
- Consensus: 5%

**Auto-trade if confidence ≥ 70%**

## 🎯 What's Tracked

- **76 whales** from leaderboard
- Trades ≥ **$50,000 USD**
- Wallets created in last **24 hours**
- All trades stored in DB
- Win/loss tracking (when markets resolve)
- Portfolio P&L

## 🔥 Features

✅ Real-time whale detection  
✅ Suspicious new wallet flagging  
✅ Confidence scoring (0-100)  
✅ Auto paper trading (≥70% confidence)  
✅ Live terminal dashboard  
✅ File logging  
✅ Telegram alerts (optional)  
✅ SQLite database  
✅ Performance tracking  

## 📝 Logs Location

```
logs/app.log              # Main log file
data/whale_bot.db         # SQLite database
```

## 🆘 Common Issues

**Issue**: Bot not detecting trades  
**Fix**: Lower `WHALE_THRESHOLD_USD` in .env

**Issue**: Too many alerts  
**Fix**: Raise `MIN_CONFIDENCE_FOR_TRADE` in .env

**Issue**: Database error  
**Fix**: Delete `data/` folder and restart

**Issue**: API rate limit  
**Fix**: Increase `TRADE_POLL_INTERVAL_MS` in .env

## 📞 APIs Used

- **Polymarket Data API**: `/trades`, `/positions`, `/activity`
- **Polymarket Gamma API**: `/markets`, `/events`, `/profiles`
- **Polymarket CLOB API**: Pricing data

## ✅ Production Checklist

- [x] All dependencies installed (`npm install`)
- [x] TypeScript compiles (`npm run build`)
- [x] Database initializes
- [x] Bot starts without errors
- [x] Logs writing correctly
- [x] Whales detected
- [x] Scores calculated
- [x] Paper trades execute
- [x] All bugs fixed

## 🎯 Success Indicators

When running, you should see:
- "🚀 Starting Polymarket Whale Scout..."
- "Seeded 50 whales from leaderboard"
- "Scanning for whale trades..."
- Live dashboard updates every 5s
- No ERROR messages in logs

---

**Status**: ✅ Production Ready  
**Version**: 1.0  
**Last Updated**: Jan 29, 2026
