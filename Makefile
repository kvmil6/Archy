.PHONY: dev build install clean

dev:
	./start.sh

install:
	python3 -m venv .venv
	.venv/bin/pip install -r backend/requirements.txt
	cd frontend && npm install

build:
	cd frontend && npx tauri build

clean:
	rm -rf .venv frontend/node_modules frontend/dist frontend/src-tauri/target
