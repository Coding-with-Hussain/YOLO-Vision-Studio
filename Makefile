# Convenience targets. Windows users can run the commands from the README.
PYTHON ?= python3
VENV := backend/.venv
VENV_PY := $(VENV)/bin/python

.PHONY: setup setup-backend setup-backend-cpu setup-frontend dev backend frontend test test-backend test-frontend lint build clean-storage

setup: setup-backend setup-frontend

$(VENV_PY):
	$(PYTHON) -m venv $(VENV)
	$(VENV_PY) -m pip install --upgrade pip

## Install backend dependencies (PyTorch from PyPI: CUDA build on Linux/Windows).
setup-backend: $(VENV_PY)
	$(VENV_PY) -m pip install -r backend/requirements-dev.txt

## Install the smaller CPU-only PyTorch build first, then the rest.
setup-backend-cpu: $(VENV_PY)
	$(VENV_PY) -m pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu
	$(VENV_PY) -m pip install -r backend/requirements-dev.txt

setup-frontend:
	cd frontend && npm install

dev:
	./scripts/dev.sh

backend:
	cd backend && .venv/bin/python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000

frontend:
	cd frontend && npm run dev

test: test-backend test-frontend

test-backend:
	cd backend && .venv/bin/python -m pytest

test-frontend:
	cd frontend && npm test

lint:
	cd frontend && npm run lint && npm run typecheck

build:
	cd frontend && npm run build

## Delete uploaded weights, outputs, uploads, history and settings.
clean-storage:
	find backend/storage -mindepth 1 ! -name .gitkeep ! -path '*/weights' ! -path '*/uploads' ! -path '*/outputs' -delete
