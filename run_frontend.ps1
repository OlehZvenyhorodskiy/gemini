# Nexus Frontend Launcher
Write-Host "🌐 Starting NEXUS Frontend..." -ForegroundColor Cyan

# 1. Check for Node.js
try {
    $nodeVersion = & node --version 2>&1
    if ($LASTEXITCODE -ne 0) { throw "Node not found" }
} catch {
    Write-Error "❌ Node.js not found! Please install Node 22+ and add to PATH."
    exit 1
}
Write-Host "✅ Using Node $($nodeVersion)" -ForegroundColor Green

# 2. Navigate to Frontend Directory
if (-not (Test-Path "frontend")) {
    Write-Error "❌ 'frontend' directory not found! Are you in the project root?"
    exit 1
}
cd frontend

# 3. Check/Install Dependencies
if (-not (Test-Path "node_modules")) {
    Write-Host "📦 Installing dependencies (npm install)..." -ForegroundColor Cyan
    npm install
}

# 4. Run Dev Server
Write-Host "🔥 Launching Next.js..." -ForegroundColor Green
npm run dev
