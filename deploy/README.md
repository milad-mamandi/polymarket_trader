# Deployment Guide

This directory contains files for deploying Whale Scout Bot as a production service on Linux servers.

## Files

- **`whale-scout.service`** - systemd service configuration
- **`install.sh`** - Automated installation script (requires pre-built application)
- **`deploy.sh`** - Automated build and deployment script (recommended)
- **`upgrade-nodejs.sh`** - Upgrade Node.js from v18 to v22
- **`logrotate.conf`** - Log rotation configuration
- **`cloudflared.service`** - Cloudflare Tunnel systemd service (optional)

## Quick Install (Ubuntu/Debian)

### Option 1: Automated Deploy (Recommended)

Use the `deploy.sh` script to automatically build and deploy:

```bash
# 1. Clone or pull the repository on your server
cd ~/polymarket_trader
git pull origin main  # Or git clone if first time

# 2. Run the deploy script (builds everything and deploys)
sudo bash deploy/deploy.sh

# 3. Edit configuration
sudo nano /opt/whale-scout/.env

# 4. Start the service
sudo systemctl start whale-scout
sudo systemctl enable whale-scout  # Auto-start on boot

# 5. Check status
sudo systemctl status whale-scout
sudo journalctl -u whale-scout -f  # Follow logs
```

### Option 2: Manual Build + Install

If you want to build locally and then install:

```bash
# 1. Build the backend
npm run build

# 2. Build the frontend (web dashboard)
cd src/web/client
npm install
npm run build
cd ../../..

# 3. Run installer (as root)
sudo bash deploy/install.sh

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
# Install Node.js 22 LTS
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs

# Verify version (must be v22.0.0 or higher)
node -v  # Should be v22 or higher
```

**Important:** Node.js v22+ is required for ES2022+ syntax support. If you're upgrading from an older version, see the [Node.js Upgrade Guide](#nodejs-upgrade-guide) below.

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

## Cloudflare Tunnel Setup (Recommended for HTTPS)

Cloudflare Tunnel provides secure HTTPS access to your dashboard without opening ports or managing SSL certificates. This is the recommended approach for production deployments.

### Prerequisites

- A domain managed by Cloudflare
- Cloudflare account (free tier works)
- Dashboard accessible locally on the server (`http://localhost:3000`)

### Installation Steps

#### 1. Install cloudflared

```bash
# Download and install cloudflared
wget https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
sudo dpkg -i cloudflared-linux-amd64.deb

# Verify installation
cloudflared --version
```

#### 2. Authenticate with Cloudflare

```bash
# This will open a browser to authenticate
cloudflared tunnel login
```

Follow the browser prompts to authenticate and select your domain.

#### 3. Create a Tunnel

```bash
# Create a tunnel named "whale-scout"
cloudflared tunnel create whale-scout

# Save the tunnel ID shown in the output
# Example: Created tunnel whale-scout with id 12345678-abcd-1234-5678-1234567890ab
```

#### 4. Configure the Tunnel

Create the tunnel configuration file:

```bash
sudo mkdir -p /etc/cloudflared
sudo nano /etc/cloudflared/config.yml
```

Add the following configuration (replace `TUNNEL_ID` with your tunnel ID):

```yaml
tunnel: TUNNEL_ID
credentials-file: /root/.cloudflared/TUNNEL_ID.json

ingress:
  - hostname: whale-scout.yourdomain.com
    service: http://localhost:3000
  - service: http_status:404
```

**Important:** Replace:
- `TUNNEL_ID` with the tunnel ID from step 3
- `whale-scout.yourdomain.com` with your actual domain

#### 5. Create DNS Record

```bash
# Create a CNAME record pointing to your tunnel
cloudflared tunnel route dns whale-scout whale-scout.yourdomain.com
```

Or manually add a CNAME record in Cloudflare dashboard:
- Type: `CNAME`
- Name: `whale-scout` (or your subdomain)
- Target: `TUNNEL_ID.cfargotunnel.com`
- Proxied: Yes (orange cloud)

#### 6. Install as Systemd Service

```bash
# Copy the service file
sudo cp deploy/cloudflared.service /etc/systemd/system/

# Reload systemd
sudo systemctl daemon-reload

# Enable and start the tunnel
sudo systemctl enable cloudflared
sudo systemctl start cloudflared

# Check status
sudo systemctl status cloudflared
```

#### 7. Test Access

Open your browser to `https://whale-scout.yourdomain.com`

You should see the login page served over HTTPS!

### Troubleshooting Cloudflare Tunnel

**Tunnel won't start:**

```bash
# Check tunnel status
sudo systemctl status cloudflared

# View logs
sudo journalctl -u cloudflared -f

# Test tunnel manually
sudo cloudflared tunnel run whale-scout
```

**DNS not resolving:**

```bash
# Verify DNS record
dig whale-scout.yourdomain.com

# Check Cloudflare DNS settings
# Ensure CNAME record exists and is proxied (orange cloud)
```

**Connection refused:**

```bash
# Verify dashboard is running locally
curl http://localhost:3000

# Check firewall (should NOT block localhost)
sudo systemctl status whale-scout
```

**Certificate errors:**

Cloudflare Tunnel handles SSL automatically. If you see certificate errors:
- Ensure "Proxied" is enabled (orange cloud) in Cloudflare DNS
- Check SSL/TLS encryption mode in Cloudflare (should be "Flexible" or "Full")

### Why Cloudflare Tunnel?

**Advantages over traditional reverse proxy:**
- ✅ No port forwarding required
- ✅ Automatic SSL/TLS certificates
- ✅ DDoS protection via Cloudflare
- ✅ No need for public IP address
- ✅ Works behind NAT/firewalls
- ✅ Built-in rate limiting and caching
- ✅ Free for personal use

**Note:** Cloudflare Tunnel only works on specific ports. Port 3000 is NOT supported for direct proxying. The tunnel must connect to `localhost:3000` on the server, and Cloudflare exposes it via standard ports (80/443).

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
# Change: MemoryMax=512M

sudo systemctl daemon-reload
sudo systemctl restart whale-scout
```

### Dashboard locked errors

```bash
# Stop service
sudo systemctl stop whale-scout

# Check for stale locks
sudo -u whale-scout fuser /opt/whale-scout/data/whale_bot.db

# Restart service
sudo systemctl start whale-scout
```

### Dashboard 401 Unauthorized Error

**Symptoms:**
- Login succeeds (shows "Login successful")
- Dashboard immediately returns 401 Unauthorized
- All API requests fail with 401
- Browser console shows failed `/api/auth/check` requests

**Cause:** Session cookies not being stored/sent by browser, usually due to:
1. Secure cookies required by HTTPS-only flag when accessing via HTTP
2. CORS restrictions blocking cross-origin requests
3. Proxy/Cloudflare headers not being trusted

**Solution 1: Access via HTTPS (Recommended)**

Use Cloudflare Tunnel or nginx with SSL:

```bash
# See "Cloudflare Tunnel Setup" section above for full guide
cloudflared tunnel create whale-scout
# ... follow setup steps
```

**Solution 2: Verify Cookie Settings**

The bot now automatically detects HTTP vs HTTPS and sets cookies accordingly. Verify your setup:

```bash
# Check if bot is running in production mode
sudo systemctl status whale-scout | grep NODE_ENV

# If using a proxy (nginx, Cloudflare), ensure headers are set correctly
# The bot trusts: X-Forwarded-Proto, CF-Visitor headers
```

**Solution 3: Check Browser Console**

Open browser DevTools (F12) → Network tab → Try logging in:

```
1. Login request succeeds (200 OK)
2. Set-Cookie header present in response?
   - If NO: Check server logs for errors
   - If YES: Check cookie flags (Secure, SameSite)
3. Subsequent requests include Cookie header?
   - If NO: Browser blocking cookies (check flags)
   - If YES: Server rejecting session (check session store)
```

**Solution 4: Test Locally First**

Test on the server itself to isolate the issue:

```bash
# Install curl if needed
sudo apt install curl -y

# Test login
curl -v -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"password":"your-password"}' \
  -c cookies.txt

# Test authenticated endpoint
curl -v http://localhost:3000/api/auth/check -b cookies.txt

# Should return: {"authenticated":true,"loginTime":...}
```

**Solution 5: Clear Browser Data**

Sometimes old cookies cause conflicts:

```
1. Open DevTools (F12) → Application → Cookies
2. Delete all cookies for your domain
3. Try logging in again
```

**Solution 6: Check Firewall/Network**

```bash
# Ensure port 3000 is accessible
sudo ufw status
sudo ufw allow 3000

# Test from local machine
curl http://SERVER_IP:3000/health
```

**Still Having Issues?**

Check the logs for detailed error messages:

```bash
# Application logs
sudo journalctl -u whale-scout -f | grep -i "auth\|cookie\|session"

# Check for CORS errors
sudo journalctl -u whale-scout -f | grep -i "cors\|origin"
```

### SyntaxError: Unexpected token 'with'

This error occurs when running the bot on Node.js versions older than v20.10.0.

**Cause:** The bot uses modern ES2022+ syntax (Import Attributes) that requires Node.js v22+.

**Solution:**

```bash
# Check your Node.js version
node -v

# If it shows v18.x or v20.x, upgrade to v22:
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs

# Verify upgrade
node -v  # Should show v22.x.x

# Rebuild the application
cd ~/polymarket_trader
rm -rf node_modules package-lock.json dist/
npm install
npm run build

# Redeploy
sudo systemctl stop whale-scout
sudo bash deploy/deploy.sh
sudo systemctl start whale-scout
```

Or use the automated upgrade script:

```bash
cd ~/polymarket_trader
sudo bash deploy/upgrade-nodejs.sh
```

### Node.js Upgrade Guide

If you're running Node.js v18 or older and need to upgrade:

**Option 1: Automated Script (Recommended)**

```bash
# Run the upgrade script
sudo bash deploy/upgrade-nodejs.sh

# This will:
# - Stop the whale-scout service
# - Remove old Node.js version
# - Install Node.js v22 LTS
# - Rebuild native modules
# - Restart the service
```

**Option 2: Manual Upgrade**

```bash
# Stop the service
sudo systemctl stop whale-scout

# Remove old Node.js
sudo apt-get remove nodejs -y
sudo apt-get autoremove -y

# Add NodeSource repository for Node.js v22
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -

# Install Node.js v22
sudo apt-get install -y nodejs

# Verify installation
node -v  # Should show v22.x.x
npm -v   # Should show v10.x.x

# Navigate to project and rebuild
cd ~/polymarket_trader
rm -rf node_modules package-lock.json dist/
npm install
npm run build

# Redeploy
sudo bash deploy/deploy.sh

# Start service
sudo systemctl start whale-scout
sudo systemctl status whale-scout
```

## Common Issues and Solutions

### Issue: Service fails with "REAL_TRADING_PRIVATE_KEY is required"

**Cause:** The CLOB client is trying to initialize even in paper trading mode.

**Solution:** This should not prevent the bot from starting. Check your `.env` file:

```bash
sudo nano /opt/whale-scout/.env

# Make sure TRADING_MODE is set correctly:
TRADING_MODE=paper

# If you're using paper trading, you can leave these empty:
REAL_TRADING_PRIVATE_KEY=
REAL_TRADING_FUNDER_ADDRESS=
```

### Issue: "Module not found" errors

**Cause:** Dependencies not installed or build incomplete.

**Solution:**

```bash
cd ~/polymarket_trader
npm install
npm run build
sudo bash deploy/deploy.sh
```

### Issue: Dashboard not loading

**Cause:** Frontend not built or port blocked.

**Solution:**

```bash
# Build frontend
cd ~/polymarket_trader/src/web/client
npm install
npm run build
cd ../../..

# Redeploy
sudo bash deploy/deploy.sh

# Check if port 3000 is accessible
sudo ufw allow 3000

# Test locally
curl http://localhost:3000
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
