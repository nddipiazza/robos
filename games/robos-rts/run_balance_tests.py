#!/usr/bin/env python3
"""Run outcome-based unit/ability contracts in isolated, parallel headless engines."""
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
import argparse
import json
import os
from pathlib import Path
import shutil
import socket
import subprocess
import sys
import time

PROJECT = Path(__file__).resolve().parent
SUITES = {
    "coverage": "test_roster_coverage.gd",
    "units": "test_unit_contracts.gd",
    "combat": "test_combat_abilities.gd",
    "economy": "test_economy_abilities.gd",
    "matchups": "test_matchup_matrix.gd",
    "campaign": "test_campaign.gd",
    "controls": "test_player_controls.gd",
    "improvements": "test_improvement_backlog.gd",
}


def find_godot():
    supplied = os.environ.get("GODOT_BIN")
    cached = Path.home()/".cache/robos-tools/godot-4.3/Godot_v4.3-stable_win64.exe"
    candidates = [supplied, shutil.which("godot4"), shutil.which("godot"), str(cached)]
    for candidate in candidates:
        if candidate and Path(candidate).is_file():
            # Own the actual engine process, not the Windows console wrapper.
            actual = candidate.replace("_console.exe", ".exe") if os.name == "nt" else candidate
            return actual if Path(actual).is_file() else candidate
    raise RuntimeError("Godot 4 not found; set GODOT_BIN to its executable")


def run_suite(name, engine, output, timeout):
    with socket.socket() as reservation:
        reservation.bind(("127.0.0.1", 0))
        port = reservation.getsockname()[1]
    env = {**os.environ, "RTS_MODE": "backend", "RTS_WEB_SERVICE_PORT": str(port)}
    started = time.monotonic()
    try:
        result = subprocess.run([engine, "--headless", "--path", str(PROJECT), "--script", "tests/"+SUITES[name]],
            cwd=PROJECT, env=env, capture_output=True, text=True, encoding="utf-8", errors="replace",
            timeout=timeout, creationflags=subprocess.BELOW_NORMAL_PRIORITY_CLASS if os.name == "nt" else 0)
        log = result.stdout+result.stderr
        parsed = None
        for line in reversed(result.stdout.splitlines()):
            try:
                candidate = json.loads(line)
                if isinstance(candidate, dict) and "suite" in candidate:
                    parsed = candidate
                    break
            except json.JSONDecodeError:
                pass
        runtime_errors = [line for line in log.splitlines() if "SCRIPT ERROR:" in line or line.startswith("ERROR:")]
        passed = result.returncode == 0 and parsed is not None and not parsed.get("probe_only", False) and not parsed.get("failures") and not runtime_errors
        report = {"passed": passed, "exit_code": result.returncode, "seconds": time.monotonic()-started,
                  "runtime_errors": runtime_errors, "result": parsed}
    except subprocess.TimeoutExpired as error:
        log = str(error)
        report = {"passed": False, "seconds": time.monotonic()-started, "error": "Timed out"}
    (output/f"{name}.log").write_text(log, encoding="utf-8")
    (output/f"{name}.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    return name, report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--jobs", type=int, choices=(1,2,3), default=3)
    parser.add_argument("--suite", action="append", choices=tuple(SUITES))
    parser.add_argument("--timeout", type=float, default=120)
    args = parser.parse_args()
    if args.timeout <= 0:
        parser.error("--timeout must be positive")
    names = list(dict.fromkeys(["coverage", *(args.suite or SUITES)]))
    engine = find_godot()
    output = PROJECT/"tests/e2e/reports/balance"/datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
    output.mkdir(parents=True)
    results = {}
    with ThreadPoolExecutor(max_workers=args.jobs) as pool:
        futures = [pool.submit(run_suite, name, engine, output, args.timeout) for name in names]
        for future in as_completed(futures):
            name, report = future.result()
            results[name] = report
            print(f"{'PASS' if report['passed'] else 'FAIL'} {name}: {report['seconds']:.2f}s", flush=True)
            if not report["passed"]:
                print(json.dumps(report, indent=2), flush=True)
    passed = all(report["passed"] for report in results.values())
    summary = {"passed": passed, "engine": engine, "jobs": args.jobs, "suites": results}
    (output/"summary.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
    print(f"Balance contract report: {output}", flush=True)
    return 0 if passed else 1


if __name__ == "__main__":
    sys.exit(main())
