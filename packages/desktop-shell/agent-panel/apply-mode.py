#!/usr/bin/env python3
"""
apply-mode.py — reads the active mode from settings.json, rewrites tint2rc
launcher entries, and restarts tint2. Called by the Agent Control Panel on
mode switch.
"""
import json, re, os, pathlib, subprocess, time

SETTINGS = pathlib.Path.home() / ".config/robos/settings.json"
TINT2RC  = pathlib.Path.home() / ".config/tint2/tint2rc"

APP_REGISTRY = {
    "agent-panel":          "/usr/local/share/applications/agent-panel.desktop",
    "tilix":                "/usr/share/applications/com.gexperts.Tilix.desktop",
    "code":                 "/usr/share/applications/code.desktop",
    "robos-chrome":         "/usr/local/share/applications/robos-chrome.desktop",
    "copilot-cli":          "/usr/local/share/applications/copilot-cli.desktop",
    "gnome-system-monitor": "/usr/local/share/applications/robos-sysmon.desktop",
    "gnome-sysmon":         "/usr/local/share/applications/robos-gnome-sysmon.desktop",
}
DEFAULT_APPS = ["agent-panel", "tilix", "code", "robos-chrome"]


def get_mode_apps():
    try:
        s = json.loads(SETTINGS.read_text())
        active_id = s.get("active_mode", "")
        mode = next((m for m in s.get("modes", []) if m["id"] == active_id), None)
        return mode["apps"] if mode else DEFAULT_APPS
    except Exception:
        return DEFAULT_APPS


apps = get_mode_apps()
desktops = [APP_REGISTRY[a] for a in apps if a in APP_REGISTRY]
launcher_lines = "".join(f"launcher_item_app = {d}\n" for d in desktops)

content = TINT2RC.read_text()
content = re.sub(r"(launcher_item_app = [^\n]+\n)+", launcher_lines, content)
TINT2RC.write_text(content)

# Kill tint2 and relaunch with DISPLAY set
result = subprocess.run(["ps", "aux"], capture_output=True, text=True)
for line in result.stdout.splitlines():
    if "tint2" in line and "grep" not in line and "apply-mode" not in line:
        pid = int(line.split()[1])
        os.kill(pid, 9)
        break
time.sleep(0.8)
env = {**os.environ, "DISPLAY": ":0", "XAUTHORITY": str(pathlib.Path.home() / ".Xauthority")}
subprocess.Popen(["tint2", "-c", str(TINT2RC)], env=env,
                 stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
print(f"Mode applied — apps: {apps}")
