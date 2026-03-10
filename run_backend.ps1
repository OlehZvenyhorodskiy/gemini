# Nexus Backend Launcher
Write-Host "🚀 Starting NEXUS Backend..." -ForegroundColor Cyan

# 1. Check for Python
$pythonCmd = "python"
try {
    $version = & $pythonCmd --version 2>&1
    if ($LASTEXITCODE -ne 0) { throw "Python not found" }
} catch {
    Write-Host "⚠️ 'python' command not found or alias issue. Trying 'py'..." -ForegroundColor Yellow
    $pythonCmd = "py"
    try {
        $version = & $pythonCmd --version 2>&1
    } catch {
        Write-Error "❌ Python not found! Please install Python 3.12+ and add to PATH."
        exit 1
    }
}
Write-Host "✅ Using $($version)" -ForegroundColor Green

# 2. Check/Create Virtual Environment
if (-not (Test-Path "venv")) {
    Write-Host "📦 Creating virtual environment..." -ForegroundColor Cyan
    & $pythonCmd -m venv venv
}

# 3. Activate Venv
Write-Host "🔌 Activating venv..." -ForegroundColor Cyan
.\venv\Scripts\Activate.ps1

# 4. Install Dependencies
if (-not (Test-Path "venv\Lib\site-packages\fastapi")) {
    Write-Host "⬇️ Installing dependencies..." -ForegroundColor Cyan
    pip install -r requirements.txt
    pip install uvicorn pyautogui # Ensure these are definitely there
}

# 5. Run Server
Write-Host "🔥 Launching Uvicorn..." -ForegroundColor Green
$env:PYTHONPATH = $PWD
python -m uvicorn backend.main:app --port 8080 --reload
