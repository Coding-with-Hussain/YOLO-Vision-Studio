#!/usr/bin/env bash
# Start the backend (port 8000) and frontend (port 5173) together.
# Stop both with Ctrl+C.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PYTHON="${ROOT}/backend/.venv/bin/python"
[[ -x "$PYTHON" ]] || PYTHON="${ROOT}/backend/.venv/Scripts/python.exe"

if [[ ! -x "$PYTHON" ]]; then
  echo "Backend virtual environment not found. Run: make setup" >&2
  exit 1
fi
if [[ ! -d "${ROOT}/frontend/node_modules" ]]; then
  echo "Frontend dependencies not installed. Run: make setup" >&2
  exit 1
fi

cleanup() { kill 0 2>/dev/null || true; }
trap cleanup EXIT INT TERM

(cd "${ROOT}/backend" && "$PYTHON" -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000) &
(cd "${ROOT}/frontend" && npm run dev) &

echo "Backend:  http://127.0.0.1:8000/docs"
echo "Frontend: http://localhost:5173"
wait
