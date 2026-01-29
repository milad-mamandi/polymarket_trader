# 🐋 Polymarket Whale Scout

A sophisticated bot that scouts for whale activity and suspicious new wallets on Polymarket, rates their bets, and executes paper trades based on confidence scores.

## Features

- **Whale Detection**: Automatically detects trades over $50,000
- **Suspicious Wallet Tracking**: Identifies newly created wallets with large bets
- **Wallet Scoring**: Sophisticated algorithm rates wallets based on:
  - Wallet age
  - Trade size
  - Historical win rate
  - Market selection
  - Bet timing
  - Position concentration
- **Bet Rating**: Evaluates each bet with a confidence score (0-100)
- **Paper Trading**: Simulates trades when confidence exceeds 70%
- **Real-time Dashboard**: Terminal-based UI showing:
  - Watched wallets
  - Recent signals
  - Portfolio performance
- **Multi-channel Alerts**: Notifications via console, file logs, and Telegram

## Installation

### Prerequisites

- Node.js 18+ and npm
- (Optional) Telegram bot token for notifications

### Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure environment variables:**
   ```bash
   cp .env.example .env
   # Edit .env with your settings
   ```

3. **Set up Telegram (Optional):**
   - Create a bot via [@BotFather](https://t.me/botfather)
   - Get your chat ID from [@userinfobot](https://t.me/userinfobot)
   - Add to `.env`:
     ```
     TELEGRAM_BOT_TOKEN=your_bot_token_here
     TELEGRAM_CHAT_ID=your_chat_id_here
     ```

## Usage

### Development Mode

```bash
npm run dev
```

### Production Mode

```bash
npm run build
npm start
```

### Configuration

Edit `.env` to customize:

```env
# Detection Thresholds
WHALE_THRESHOLD_USD=50000
NEW_WALLET_HOURS=24
MIN_CONFIDENCE_FOR_TRADE=70

# Paper Trading
INITIAL_PAPER_BALANCE=10000
MAX_POSITION_SIZE_PERCENT=10

# Polling
TRADE_POLL_INTERVAL_MS=30000

# Notifications
TELEGRAM_BOT_TOKEN=your_token
TELEGRAM_CHAT_ID=your_chat_id
```

## How It Works

### 1. Whale Detection

The bot continuously polls Polymarket's Data API for large trades:

```
GET /trades?filterType=CASH&filterAmount=50000
```

### 2. Wallet Analysis

For each detected wallet, the bot:
- Fetches wallet profile and creation date
- Analyzes trading history
- Calculates a suspicion score (0-100)

**Scoring Algorithm:**
- Wallet Age (25%): Newer = more suspicious
- Trade Size (20%): Larger bets = higher signal
- Win Rate (20%): Historical accuracy
- Market Selection (15%): Quality of markets chosen
- Bet Timing (10%): When bets are placed
- Concentration (10%): Position focus

### 3. Bet Rating

Each bet is rated based on:
- Wallet Score (30%)
- Size Signal (25%)
- Market Quality (20%)
- Timing (15%)
- Consensus (10%)

### 4. Paper Trading

If confidence ≥ 70%, the bot:
- Calculates position size (up to 10% of portfolio)
- Scales size based on confidence level
- Executes simulated trade
- Logs all details

### 5. Real-time Monitoring

The terminal dashboard updates every 5 seconds showing:
- Active watched wallets
- Recent signals and trades
- Portfolio P&L and performance

## Dashboard

```
╔═══════════════════════════════════════════════════════════════════════╗
║                   🐋 POLYMARKET WHALE SCOUT v1.0                      ║
╠═══════════════════════════════════════════════════════════════════════╣
║ Status: RUNNING          Mode: PAPER TRADING           Uptime: 2h 34m ║
╚═══════════════════════════════════════════════════════════════════════╝

WATCHED WALLETS (15)
┌────────────────┬───────────┬──────┬─────────────┬──────────┐
│ Address        │ Type      │ Score│ Volume      │ W/L      │
├────────────────┼───────────┼──────┼─────────────┼──────────┤
│ 0x7c3d...5c6b  │ New       │ 85   │ $127,500.00 │ 3/4 (75%)│
│ 0x89ab...ef12  │ Whale     │ 72   │ $890,000.00 │ 8/10(80%)│
└────────────────┴───────────┴──────┴─────────────┴──────────┘

RECENT SIGNALS (Last 1hr)
┌──────────┬────────────┬─────────────────────┬──────────┬─────┬──────────┐
│ Time     │ Wallet     │ Market              │ Bet      │ Conf│ Status   │
├──────────┼────────────┼─────────────────────┼──────────┼─────┼──────────┤
│ 14:32    │ 0x7c3d... │ Trump wins 2026?    │ YES@0.67 │ 78% │ EXECUTED │
└──────────┴────────────┴─────────────────────┴──────────┴─────┴──────────┘

PAPER PORTFOLIO
───────────────────────────────────────────────────────────────────────────
Starting Balance: $10,000.00    Current: $11,234.50    P&L: +$1,234.50
Open Positions: 3               Win Rate: 72%          ROI: +12.3%
───────────────────────────────────────────────────────────────────────────
```

## Logging

### Console Logs
Real-time output to terminal with color coding

### File Logs
- `logs/app.log` - General application logs
- `logs/trades.log` - Detailed trade execution logs

### Telegram Alerts
Instant notifications for:
- Whale detections
- Paper trade executions
- Errors and warnings

## Database

SQLite database stored in `data/whale_bot.db` with tables:
- `wallets` - Tracked wallet information
- `wallet_trades` - Their actual trades
- `paper_trades` - Our simulated trades
- `performance` - Daily metrics
- `market_cache` - Cached market data

## API Endpoints Used

| Endpoint | Purpose |
|----------|---------|
| `GET /trades` | Detect whale trades |
| `GET /public-profile` | Check wallet age |
| `GET /positions` | Analyze positions |
| `GET /activity` | Trading history |
| `GET /v1/leaderboard` | Seed initial whales |
| `GET /markets` | Market details |

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    POLYMARKET WHALE BOT                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐    │
│  │ Data Fetcher │───▶│ Wallet       │───▶│ Bet Rater    │    │
│  │ (REST API)   │    │ Analyzer     │    │ (Confidence) │    │
│  └──────────────┘    └──────────────┘    └──────────────┘    │
│         │                    │                    │            │
│         ▼                    ▼                    ▼            │
│  ┌──────────────────────────────────────────────────────┐     │
│  │              SQLite Database                         │     │
│  │  ├─ Wallets  ├─ Trades  ├─ Paper Trades ├─ Metrics │     │
│  └──────────────────────────────────────────────────────┘     │
│         │                                                      │
│         ▼                                                      │
│  ┌──────────────────────────────────────────────────────┐     │
│  │           Paper Trading Engine                       │     │
│  └──────────────────────────────────────────────────────┘     │
│         │                                                      │
│         ▼                                                      │
│  ┌──────────────────────────────────────────────────────┐     │
│  │     Multi-Channel Alerts (Console/File/Telegram)     │     │
│  └──────────────────────────────────────────────────────┘     │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Project Structure

```
poly/
├── src/
│   ├── index.ts                 # Entry point
│   ├── config/
│   │   └── settings.ts          # Configuration
│   ├── services/
│   │   ├── polymarket/
│   │   │   ├── api.ts           # REST API client
│   │   │   └── types.ts         # Type definitions
│   │   ├── walletScanner.ts     # Whale detection
│   │   ├── walletAnalyzer.ts    # Scoring algorithm
│   │   ├── betRater.ts          # Confidence rating
│   │   ├── tradeEngine.ts       # Paper trading
│   │   └── telegram.ts          # Notifications
│   ├── models/
│   │   ├── database.ts          # SQLite setup
│   │   ├── wallet.ts            # Wallet model
│   │   ├── trade.ts             # Trade model
│   │   └── paperTrade.ts        # Paper trade model
│   ├── core/
│   │   ├── monitor.ts           # Main loop
│   │   ├── alertSystem.ts       # Alert management
│   │   └── performanceTracker.ts# Performance tracking
│   └── utils/
│       ├── logger.ts            # Logging
│       ├── helpers.ts           # Utility functions
│       └── display.ts           # Terminal UI
├── data/
│   └── whale_bot.db             # Database
├── logs/
│   ├── app.log                  # Application logs
│   └── trades.log               # Trade logs
├── package.json
├── tsconfig.json
└── .env
```

## Safety Features

✅ **Paper Trading Only** - No real money at risk
✅ **Position Size Limits** - Maximum 10% per trade
✅ **Confidence Thresholds** - Only trades above 70% confidence
✅ **Error Handling** - Graceful degradation on API failures
✅ **Rate Limiting** - Respects API limits with caching

## Future Enhancements

- [ ] WebSocket integration for real-time updates
- [ ] Machine learning for improved scoring
- [ ] Advanced consensus detection
- [ ] Web dashboard
- [ ] Backtesting framework
- [ ] Real trading mode (with proper wallet integration)

## Disclaimer

This bot is for educational and informational purposes only. It operates in paper trading mode and does not execute real trades. Always do your own research before making investment decisions.

## License

MIT

## Support

For issues or questions, please check the logs in `logs/app.log` or create an issue in the repository.

---

Built with ❤️ for the Polymarket community
