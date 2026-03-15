#!/usr/bin/env python3
"""
gen-userdata.py — for robos-gnome, user-data is maintained directly.
This script is a no-op placeholder so build.sh doesn't fail.
"""
import pathlib
ud = pathlib.Path(__file__).parent / "cloud-init" / "user-data"
if ud.exists():
    print(f"user-data already exists ({ud.stat().st_size} bytes), skipping generation.")
else:
    print("ERROR: user-data not found!")
    raise SystemExit(1)
