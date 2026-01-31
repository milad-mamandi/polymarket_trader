# Deployment & Maintenance Scripts

This directory contains scripts for deploying, updating, and maintaining the Polymarket Whale Scout bot.

---

## 🚀 Deployment Scripts

### `deploy.sh` / `deploy.ps1`
**Full deployment with restart** - Use when deploying updates to a server.

**Linux/Mac:**
```bash
./scripts/deploy.sh
```

**Windows:**
```powershell
.\scripts\deploy.ps1
```

**What it does:**
- Stops the bot (PM2 if available)
- Stashes local changes
- Pulls latest from GitHub
- Installs dependencies
- Builds TypeScript + client
- Checks database health (offers reset if >50 positions)
- Restarts bot with PM2 or foreground

**Requires:** Node.js, npm, git  
**Optional:** PM2 (for background process management)

---

### `push-and-deploy.sh` / `push-and-deploy.ps1`
**Push changes to GitHub and deploy to remote server** - All-in-one script.

**Linux/Mac:**
```bash
./scripts/push-and-deploy.sh
```

**Windows:**
```powershell
.\scripts\push-and-deploy.ps1
```

**What it does:**
1. Shows changed files
2. Prompts for commit message
3. Commits and pushes to GitHub
4. Optionally deploys to remote server via SSH

**Server Configuration:**
Add to `.env` (optional, for automatic SSH deployment):
```env
SERVER_HOST=your.server.com
SERVER_USER=your-username
SERVER_PATH=/opt/polymarket_trader
```

---

### `quick-update.sh`
**Fast update without restart** - For minor updates.

**Linux/Mac:**
```bash
./scripts/quick-update.sh
```

**What it does:**
- Pulls latest changes
- Installs dependencies (only if package.json changed)
- Builds project
- Does NOT restart bot (manual restart required)

**Use when:** Making non-breaking changes that don't require immediate restart.

---

## 🗄️ Database Scripts

### `reset_paper_trades.sql`
**Reset paper trading balance and trades** - Use when balance becomes negative or you want a fresh start.

**Manual Reset:**
```bash
# Windows
sqlite3 data\whale_bot.db < scripts\reset_paper_trades.sql

# Linux/Mac
sqlite3 data/whale_bot.db < scripts/reset_paper_trades.sql
```

**Automated Reset:**
The `deploy.sh` script will automatically offer to reset if >50 open positions are detected.

**What it does:**
- Deletes all paper trades (both open and closed)
- Resets balance to `INITIAL_PAPER_BALANCE` from config
- Preserves wallet detection data and other tables

**After resetting:**
1. Restart the bot: `npm run dev` or `pm2 restart whale-scout`
2. Bot starts fresh with configured initial balance
3. Safeguards prevent over-leveraging:
   - **Max Open Positions**: 30 (configurable)
   - **Max Locked Capital**: 80% of initial balance
   - **Low Balance Warning**: 20%

---

## 🛠️ PM2 Process Management

If PM2 is installed, the deployment scripts will automatically use it for background process management.

**Install PM2:**
```bash
npm install -g pm2
```

**Useful PM2 Commands:**
```bash
# View status
pm2 status whale-scout

# View logs
pm2 logs whale-scout

# Restart
pm2 restart whale-scout

# Stop
pm2 stop whale-scout

# Monitor
pm2 monit

# Auto-start on boot
pm2 startup
pm2 save
```

---

## ⚙️ Configuration

### Position Limits
Edit `.env` to customize safeguards:
```env
MAX_OPEN_POSITIONS=30
MAX_LOCKED_CAPITAL_PERCENT=80
LOW_BALANCE_WARNING_PERCENT=20
```

Or adjust in the dashboard: **Settings > Position Limits**

### Server Deployment
For automatic SSH deployment, add to `.env`:
```env
SERVER_HOST=your.server.com
SERVER_USER=your-username
SERVER_PATH=/opt/polymarket_trader
```

---

## 📋 Quick Reference

| Task | Command |
|------|---------|
| Deploy locally | `./scripts/deploy.sh` |
| Push & deploy to server | `./scripts/push-and-deploy.sh` |
| Quick update (no restart) | `./scripts/quick-update.sh` |
| Reset database | `sqlite3 data/whale_bot.db < scripts/reset_paper_trades.sql` |
| View logs | `tail -f logs/app.log` or `pm2 logs whale-scout` |
| Restart bot | `pm2 restart whale-scout` or `npm run dev` |

---

## 🔍 Troubleshooting

**Script permissions (Linux/Mac):**
```bash
chmod +x scripts/*.sh
```

**PM2 not found:**
```bash
npm install -g pm2
```

**SQLite not found:**
- Ubuntu/Debian: `sudo apt install sqlite3`
- macOS: `brew install sqlite3`
- Windows: Download from https://www.sqlite.org/download.html

**SSH connection fails:**
- Check `SERVER_HOST`, `SERVER_USER`, `SERVER_PATH` in `.env`
- Ensure SSH key authentication is set up
- Test connection: `ssh $SERVER_USER@$SERVER_HOST`

---

*Last Updated: January 31, 2026*
