# Deployment Guide

This directory contains files for deploying Whale Scout Bot as a production service on Linux servers.

## Files

- **`whale-scout.service`** - systemd service configuration
- **`install.sh`** - Automated installation script
- **`logrotate.conf`** - Log rotation configuration

## Quick Install (Ubuntu/Debian)

```bash
# 1. Build the backend
npm run build

# 2. Build the frontend (web dashboard)
cd src/web/client
npm install
npm run build
cd ../../..

# 3. Run installer (as root)
sudo ./deploy/install.sh

# 4. Edit configuration
sudo nano /opt/whale-scout/.env

# 5. Start the service
sudo systemctl start whale-scout
sudo systemctl enable whale-scout  # Auto-start on boot

# 6. Check status
sudo systemctl status whale-scout
sudo journalctl -u whale-scout -f  # Follow logs
```

## Manual Install

If you prefer manual installation:

### 1. Prerequisites

```bash
# Install Node.js 18+
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Verify version
node -v  # Should be v18 or higher
```

### 2. Create Service User

```bash
sudo useradd -r -s /bin/false -d /opt/whale-scout whale-scout
```

### 3. Create Directories

```bash
sudo mkdir -p /opt/whale-scout/{data,logs}
```

### 4. Copy Files

```bash
# Build backend first
npm run build

# Build frontend (web dashboard)
cd src/web/client
npm install
npm run build
cd ../../..

# Copy to installation directory
sudo cp -r dist /opt/whale-scout/
sudo cp -r node_modules /opt/whale-scout/
sudo cp package.json package-lock.json /opt/whale-scout/
sudo cp .env /opt/whale-scout/  # Or .env.example

# Copy web dashboard
sudo mkdir -p /opt/whale-scout/src/web/client
sudo cp -r src/web/client/dist /opt/whale-scout/src/web/client/
```

### 5. Set Permissions

```bash
sudo chown -R whale-scout:whale-scout /opt/whale-scout
sudo chmod 750 /opt/whale-scout
sudo chmod 640 /opt/whale-scout/.env
```

### 6. Install Service

```bash
sudo cp deploy/whale-scout.service /etc/systemd/system/
sudo chmod 644 /etc/systemd/system/whale-scout.service
sudo systemctl daemon-reload
```

### 7. Setup Log Rotation

```bash
sudo cp deploy/logrotate.conf /etc/logrotate.d/whale-scout
sudo chmod 644 /etc/logrotate.d/whale-scout
```

### 8. Start Service

```bash
sudo systemctl start whale-scout
sudo systemctl enable whale-scout
```

## Service Management

### Start/Stop/Restart

```bash
sudo systemctl start whale-scout
sudo systemctl stop whale-scout
sudo systemctl restart whale-scout
sudo systemctl status whale-scout
```

### View Logs

```bash
# Real-time logs
sudo journalctl -u whale-scout -f

# Last 100 lines
sudo journalctl -u whale-scout -n 100

# Since today
sudo journalctl -u whale-scout --since today

# Application logs (if file logging enabled)
sudo tail -f /opt/whale-scout/logs/app.log
```

### Enable/Disable Auto-start

```bash
sudo systemctl enable whale-scout   # Auto-start on boot
sudo systemctl disable whale-scout  # Don't auto-start
```

## CLI Usage on Server

Run CLI commands as the service user:

```bash
cd /opt/whale-scout

# View stats
sudo -u whale-scout node dist/cli/index.js stats

# View trades
sudo -u whale-scout node dist/cli/index.js trades --limit 20

# Export trades
sudo -u whale-scout node dist/cli/index.js trades export

# Edit configuration (requires interactive terminal)
sudo -u whale-scout node dist/cli/index.js config

# Reset database
sudo -u whale-scout node dist/cli/index.js reset

# Start web dashboard
sudo -u whale-scout node dist/cli/index.js dashboard
```

## Web Dashboard

The bot includes a web dashboard for real-time monitoring and control.

### Starting the Dashboard

```bash
# Start dashboard only (bot must be started separately)
sudo -u whale-scout node /opt/whale-scout/dist/cli/index.js dashboard

# Or start bot with dashboard
sudo -u whale-scout node /opt/whale-scout/dist/cli/index.js start --dashboard
```

### Accessing the Dashboard

1. Open browser to `http://your-server-ip:3000`
2. Login with password set in `.env` (`DASHBOARD_PASSWORD`)
3. View real-time metrics, trades, and control the bot

### Dashboard Configuration

Edit `/opt/whale-scout/.env`:

```env
DASHBOARD_ENABLED=true
DASHBOARD_PORT=3000
DASHBOARD_PASSWORD=your-secure-password
DASHBOARD_SESSION_SECRET=random-secret-here
```

### Dashboard as a Service

Create a separate systemd service for the dashboard:

```bash
sudo nano /etc/systemd/system/whale-scout-dashboard.service
```

```ini
[Unit]
Description=Polymarket Whale Scout Dashboard
After=network.target whale-scout.service

[Service]
Type=simple
User=whale-scout
WorkingDirectory=/opt/whale-scout
ExecStart=/usr/bin/node /opt/whale-scout/dist/cli/index.js dashboard
Restart=on-failure
RestartSec=10

# Security
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/opt/whale-scout/data /opt/whale-scout/logs

[Install]
WantedBy=multi-user.target
```

Start the dashboard service:

```bash
sudo systemctl daemon-reload
sudo systemctl start whale-scout-dashboard
sudo systemctl enable whale-scout-dashboard
```

### Reverse Proxy (Optional)

For production, use nginx or Apache as a reverse proxy:

**Nginx Configuration:**

```bash
sudo nano /etc/nginx/sites-available/whale-scout
```

```nginx
server {
    listen 80;
    server_name whale-scout.yourdomain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    # WebSocket support
    location /ws {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "Upgrade";
        proxy_set_header Host $host;
    }
}
```

Enable the site:

```bash
sudo ln -s /etc/nginx/sites-available/whale-scout /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

**SSL with Let's Encrypt:**

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d whale-scout.yourdomain.com
```

## Configuration

Edit the `.env` file:

```bash
sudo nano /opt/whale-scout/.env
```

After making changes, restart the service:

```bash
sudo systemctl restart whale-scout
```

## Updating the Bot

```bash
# 1. Stop services
sudo systemctl stop whale-scout
sudo systemctl stop whale-scout-dashboard  # If using separate service

# 2. Navigate to project directory
cd /path/to/whale-scout

# 3. Pull updates (if using git)
git pull

# 4. Install dependencies
npm install

# 5. Build backend
npm run build

# 6. Build frontend (web dashboard)
cd src/web/client
npm install
npm run build
cd ../../..

# 7. Copy updated files
sudo cp -r dist /opt/whale-scout/
sudo cp -r node_modules /opt/whale-scout/
sudo mkdir -p /opt/whale-scout/src/web/client
sudo cp -r src/web/client/dist /opt/whale-scout/src/web/client/

# 8. Set permissions
sudo chown -R whale-scout:whale-scout /opt/whale-scout

# 9. Start services
sudo systemctl start whale-scout
sudo systemctl start whale-scout-dashboard  # If using separate service
```

## Monitoring

### Check Service Health

```bash
# Service status
sudo systemctl status whale-scout

# Check if process is running
ps aux | grep whale-scout

# Check resource usage
top -u whale-scout
```

### Database Inspection

```bash
sudo -u whale-scout sqlite3 /opt/whale-scout/data/whale_bot.db

# Useful queries:
sqlite> SELECT COUNT(*) FROM wallets;
sqlite> SELECT * FROM paper_trades ORDER BY created_at DESC LIMIT 10;
sqlite> SELECT status, COUNT(*) FROM paper_trades GROUP BY status;
sqlite> .quit
```

## Troubleshooting

### Service won't start

```bash
# Check service status
sudo systemctl status whale-scout

# Check logs for errors
sudo journalctl -u whale-scout -n 50

# Verify permissions
ls -la /opt/whale-scout

# Test manually
sudo -u whale-scout node /opt/whale-scout/dist/cli/index.js start
```

### High memory usage

```bash
# Check current usage
sudo systemctl status whale-scout

# Adjust memory limit in service file
sudo nano /etc/systemd/system/whale-scout.service
# Change: MemoryLimit=512M

sudo systemctl daemon-reload
sudo systemctl restart whale-scout
```

### Database locked errors

```bash
# Stop service
sudo systemctl stop whale-scout

# Check for stale locks
sudo -u whale-scout fuser /opt/whale-scout/data/whale_bot.db

# Restart service
sudo systemctl start whale-scout
```

## Uninstall

```bash
# Stop and disable service
sudo systemctl stop whale-scout
sudo systemctl disable whale-scout

# Remove service file
sudo rm /etc/systemd/system/whale-scout.service
sudo systemctl daemon-reload

# Remove application
sudo rm -rf /opt/whale-scout

# Remove user (optional)
sudo userdel whale-scout

# Remove logrotate config
sudo rm /etc/logrotate.d/whale-scout
```

## Security Notes

- Service runs as non-privileged user (`whale-scout`)
- Files are not world-readable (750/640 permissions)
- `.env` file contains sensitive data - keep it secure
- Dashboard is password-protected with session-based authentication
- Use HTTPS/SSL for dashboard in production (nginx reverse proxy)
- Consider firewall rules to restrict dashboard access:
  ```bash
  # Allow dashboard only from specific IP
  sudo ufw allow from YOUR_IP to any port 3000
  ```
- No other network ports exposed (bot only makes outbound requests)
- Consider using systemd hardening options (already included in service file)

## Best Practices

1. **Regular Backups**: Backup the database regularly
   ```bash
   sudo -u whale-scout cp /opt/whale-scout/data/whale_bot.db \
     /opt/whale-scout/data/whale_bot.db.backup-$(date +%Y%m%d)
   ```

2. **Monitor Logs**: Set up alerting for errors
   ```bash
   sudo journalctl -u whale-scout -p err --since "1 hour ago"
   ```

3. **Resource Limits**: Monitor CPU/memory usage
   ```bash
   systemctl show whale-scout | grep -E 'Memory|CPU'
   ```

4. **Updates**: Keep Node.js and dependencies updated
   ```bash
   npm outdated
   npm update
   ```

## Support

For issues or questions:
- Check logs: `sudo journalctl -u whale-scout -f`
- Review README.md in project root
- Check GitHub issues
