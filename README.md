# 🐋 Polymarket Whale Scout

A sophisticated CLI tool with web dashboard that scouts for whale activity and suspicious new wallets on Polymarket, rates their bets, and executes paper trades based on confidence scores.

## 🎉 Recent Updates (v2.0)

### January 2026 - Dashboard Modernization
- ✅ **Reset Functionality**: One-click reset for paper trading data in Settings page
- ✅ **React Query + Axios**: Modern data fetching with automatic refetching (10s intervals)
- ✅ **Better Performance**: Optimized data loading and caching
- 🚧 **Real Trading Infrastructure**: Foundation for real trading mode (in progress)

See [TODO.md](TODO.md) for remaining tasks and implementation details.

## Features

- **🐋 Whale Detection**: Automatically detects trades over $50,000
- **🆕 Suspicious Wallet Tracking**: Identifies newly created wallets with large bets
- **📊 Wallet Scoring**: Sophisticated algorithm rates wallets based on:
  - Wallet age
  - Trade size
  - Historical win rate
  - Market selection
  - Bet timing
  - Position concentration
- **⭐ Bet Rating**: Evaluates each bet with a confidence score (0-100)
- **📈 Paper Trading**: Simulates trades when confidence exceeds 70%
- **🔄 Smart Resolution**: 3-tier fallback system handles archived markets
  - Primary: Normal market resolution
  - Fallback: Closed positions endpoint
  - Safeguard: Mark indeterminate outcomes as cancelled
- **💻 Full-Featured CLI**: Six powerful commands
  - `start` - Run the bot
  - `stats` - View performance metrics
  - `trades` - Browse and export trade history
  - `config` - Interactive configuration editor
  - `reset` - Database management tools
  - `dashboard` - Web dashboard interface
- **🌐 Web Dashboard**: Modern React-based web interface
  - Live portfolio tracking with WebSocket updates
  - Interactive charts and statistics
  - Trade and wallet management
  - Bot controls (start/stop/restart)
  - **🔄 One-Click Reset**: Reset paper trading data with confirmation dialog
  - **⚡ React Query + Axios**: Auto-refetching data every 10 seconds
  - **🎯 Real Trading Ready**: Infrastructure for real trading mode (coming soon)
  - Password-protected access
- **📱 Multi-channel Alerts**: Notifications via console, file logs, and Telegram
- **🚀 Production-Ready**: systemd service and deployment scripts included

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

### CLI Commands

Whale Scout provides a comprehensive command-line interface:

```bash
# Start the bot (monitors in real-time)
whale-scout start
whale-scout start --dashboard     # Start bot with web dashboard
# or: npm run dev (development)
# or: npm start (production)

# Start web dashboard only
whale-scout dashboard
whale-scout dashboard -p 8080     # Custom port

# View performance statistics
whale-scout stats
whale-scout stats --period week        # Last 7 days
whale-scout stats --period month       # Last 30 days
whale-scout stats --verbose            # Include recent trades

# Browse trade history
whale-scout trades                     # List all trades
whale-scout trades --status WON        # Filter by status
whale-scout trades --limit 50          # Show last 50 trades
whale-scout trades --from 2026-01-01   # Date range

# View single trade details
whale-scout trades view <id>

# Export trades to CSV
whale-scout trades export              # All trades to trades.csv
whale-scout trades export --status WON --from 2026-01-01

# Interactive configuration editor
whale-scout config

# Database management
whale-scout reset                      # Interactive menu
whale-scout reset full                 # Full reset (requires confirmation)
whale-scout reset paper                # Paper trades only
whale-scout reset archived             # Archived wallet trades only
```

### Development Mode

```bash
npm run dev
```

### Production Mode

```bash
npm run build
npm start
```

### Web Dashboard

Access the full-featured web dashboard for real-time monitoring and control:

```bash
# Start dashboard only
whale-scout dashboard

# Start bot with dashboard
whale-scout start --dashboard

# Custom port
whale-scout dashboard -p 8080
```

**Access**: http://localhost:3000 (or custom port)  
**Default Password**: `admin123` (configurable in `.env`)

**Dashboard Features:**
- 📊 **Real-time Portfolio Tracking** - Live balance, P&L, win rate, and trade counts
- 📈 **Interactive Charts** - Performance over time visualization
- 🎯 **Trade Management** - View recent paper trades with status and P&L
- 👛 **Wallet Monitoring** - Track watched wallets with scores
- 🎮 **Bot Controls** - Start, stop, and restart the monitoring bot
- 🔄 **WebSocket Updates** - Instant updates for new trades, resolutions, and whale detections
- 🗑️ **One-Click Reset** - Clear paper trading data with confirmation dialog
- ⚡ **Auto-Refresh** - Data automatically refetches every 10 seconds using React Query
- 🔒 **Password Protection** - Secure access with session-based authentication

**Dashboard Configuration** (in `.env`):
```env
# Web Dashboard
DASHBOARD_ENABLED=true
DASHBOARD_PORT=3000
DASHBOARD_PASSWORD=admin123
DASHBOARD_SESSION_SECRET=change-this-to-random-secret-in-production
```

**Dashboard Screenshots:**
- Portfolio overview with key metrics
- Recent trades table with filters
- Watched wallets with scoring
- Real-time updates via WebSocket

**Building the Dashboard:**
```bash
# Build backend
npm run build

# Build frontend (required for dashboard)
cd src/web/client
npm install
npm run build
cd ../../..
```

The dashboard is fully responsive and works on desktop and mobile devices.

### Server Deployment

Deploy as a systemd service on Linux servers:

```bash
# Build the project
npm run build

# Run automated installer
sudo ./deploy/install.sh

# Configure
sudo nano /opt/whale-scout/.env

# Start service
sudo systemctl start whale-scout
sudo systemctl enable whale-scout

# View logs
sudo journalctl -u whale-scout -f
```

See [deploy/README.md](deploy/README.md) for detailed deployment instructions.

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

# Web Dashboard
DASHBOARD_ENABLED=true
DASHBOARD_PORT=3000
DASHBOARD_PASSWORD=admin123
DASHBOARD_SESSION_SECRET=change-this-to-random-secret-in-production

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

### 5. Smart Resolution System

When checking if paper trades are resolved, the bot uses a 3-tier fallback system:

**Tier 1: Normal Resolution**
```
GET /markets/{conditionId}
```
Fetches market data to check if resolved and determine winning outcome.

**Tier 2: Closed Positions Fallback**
```
GET /closed-positions?market={conditionId}
```
If market returns 422 (archived/unavailable), checks closed positions endpoint to find actual trade resolution.

**Tier 3: Indeterminate Handling**
If outcome cannot be determined (no matching closed position), marks trade as `CANCELLED` and returns capital. This prevents false losses from archived markets.

**Trade Statuses:**
- `OPEN` - Position still active
- `WON` - Market resolved in our favor
- `LOST` - Market resolved against us
- `CANCELLED` - Outcome indeterminate, capital returned

This system prevents false losses from archived markets while maintaining accurate win/loss tracking.

### 6. Real-time Monitoring

The bot logs all activity with detailed information:
- Whale detections
- Wallet analysis scores
- Trade executions with reasoning
- Market resolutions
- Performance metrics

## CLI Command Reference

### `start` - Start Bot

Runs the whale scout monitoring bot in the foreground.

```bash
whale-scout start
```

The bot will:
- Continuously scan for whale trades (every 30 seconds)
- Analyze detected wallets
- Execute paper trades when confidence ≥ 70%
- Check for market resolutions (every 5 minutes)
- Display real-time updates to console

**Press Ctrl+C to stop**

---

### `stats` - Performance Statistics

Display paper trading performance metrics with optional filters.

```bash
whale-scout stats [options]
```

**Options:**
- `-p, --period <period>` - Time period: `day`, `week`, `month`, `all` (default: `all`)
- `-v, --verbose` - Include list of recent trades

**Example Output:**
```
╔════════════════════════════════════════╗
║     📊 Performance Statistics          ║
╚════════════════════════════════════════╝

Paper Trading (All Time)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Total Trades ........... 61
  Won .................... 41 (67.2%)
  Lost ................... 20 (32.8%)
  Cancelled .............. 45

  Starting Balance ....... $10,000.00
  Current Balance ........ $12,345.67
  Total P&L .............. +$2,345.67 (23.5%)
  
  Average Trade Size ..... $850.00
  Win Rate ............... 67.2%
  Avg Win ................ +$125.00
  Avg Loss ............... -$75.00

Wallet Tracking
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Total Wallets .......... 15
  Whales ................. 8
  Suspicious ............. 7
```

---

### `trades` - Trade History Viewer

Browse, filter, and export paper trade history.

#### List Trades

```bash
whale-scout trades [options]
```

**Options:**
- `-s, --status <status>` - Filter: `OPEN`, `WON`, `LOST`, `CANCELLED`
- `-f, --from <date>` - Start date (YYYY-MM-DD)
- `-t, --to <date>` - End date (YYYY-MM-DD)
- `-l, --limit <number>` - Max trades to display (default: 20)

**Examples:**
```bash
# Last 50 trades
whale-scout trades --limit 50

# All winning trades
whale-scout trades --status WON

# Trades from last week
whale-scout trades --from 2026-01-22

# Specific date range
whale-scout trades --from 2026-01-01 --to 2026-01-31
```

**Example Output:**
```
📊 Paper Trades (Last 20)

┌────┬─────────┬──────────────────────┬─────────┬───────────┬───────────┐
│ ID │ Status  │ Market               │ Outcome │ Entry     │ P&L       │
├────┼─────────┼──────────────────────┼─────────┼───────────┼───────────┤
│ 45 │ WON     │ Trump wins 2024?     │ YES     │ 0.67      │ +$234.50  │
│ 44 │ LOST    │ Biden approval 50%?  │ NO      │ 0.45      │ -$123.00  │
│ 43 │ OPEN    │ Recession in 2026?   │ YES     │ 0.32      │ --        │
└────┴─────────┴──────────────────────┴─────────┴───────────┴───────────┘

Summary: 18 trades | 12 WON | 5 LOST | 1 OPEN | P&L: +$1,234.56
```

#### View Single Trade

```bash
whale-scout trades view <id>
```

Shows detailed information about a specific trade:
- Market details and question
- Triggered by wallet address
- Entry/exit prices and timestamps
- Position size and P&L
- Confidence score

**Example:**
```bash
whale-scout trades view 45
```

#### Export to CSV

```bash
whale-scout trades export [options] [output-file]
```

Export trades to CSV format. Accepts same filter options as list command.

**Examples:**
```bash
# Export all trades
whale-scout trades export

# Export winning trades to custom file
whale-scout trades export --status WON wins.csv

# Export date range
whale-scout trades export --from 2026-01-01 --to 2026-01-31 january.csv
```

**CSV Columns:**
- id, status, market_title, outcome, entry_price, exit_price, pnl, pnl_percent, confidence, triggered_by, timestamp

---

### `config` - Configuration Editor

Interactive menu for editing bot configuration without manually editing `.env` file.

```bash
whale-scout config
```

**Features:**
- Categorized settings display
- Real-time validation
- Save/cancel/reset options
- Type checking (number/string/boolean)

**Example Session:**
```
🔧 Configuration Editor
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

WHALE DETECTION
1. WHALE_THRESHOLD_USD ............. 50,000
2. NEW_WALLET_HOURS ................ 24

TRADING
3. MIN_CONFIDENCE_FOR_TRADE ........ 70
4. INITIAL_PAPER_BALANCE ........... 10,000
5. MAX_POSITION_SIZE_PERCENT ....... 10

TIMING
6. TRADE_POLL_INTERVAL_MS .......... 30,000
7. RESOLUTION_CHECK_INTERVAL_MS .... 300,000

NOTIFICATIONS
8. TELEGRAM_ENABLED ................ true
9. TELEGRAM_BOT_TOKEN .............. (not set)
10. TELEGRAM_CHAT_ID ............... (not set)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Commands:
  1-10: Edit variable
  S: Save changes
  R: Reset to defaults (requires confirmation)
  Q: Quit without saving

Enter command: _
```

**Editable Settings:**

**Whale Detection:**
- `WHALE_THRESHOLD_USD` - Minimum USD size to flag as whale
- `NEW_WALLET_HOURS` - Max wallet age (hours) to flag as suspicious

**Trading:**
- `MIN_CONFIDENCE_FOR_TRADE` - Minimum confidence score (0-100) to execute
- `INITIAL_PAPER_BALANCE` - Starting paper trading balance (USD)
- `MAX_POSITION_SIZE_PERCENT` - Max % of balance per trade

**Timing:**
- `TRADE_POLL_INTERVAL_MS` - How often to scan for new trades (ms)
- `RESOLUTION_CHECK_INTERVAL_MS` - How often to check for resolved markets (ms)

**Error Handling:**
- `ERROR_LOG_LEVEL_422` - Log level for 422 errors (error/warn/debug)
- `MARKET_AGE_THRESHOLD_DAYS` - Days before archiving 422 error trades

**Notifications:**
- `TELEGRAM_ENABLED` - Enable Telegram notifications (true/false)
- `TELEGRAM_BOT_TOKEN` - Telegram bot API token
- `TELEGRAM_CHAT_ID` - Telegram chat ID for notifications

**Note:** Changes require bot restart to take effect.

---

### `reset` - Database Management

Reset or clear database tables with confirmation safeguards.

```bash
whale-scout reset [type]
```

**Interactive Mode** (no arguments):
```bash
whale-scout reset
```

Displays menu with options:
1. Full Database Reset - Delete ALL data
2. Paper Trades Only - Reset paper trading records
3. Archived Wallet Trades - Delete archived trades only
4. Performance Metrics - Clear performance data
5. Market Cache - Clear cached market data

**Quick Mode** (with type argument):
```bash
# Full database reset
whale-scout reset full

# Reset paper trades only
whale-scout reset paper

# Delete archived wallet trades
whale-scout reset archived

# Clear performance metrics
whale-scout reset performance

# Clear market cache
whale-scout reset cache
```

**Safety Features:**
- All resets require typing "CONFIRM"
- Cannot be undone
- Displays what will be deleted before confirmation

**Example:**
```
⚠️  You are about to: Full Database Reset
Delete ALL data (wallets, trades, paper trades, performance)

This action CANNOT be undone!

Type "CONFIRM" to proceed: CONFIRM

🗑️  Processing reset...

  ✓ Cleared table: wallets
  ✓ Cleared table: wallet_trades
  ✓ Cleared table: paper_trades
  ✓ Cleared table: performance
  ✓ Cleared table: market_cache
  ✓ Reset paper trading balance to $10,000

✓ Reset completed successfully!
```

---

### `dashboard` - Web Dashboard

Start the web dashboard for real-time monitoring and bot control via browser.

```bash
whale-scout dashboard [options]
```

**Options:**
- `-p, --port <port>` - Custom port (default: 3000 from .env)

**Features:**

**📊 Portfolio Overview**
- Real-time balance and P&L tracking
- Win rate and trade statistics
- Open positions count
- Visual indicators for gains/losses

**🎯 Recent Paper Trades**
- Last 10 trades with status badges
- Entry price and confidence scores
- P&L calculations
- Quick access to trade details

**👛 Watched Wallets**
- Top 10 wallets by score
- Whale/suspicious indicators
- Win rate and trade counts
- Last activity timestamps

**🎮 Bot Controls**
- Start/Stop/Restart buttons
- Real-time status indicator
- Uptime tracking
- Error status display

**🔄 Real-time Updates**
- WebSocket connection for instant updates
- New trade notifications
- Trade resolution updates
- Portfolio balance changes
- Whale detection alerts

**🔒 Security**
- Password-protected access
- Session-based authentication
- HttpOnly cookies
- Rate limiting
- Helmet security headers

**Usage:**

```bash
# Start dashboard only (bot must be started separately or via dashboard)
whale-scout dashboard

# Custom port
whale-scout dashboard --port 8080

# Start bot with dashboard together
whale-scout start --dashboard
```

**Access:**
1. Open browser to http://localhost:3000
2. Enter password (default: `admin123`)
3. View real-time monitoring dashboard

**Configuration** (`.env`):
```env
DASHBOARD_ENABLED=true          # Enable/disable dashboard
DASHBOARD_PORT=3000             # Port to run on
DASHBOARD_PASSWORD=admin123     # Access password
DASHBOARD_SESSION_SECRET=xxx    # Session encryption secret
```

**Tech Stack:**
- Backend: Express.js + WebSocket
- Frontend: React + Vite + TypeScript + Tailwind CSS
- Real-time: WebSocket with auto-reconnect
- Charts: Recharts library

**Building:**
```bash
# Build backend
npm run build

# Build frontend (required for dashboard)
cd src/web/client
npm install
npm run build
cd ../../..

# Run
whale-scout dashboard
```

**Deployment:**

The dashboard can run alongside the bot in production:
```bash
# Option 1: Separate processes
whale-scout start              # Terminal 1
whale-scout dashboard          # Terminal 2

# Option 2: Together
whale-scout start --dashboard  # Single process

# Option 3: systemd service (see deploy/README.md)
sudo systemctl start whale-scout-dashboard
```

**WebSocket Events:**

The dashboard receives real-time updates for:
- `portfolio` - Balance and P&L changes
- `trade:new` - New paper trade executed
- `trade:resolved` - Trade won/lost/cancelled
- `whale:detected` - Large wallet activity
- `bot:status` - Bot started/stopped

**Browser Support:**
- Chrome/Edge 90+
- Firefox 88+
- Safari 14+
- Mobile browsers (responsive design)

**Troubleshooting:**

```bash
# Check if server is running
curl http://localhost:3000/health

# View dashboard logs
tail -f logs/app.log | grep "dashboard"

# Test WebSocket connection
# Open browser console and check for WS connection messages

# Rebuild frontend if UI not loading
cd src/web/client && npm run build
```

---

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
│   ├── index.ts                      # Entry point & exports
│   ├── cli/
│   │   ├── index.ts                  # CLI entry point
│   │   ├── commands/
│   │   │   ├── start.ts              # Start bot command
│   │   │   ├── stats.ts              # Performance stats command
│   │   │   ├── trades.ts             # Trade viewer/export command
│   │   │   ├── config.ts             # Configuration editor command
│   │   │   ├── reset.ts              # Database reset command
│   │   │   └── dashboard.ts          # Dashboard server command
│   │   └── utils/
│   │       ├── prompts.ts            # User input utilities
│   │       └── envWriter.ts          # .env file manipulation
│   ├── web/
│   │   ├── server/                   # Express backend
│   │   │   ├── index.ts              # Server & WebSocket setup
│   │   │   ├── websocket.ts          # WebSocket manager
│   │   │   ├── middleware/
│   │   │   │   └── auth.ts           # Authentication middleware
│   │   │   └── routes/
│   │   │       ├── auth.ts           # Login/logout endpoints
│   │   │       ├── api.ts            # Dashboard data endpoints
│   │   │       └── controls.ts       # Bot control endpoints
│   │   └── client/                   # React frontend
│   │       ├── package.json          # Separate npm project
│   │       ├── vite.config.ts        # Vite configuration
│   │       ├── tailwind.config.js    # Tailwind CSS config
│   │       ├── index.html            # HTML entry point
│   │       └── src/
│   │           ├── main.tsx          # React entry point
│   │           ├── App.tsx           # Main app component
│   │           ├── lib/
│   │           │   ├── api.ts        # API client
│   │           │   └── utils.ts      # Helper functions
│   │           ├── hooks/
│   │           │   └── useWebSocket.ts  # WebSocket hook
│   │           └── pages/
│   │               ├── Login.tsx     # Login page
│   │               └── Dashboard.tsx # Dashboard page
│   ├── config/
│   │   └── settings.ts               # Configuration loader
│   ├── services/
│   │   ├── polymarket/
│   │   │   ├── api.ts                # REST API client
│   │   │   └── types.ts              # Type definitions
│   │   ├── walletScanner.ts          # Whale detection
│   │   ├── walletAnalyzer.ts         # Scoring algorithm
│   │   ├── betRater.ts               # Confidence rating
│   │   ├── tradeEngine.ts            # Paper trading
│   │   └── telegram.ts               # Notifications
│   ├── models/
│   │   ├── database.ts               # SQLite setup
│   │   ├── wallet.ts                 # Wallet CRUD
│   │   ├── trade.ts                  # Trade CRUD with archival
│   │   ├── paperTrade.ts             # Paper trade CRUD (WON/LOST/CANCELLED)
│   │   └── performance.ts            # Performance metrics
│   ├── core/
│   │   ├── monitor.ts                # Main loop with smart resolution
│   │   ├── alertSystem.ts            # Alert management
│   │   └── performanceTracker.ts     # Performance tracking
│   └── utils/
│       ├── logger.ts                 # Winston logger
│       ├── helpers.ts                # Utility functions
│       └── display.ts                # Terminal UI
├── deploy/
│   ├── whale-scout.service           # systemd service file
│   ├── install.sh                    # Automated installer
│   ├── logrotate.conf                # Log rotation config
│   └── README.md                     # Deployment guide
├── data/
│   └── whale_bot.db                  # SQLite database
├── logs/
│   ├── app.log                       # Application logs
│   └── trades.log                    # Trade logs
├── dist/                             # Compiled JavaScript (after build)
├── node_modules/                     # Dependencies
├── package.json
├── tsconfig.json
├── .env                              # Configuration (DO NOT COMMIT)
├── .env.example                      # Configuration template
├── AGENTS.md                         # AI agent guidelines
└── README.md                         # This file
```

## Safety Features

✅ **Paper Trading Only** - No real money at risk
✅ **Position Size Limits** - Maximum 10% per trade
✅ **Confidence Thresholds** - Only trades above 70% confidence
✅ **Error Handling** - Graceful degradation on API failures
✅ **Rate Limiting** - Respects API limits with caching

## Future Enhancements

- [x] ~~WebSocket integration for real-time updates~~ ✅ **Implemented**
- [x] ~~Web dashboard with charts~~ ✅ **Implemented**
- [x] ~~React Query + Axios for modern data fetching~~ ✅ **Implemented (50%)**
- [x] ~~One-click reset functionality~~ ✅ **Implemented**
- [ ] **Real trading mode with Polymarket CLOB integration** 🚧 **In Progress**
- [ ] Machine learning for improved scoring
- [ ] Advanced consensus detection
- [ ] Backtesting framework with historical data
- [ ] Performance analytics dashboard with advanced charts
- [ ] Multi-market support beyond Polymarket
- [ ] Alert customization (filter by confidence, wallet type)
- [ ] Risk management tools (stop-loss, take-profit)
- [ ] Mobile app (React Native)
- [ ] Multi-user dashboard with role-based access
- [ ] Historical data analysis and pattern recognition

## Disclaimer

This bot is for educational and informational purposes only. It operates in paper trading mode and does not execute real trades. Always do your own research before making investment decisions.

## License

MIT

## Support

For issues or questions, please check the logs in `logs/app.log` or create an issue in the repository.

---

Built with ❤️ for the Polymarket community
