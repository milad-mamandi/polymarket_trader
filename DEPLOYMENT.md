# 🚀 Ubuntu VPS Deployment Guide

Complete guide for deploying Polymarket Whale Scout Bot on Ubuntu servers.

---

## 📋 Prerequisites

Before deployment, ensure your VPS has:

- **Operating System**: Ubuntu 20.04 LTS or higher (also works on Debian 10+)
- **Node.js**: Version 18 or higher
- **RAM**: Minimum 512MB (1GB+ recommended)
- **Storage**: At least 2GB free space
- **Root Access**: Required for systemd service installation

---

## ⚡ Quick Deploy (Recommended)

The fastest way to deploy is using the automated deployment script:

```bash
# 1. Clone the repository
git clone https://github.com/your-username/polymarket_trader.git
cd polymarket_trader

# 2. Run automated deployment (builds everything + installs as service)
sudo bash deploy/deploy.sh
```

That's it! The script will:
- ✅ Install all dependencies (including dev dependencies for build)
- ✅ Build backend with TypeScript compiler
- ✅ Build frontend React dashboard
- ✅ Validate all build artifacts
- ✅ Install as systemd service
- ✅ Set up log rotation
- ✅ Create service user and directories

**After deployment:**
```bash
# Configure your bot
sudo nano /opt/whale-scout/.env

# Start the service
sudo systemctl start whale-scout

# Enable auto-start on boot
sudo systemctl enable whale-scout

# Check status
sudo systemctl status whale-scout
```

---

## 🐛 Common Deployment Errors (FIXED)

If you encountered these errors on your VPS, they are now fixed in version 2.0.1+:

### ❌ Error #1: "sh: 1: tsc: not found"

**What it means:** TypeScript compiler not available during build

**Root Cause:** Running `npm install --production` on VPS, which skips `devDependencies` (including TypeScript)

**Solution:** Use `deploy/deploy.sh` which runs `npm install` (without `--production` flag) to include TypeScript and other build tools.

**Manual Fix:**
```bash
# Instead of: npm install --production
npm install  # Installs ALL dependencies including TypeScript
npm run build
```

---

### ❌ Error #2: "Cannot find namespace 'NodeJS'"

**What it means:** Frontend TypeScript can't find Node.js type definitions

**Root Cause:** Frontend uses `NodeJS.Timeout` type in `useWebSocket.ts:23` but `@types/node` wasn't installed in the frontend package.

**Solution:** Fixed in `src/web/client/package.json` - now includes `@types/node` and `tsconfig.json` includes `"node"` in lib array.

**Verify the fix:**
```bash
cd src/web/client
cat package.json | grep "@types/node"  # Should show: "@types/node": "^18.0.0"
cat tsconfig.json | grep "lib"         # Should include "node"
```

---

### ❌ Error #3: "cp: cannot stat 'dist': No such file or directory"

**What it means:** Install script tries to copy `dist/` folder that doesn't exist

**Root Cause:** Running `install.sh` before building the backend

**Solution:** Use `deploy/deploy.sh` which builds before installing. If using `install.sh` manually, it now validates that `dist/` exists and provides helpful error messages.

**Manual Fix:**
```bash
# Build FIRST, then install
npm install
npm run build              # Creates dist/ directory
sudo bash deploy/install.sh  # Now dist/ exists
```

---

## 📦 Manual Deployment Steps

If you prefer to deploy manually or need more control:

### Step 1: Install Node.js 18+

```bash
# Add Node.js repository
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -

# Install Node.js
sudo apt-get install -y nodejs

# Verify installation
node -v  # Should show v18.x.x or higher
npm -v   # Should show npm version
```

### Step 2: Clone Repository

```bash
git clone https://github.com/your-username/polymarket_trader.git
cd polymarket_trader
```

### Step 3: Install Dependencies

```bash
# IMPORTANT: Install ALL dependencies (not --production)
npm install

# This installs:
# - Production dependencies (axios, ethers, express, etc.)
# - Dev dependencies (typescript, tsx, vite, etc.) - REQUIRED for build
```

### Step 4: Build Backend

```bash
# Compile TypeScript to JavaScript
npm run build

# This runs: tsc (TypeScript compiler)
# Output: dist/ directory with compiled .js files
```

**Verify backend build:**
```bash
ls -la dist/
# Should contain: main.js, cli/, core/, models/, services/, utils/, web/
```

### Step 5: Build Frontend (Web Dashboard)

```bash
# Navigate to frontend
cd src/web/client

# Install frontend dependencies
npm install

# Build with Vite
npm run build

# Return to project root
cd ../../..
```

**Verify frontend build:**
```bash
ls -la src/web/client/dist/
# Should contain: index.html, assets/, etc.
```

### Step 6: Install as Systemd Service

```bash
# Run the installer script
sudo bash deploy/install.sh
```

The installer will:
- Create service user (`whale-scout`)
- Create installation directory (`/opt/whale-scout`)
- Copy built files to `/opt/whale-scout/`
- Install systemd service
- Set up log rotation
- Configure permissions

### Step 7: Configure

```bash
# Edit configuration
sudo nano /opt/whale-scout/.env

# Important settings:
# - TELEGRAM_BOT_TOKEN (optional)
# - WHALE_THRESHOLD_USD (default: 50000)
# - DASHBOARD_PASSWORD (change from default!)
# - TRADING_MODE (paper or real)
```

### Step 8: Start Service

```bash
# Start the bot
sudo systemctl start whale-scout

# Enable auto-start on boot
sudo systemctl enable whale-scout

# Check status
sudo systemctl status whale-scout

# View logs
sudo journalctl -u whale-scout -f
```

---

## 🔍 Troubleshooting

### Build Fails with "tsc: not found"

**Problem:** TypeScript not installed

**Solution:**
```bash
# Check if TypeScript is installed
npm list typescript

# If not found, install dependencies properly:
npm install  # Don't use --production flag
```

### Frontend Build Fails with TypeScript Errors

**Problem:** Missing type definitions

**Solution:**
```bash
cd src/web/client

# Check if @types/node is installed
npm list @types/node

# If not found:
npm install --save-dev @types/node

# Rebuild
npm run build
```

### Install Script Says "dist not found"

**Problem:** Backend not built before installation

**Solution:**
```bash
# Build backend first
npm run build

# Verify dist exists
ls -la dist/

# Then install
sudo bash deploy/install.sh
```

### Service Won't Start

**Problem:** Various potential issues

**Diagnosis:**
```bash
# Check service status
sudo systemctl status whale-scout

# View detailed logs
sudo journalctl -u whale-scout -n 50

# Check file permissions
ls -la /opt/whale-scout/

# Try running manually
sudo -u whale-scout node /opt/whale-scout/dist/main.js
```

### Port 3000 Already in Use

**Problem:** Another service using port 3000

**Solution:**
```bash
# Edit .env to change port
sudo nano /opt/whale-scout/.env
# Change: DASHBOARD_PORT=3001

# Restart service
sudo systemctl restart whale-scout
```

### Database Locked Errors

**Problem:** Multiple processes accessing SQLite database

**Solution:**
```bash
# Stop service
sudo systemctl stop whale-scout

# Check for processes using database
sudo -u whale-scout fuser /opt/whale-scout/data/whale_bot.db

# Kill any stale processes
sudo pkill -u whale-scout node

# Restart
sudo systemctl start whale-scout
```

---

## 🎯 Service Management

### Start/Stop/Restart

```bash
sudo systemctl start whale-scout    # Start the bot
sudo systemctl stop whale-scout     # Stop the bot
sudo systemctl restart whale-scout  # Restart the bot
sudo systemctl status whale-scout   # Check status
```

### View Logs

```bash
# Real-time logs (follow)
sudo journalctl -u whale-scout -f

# Last 100 lines
sudo journalctl -u whale-scout -n 100

# Logs since today
sudo journalctl -u whale-scout --since today

# Logs with errors only
sudo journalctl -u whale-scout -p err

# Application log files
sudo tail -f /opt/whale-scout/logs/app.log
```

### Auto-start Configuration

```bash
# Enable auto-start on boot
sudo systemctl enable whale-scout

# Disable auto-start
sudo systemctl disable whale-scout

# Check if enabled
sudo systemctl is-enabled whale-scout
```

---

## 🖥️ CLI Commands on Server

Run CLI commands as the service user:

```bash
# Navigate to installation directory
cd /opt/whale-scout

# View statistics
sudo -u whale-scout node dist/cli/index.js stats

# View recent trades
sudo -u whale-scout node dist/cli/index.js trades --limit 20

# Export trades to CSV
sudo -u whale-scout node dist/cli/index.js trades export

# View configuration
sudo -u whale-scout node dist/cli/index.js config

# Reset database (WARNING: deletes all data)
sudo -u whale-scout node dist/cli/index.js reset

# Start web dashboard (if not running via service)
sudo -u whale-scout node dist/cli/index.js dashboard
```

---

## 🌐 Web Dashboard Access

### Starting the Dashboard

The dashboard can be started in two ways:

**Option 1: Via bot service (automatic)**
```bash
# Set in .env
DASHBOARD_ENABLED=true

# Restart service
sudo systemctl restart whale-scout
```

**Option 2: Standalone (separate process)**
```bash
sudo -u whale-scout node /opt/whale-scout/dist/cli/index.js dashboard
```

### Accessing the Dashboard

1. Find your server's IP address:
   ```bash
   hostname -I
   ```

2. Open browser to: `http://YOUR_SERVER_IP:3000`

3. Login with password from `/opt/whale-scout/.env` (`DASHBOARD_PASSWORD`)

### Secure Dashboard with Reverse Proxy

For production, use nginx with SSL:

```bash
# Install nginx
sudo apt install nginx

# Create nginx config
sudo nano /etc/nginx/sites-available/whale-scout
```

**Nginx Configuration:**
```nginx
server {
    listen 80;
    server_name whale.yourdomain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
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

**Enable and secure:**
```bash
# Enable site
sudo ln -s /etc/nginx/sites-available/whale-scout /etc/nginx/sites-enabled/

# Test configuration
sudo nginx -t

# Reload nginx
sudo systemctl reload nginx

# Install SSL with Let's Encrypt
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d whale.yourdomain.com
```

---

## 🔄 Updating the Bot

To update to a new version:

```bash
# 1. Stop services
sudo systemctl stop whale-scout

# 2. Navigate to project source (where you cloned the repo)
cd /path/to/polymarket_trader

# 3. Pull updates
git pull

# 4. Re-run deployment script
sudo bash deploy/deploy.sh

# The script will rebuild everything and update the installation
```

**Or manually:**
```bash
# Stop service
sudo systemctl stop whale-scout

# Update source
cd /path/to/polymarket_trader
git pull

# Install/update dependencies
npm install

# Rebuild backend
npm run build

# Rebuild frontend
cd src/web/client
npm install
npm run build
cd ../../..

# Copy updated files
sudo cp -r dist /opt/whale-scout/
sudo cp -r src/web/client/dist /opt/whale-scout/src/web/client/
sudo chown -R whale-scout:whale-scout /opt/whale-scout

# Start service
sudo systemctl start whale-scout
```

---

## 🔒 Security Best Practices

1. **Change Default Password**
   ```bash
   sudo nano /opt/whale-scout/.env
   # Set strong DASHBOARD_PASSWORD
   ```

2. **Use Hashed Passwords**
   ```bash
   # Generate bcrypt hash
   sudo -u whale-scout node /opt/whale-scout/dist/cli/index.js password hash MySecurePassword
   
   # Copy hash to .env
   DASHBOARD_PASSWORD=$2b$10$...
   ```

3. **Firewall Configuration**
   ```bash
   # Allow SSH
   sudo ufw allow ssh
   
   # Allow dashboard only from your IP
   sudo ufw allow from YOUR_IP_ADDRESS to any port 3000
   
   # Enable firewall
   sudo ufw enable
   ```

4. **Use HTTPS** - Set up nginx reverse proxy with Let's Encrypt SSL

5. **Regular Backups**
   ```bash
   # Backup database
   sudo -u whale-scout cp /opt/whale-scout/data/whale_bot.db \
     /opt/whale-scout/data/whale_bot.db.backup-$(date +%Y%m%d)
   ```

6. **Monitor Logs** - Set up log monitoring and alerts for errors

7. **Keep Updated** - Regularly update Node.js and npm packages

---

## 📊 Monitoring and Maintenance

### Resource Monitoring

```bash
# Check service resource usage
systemctl status whale-scout

# Detailed systemd resource info
systemctl show whale-scout | grep -E 'Memory|CPU'

# Process monitoring
top -u whale-scout

# Disk usage
du -sh /opt/whale-scout/*
```

### Database Inspection

```bash
# Open database
sudo -u whale-scout sqlite3 /opt/whale-scout/data/whale_bot.db

# Useful queries:
sqlite> SELECT COUNT(*) FROM wallets;
sqlite> SELECT * FROM paper_trades ORDER BY created_at DESC LIMIT 10;
sqlite> SELECT status, COUNT(*) FROM paper_trades GROUP BY status;
sqlite> .schema wallets
sqlite> .quit
```

### Health Checks

```bash
# Check if process is running
ps aux | grep whale-scout

# Check listening ports
sudo netstat -tlnp | grep node

# Check logs for errors
sudo journalctl -u whale-scout -p err --since "1 hour ago"

# Test API endpoint (if dashboard enabled)
curl http://localhost:3000/api/health
```

---

## 📚 Additional Resources

- **Main Documentation**: See [README.md](./README.md) for bot features and configuration
- **Deployment Infrastructure**: See [deploy/README.md](./deploy/README.md) for systemd service details
- **Agent Guidelines**: See [AGENTS.md](./AGENTS.md) for development and coding standards
- **Polymarket API**: https://docs.polymarket.com/

---

## 🆘 Getting Help

If you encounter issues:

1. **Check logs first:**
   ```bash
   sudo journalctl -u whale-scout -n 100
   ```

2. **Review this troubleshooting guide** (see sections above)

3. **Test manually:**
   ```bash
   sudo -u whale-scout node /opt/whale-scout/dist/main.js
   ```

4. **Check configuration:**
   ```bash
   sudo cat /opt/whale-scout/.env
   ```

5. **Verify file permissions:**
   ```bash
   ls -la /opt/whale-scout/
   ```

---

## 🗑️ Uninstalling

To completely remove the bot:

```bash
# Stop and disable service
sudo systemctl stop whale-scout
sudo systemctl disable whale-scout

# Remove service file
sudo rm /etc/systemd/system/whale-scout.service
sudo systemctl daemon-reload

# Remove installation directory (WARNING: deletes all data!)
sudo rm -rf /opt/whale-scout

# Remove service user
sudo userdel whale-scout

# Remove log rotation config
sudo rm /etc/logrotate.d/whale-scout
```

---

**Last Updated:** January 31, 2026  
**Version:** 2.0.1+

For the latest deployment instructions, always check the GitHub repository.
