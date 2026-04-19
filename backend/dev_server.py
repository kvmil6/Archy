from __future__ import annotations

import argparse
import sys
from pathlib import Path

import uvicorn


REPO_ROOT = Path(__file__).resolve().parent.parent
APP_DIR = Path(__file__).resolve().parent / "app"

if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run Archy backend from any working directory.")
    parser.add_argument("--host", default="0.0.0.0", help="Bind host. Default: 0.0.0.0")
    parser.add_argument("--port", type=int, default=8000, help="Bind port. Default: 8000")
    parser.add_argument(
        "--no-reload",
        action="store_true",
        help="Disable auto-reload (enabled by default for local development).",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    reload_enabled = not args.no_reload
    uvicorn.run(
        "backend.app.main:app",
        host=args.host,
        port=args.port,
        reload=reload_enabled,
        reload_dirs=[str(APP_DIR)] if reload_enabled else None,
    )


if __name__ == "__main__":
    main()
