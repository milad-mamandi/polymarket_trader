# Quick Start Guide - Polymarket Whale Scout

## Getting Started

Your Polymarket Whale Scout bot is ready to run! Follow these steps:

### 1. Run the Bot

**Option A: Development Mode (Recommended for Testing)**
```bash
npm run dev
```

**Option B: Production Mode**
```bash
npm run build
npm start
```

### 2. What to Expect

When the bot starts, you'll see:

1. **Initial Setup**
   - Database initialization
   - Configuration display
   - Seeding of initial whales from leaderboard (may take 1-2 minutes)

2. **Live Dashboard**
   - Watched wallets table
   - Recent signals
   - Paper portfolio performance
   - Updates every 5 seconds

3. **Console Alerts**
   - 🐋 Whale alerts when large trades are detected
   - ✅ Trade execution confirmations
   - Real-time activity logs

### 3. Telegram Setup (Optional)

To receive Telegram notifications:

1. **Create a Telegram Bot:**
   - Open Telegram and search for [@BotFather](https://t.me/botfather)
   - Send `/newbot` and follow instructions
   - Copy the bot token

2. **Get Your Chat ID:**
   - Start a chat with your new bot
   - Search for [@userinfobot](https://t.me/userinfobot) and start it
   - Copy your chat ID (the number)

3. **Update .env:**
   ```bash
   TELEGRAM_BOT_TOKEN=123456789:ABCdefGHIjklMNOpqrsTUVwxyz
   TELEGRAM_CHAT_ID=987654321
   ```

4. **Restart the bot**

### 4. Understanding the Dashboard

```
╔═══════════════════════════════════════════════════════════════════════╗
║                   🐋 POLYMARKET WHALE SCOUT v1.0                      ║
╠═══════════════════════════════════════════════════════════════════════╣
║ Status: RUNNING          Mode: PAPER TRADING           Uptime: 2h 34m ║
╚═══════════════════════════════════════════════════════════════════════╝

WATCHED WALLETS (15)
┌────────────────┬───────────┬──────┬─────────────┬──────────┐
│ Address        │ Type      │ Score│ Volume      │ W/L      │
│ 0x7c3d...5c6b  │ New       │ 85   │ $127,500.00 │ 3/4 (75%)│
└────────────────┴───────────┴──────┴─────────────┴──────────┘

RECENT SIGNALS (Last 1hr)
┌──────────┬────────────┬─────────────────────┬──────────┬─────┬──────────┐
│ Time     │ Wallet     │ Market              │ Bet      │ Conf│ Status   │
│ 14:32    │ 0x7c3d... │ Trump wins 2026?    │ YES@0.67 │ 78% │ EXECUTED │
└──────────┴────────────┴─────────────────────┴──────────┴─────┴──────────┘

PAPER PORTFOLIO
───────────────────────────────────────────────────────────────────────────
Starting Balance: $10,000.00    Current: $11,234.50    P&L: +$1,234.50
Open Positions: 3               Win Rate: 72%          ROI: +12.3%
───────────────────────────────────────────────────────────────────────────
```

**What Each Section Means:**

- **Watched Wallets**: Whales and suspicious new wallets being tracked
  - **Type**: "Whale" (large trades), "New" (recently created), or both
  - **Score**: Suspicion/quality rating (0-100)
  - **Volume**: Total trading volume
  - **W/L**: Win/loss record with win rate

- **Recent Signals**: Bets detected in the last hour
  - **Time**: When detected
  - **Wallet**: Who placed the bet
  - **Market**: What they're betting on
  - **Bet**: Outcome and price
  - **Conf**: Confidence rating (0-100%)
  - **Status**: EXECUTED if ≥70% confidence, SKIPPED otherwise

- **Paper Portfolio**: Your simulated trading performance
  - **Starting Balance**: Initial $10,000
  - **Current**: Total portfolio value
  - **P&L**: Profit/loss
  - **Open Positions**: Active trades
  - **Win Rate**: Percentage of winning trades
  - **ROI**: Return on investment

### 5. Customizing Configuration

Edit `.env` to change settings:

```env
# Whale Detection
WHALE_THRESHOLD_USD=50000        # Minimum trade size to track
NEW_WALLET_HOURS=24              # How new is "suspicious"

# Trading
MIN_CONFIDENCE_FOR_TRADE=70      # Minimum confidence to paper trade
INITIAL_PAPER_BALANCE=10000      # Starting virtual balance
MAX_POSITION_SIZE_PERCENT=10     # Max % of portfolio per trade

# Monitoring
TRADE_POLL_INTERVAL_MS=30000     # How often to check (30 seconds)
```

### 6. Checking Logs

**Application Logs:**
```bash
tail -f logs/app.log
```

**Trade Logs (Detailed):**
```bash
tail -f logs/trades.log
```

### 7. Database

The SQLite database is stored at `data/whale_bot.db`. You can query it directly:

```bash
sqlite3 data/whale_bot.db
```

Useful queries:
```sql
-- See all watched wallets
SELECT * FROM wallets ORDER BY suspicion_score DESC LIMIT 10;

-- See paper trades
SELECT * FROM paper_trades ORDER BY timestamp DESC LIMIT 10;

-- Check performance
SELECT * FROM performance ORDER BY date DESC LIMIT 7;
```

### 8. Stopping the Bot

Press `Ctrl+C` to gracefully shutdown the bot.

## How the Bot Works

### Detection Flow

1. **Every 30 seconds**, the bot polls Polymarket for trades ≥ $50,000
2. For each large trade, it:
   - Fetches wallet profile and creation date
   - Checks if wallet is < 24 hours old
   - Calculates a suspicion score
3. If score is high enough, wallet is added to watch list

### Rating Flow

When a watched wallet places a bet:

1. **Wallet Score** (30%): Based on age, history, win rate
2. **Size Signal** (25%): How large the bet is
3. **Market Quality** (20%): Volume and liquidity
4. **Timing** (15%): When the bet was placed
5. **Consensus** (10%): Do other whales agree?

If **total confidence ≥ 70%**, the bot executes a paper trade.

### Paper Trading

- Position size: Up to 10% of portfolio
- Scaled by confidence (higher confidence = larger position)
- Fully simulated (no real money)
- Tracks P&L as if real

## Troubleshooting

**Bot not starting?**
- Check Node.js version: `node --version` (should be 18+)
- Ensure dependencies installed: `npm install`
- Check .env file exists

**No whales detected?**
- This is normal if there's low activity
- Wait 5-10 minutes for initial scan
- Check whale threshold in .env

**Telegram not working?**
- Verify bot token and chat ID
- Make sure you've started a chat with the bot
- Check logs for errors

**High CPU usage?**
- Increase TRADE_POLL_INTERVAL_MS to 60000 (60s)
- This will reduce API calls

## Tips

1. **Let it run for a few hours** to collect data and see patterns
2. **Monitor the logs** to understand what's being detected
3. **Adjust thresholds** based on what you see
4. **Track the paper portfolio** to gauge strategy effectiveness
5. **Use Telegram** for mobile notifications when away

## Next Steps

- Monitor for 24-48 hours to see how it performs
- Adjust confidence threshold based on results
- Fine-tune whale threshold for your needs
- Consider implementing real trading (requires wallet setup)

---

**Need help?** Check `logs/app.log` for errors or issues.
