#!/usr/bin/env bash
# Archy — single-command dev startup (macOS / Linux)
set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

echo "🔍 Checking prerequisites..."

# 1. Python 3.10+
if ! command -v python3 &>/dev/null; then
    echo -e "${RED}Python 3 not found. Install Python 3.10+ first.${NC}"
    exit 1
fi
PY_VERSION=$(python3 -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')")
PY_MAJOR=$(echo "$PY_VERSION" | cut -d. -f1)
PY_MINOR=$(echo "$PY_VERSION" | cut -d. -f2)
if [ "$PY_MAJOR" -lt 3 ] || { [ "$PY_MAJOR" -eq 3 ] && [ "$PY_MINOR" -lt 10 ]; }; then
    echo -e "${RED}Python $PY_VERSION found, but 3.10+ is required.${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Python $PY_VERSION${NC}"

# 2. Create/activate venv
if [ ! -d ".venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv .venv
fi
source .venv/bin/activate

# 3. Install backend deps if needed
if [ ! -f ".venv/.deps_installed" ]; then
    echo "Installing backend dependencies..."
    pip install -q -r backend/requirements.txt
    touch .venv/.deps_installed
fi
echo -e "${GREEN}✓ Backend dependencies${NC}"

# 4. Install frontend deps if needed
if [ ! -d "frontend/node_modules" ]; then
    echo "Installing frontend dependencies..."
    cd frontend && npm install && cd ..
fi
echo -e "${GREEN}✓ Frontend dependencies${NC}"

# 5. Check for Rust (optional — only needed for Tauri desktop)
if command -v rustc &>/dev/null; then
    echo -e "${GREEN}✓ Rust $(rustc --version | cut -d' ' -f2) — running Tauri desktop${NC}"
    cd frontend && npx tauri dev
else
    echo "Rust not found — running in web mode (two terminals)"
    echo "Starting backend..."
    python backend/dev_server.py &
    BACKEND_PID=$!
    trap "kill $BACKEND_PID 2>/dev/null" EXIT

    echo "Starting frontend..."
    cd frontend && npm run dev
fi
