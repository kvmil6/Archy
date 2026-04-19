@echo off
REM Archy — single-command dev startup (Windows)

echo Checking prerequisites...

REM 1. Python 3.10+
python --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Python not found. Install Python 3.10+ from python.org
    exit /b 1
)
for /f "tokens=2 delims= " %%v in ('python --version 2^>^&1') do set PY_VER=%%v
echo [OK] Python %PY_VER%

REM 2. Create venv if needed
if not exist ".venv" (
    echo Creating virtual environment...
    python -m venv .venv
)
call .venv\Scripts\activate.bat

REM 3. Install backend deps if needed
if not exist ".venv\.deps_installed" (
    echo Installing backend dependencies...
    pip install -q -r backend\requirements.txt
    echo. > .venv\.deps_installed
)
echo [OK] Backend dependencies

REM 4. Install frontend deps if needed
if not exist "frontend\node_modules" (
    echo Installing frontend dependencies...
    cd frontend && npm install && cd ..
)
echo [OK] Frontend dependencies

REM 5. Check for Rust
rustc --version >nul 2>&1
if errorlevel 1 (
    echo Rust not found — running in web mode
    echo Starting backend...
    start "Archy Backend" python backend\dev_server.py
    echo Starting frontend...
    cd frontend && npm run dev
) else (
    echo [OK] Rust found — running Tauri desktop
    cd frontend && npx tauri dev
)
