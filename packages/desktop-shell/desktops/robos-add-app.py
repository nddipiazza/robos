#!/usr/bin/env python3
"""robos-add-app — register a new application into the RobOS app registry.

Usage (for Copilot CLI or any agent):
  robos-add-app --label "My Tool" --desktop /usr/share/applications/mytool.desktop
  robos-add-app --label "My Tool" --exec /usr/bin/mytool [--icon icon-name] [--id myapp]
  robos-add-app --list
  robos-add-app --remove myapp-id

When --exec is given instead of --desktop, a .desktop file is auto-generated at
/usr/local/share/applications/<id>.desktop before registering.
"""

import argparse, json, pathlib, sys, subprocess, uuid, os

SETTINGS_FILE  = pathlib.Path.home() / ".config" / "robos" / "settings.json"
DESKTOP_DIR    = pathlib.Path("/usr/local/share/applications")

def load():
    try:
        return json.loads(SETTINGS_FILE.read_text())
    except Exception:
        return {}

def save(s):
    SETTINGS_FILE.parent.mkdir(parents=True, exist_ok=True)
    SETTINGS_FILE.write_text(json.dumps(s, indent=2))

def list_apps(s):
    apps = s.get("apps", [])
    if not apps:
        print("No apps registered.")
        return
    w = max(len(a.get("label","")) for a in apps)
    print(f"{'ID':<20} {'Label':<{w+2}} Desktop")
    print("-" * 80)
    for a in apps:
        print(f"{a.get('id',''):<20} {a.get('label',''):<{w+2}} {a.get('desktop','')}")

def make_desktop(app_id, label, exec_cmd, icon):
    content = f"""[Desktop Entry]
Name={label}
Exec={exec_cmd}
Icon={icon or 'application-x-executable'}
Type=Application
Categories=Utility;
StartupNotify=false
"""
    desk_path = DESKTOP_DIR / f"{app_id}.desktop"
    try:
        desk_path.parent.mkdir(parents=True, exist_ok=True)
        desk_path.write_text(content)
    except PermissionError:
        # write via sudo
        import tempfile
        with tempfile.NamedTemporaryFile("w", suffix=".desktop", delete=False) as tf:
            tf.write(content); tmp = tf.name
        subprocess.run(["sudo", "cp", tmp, str(desk_path)], check=True)
        subprocess.run(["sudo", "chmod", "644", str(desk_path)], check=True)
        os.unlink(tmp)
    return str(desk_path)

def main():
    p = argparse.ArgumentParser(description="Register apps into RobOS")
    p.add_argument("--label",   help="Display name (required to add)")
    p.add_argument("--desktop", help="Path to existing .desktop file")
    p.add_argument("--exec",    help="Executable path (auto-creates .desktop)")
    p.add_argument("--icon",    help="Icon name or path (optional)")
    p.add_argument("--id",      help="App ID (auto-generated if omitted)")
    p.add_argument("--remove",  metavar="ID", help="Remove app by ID")
    p.add_argument("--list",    action="store_true", help="List registered apps")
    args = p.parse_args()

    s = load()
    if "apps" not in s:
        s["apps"] = []

    if args.list:
        list_apps(s); return

    if args.remove:
        before = len(s["apps"])
        s["apps"] = [a for a in s["apps"] if a.get("id") != args.remove]
        if len(s["apps"]) < before:
            save(s); print(f"Removed app '{args.remove}'")
        else:
            print(f"No app found with id '{args.remove}'", file=sys.stderr); sys.exit(1)
        return

    # ── Add / update ──────────────────────────────────────────────────────────
    if not args.label:
        p.error("--label is required when adding an app")

    app_id = args.id or args.label.lower().replace(" ", "-")

    if args.exec and not args.desktop:
        desktop_path = make_desktop(app_id, args.label, args.exec, args.icon)
        print(f"Created .desktop at {desktop_path}")
    elif args.desktop:
        desktop_path = args.desktop
    else:
        p.error("Provide --desktop <path> or --exec <cmd>")

    # check for duplicate id
    existing = next((a for a in s["apps"] if a.get("id") == app_id), None)
    if existing:
        existing["label"]   = args.label
        existing["desktop"] = desktop_path
        if args.icon: existing["icon"] = args.icon
        save(s)
        print(f"Updated app '{app_id}': {args.label}")
    else:
        s["apps"].append({
            "id":      app_id,
            "label":   args.label,
            "desktop": desktop_path,
            **({"icon": args.icon} if args.icon else {}),
        })
        save(s)
        print(f"Registered app '{app_id}': {args.label} → {desktop_path}")

if __name__ == "__main__":
    main()
