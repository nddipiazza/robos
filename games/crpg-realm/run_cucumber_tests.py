#!/usr/bin/env python3
"""
RobOS cRPG Cucumber E2E Test Suite Runner
Executes Behave E2E test scenarios and attaches captured MP4 videos and GameState JSON telemetry
into an interactive HTML report (mirroring the Dragon Warrior E2E architecture).
"""

from __future__ import annotations

import html
import os
from pathlib import Path
import re
import subprocess
import sys

PROJECT_DIR = Path(__file__).resolve().parent
REPORTS_DIR = PROJECT_DIR / "tests" / "e2e" / "reports"
VIDEOS_DIR = REPORTS_DIR / "videos"
HTML_REPORT = REPORTS_DIR / "index.html"
FEATURES_DIR = PROJECT_DIR / "tests" / "e2e" / "features"

SCENARIO_PATTERN = re.compile(
    r'<div class="scenario">.*?<span class="val">Scenario:\s*(.*?)</span>'
    r'.*?<ol class="scenario_steps".*?</ol>',
    re.DOTALL,
)

def embed_artifacts() -> None:
    if not HTML_REPORT.exists():
        return

    content = HTML_REPORT.read_text(encoding="utf-8")

    def embed_for_scenario(match: re.Match[str]) -> str:
        scenario_html = match.group(0)
        scenario_title = match.group(1).strip()
        raw_name = html.unescape(scenario_title).lower().replace(" ", "_").replace("-", "_")
        scenario_key = "".join([c for c in raw_name if c.isalnum() or c == "_"])
        attachments = ""

        video_filename = f"{scenario_key}.mp4"
        video_path = VIDEOS_DIR / video_filename
        if video_path.exists():
            attachments += f"""
            <div style="margin: 15px 0; padding: 12px; background: #16213e; color: #fff; border-radius: 8px; border-left: 4px solid #00bcd4;">
                <h4 style="color: #00bcd4; margin: 0 0 10px 0;">⚔️ Playthrough Video Proof-of-Work: {scenario_title}</h4>
                <video controls width="720" height="405" autoplay muted loop style="border: 1px solid #00bcd4; border-radius: 4px; max-width: 100%;">
                    <source src="videos/{video_filename}" type="video/mp4">
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
                    📊 Attached GameState Telemetry (JSON Payload)
                </summary>
                <pre style="margin-top: 10px; background: #0f3460; padding: 12px; border-radius: 6px; color: #64ffda; max-height: 350px; overflow: auto; font-family: monospace; font-size: 12px; white-space: pre-wrap;">{state_content}</pre>
            </details>
            """

        if attachments and "</ol>" in scenario_html:
            return scenario_html.replace("</ol>", f"{attachments}</ol>", 1)
        return scenario_html

    updated_content = SCENARIO_PATTERN.sub(embed_for_scenario, content)
    HTML_REPORT.write_text(updated_content, encoding="utf-8")
    print(f"✔ [Reports] Successfully embedded video recordings and telemetry into {HTML_REPORT}")

def main() -> int:
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    VIDEOS_DIR.mkdir(parents=True, exist_ok=True)

    target_dir = FEATURES_DIR / "normal"
    suite_name = "Normal Isolated Tests"
    suite_selected = False
    forward_args = []

    for arg in sys.argv[1:]:
        if arg in ("--normal", "--isolated"):
            target_dir = FEATURES_DIR / "normal"
            suite_name = "Normal Isolated Tests"
            suite_selected = True
        elif arg in ("--playthrough", "--playthroughs", "--full"):
            target_dir = FEATURES_DIR / "full_playthroughs"
            suite_name = "Full Campaign Playthroughs"
            suite_selected = True
        elif arg in ("--all", "--both"):
            target_dir = FEATURES_DIR
            suite_name = "All Suites (Normal + Full Playthroughs)"
            suite_selected = True
        else:
            forward_args.append(arg)

    # Check if a custom path or feature was provided in forward_args
    has_custom_path = any(
        a.endswith(".feature") or os.path.exists(a) or (PROJECT_DIR / a).exists()
        for a in forward_args if not a.startswith("-")
    )

    print("=================================================================")
    print(f"   RobOS cRPG Cucumber E2E Verification (Xvfb)                  ")
    print(f"   Suite: {suite_name}")
    if not suite_selected and not has_custom_path:
        print("   (Tip: Use --playthrough for full playthroughs, --all for both)")
    print("=================================================================")

    behave_cmd = [
        sys.executable, "-m", "behave",
    ]
    if not has_custom_path:
        behave_cmd.append(str(target_dir))
    behave_cmd.extend([
        "-f", "behave_html_formatter:HTMLFormatter",
        "-o", str(HTML_REPORT),
        *forward_args
    ])

    env = os.environ.copy()
    env["PYTHONPATH"] = str(PROJECT_DIR) + ":" + env.get("PYTHONPATH", "")

    result = subprocess.run(behave_cmd, cwd=PROJECT_DIR, env=env, check=False)
    
    try:
        report_script = PROJECT_DIR / "tests" / "e2e" / "generate_report.py"
        subprocess.run([sys.executable, str(report_script)], cwd=PROJECT_DIR, check=False)
    except Exception as e:
        print(f"Report generation error: {e}")
    
    print("\n=================================================================")
    if result.returncode == 0:
        print("🎉 ALL CUCUMBER E2E PLAYTHROUGH SCENARIOS PASSED SUCCESSFULLY!")
    else:
        print(f"⚠️ Test run finished with exit code {result.returncode}")
    print(f"  Interactive HTML Report: {HTML_REPORT}")
    print("=================================================================\n")
    return result.returncode

if __name__ == "__main__":
    raise SystemExit(main())
