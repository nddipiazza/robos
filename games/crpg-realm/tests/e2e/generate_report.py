#!/usr/bin/env python3
"""
RobOS cRPG HTML Report Generator
Parses Gherkin features, matches recorded Xvfb MP4 videos and GameState JSON telemetry,
and generates an interactive, dark-themed HTML report.
"""

from __future__ import annotations

import datetime
import glob
import html
import json
import os
import sys

PROJECT_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
FEATURES_DIR = os.path.join(PROJECT_DIR, "tests", "e2e", "features")
REPORTS_DIR = os.path.join(PROJECT_DIR, "tests", "e2e", "reports")
VIDEOS_DIR = os.path.join(REPORTS_DIR, "videos")

def find_scenario_video(scenario_title):
    clean = "".join([c for c in scenario_title.lower().replace(" ", "_").replace("-", "_") if c.isalnum() or c == "_"])
    expected = f"{clean}.mp4"
    p = os.path.join(VIDEOS_DIR, expected)
    if os.path.exists(p) and os.path.getsize(p) > 0:
        return expected, p
    for mp4 in sorted(glob.glob(os.path.join(VIDEOS_DIR, "*.mp4"))):
        base = os.path.basename(mp4)
        words = [w for w in clean.split("_") if len(w) > 3]
        if words and sum(1 for w in words if w in base) >= min(2, len(words)):
            return base, mp4
    return None, None

def find_scenario_telemetry(scenario_title):
    clean = "".join([c for c in scenario_title.lower().replace(" ", "_").replace("-", "_") if c.isalnum() or c == "_"])
    expected = f"gamestate_{clean}.json"
    p = os.path.join(REPORTS_DIR, expected)
    if os.path.exists(p):
        return p
    for jf in sorted(glob.glob(os.path.join(REPORTS_DIR, "gamestate_*.json"))):
        base = os.path.basename(jf)
        words = [w for w in clean.split("_") if len(w) > 3]
        if words and sum(1 for w in words if w in base) >= min(2, len(words)):
            return jf
    return None

def parse_features():
    results = []
    for feat_file in sorted(glob.glob(os.path.join(FEATURES_DIR, "**", "*.feature"), recursive=True)):
        feat_title = ""
        suite_type = "Full Campaign Playthrough" if "full_playthroughs" in feat_file else "Normal Isolated"
        cur_scenario = None
        with open(feat_file, "r", encoding="utf-8") as f:
            for line in f:
                s = line.strip()
                if s.startswith("Feature:"):
                    feat_title = s.replace("Feature:", "").strip()
                elif s.startswith("Scenario:"):
                    if cur_scenario:
                        results.append(cur_scenario)
                    sc_title = s.replace("Scenario:", "").strip()
                    v_name, v_path = find_scenario_video(sc_title)
                    telem_path = find_scenario_telemetry(sc_title)
                    telem_data = None
                    if telem_path and os.path.exists(telem_path):
                        try:
                            with open(telem_path, "r", encoding="utf-8") as tf:
                                telem_data = json.load(tf)
                        except Exception:
                            pass
                    cur_scenario = {
                        "feature": feat_title,
                        "suite": suite_type,
                        "scenario": sc_title,
                        "description": [],
                        "steps": [],
                        "video_file": v_name,
                        "telemetry": telem_data,
                        "passed": (v_path is not None and os.path.exists(v_path))
                    }
                elif cur_scenario and any(s.startswith(k) for k in ["Given", "When", "Then", "And"]):
                    cur_scenario["steps"].append(s)
                elif cur_scenario and len(cur_scenario["steps"]) == 0 and s and not s.startswith("#") and not s.startswith('"""'):
                    cur_scenario["description"].append(s)
        if cur_scenario:
            results.append(cur_scenario)
    return results

def generate_html(results, output_file):
    total = len(results)
    passed = sum(1 for r in results if r["passed"])
    failed = total - passed
    now_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    ts = int(datetime.datetime.now().timestamp())

    cards_html = ""
    for r in results:
        steps_html = "".join([f"<li style='margin-bottom:6px;'><span style='color:#00bcd4;font-weight:bold;'>{s.split()[0]}</span> {' '.join(s.split()[1:])}</li>" for s in r["steps"]])
        badge = "<span style='background:#238636;color:#fff;padding:4px 10px;border-radius:12px;font-weight:bold;font-size:12px;'>PASSED</span>" if r["passed"] else "<span style='background:#da3633;color:#fff;padding:4px 10px;border-radius:12px;font-weight:bold;font-size:12px;'>FAILED</span>"
        
        desc_html = ""
        if r.get("description"):
            desc_text = " ".join(r["description"])
            desc_html = f"<div style='background: #0d1117; border-left: 3px solid #00bcd4; padding: 8px 12px; margin: 8px 0 14px 0; border-radius: 4px; color: #8b949e; font-size: 13px; font-style: italic;'>{html.escape(desc_text)}</div>"

        video_block = ""
        if r["video_file"]:
            video_rel = f"videos/{r['video_file']}?v={ts}"
            video_block = f"""
            <div style="flex: 1; min-width: 320px; background: #0d1117; padding: 12px; border-radius: 8px; border: 1px solid #30363d;">
                <h4 style="margin: 0 0 10px 0; color: #00bcd4; font-size: 13px;">🎬 Xvfb 1080p Video Proof-of-Work</h4>
                <video controls autoplay loop muted playsinline width="100%" style="border-radius: 6px; border: 1px solid #21262d;">
                    <source src="{video_rel}" type="video/mp4">
                    Browser video unsupported.
                </video>
            </div>
            """

        telem_block = ""
        if r["telemetry"]:
            telem_json = html.escape(json.dumps(r["telemetry"], indent=2))
            telem_block = f"""
            <details style="margin-top: 12px; background: #0d1117; padding: 10px; border-radius: 6px; border: 1px solid #30363d;">
                <summary style="cursor: pointer; color: #58a6ff; font-weight: bold; font-size: 13px;">📊 Attached GameState Telemetry (JSON Payload)</summary>
                <pre style="background: #161b22; padding: 12px; border-radius: 6px; color: #7ee787; max-height: 250px; overflow: auto; font-family: monospace; font-size: 12px; margin-top: 8px;">{telem_json}</pre>
            </details>
            """

        suite_color = "#8957e5" if r.get("suite") == "Full Campaign Playthrough" else "#1f6feb"
        suite_badge = f"<span style='background:{suite_color};color:#fff;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:bold;margin-right:8px;'>{r.get('suite', 'E2E')}</span>"

        cards_html += f"""
        <div style="background: #161b22; border: 1px solid #30363d; border-radius: 10px; margin-bottom: 24px; padding: 20px; box-shadow: 0 4px 12px rgba(0,0,0,0.4);">
            <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #21262d; padding-bottom: 12px; margin-bottom: 16px;">
                <div>
                    <h3 style="margin: 0 0 4px 0; color: #f0883e; font-size: 17px;">{suite_badge}📄 {r['feature']}</h3>
                    <div style="color: #c9d1d9; font-size: 14px; font-weight: bold;">Scenario: {r['scenario']}</div>
                    {desc_html}
                </div>
                {badge}
            </div>
            <div style="display: flex; flex-wrap: wrap; gap: 20px;">
                <div style="flex: 1; min-width: 300px;">
                    <h4 style="margin: 0 0 10px 0; color: #8b949e; font-size: 13px; text-transform: uppercase;">Gherkin BDD Steps</h4>
                    <ul style="list-style: none; padding: 0; margin: 0; font-family: monospace; font-size: 13px; color: #e6edf3;">
                        {steps_html}
                    </ul>
                </div>
                {video_block}
            </div>
            {telem_block}
        </div>
        """

    full_html = f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>RobOS cRPG — Cucumber E2E BDD Test Report</title>
    <style>
        body {{
            background-color: #0b0e14;
            color: #e6edf3;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            margin: 0;
            padding: 30px;
        }}
        .header {{
            text-align: center;
            border-bottom: 1px solid #30363d;
            padding-bottom: 20px;
            margin-bottom: 30px;
        }}
        .header h1 {{
            color: #00bcd4;
            font-size: 2.2rem;
            margin: 0 0 10px 0;
        }}
        .stats-bar {{
            display: flex;
            justify-content: center;
            gap: 20px;
            margin-bottom: 30px;
        }}
        .stat-box {{
            background: #161b22;
            border: 1px solid #30363d;
            border-radius: 8px;
            padding: 15px 30px;
            text-align: center;
            min-width: 120px;
        }}
        .stat-num {{ font-size: 1.8rem; font-weight: bold; }}
        .stat-num.pass {{ color: #2ea043; }}
        .stat-num.total {{ color: #58a6ff; }}
        .stat-label {{ font-size: 0.85rem; color: #8b949e; text-transform: uppercase; margin-top: 5px; }}
    </style>
</head>
<body>
    <div class="header">
        <h1>⚔️ RobOS cRPG: Realm of Heroes</h1>
        <p>Automated Cucumber E2E Verification Report | Execution Time: {now_str}</p>
        <p style="color:#8b949e; font-size: 13px;">Engine: Godot 4.3 (GL Compatibility) | Virtual Display: Xvfb :99 | Ruleset: D&D 5e SRD</p>
    </div>

    <div class="stats-bar">
        <div class="stat-box">
            <div class="stat-num total">{total}</div>
            <div class="stat-label">Total Scenarios</div>
        </div>
        <div class="stat-box">
            <div class="stat-num pass">{passed}</div>
            <div class="stat-label">Passed</div>
        </div>
        <div class="stat-box">
            <div class="stat-num {'pass' if failed == 0 else 'fail'}">{failed}</div>
            <div class="stat-label">Failed</div>
        </div>
    </div>

    <div style="max-width: 1100px; margin: 0 auto;">
        {cards_html}
    </div>
</body>
</html>
"""
    with open(output_file, "w", encoding="utf-8") as f:
        f.write(full_html)
    print(f"✔ [HTML Report] Generated interactive report with video & telemetry: {output_file}")

def main():
    os.makedirs(REPORTS_DIR, exist_ok=True)
    out_file = os.path.join(REPORTS_DIR, "index.html")
    results = parse_features()
    generate_html(results, out_file)

if __name__ == "__main__":
    main()
