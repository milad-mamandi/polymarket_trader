# 🚀 Server Deployment Checklist

## Pre-Deployment Steps (Local Machine)

✅ **All files updated and tested locally**
- ✅ `deploy/whale-scout.service` - Fixed MemoryLimit → MemoryMax
- ✅ `deploy/install.sh` - Updated Node.js v22 requirement
- ✅ `deploy/deploy.sh` - Updated Node.js v22 requirement
- ✅ `deploy/README.md` - Comprehensive updates with troubleshooting
- ✅ `package.json` - Added engines field (Node.js >=22.0.0)
- ✅ `deploy/upgrade-nodejs.sh` - New automated upgrade script
- ✅ `README.md` - Updated Node.js requirement
- ✅ Build tested successfully (backend + frontend)

---

## Server Deployment Steps

### Step 1: Upload Code to Server

```bash
# Option A: If using Git
cd ~/polymarket_trader
git pull

# Option B: If uploading via scp
# (From your local machine)
scp -r polymarket_trader user@your-server:/root/
```

### Step 2: Upgrade Node.js on Server

**SSH into your server:**
```bash
ssh root@ams
cd ~/polymarket_trader
```

**Check current Node.js version:**
```bash
node -v
# If it shows v18.x or v20.x, you need to upgrade
```

**Run the automated upgrade script:**
```bash
sudo bash deploy/upgrade-nodejs.sh
```

This script will:
- Stop the whale-scout service (if running)
- Remove old Node.js
- Install Node.js v22 LTS
- Reinstall dependencies at /opt/whale-scout (if it exists)
- Restart the service

**Verify upgrade:**
```bash
node -v   # Should show v22.x.x
npm -v    # Should show v10.x.x
```

### Step 3: Clean and Rebuild Application

```bash
cd ~/polymarket_trader

# Remove old build artifacts
rm -rf node_modules package-lock.json dist/

# Install dependencies with Node v22
npm install

# Build backend + frontend
npm run build

# Verify builds
ls -la dist/cli/index.js
ls -la dist/main.js
ls -la src/web/client/dist/index.html
```

### Step 4: Stop Current Service

```bash
# Check if service is running
sudo systemctl status whale-scout

# Stop the service
sudo systemctl stop whale-scout

# Verify it stopped
sudo systemctl status whale-scout
```

### Step 5: Deploy to /opt/whale-scout

```bash
# Run the deployment script
cd ~/polymarket_trader
sudo bash deploy/deploy.sh
```

This script will:
- Validate build artifacts
- Install dependencies
- Build backend and frontend
- Copy files to /opt/whale-scout
- Install systemd service (with MemoryMax fix)
- Set proper permissions

### Step 6: Verify Configuration

```bash
# Check .env file exists and is configured
sudo nano /opt/whale-scout/.env

# Ensure these are set:
# - TRADING_MODE=paper (or real if you want real trading)
# - DASHBOARD_ENABLED=true
# - DASHBOARD_PORT=3000
# - DASHBOARD_PASSWORD=your-secure-password
# - TELEGRAM settings (optional)
```

### Step 7: Reload systemd and Start Service

```bash
# Reload systemd to pick up the new service file
sudo systemctl daemon-reload

# Start the service
sudo systemctl start whale-scout

# Enable auto-start on boot
sudo systemctl enable whale-scout

# Check status
sudo systemctl status whale-scout
```

### Step 8: Verify Deployment

**Check service status:**
```bash
sudo systemctl status whale-scout
# Should show "active (running)"
```

**View logs (last 50 lines):**
```bash
sudo journalctl -u whale-scout -n 50 --no-pager
```

**Follow logs in real-time:**
```bash
sudo journalctl -u whale-scout -f
# Press Ctrl+C to exit
```

**Check for the error we were fixing:**
```bash
sudo journalctl -u whale-scout -n 100 | grep -i "unexpected token"
# Should return no results (error is fixed)
```

**Check for MemoryLimit deprecation warning:**
```bash
sudo journalctl -u whale-scout -n 100 | grep -i "MemoryLimit"
# Should return no results (warning is fixed)
```

**Test dashboard access:**
```bash
# From server
curl http://localhost:3000

# From your browser
http://YOUR_SERVER_IP:3000
```

### Step 9: Monitor for Issues

**Let the service run for 2-3 minutes, then check:**

```bash
# Check if any errors occurred
sudo journalctl -u whale-scout --since "5 minutes ago" | grep -i error

# Check process status
ps aux | grep node

# Check resource usage
sudo systemctl status whale-scout

# Check application logs
sudo tail -100 /opt/whale-scout/logs/app.log
```

---

## Expected Results

✅ **Service should start successfully**
✅ **No "SyntaxError: Unexpected token 'with'" errors**
✅ **No "MemoryLimit" deprecation warnings**
✅ **Bot should begin scanning for whales**
✅ **Dashboard should be accessible at http://YOUR_SERVER_IP:3000**
✅ **Logs should show normal operation**

---

## Troubleshooting

### Issue: Service fails to start

```bash
# Check detailed error
sudo journalctl -u whale-scout -n 100

# Try running manually to see error
sudo -u whale-scout node /opt/whale-scout/dist/cli/index.js start
```

### Issue: Still getting "Unexpected token 'with'" error

```bash
# Verify Node.js version
node -v  # Must be v22.x.x

# If still v18, reinstall Node.js
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs

# Rebuild everything
cd ~/polymarket_trader
rm -rf node_modules dist
npm install
npm run build
sudo bash deploy/deploy.sh
```

### Issue: Dashboard not accessible

```bash
# Check if port is open
sudo ufw status
sudo ufw allow 3000

# Check if service is listening
sudo netstat -tlnp | grep 3000

# Test locally
curl http://localhost:3000
```

### Issue: "REAL_TRADING_PRIVATE_KEY" errors

This is informational and won't prevent the bot from running in paper mode. To silence:

```bash
sudo nano /opt/whale-scout/.env
# Ensure: TRADING_MODE=paper
# Save and restart: sudo systemctl restart whale-scout
```

---

## Rollback Plan (If Needed)

If deployment fails and you need to rollback:

```bash
# Stop service
sudo systemctl stop whale-scout

# Restore old Node.js version (if you have backup)
# OR keep v22 and fix the issue

# Check logs for specific error
sudo journalctl -u whale-scout -n 200

# Try manual start to debug
cd /opt/whale-scout
sudo -u whale-scout node dist/cli/index.js start
```

---

## Post-Deployment Validation

After deployment is successful, run these commands to document the deployment:

```bash
# Document versions
echo "Node.js: $(node -v)" >> /tmp/deployment-log.txt
echo "npm: $(npm -v)" >> /tmp/deployment-log.txt
echo "Service: $(systemctl is-active whale-scout)" >> /tmp/deployment-log.txt
echo "Deployment Date: $(date)" >> /tmp/deployment-log.txt

# View the log
cat /tmp/deployment-log.txt
```

---

## Success Criteria

- ✅ Service shows "active (running)" status
- ✅ No SyntaxError in logs
- ✅ No MemoryLimit deprecation warnings
- ✅ Bot is scanning for trades (check logs)
- ✅ Dashboard is accessible
- ✅ No critical errors in last 100 log lines

---

## Next Steps After Successful Deployment

1. **Monitor the bot for 24 hours** to ensure stability
2. **Set up log monitoring** (optional)
3. **Configure backup script** for database (optional)
4. **Set up SSL/HTTPS** for dashboard (optional, see deploy/README.md)
5. **Test paper trades** by waiting for whale detection

---

## Support

If you encounter issues not covered here:

1. Check **deploy/README.md** for detailed troubleshooting
2. Check **logs**: `sudo journalctl -u whale-scout -f`
3. Check **application logs**: `/opt/whale-scout/logs/app.log`
4. Review **AGENTS.md** for architecture details

---

**Deployment prepared by:** OpenCode  
**Date:** January 31, 2026  
**Changes:** Node.js v22 upgrade, MemoryLimit fix, comprehensive docs
