#############################################
# Polymarket Whale Scout - Deployment Script (Windows)
# Pulls latest changes and restarts the bot
#############################################

$ErrorActionPreference = "Stop"

Write-Host "🚀 Starting deployment..." -ForegroundColor Cyan

# Change to project directory
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectDir = Split-Path -Parent $ScriptDir
Set-Location $ProjectDir
Write-Host "📁 Project directory: $ProjectDir" -ForegroundColor Gray

# Check if git repo
if (-not (Test-Path ".git")) {
    Write-Host "❌ Error: Not a git repository" -ForegroundColor Red
    exit 1
}

# Stop the bot if running (PM2)
Write-Host "`n🛑 Stopping bot..." -ForegroundColor Yellow
$pm2Installed = Get-Command pm2 -ErrorAction SilentlyContinue
if ($pm2Installed) {
    try {
        pm2 stop whale-scout 2>$null
    } catch {
        Write-Host "Bot not running in PM2" -ForegroundColor Gray
    }
} else {
    Write-Host "⚠️  PM2 not found - skipping stop" -ForegroundColor Yellow
}

# Stash any local changes
Write-Host "`n💾 Stashing local changes..." -ForegroundColor Yellow
git stash

# Pull latest changes
Write-Host "`n⬇️  Pulling latest changes from main..." -ForegroundColor Yellow
git pull origin main

# Install/update dependencies
Write-Host "`n📦 Installing dependencies..." -ForegroundColor Yellow
npm install

# Build TypeScript and client
Write-Host "`n🔨 Building project..." -ForegroundColor Yellow
npm run build

# Check if database reset is needed
Write-Host "`n🗄️  Database Check" -ForegroundColor Yellow
if (Test-Path "data\whale_bot.db") {
    try {
        $OpenTrades = sqlite3 data\whale_bot.db "SELECT COUNT(*) FROM paper_trades WHERE status = 'OPEN';" 2>$null
        Write-Host "Current open positions: $OpenTrades" -ForegroundColor Gray
        
        if ([int]$OpenTrades -gt 50) {
            Write-Host "⚠️  Warning: High number of open positions ($OpenTrades)" -ForegroundColor Yellow
            $response = Read-Host "Reset paper trades database? (y/N)"
            if ($response -eq "y" -or $response -eq "Y") {
                Write-Host "🔄 Resetting paper trades..." -ForegroundColor Yellow
                Get-Content scripts\reset_paper_trades.sql | sqlite3 data\whale_bot.db
                Write-Host "✅ Database reset complete" -ForegroundColor Green
            }
        }
    } catch {
        Write-Host "Could not check database - will be created on first run" -ForegroundColor Gray
    }
} else {
    Write-Host "No database found - will be created on first run" -ForegroundColor Gray
}

# Restart the bot
Write-Host "`n▶️  Starting bot..." -ForegroundColor Yellow
if ($pm2Installed) {
    # Check if PM2 process exists
    $pm2List = pm2 list | Out-String
    if ($pm2List -match "whale-scout") {
        pm2 restart whale-scout
    } else {
        # First time setup with PM2
        pm2 start npm --name "whale-scout" -- start
        pm2 save
    }
    
    Write-Host "`n✅ Bot restarted with PM2" -ForegroundColor Green
    pm2 status whale-scout
} else {
    Write-Host "⚠️  PM2 not installed - starting in foreground" -ForegroundColor Yellow
    Write-Host "💡 Install PM2 for background process: npm install -g pm2" -ForegroundColor Yellow
    npm start
}

Write-Host "`n🎉 Deployment complete!" -ForegroundColor Green
Write-Host "`n📊 Monitor logs:" -ForegroundColor Cyan
Write-Host "  tail -f logs\app.log     (File logs)" -ForegroundColor Yellow
Write-Host "  pm2 logs whale-scout    (PM2 logs)" -ForegroundColor Yellow
Write-Host "`n🌐 Dashboard: http://localhost:3000" -ForegroundColor Cyan
