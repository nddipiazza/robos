#!/usr/bin/env python3
"""Placeholder user-data generator for RobOS.

Phase 1 uses a static user-data file. This script validates it exists
and copies it to the output directory.
"""

import shutil
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
USER_DATA = SCRIPT_DIR / "cloud-init" / "user-data"
OUTPUT_DIR = SCRIPT_DIR / "output"

def main():
    if not USER_DATA.exists():
        print(f"ERROR: {USER_DATA} not found", file=sys.stderr)
        sys.exit(1)

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    shutil.copy2(USER_DATA, OUTPUT_DIR / "user-data")
    shutil.copy2(SCRIPT_DIR / "cloud-init" / "meta-data", OUTPUT_DIR / "meta-data")
    print("user-data and meta-data copied to output/")

if __name__ == "__main__":
    main()
