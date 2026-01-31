# Polymarket Whale Scout - Manager

Interactive management script for the Polymarket Whale Scout bot.

## Quick Start

```bash
./scripts/manage.sh
```

This opens an interactive menu with all management options.

## Menu Options

| Option | Command | Description |
|--------|---------|-------------|
| 1 | **Deploy** | Full deployment: pull changes, build, restart bot |
| 2 | **Update** | Quick update: pull & build (no restart) |
| 3 | **Setup Server** | Install Node.js, PM2, build tools, create swap |
| 4 | **Start Bot** | Start the bot with PM2 |
| 5 | **Stop Bot** | Stop the bot |
| 6 | **Restart Bot** | Quick restart |
| 7 | **View Logs** | Show PM2 or file logs |
| 8 | **Server Status** | Check memory, disk space, bot status |
| 9 | **Reset Database** | Clear all paper trades (⚠️ destructive) |
| 10 | **Uninstall** | Remove bot (soft/hard/full wipe) |
| 11 | **Exit** | Exit the manager |

## Common Workflows

### First Time Setup (New Server)
```bash
./scripts/manage.sh
# Select: 3 (Setup Server)
# Select: 1 (Deploy)
```

### Regular Update
```bash
./scripts/manage.sh
# Select: 1 (Deploy)
```

### Quick Restart (No Build)
```bash
./scripts/manage.sh
# Select: 6 (Restart Bot)
```

## Memory Requirements

The build process requires significant memory. If your server has <2GB RAM:

**Option A:** Use the Setup command (option 3) to automatically create 2GB swap
**Option B:** Manually create swap:
```bash
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
```

If you see "Killed" during deployment, you need more swap.

## Troubleshooting

### "Killed" during build
- Server ran out of memory
- Run Setup (option 3) to create swap
- Or manually create swap (see above)

### Bot won't start
- Check Server Status (option 8)
- Ensure PM2 is installed (Setup option 3)
- Check logs (option 7)

### Database issues
- Reset Database (option 9) to start fresh
- This clears all paper trades but keeps wallet tracking

### Permission denied
```bash
chmod +x scripts/manage.sh
```

## Server Requirements

- **OS:** Linux (Ubuntu/Debian/CentOS)
- **RAM:** 1GB minimum, 2GB+ recommended (or 1GB + 2GB swap)
- **Disk:** 500MB free space
- **Node.js:** v18+ (installed automatically by Setup)

## Files

- `manage.sh` - This management script
- `reset_paper_trades.sql` - Database reset script (used by option 9)

---

*Run `./scripts/manage.sh` and follow the interactive prompts.*
