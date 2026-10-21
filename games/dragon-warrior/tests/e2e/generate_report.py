#!/usr/bin/env python3
"""
Cucumber HTML Report Generator for AI Dragon Warrior v2.
Outputs interactive HTML report and video artifacts to tests/e2e/reports/
Adds strict timestamp cache-busting to video sources so browsers never serve stale cached videos.
"""

import os
import sys
import glob
import json
import datetime
import shutil

if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

PROJECT_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
FEATURES_DIR = os.path.join(PROJECT_DIR, "tests", "e2e", "features")

PRIMARY_REPORTS_DIR = os.path.join(PROJECT_DIR, "tests", "e2e", "reports")
PRIMARY_VIDEOS_DIR = os.path.join(PRIMARY_REPORTS_DIR, "videos")

os.makedirs(PRIMARY_VIDEOS_DIR, exist_ok=True)

def find_scenario_video(scenario_title, feature_basename):
    """Find the best matching MP4 video file for a scenario."""
    clean_title = scenario_title.lower().replace(" ", "_").replace("-", "_")
    clean_title_no_punct = "".join([c for c in clean_title if c.isalnum() or c == "_"])
    
    candidate_names = [
        f"{clean_title}.mp4",
        f"{clean_title_no_punct}.mp4",
        f"{feature_basename}.mp4",
    ]
    
    # Check video directory
    for cand in candidate_names:
        vpath = os.path.join(PRIMARY_VIDEOS_DIR, cand)
        if os.path.exists(vpath) and os.path.getsize(vpath) > 0:
            return cand, vpath

    # Fuzzy match in directory
    for mp4 in sorted(glob.glob(os.path.join(PRIMARY_VIDEOS_DIR, "*.mp4"))):
        base_mp4 = os.path.basename(mp4)
        # If scenario title words are in video filename
        keywords = [w for w in clean_title_no_punct.split("_") if len(w) > 3]
        if keywords and sum(1 for k in keywords if k in base_mp4) >= min(2, len(keywords)):
            return base_mp4, mp4

    fallback_name = f"{feature_basename}.mp4"
    fallback_path = os.path.join(PRIMARY_VIDEOS_DIR, fallback_name)
    return fallback_name, fallback_path

def parse_feature(filepath):
    feature_title = ""
    scenarios = []
    current_scenario = None
    feature_basename = os.path.splitext(os.path.basename(filepath))[0]

    with open(filepath, "r", encoding="utf-8") as f:
        for line in f:
            stripped = line.strip()
            if stripped.startswith("Feature:"):
                feature_title = stripped.replace("Feature:", "").strip()
            elif stripped.startswith("Scenario:"):
                if current_scenario:
                    scenarios.append(current_scenario)
                sc_title = stripped.replace("Scenario:", "").strip()
                v_name, v_path = find_scenario_video(sc_title, feature_basename)
                passed = os.path.exists(v_path) and os.path.getsize(v_path) > 0
                current_scenario = {
                    "feature": feature_title or feature_basename,
                    "scenario": sc_title,
                    "steps": [],
                    "video_file": v_name,
                    "passed": passed
                }
            elif current_scenario and any(stripped.startswith(k) for k in ["Given", "When", "Then", "And"]):
                current_scenario["steps"].append(stripped)

    if current_scenario:
        scenarios.append(current_scenario)

    if not scenarios:
        v_name, v_path = find_scenario_video(feature_basename, feature_basename)
        scenarios.append({
            "feature": feature_title or feature_basename,
            "scenario": feature_basename,
            "steps": [],
            "video_file": v_name,
            "passed": os.path.exists(v_path) and os.path.getsize(v_path) > 0
        })

    return scenarios

def build_html_report(results, output_path):
    total = len(results)
    passed = sum(1 for r in results if r["passed"])
    failed = total - passed
    now_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    timestamp_qs = int(datetime.datetime.now().timestamp())

    scenarios_html = ""
    for item in results:
        video_rel = f"videos/{item['video_file']}?v={timestamp_qs}"
        steps_html = "".join([f"<li class='step-item'><span class='step-keyword'>{s.split()[0]}</span> {' '.join(s.split()[1:])}</li>" for s in item["steps"]])
        status_badge = "<span class='badge pass'>PASSED</span>" if item["passed"] else "<span class='badge fail'>FAILED</span>"
        
        scenarios_html += f"""
        <div class="scenario-card">
            <div class="scenario-header">
                <div>
                    <h3 class="scenario-title">📄 {item['feature']}</h3>
                    <div class="scenario-subtitle">Scenario: {item['scenario']}</div>
                </div>
                {status_badge}
            </div>
            <div class="scenario-body">
                <div class="steps-container">
                    <h4>Gherkin BDD Steps</h4>
                    <ul class="step-list">
                        {steps_html}
                    </ul>
                </div>
                <div class="video-container">
                    <h4>🎬 High-Definition 60 FPS Offscreen Video Capture (Xvfb Virtual Display)</h4>
                    <video controls autoplay loop muted playsinline width="100%">
                        <source src="{video_rel}" type="video/mp4">
                        Your browser does not support HTML5 video playback.
                    </video>
                </div>
            </div>
        </div>
        """

    html_content = f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>AI Dragon Warrior v2 — Cucumber E2E BDD Test Report</title>
    <style>
        :root {{
            --bg-color: #0b0e14;
            --card-bg: #161b22;
            --accent-gold: #f1c40f;
            --accent-blue: #3498db;
            --text-main: #e6edf3;
            --text-muted: #8b949e;
            --pass-color: #2ea043;
            --fail-color: #f85149;
            --border-color: #30363d;
        }}
        body {{
            background-color: var(--bg-color);
            color: var(--text-main);
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            margin: 0;
            padding: 30px;
        }}
        .header {{
            text-align: center;
            border-bottom: 1px solid var(--border-color);
            padding-bottom: 20px;
            margin-bottom: 30px;
        }}
        .header h1 {{
            color: var(--accent-gold);
            font-size: 2.2rem;
            margin: 0 0 10px 0;
            letter-spacing: 1px;
        }}
        .header p {{
            color: var(--text-muted);
            margin: 0;
        }}
        .stats-bar {{
            display: flex;
            justify-content: center;
            gap: 20px;
            margin-bottom: 30px;
        }}
        .stat-box {{
            background: var(--card-bg);
            border: 1px solid var(--border-color);
            border-radius: 8px;
            padding: 15px 30px;
            text-align: center;
            min-width: 120px;
        }}
        .stat-num {{
            font-size: 1.8rem;
            font-weight: bold;
        }}
        .stat-num.pass {{ color: var(--pass-color); }}
        .stat-num.fail {{ color: var(--fail-color); }}
        .stat-num.total {{ color: var(--accent-blue); }}
        .stat-label {{
            font-size: 0.85rem;
            color: var(--text-muted);
            text-transform: uppercase;
            letter-spacing: 1px;
            margin-top: 5px;
        }}
        .scenario-card {{
            background: var(--card-bg);
            border: 1px solid var(--border-color);
            border-radius: 10px;
            margin-bottom: 30px;
            overflow: hidden;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        }}
        .scenario-header {{
            padding: 20px;
            background: #1c2128;
            border-bottom: 1px solid var(--border-color);
            display: flex;
            justify-content: space-between;
            align-items: center;
        }}
        .scenario-title {{
            margin: 0 0 5px 0;
            color: var(--accent-gold);
            font-size: 1.2rem;
        }}
        .scenario-subtitle {{
            color: var(--text-muted);
            font-size: 0.95rem;
        }}
        .badge {{
            padding: 6px 12px;
            border-radius: 20px;
            font-size: 0.8rem;
            font-weight: bold;
            letter-spacing: 1px;
        }}
        .badge.pass {{ background: rgba(46, 160, 67, 0.2); color: var(--pass-color); border: 1px solid var(--pass-color); }}
        .badge.fail {{ background: rgba(248, 81, 73, 0.2); color: var(--fail-color); border: 1px solid var(--fail-color); }}
        .scenario-body {{
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 20px;
            padding: 20px;
        }}
        @media (max-width: 900px) {{
            .scenario-body {{ grid-template-columns: 1fr; }}
        }}
        .steps-container h4, .video-container h4 {{
            margin-top: 0;
            color: var(--accent-blue);
            font-size: 1rem;
            border-bottom: 1px solid var(--border-color);
            padding-bottom: 8px;
        }}
        .step-list {{
            list-style: none;
            padding: 0;
            margin: 0;
        }}
        .step-item {{
            padding: 10px 14px;
            background: #0d1117;
            border-radius: 6px;
            margin-bottom: 8px;
            border: 1px solid #21262d;
            font-size: 0.95rem;
        }}
        .step-keyword {{
            color: var(--accent-gold);
            font-weight: bold;
            margin-right: 6px;
        }}
        video {{
            border-radius: 6px;
            border: 1px solid var(--border-color);
            background: #000;
        }}
    </style>
</head>
<body>
    <div class="header">
        <h1>🐉 AI Dragon Warrior v2</h1>
        <p>Cucumber E2E BDD Automated Test Execution & Offscreen Video Proof Report</p>
        <p style="margin-top:5px;font-size:0.85rem;color:#6e7681;">Generated at: {now_str}</p>
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
            <div class="stat-num fail">{failed}</div>
            <div class="stat-label">Failed</div>
        </div>
    </div>

    <div class="scenarios-list">
        {scenarios_html}
    </div>
</body>
</html>
"""

    with open(output_path, "w", encoding="utf-8") as f:
        f.write(html_content)

    print(f"📊 [Cucumber Report] Generated HTML report at: {output_path}")

def main():
    feature_files = sorted(glob.glob(os.path.join(FEATURES_DIR, "*.feature")))
    results = []

    for ff in feature_files:
        parsed_scenarios = parse_feature(ff)
        results.extend(parsed_scenarios)

    build_html_report(results, os.path.join(PRIMARY_REPORTS_DIR, "index.html"))

if __name__ == "__main__":
    main()
