###############################################
# Push to GitHub and Deploy to Server (Windows)
# Commits, pushes, and triggers deployment
###############################################

$ErrorActionPreference = "Stop"

Write-Host "📤 Push and Deploy Script`n" -ForegroundColor Cyan

# Change to project directory
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectDir = Split-Path -Parent $ScriptDir
Set-Location $ProjectDir

# Check if there are changes
$hasChanges = git diff-index --quiet HEAD -- 2>$null
if ($LASTEXITCODE -eq 0) {
    Write-Host "No changes to commit" -ForegroundColor Yellow
} else {
    # Show changed files
    Write-Host "Changed files:" -ForegroundColor Yellow
    git status --short
    
    # Ask for commit message
    Write-Host "`nEnter commit message (or press Enter to skip):" -ForegroundColor Cyan
    $CommitMsg = Read-Host
    
    if ($CommitMsg) {
        # Stage and commit
        Write-Host "`n📝 Committing changes..." -ForegroundColor Yellow
        git add .
        git commit -m $CommitMsg
    } else {
        Write-Host "Skipping commit" -ForegroundColor Yellow
    }
}

# Push to GitHub
Write-Host "`n⬆️  Pushing to GitHub..." -ForegroundColor Yellow
git push origin main
Write-Host "✅ Pushed to GitHub" -ForegroundColor Green

# Ask if should deploy to server
Write-Host "`nDeploy to server now? (y/N):" -ForegroundColor Cyan
$Deploy = Read-Host

if ($Deploy -eq "y" -or $Deploy -eq "Y") {
    Write-Host "`n🚀 Deploying to server..." -ForegroundColor Yellow
    
    # Check if SERVER_HOST is set in .env
    if (Test-Path ".env") {
        $envContent = Get-Content ".env" | Out-String
        if ($envContent -match "SERVER_HOST=(.+)") {
            $ServerHost = $matches[1].Trim()
            $ServerUser = if ($envContent -match "SERVER_USER=(.+)") { $matches[1].Trim() } else { "root" }
            $ServerPath = if ($envContent -match "SERVER_PATH=(.+)") { $matches[1].Trim() } else { "/opt/polymarket_trader" }
            
            Write-Host "Server: $ServerUser@$ServerHost`:$ServerPath" -ForegroundColor Cyan
            
            # SSH and deploy (requires OpenSSH or PuTTY)
            ssh "$ServerUser@$ServerHost" "cd $ServerPath && ./scripts/deploy.sh"
            
            Write-Host "`n✅ Deployment complete!" -ForegroundColor Green
        } else {
            Write-Host "⚠️  SERVER_HOST not configured in .env" -ForegroundColor Yellow
            Write-Host "Add to .env:" -ForegroundColor Cyan
            Write-Host "SERVER_HOST=your.server.com"
            Write-Host "SERVER_USER=your-username"
            Write-Host "SERVER_PATH=/path/to/project"
            Write-Host ""
            Write-Host "Or deploy manually:" -ForegroundColor Yellow
            Write-Host "ssh your-server"
            Write-Host "cd /path/to/project"
            Write-Host "./scripts/deploy.sh"
        }
    } else {
        Write-Host "⚠️  .env file not found" -ForegroundColor Yellow
    }
} else {
    Write-Host "Deploy manually when ready:" -ForegroundColor Yellow
    Write-Host "ssh your-server"
    Write-Host "cd /path/to/project"
    Write-Host "./scripts/deploy.sh"
}

Write-Host "`n🎉 Done!" -ForegroundColor Green
