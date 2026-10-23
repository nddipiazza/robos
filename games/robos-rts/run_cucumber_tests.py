#!/usr/bin/env python3
"""
run_cucumber_tests.py — RobOS RTS Cucumber E2E Test Suite Runner
Runs headless 64Hz simulation engine tests (`--backend` default) or `--human`
and generates an HTML report with attached Observation JSON telemetry in `tests/e2e/reports/index.html`.
"""

from __future__ import annotations

import os
from pathlib import Path
import subprocess
import sys

PROJECT_DIR = Path(__file__).resolve().parent
REPORTS_DIR = PROJECT_DIR / "tests" / "e2e" / "reports"
FEATURES_DIR = PROJECT_DIR / "tests" / "e2e" / "features" / "engine"


def main() -> int:
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    os.environ.setdefault("RTS_MODE", "backend")
    forward_args = []

    realtime = False
    for arg in sys.argv[1:]:
        if arg in ("--backend", "--fast"):
            os.environ["RTS_MODE"] = "backend"
        elif arg in ("--human", "--prove"):
            os.environ["RTS_MODE"] = "human"
        elif arg in ("--realtime", "--realtime-headless"):
            realtime = True
            os.environ["RTS_MODE"] = "realtime"
            os.environ["RTS_HEADLESS"] = "1" if arg == "--realtime-headless" else "0"
        elif arg.startswith("--speed="):
            speed = arg.split("=", 1)[1]
            if speed not in ("1", "2", "4", "8"):
                raise SystemExit("--speed must be 1, 2, 4 or 8")
            os.environ["RTS_TEST_SPEED"] = speed
        elif arg == "--record":
            os.environ["RTS_RECORD"] = "1"
        elif arg == "--show-window":
            os.environ["RTS_SHOW_WINDOW"] = "1"
        elif arg == "--keep-open":
            os.environ["RTS_KEEP_OPEN"] = "1"
        elif arg == "--engine":
            pass
        else:
            forward_args.append(arg)

    cmd = [
        sys.executable,
        "-m",
        "behave",
        str(FEATURES_DIR.parent / "realtime" if realtime else FEATURES_DIR),
        *forward_args,
    ]
    print(f"🚀 Running RobOS RTS Cucumber E2E Suite (RTS_MODE={os.environ['RTS_MODE']})...")
    res = subprocess.run(cmd, cwd=str(PROJECT_DIR))
    return res.returncode


if __name__ == "__main__":
    sys.exit(main())
