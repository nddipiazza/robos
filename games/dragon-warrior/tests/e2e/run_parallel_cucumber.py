#!/usr/bin/env python3
"""
Fully Configurable Parallel E2E Cucumber Test Runner for AI Dragon Warrior.
Runs tests in parallel with complete worker isolation (ports, X11 displays, and report directories).
Supports taskbar tray notification context menu during headed test runs.
"""

from __future__ import annotations

import argparse
import glob
import os
import shutil
import subprocess
import sys
import time
from concurrent.futures import ProcessPoolExecutor, as_completed

PROJECT_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
PRIMARY_REPORTS_DIR = os.path.join(PROJECT_DIR, "tests", "e2e", "reports")
PRIMARY_VIDEOS_DIR = os.path.join(PRIMARY_REPORTS_DIR, "videos")
FEATURES_DIR = os.path.join(PROJECT_DIR, "tests", "e2e", "features")


def resolve_default_host_display() -> str:
	return os.environ.get("HOST_DISPLAY", os.environ.get("DISPLAY", ":0"))


def run_worker_task(worker_info: dict) -> dict:
	worker_id = worker_info["worker_id"]
	features = worker_info["features"]
	assigned_port = worker_info["port"]
	assigned_display = worker_info["display"]
	is_headed = worker_info["is_headed"]
	worker_reports_dir = os.path.join(PRIMARY_REPORTS_DIR, f"worker_{worker_id}")
	worker_videos_dir = os.path.join(worker_reports_dir, "videos")

	os.makedirs(worker_videos_dir, exist_ok=True)

	env = os.environ.copy()
	env["DW_WORKER_ID"] = str(worker_id)
	env["DW_WEB_SERVICE_PORT"] = str(assigned_port)
	env["REPORTS_DIR"] = worker_reports_dir
	env["VIDEOS_DIR"] = worker_videos_dir

	env["DW_HEADED"] = "1" if is_headed else "0"
	if is_headed:
		env["USE_XVFB"] = "0"
		env["HEADLESS"] = "0"
		env["DISPLAY"] = assigned_display
	else:
		env["USE_XVFB"] = "1"
		env["HEADLESS"] = "1"
		env["DISPLAY"] = assigned_display

	print(f"🚀 [Worker {worker_id}] Starting {len(features)} feature(s) on display {env['DISPLAY']} (port {assigned_port})...")

	cmd = [
		sys.executable,
		"-m",
		"behave",
		*features,
		"-f",
		"behave_html_formatter:HTMLFormatter",
		"-o",
		os.path.join(worker_reports_dir, "report.html"),
	]

	t0 = time.time()
	proc = subprocess.run(cmd, cwd=PROJECT_DIR, env=env, check=False)
	elapsed = time.time() - t0

	print(f"🏁 [Worker {worker_id}] Completed in {elapsed:.1f}s with exit code {proc.returncode}.")

	return {
		"worker_id": worker_id,
		"returncode": proc.returncode,
		"reports_dir": worker_reports_dir,
		"features_count": len(features),
		"elapsed": elapsed,
	}


def consolidate_worker_reports(worker_results: list[dict]) -> None:
	os.makedirs(PRIMARY_VIDEOS_DIR, exist_ok=True)

	for res in worker_results:
		wdir = res["reports_dir"]
		if not os.path.exists(wdir):
			continue

		# Copy videos
		w_videos = os.path.join(wdir, "videos")
		if os.path.exists(w_videos):
			for vid in glob.glob(os.path.join(w_videos, "*.mp4")):
				dest = os.path.join(PRIMARY_VIDEOS_DIR, os.path.basename(vid))
				shutil.copy2(vid, dest)

		# Copy GameState JSONs
		for json_file in glob.glob(os.path.join(wdir, "gamestate_*.json")):
			dest = os.path.join(PRIMARY_REPORTS_DIR, os.path.basename(json_file))
			shutil.copy2(json_file, dest)

	# Trigger HTML report generator
	generate_script = os.path.join(PROJECT_DIR, "tests", "e2e", "generate_report.py")
	if os.path.exists(generate_script):
		subprocess.run([sys.executable, generate_script], check=False)


def main() -> int:
	parser = argparse.ArgumentParser(description="Dragon Warrior Parallel E2E Cucumber Runner")
	parser.add_argument("-j", "--jobs", "--workers", type=int, default=None, help="Number of parallel worker processes (default: 5)")
	parser.add_argument("--base-port", type=int, default=None, help="Base Web Service REST API port (default: 8080)")
	parser.add_argument("--base-display", type=int, default=None, help="Base X11 display number offset for Xvfb (default: 100)")
	parser.add_argument("--headed", action="store_true", help="Run in headed desktop mode instead of headless Xvfb")
	parser.add_argument("targets", nargs="*", help="Feature files or directories to run")

	args = parser.parse_args()

	# Dynamic defaults from CLI or Environment (Hardcode Nothing!)
	num_workers = args.jobs or int(os.environ.get("DW_PARALLEL_WORKERS", "5"))
	base_port = args.base_port or int(os.environ.get("DW_WEB_SERVICE_BASE_PORT", "8080"))
	base_display_num = args.base_display or int(os.environ.get("DW_BASE_DISPLAY", "100"))
	is_headed = args.headed or os.environ.get("HEADLESS", "1").lower() in ("0", "false", "no", "off") or os.environ.get("USE_XVFB", "1").lower() in ("0", "false", "no", "off")

	# Target resolution
	target_paths = args.targets or [FEATURES_DIR]
	feature_files: list[str] = []

	for target in target_paths:
		file_part = target.split(":", 1)[0]
		line_part = (":" + target.split(":", 1)[1]) if ":" in target else ""
		if os.path.isfile(file_part) and file_part.endswith(".feature"):
			feature_files.append(os.path.abspath(file_part) + line_part)
		elif os.path.isdir(target):
			found = glob.glob(os.path.join(target, "**", "*.feature"), recursive=True)
			feature_files.extend([os.path.abspath(f) for f in found])

	feature_files = sorted(list(set(feature_files)))

	if not feature_files:
		print("❌ No .feature files found!")
		return 1

	num_workers = min(num_workers, len(feature_files))

	print("=" * 60)
	print(f"🐉 AI Dragon Warrior Parallel E2E Cucumber Test Suite")
	print(f"⚙️ Configuration:")
	print(f"   • Workers: {num_workers}")
	print(f"   • Mode: {'HEADED (Desktop)' if is_headed else 'HEADLESS (Xvfb)'}")
	print(f"   • Base Web Service Port: {base_port}")
	print(f"   • Base X11 Display: :{base_display_num}")
	print(f"   • Total Features: {len(feature_files)}")
	print("=" * 60)

	# Launch E2E Test Manager GUI on host DISPLAY during headed runs
	app_proc = None
	if is_headed and sys.platform != "win32" and not os.environ.get("DW_NO_GUI"):
		app_script = os.path.join(PROJECT_DIR, "tests", "e2e", "e2e_test_app.py")
		if os.path.exists(app_script):
			try:
				app_env = os.environ.copy()
				app_env["DISPLAY"] = resolve_default_host_display()
				app_proc = subprocess.Popen(
					[sys.executable, app_script, "--parent-pid", str(os.getpid())],
					env=app_env,
					stdout=subprocess.DEVNULL,
					stderr=subprocess.DEVNULL,
				)
				print(f"🐉 E2E Test Manager GUI active on {app_env['DISPLAY']}. Use the GUI app to monitor, control, or kill test execution.")
			except Exception as e:
				print(f"⚠️ Could not launch E2E Test Manager GUI: {e}")

	# Check Xvfb availability
	xvfb_bin = None
	if not is_headed:
		xvfb_bin = shutil.which("Xvfb") or shutil.which("Xvfb.exe")
		if not xvfb_bin:
			candidates = [
				os.path.expanduser("~/.local/xvfb/usr/bin/Xvfb"),
				"/usr/bin/Xvfb",
				"/usr/local/bin/Xvfb",
				os.path.expanduser("~/.local/bin/Xvfb"),
			]
			for c in candidates:
				if os.path.exists(c):
					xvfb_bin = c
					break
		if not xvfb_bin:
			print("ℹ️ Xvfb binary not found on system. Workers will use host X11 DISPLAY.")

	# Distribute feature files among workers
	worker_buckets: list[list[str]] = [[] for _ in range(num_workers)]
	for idx, feat in enumerate(feature_files):
		worker_buckets[idx % num_workers].append(feat)

	worker_tasks: list[dict] = []
	host_display = resolve_default_host_display()
	for i in range(num_workers):
		assigned_display = f":{base_display_num + i}" if xvfb_bin else host_display
		worker_tasks.append({
			"worker_id": i + 1,
			"features": worker_buckets[i],
			"port": base_port + (i * 10),
			"display": assigned_display,
			"is_headed": is_headed,
		})

	t_start = time.time()
	worker_results: list[dict] = []
	exit_codes: list[int] = []

	try:
		with ProcessPoolExecutor(max_workers=num_workers) as executor:
			futures = [executor.submit(run_worker_task, task) for task in worker_tasks]
			for future in as_completed(futures):
				res = future.result()
				worker_results.append(res)
				exit_codes.append(res["returncode"])
	finally:
		if app_proc and app_proc.poll() is None:
			try:
				app_proc.terminate()
			except Exception:
				pass

	total_elapsed = time.time() - t_start

	# Consolidate reports and artifacts
	consolidate_worker_reports(worker_results)

	overall_failed = any(code != 0 for code in exit_codes)

	print("\n" + "=" * 60)
	print(f"🏆 Parallel E2E Execution Complete in {total_elapsed:.1f}s")
	print(f"📊 Worker Exit Codes: {exit_codes}")
	print(f"📄 HTML Report: {os.path.join(PRIMARY_REPORTS_DIR, 'index.html')}")
	print("=" * 60)

	return 1 if overall_failed else 0


if __name__ == "__main__":
	raise SystemExit(main())
