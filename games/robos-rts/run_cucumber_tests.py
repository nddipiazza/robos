#!/usr/bin/env python3
"""
run_cucumber_tests.py — RobOS RTS Cucumber E2E Test Suite Runner
Runs headless SnowPlay/SC2 64Hz simulation engine tests (`--backend` default) or `--human`
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

    for arg in sys.argv[1:]:
        if arg in ("--backend", "--fast"):
            os.environ["RTS_MODE"] = "backend"
        elif arg in ("--human", "--prove"):
            os.environ["RTS_MODE"] = "human"
        elif arg == "--engine":
            pass
        else:
            forward_args.append(arg)

    cmd = [
        sys.executable,
        "-m",
        "behave",
        str(FEATURES_DIR),
        *forward_args,
    ]
    print(f"🚀 Running RobOS RTS Cucumber E2E Suite (RTS_MODE={os.environ['RTS_MODE']})...")
    res = subprocess.run(cmd, cwd=str(PROJECT_DIR))
    return res.returncode


if __name__ == "__main__":
    sys.exit(main())
