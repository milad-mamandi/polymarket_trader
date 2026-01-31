# 🐋 Polymarket Whale Scout

A sophisticated bot that scouts for whale activity and suspicious new wallets on Polymarket, rates their bets, and executes paper or real trades based on confidence scores.

## Features

- **🐋 Whale Detection**: Automatically detects trades over $50,000
- **🆕 Suspicious Wallet Tracking**: Identifies newly created wallets with large bets
- **📊 Wallet Scoring**: Sophisticated algorithm rates wallets based on age, trade size, win rate, market selection, bet timing, and position concentration
- **⭐ Bet Rating**: Evaluates each bet with a confidence score (0-100)
- **📈 Paper Trading**: Simulates trades when confidence exceeds threshold
- **💰 Real Trading Mode**: Execute actual trades via Polymarket CLOB API (requires configuration)
- **🔄 Smart Resolution**: 3-tier fallback system handles archived markets gracefully
- **💻 Full-Featured CLI**: Six powerful commands (start, stats, trades, config, reset, dashboard)
- **🌐 Web Dashboard**: Modern React-based interface with real-time WebSocket updates
  - Live portfolio tracking
  - Interactive charts and statistics
  - Order monitoring and management
  - Bot controls (start/stop/restart)
  - Password-protected access
- **📱 Multi-channel Alerts**: Console, file logs, and Telegram notifications
- **🚀 Production-Ready**: systemd service and deployment scripts included

## Installation

### Prerequisites

- **Node.js 22+ and npm** (required for ES2022+ syntax support)
- (Optional) Telegram bot token for notifications
- (Optional) Polymarket API credentials for real trading

**Important:** Node.js v22 LTS or higher is required. If you're on an older version, see the [Node.js Upgrade Guide](deploy/README.md#nodejs-upgrade-guide).

**Quick Install Node.js v22:**
```bash
# Ubuntu/Debian
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs

# Or use the automated upgrade script
sudo bash deploy/upgrade-nodejs.sh
```

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

## Quick Start

### Run the Bot

```bash
# Development mode (with hot reload)
npm run dev

# Production mode
npm run build
npm start

# CLI command
whale-scout start
whale-scout start --dashboard   # Start with web dashboard
```

### Web Dashboard

```bash
# Start dashboard only
whale-scout dashboard

# Custom port
whale-scout dashboard -p 8080
```

Access at: http://localhost:3000  
Default password: `admin123` (configurable in `.env`)

### Other CLI Commands

```bash
# View performance statistics
whale-scout stats
whale-scout stats --period week

# Browse trade history
whale-scout trades
whale-scout trades --status WON --limit 50

# Export trades to CSV
whale-scout trades export

# Interactive configuration editor
whale-scout config

# Database management
whale-scout reset
```

Run `whale-scout --help` or `whale-scout <command> --help` for detailed usage.

## Configuration

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
RESOLUTION_CHECK_INTERVAL_MS=300000

# Web Dashboard
DASHBOARD_ENABLED=true
DASHBOARD_PORT=3000
DASHBOARD_PASSWORD=admin123
DASHBOARD_SESSION_SECRET=change-this-to-random-secret-in-production

# Notifications
TELEGRAM_BOT_TOKEN=your_token
TELEGRAM_CHAT_ID=your_chat_id

# Real Trading (Advanced)
TRADING_MODE=paper                      # paper or real
REAL_TRADING_ENABLED=false
REAL_TRADING_PRIVATE_KEY=0x...
REAL_TRADING_CHAIN_ID=137               # Polygon mainnet
CLOB_API=https://clob.polymarket.com
```

## How It Works

### 1. Whale Detection
The bot continuously polls Polymarket's Data API for large trades (filterType=CASH, filterAmount=50000).

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
Each bet is rated based on wallet score, size signal, market quality, timing, and consensus.

### 4. Trade Execution
If confidence ≥ threshold, the bot:
- Calculates position size (up to 10% of portfolio)
- Scales size based on confidence level
- Executes simulated trade (paper mode) or real trade (real mode)
- Logs all details

### 5. Smart Resolution System
When checking if trades are resolved, the bot uses a 3-tier fallback system:

1. **Normal Resolution**: Fetches market data to check if resolved
2. **Closed Positions Fallback**: If market is archived (422 error), checks closed positions endpoint
3. **Indeterminate Handling**: If outcome cannot be determined, marks trade as CANCELLED and returns capital

Trade statuses: `OPEN`, `WON`, `LOST`, `CANCELLED` (paper) | `PENDING`, `OPEN`, `PARTIALLY_FILLED`, `FILLED`, `WON`, `LOST`, `CANCELLED`, `EXPIRED`, `FAILED` (real)

### 6. Real-time Monitoring
The bot logs all activity with detailed information via console, file logs, and optional Telegram alerts.

## Architecture

```
┌──────────────────────────────────────────────┐
│         POLYMARKET WHALE SCOUT BOT           │
├──────────────────────────────────────────────┤
│  Data Fetcher (REST/WebSocket API)          │
│         ↓                                     │
│  Wallet Analyzer (Scoring Algorithm)         │
│         ↓                                     │
│  Bet Rater (Confidence Calculator)           │
│         ↓                                     │
│  SQLite Database (Wallets, Trades, Metrics)  │
│         ↓                                     │
│  Trading Engine (Paper/Real Mode)            │
│         ↓                                     │
│  Multi-Channel Alerts & Web Dashboard        │
└──────────────────────────────────────────────┘
```

### Tech Stack
- **Backend**: Node.js + TypeScript + Express.js
- **Frontend**: React + Vite + Tailwind CSS
- **Database**: SQLite
- **Real-time**: WebSocket
- **Blockchain**: ethers.js + Polymarket CLOB API

See [AGENTS.md](AGENTS.md) for detailed architecture, coding standards, and API references.

## Database

SQLite database stored in `data/whale_bot.db` with tables:
- `wallets` - Tracked wallet information
- `wallet_trades` - Their actual trades
- `paper_trades` - Simulated trades
- `real_trades` - Actual executed trades
- `performance` - Daily metrics
- `market_cache` - Cached market data

## Logging

- **Console Logs**: Real-time output with color coding
- **File Logs**: `logs/app.log` (general), `logs/trades.log` (trades)
- **Telegram Alerts**: Instant notifications for whale detections, trades, and errors

## Safety Features

✅ **Paper Trading Default** - No real money at risk  
✅ **Position Size Limits** - Maximum 10% per trade  
✅ **Confidence Thresholds** - Only trades above configured confidence  
✅ **Kill Switch** - Emergency stop mechanism for real trading  
✅ **Error Handling** - Graceful degradation on API failures  
✅ **Rate Limiting** - Respects API limits with caching  

## Server Deployment

Deploy as a systemd service on Linux servers:

**Prerequisites:**
- Ubuntu/Debian server
- Node.js v22 LTS or higher
- Root or sudo access

**Quick Deploy:**

```bash
# 1. Upgrade Node.js to v22 (if needed)
sudo bash deploy/upgrade-nodejs.sh

# 2. Build the project
npm install
npm run build

# 3. Run automated deployment
sudo bash deploy/deploy.sh

# 4. Configure
sudo nano /opt/whale-scout/.env

# 5. Start service
sudo systemctl start whale-scout
sudo systemctl enable whale-scout

# 6. View logs
sudo journalctl -u whale-scout -f
```

See [deploy/README.md](deploy/README.md) for detailed deployment instructions, troubleshooting, and the Node.js upgrade guide.

## Disclaimer

This bot is for educational and informational purposes only. Paper trading mode does not involve real money. Real trading mode executes actual trades on Polymarket - use at your own risk. Always do your own research before making investment decisions.

## License

MIT

## Support

For issues or questions, check the logs in `logs/app.log` or create an issue in the repository.

---

Built with ❤️ for the Polymarket community
