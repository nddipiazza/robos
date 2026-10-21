#!/usr/bin/env python3
"""Run the Behave E2E suite and attach captured artifacts to its HTML report."""

from __future__ import annotations

import html
from pathlib import Path
import re
import subprocess
import sys


PROJECT_DIR = Path(__file__).resolve().parent
REPORTS_DIR = PROJECT_DIR / "tests" / "e2e" / "reports"
VIDEOS_DIR = REPORTS_DIR / "videos"
HTML_REPORT = REPORTS_DIR / "index.html"

SCENARIO_PATTERN = re.compile(
	r'<div class="scenario">.*?<span class="val">Scenario:\s*(.*?)</span>'
	r'.*?<ol class="scenario_steps".*?</ol>',
	re.DOTALL,
)


def _embed_artifacts() -> None:
	if not HTML_REPORT.exists():
		return

	content = HTML_REPORT.read_text(encoding="utf-8")

	def embed_for_scenario(match: re.Match[str]) -> str:
		scenario_html = match.group(0)
		scenario_title = match.group(1).strip()
		raw_name = html.unescape(scenario_title).lower().replace(" ", "_").replace("-", "_")
		scenario_key = (
			"full_boot_to_throne_room"
			if "start" in raw_name or "boot" in raw_name
			else raw_name
		)
		attachments = ""

		video_filename = f"{scenario_key}.mp4"
		if (VIDEOS_DIR / video_filename).exists():
			attachments += f"""
			<div style="margin: 15px 0; padding: 12px; background: #16213e; color: #fff; border-radius: 8px; border-left: 4px solid #e94560;">
				<h4 style="color: #e94560; margin: 0 0 10px 0;">Playthrough Recording: {scenario_title}</h4>
				<video controls width="640" height="420" autoplay muted loop style="border: 1px solid #e94560; border-radius: 4px;">
					<source src="/videos/{video_filename}" type="video/mp4">
					Your browser does not support the video tag.
				</video>
			</div>
			"""

		state_path = REPORTS_DIR / f"gamestate_{scenario_key}.json"
		if state_path.exists():
			state_content = html.escape(state_path.read_text(encoding="utf-8"), quote=False)
			attachments += f"""
			<details style="margin: 15px 0; padding: 12px; background: #1a1a2e; color: #4ecca3; border-radius: 8px; border-left: 4px solid #4ecca3;">
				<summary style="cursor: pointer; font-weight: bold; color: #4ecca3; font-size: 14px; outline: none;">
					Attached GameState Inspection (Web Service Telemetry Payload)
				</summary>
				<pre style="margin-top: 10px; background: #0f3460; padding: 12px; border-radius: 6px; color: #e94560; max-height: 350px; overflow: auto; font-family: monospace; font-size: 12px; white-space: pre-wrap;">{state_content}</pre>
			</details>
			"""

		if attachments and "</ol>" in scenario_html:
			return scenario_html.replace("</ol>", f"{attachments}</ol>", 1)
		return scenario_html

	HTML_REPORT.write_text(SCENARIO_PATTERN.sub(embed_for_scenario, content), encoding="utf-8")


def main() -> int:
	VIDEOS_DIR.mkdir(parents=True, exist_ok=True)
	runner_script = PROJECT_DIR / "tests" / "e2e" / "run_parallel_cucumber.py"
	
	cmd = [sys.executable, str(runner_script), *sys.argv[1:]]
	result = subprocess.run(cmd, cwd=PROJECT_DIR, check=False)
	return result.returncode


if __name__ == "__main__":
	raise SystemExit(main())

