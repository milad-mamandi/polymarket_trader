# Database Reset Scripts

## Reset Paper Trades

If your paper trading balance becomes negative due to too many open positions, run this script to start fresh:

### Windows (PowerShell/CMD)
```bash
sqlite3 data\whale_bot.db < scripts\reset_paper_trades.sql
```

### Linux/Mac
```bash
sqlite3 data/whale_bot.db < scripts/reset_paper_trades.sql
```

### What it does
- Deletes all paper trades (both open and closed)
- Resets your balance to the `INITIAL_PAPER_BALANCE` from config
- Preserves wallet detection data and other tables

### After resetting
1. Restart the bot: `npm run dev`
2. The bot will start fresh with your configured initial balance
3. New safeguards will prevent over-leveraging:
   - **Max Open Positions**: 30 (configurable via `MAX_OPEN_POSITIONS`)
   - **Max Locked Capital**: 80% of initial balance (configurable via `MAX_LOCKED_CAPITAL_PERCENT`)
   - **Low Balance Warning**: 20% (configurable via `LOW_BALANCE_WARNING_PERCENT`)

### Configure limits
Edit `.env` to customize:
```env
MAX_OPEN_POSITIONS=30
MAX_LOCKED_CAPITAL_PERCENT=80
LOW_BALANCE_WARNING_PERCENT=20
```

Or adjust in the dashboard under Settings > Position Limits.
