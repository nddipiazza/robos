#!/usr/bin/env python3
"""RobOS Control Panel - left-tree navigation, right editor pane"""

import os
os.environ["GTK_CSD"] = "0"          # must be set before GTK is initialised

import gi, subprocess, threading, json, pathlib, uuid
gi.require_version('Gtk', '3.0')
from gi.repository import Gtk, Gdk, GLib

APP_VERSION    = "0.1.0"
SETTINGS_FILE  = pathlib.Path.home() / ".config" / "robos" / "settings.json"
APPLY_MODE_BIN = "/usr/local/share/robos/apply-mode.py"

# -- App registry for taskbar launchers ────────────────────────────────────────
APP_REGISTRY = {
    "robos-applications":  {"label": "RobOS Software Registry","desktop": "/usr/local/share/applications/robos-applications.desktop"},
    "agents-manager":      {"label": "RobOS Agents",     "desktop": "/usr/local/share/applications/agents-manager.desktop"},
    "tilix":               {"label": "Terminal",        "desktop": "/usr/share/applications/com.gexperts.Tilix.desktop"},
    "code":                {"label": "VS Code",         "desktop": "/usr/share/applications/code.desktop"},
    "robos-chrome":        {"label": "Chrome",          "desktop": "/usr/local/share/applications/robos-chrome.desktop"},
    "copilot-cli":         {"label": "Copilot CLI",     "desktop": "/usr/local/share/applications/copilot-cli.desktop"},
    "gnome-system-monitor":{"label": "System Monitor",  "desktop": "/usr/local/share/applications/robos-sysmon.desktop"},
    "gnome-sysmon":        {"label": "GNOME Sys Monitor","desktop": "/usr/local/share/applications/robos-gnome-sysmon.desktop"},
    "context-manager":     {"label": "Context Manager",  "desktop": "/usr/local/share/applications/context-manager.desktop"},
}

BUILTIN_MODES = [
    {"id": "dev-plan",      "name": "Developer — Plan Mode",
     "description": "Planning and discovery: read tickets, explore docs, map out approach before coding.",
     "apps": ["agents-manager", "robos-chrome", "tilix"]},
    {"id": "dev-work",      "name": "Developer — Work Ticket",
     "description": "Active development: write code, run tests, use Copilot CLI to move fast on the ticket.",
     "apps": ["agents-manager", "code", "copilot-cli", "tilix", "robos-chrome", "gnome-system-monitor"]},
    {"id": "reviewer-pr",   "name": "Reviewer — Review PR",
     "description": "Pull request review: read diffs, leave comments, check CI, approve or request changes.",
     "apps": ["agents-manager", "robos-chrome", "code", "tilix", "gnome-system-monitor"]},
    {"id": "reviewer-plan", "name": "Reviewer — Review Plan",
     "description": "Review technical plans, architecture proposals, and design docs before work begins.",
     "apps": ["agents-manager", "robos-chrome", "tilix", "gnome-system-monitor"]},
    {"id": "em-metrics",    "name": "Engineering Manager — Metrics",
     "description": "Team health: sprint progress, PR aging, blockers, velocity, daily standup prep.",
     "apps": ["agents-manager", "robos-chrome", "tilix"]},
]

SERVER_TYPE_FIELDS = {
    "github": [
        ("gh_api_url", "API URL",      "https://api.github.com",             False),
        ("gh_org",     "Owner / Org",  "myorg  (blank = all)",               False),
        ("gh_repo",    "Repo filter",  "myrepo  (blank = all in org)",       False),
        ("gh_labels",  "Label filter", "sprint,in-progress  (comma-sep)",    False),
    ],
    "jira": [
        ("jira_url",   "Server URL",   "https://yourcompany.atlassian.net",  False),
        ("jira_user",  "Username",     "user@company.com",                   False),
        ("jira_token", "API Token",    "Atlassian API token",                True),
    ],
    "custom": [
        ("custom_url",   "Server URL", "https://...",                        False),
        ("custom_token", "API Token",  "Token (if required)",                True),
    ],
}

DEFAULT_TASK_SERVERS = [
    {"id": "github-default", "name": "GitHub Issues", "type": "github",
     "gh_api_url": "", "gh_org": "nddipiazza", "gh_repo": "hello-robos", "gh_labels": "",
     "issue_query_prompt": "Show all open GitHub issues in the repo nddipiazza/hello-robos that are assigned to me (nddipiazza). Output each as JSON with fields: id, title, url, state.",
     "issue_fetch_script": "",
     "workspace_setup_script": "",
     "workflow_states": [],
     "issue_types": None,   # None = will be filled with DEFAULT_ISSUE_TYPES on load
     "workflows": None},    # None = will be filled with DEFAULT_WORKFLOWS on load
]

DEFAULT_ISSUE_TYPES = [
    {"id": "bug",     "label": "Bug",     "color": "#d73a4a"},
    {"id": "feature", "label": "Feature", "color": "#0075ca"},
    {"id": "task",    "label": "Task",    "color": "#e4e669"},
]

DEFAULT_WORKFLOWS = [
    {
        "id": "bug-workflow", "name": "Bug Workflow", "type_id": "bug",
        "states": [
            {"id": "not-started",          "label": "Not Started",         "is_initial": True,
             "on_enter_prompt": "Clone the GitHub repo to ~/source/{org}/{repo} if it doesn't exist (gh repo clone {org}/{repo} ~/source/{org}/{repo}). Checkout or create branch issue-{number}. Find the most relevant source file from the issue body and open VS Code there.",
             "on_enter_script": ""},
            {"id": "in-progress",          "label": "In Progress",         "is_initial": False, "on_enter_prompt": "", "on_enter_script": ""},
            {"id": "pr-review",            "label": "PR Review",           "is_initial": False,
             "on_enter_prompt": "In ~/source/{org}/{repo} on branch issue-{number}: run git push -u origin issue-{number}, then gh pr create --title 'Fix #{number}' --body 'Closes #{number}' --repo {org}/{repo}, then open the PR in the browser.",
             "on_enter_script": ""},
            {"id": "additional-testing",   "label": "Additional Testing",  "is_initial": False, "on_enter_prompt": "", "on_enter_script": ""},
            {"id": "done",                 "label": "Done",                "is_initial": False,
             "on_enter_prompt": "Close GitHub issue {number} as completed using gh issue close {number} --repo {org}/{repo}.",
             "on_enter_script": ""},
        ],
        "transitions": [
            {"from": "not-started",       "to": "in-progress"},
            {"from": "in-progress",       "to": "pr-review"},
            {"from": "in-progress",       "to": "additional-testing"},
            {"from": "pr-review",         "to": "additional-testing"},
            {"from": "pr-review",         "to": "done"},
            {"from": "additional-testing","to": "pr-review"},
            {"from": "additional-testing","to": "done"},
        ]
    },
    {
        "id": "feature-workflow", "name": "Feature Workflow", "type_id": "feature",
        "states": [
            {"id": "not-started",  "label": "Not Started",       "is_initial": True,
             "on_enter_prompt": "Clone the GitHub repo to ~/source/{org}/{repo} if it doesn't exist. Checkout or create branch issue-{number}. Open VS Code at the project root.",
             "on_enter_script": ""},
            {"id": "design",       "label": "Design / Planning", "is_initial": False, "on_enter_prompt": "", "on_enter_script": ""},
            {"id": "in-progress",  "label": "In Progress",       "is_initial": False, "on_enter_prompt": "", "on_enter_script": ""},
            {"id": "pr-review",    "label": "PR Review",         "is_initial": False,
             "on_enter_prompt": "Push the current branch and create a PR for issue {number} in repo {org}/{repo}.",
             "on_enter_script": ""},
            {"id": "qa-testing",   "label": "QA / Testing",      "is_initial": False, "on_enter_prompt": "", "on_enter_script": ""},
            {"id": "done",         "label": "Done",               "is_initial": False,
             "on_enter_prompt": "Close GitHub issue {number} as completed using gh issue close {number} --repo {org}/{repo}.",
             "on_enter_script": ""},
        ],
        "transitions": [
            {"from": "not-started", "to": "design"},
            {"from": "not-started", "to": "in-progress"},
            {"from": "design",      "to": "in-progress"},
            {"from": "in-progress", "to": "pr-review"},
            {"from": "pr-review",   "to": "qa-testing"},
            {"from": "pr-review",   "to": "done"},
            {"from": "qa-testing",  "to": "pr-review"},
            {"from": "qa-testing",  "to": "done"},
        ]
    },
]

AGENT_REGISTRY = [
    {"id": "github-copilot", "name": "GitHub Copilot",
     "description": "GitHub Copilot CLI  (gh copilot extension)",
     "login_cmd":        ["tilix", "-e", "sh -c 'gh auth login; echo; read -p \"Press Enter...\" x; exec zsh'"],
     "logout_cmd":       ["gh", "auth", "logout", "--hostname", "github.com"],
     "user_cmd":         ["gh", "api", "user", "--jq", ".login"],
     "version_cmd":      ["sh", "-c", "gh extension list 2>/dev/null | grep -q copilot && echo 'installed' || echo 'not installed'"],
     "host_version_cmd": ["gh", "--version"]},
]

JOBS = []  # no longer used — jobs page reads live processes

# nav tree: (label, icon_name, page_id, [children])
NAV_TREE = [
    ("Jobs",         "system-run",               "jobs",         []),
    ("Ticket Desktops", "user-desktop",          "desktops",     []),
    ("Workspace",    "folder",                   None,           [
        ("Modes",        "preferences-desktop",  "modes",        []),
        ("Apps",         "applications-other",   "apps",         []),
        ("Task Servers", "network-server",        "task_servers", []),
    ]),
    ("Agents",       "preferences-system",       "agents",       []),
    ("Agent Instructions", "text-editor",        "agents_md",    []),
    ("Settings",     "emblem-system",            "settings",     []),
    ("About",        "help-about",               "about",        []),
]

CSS = """
* { background-color: #1a1a2e; color: #e0e0e0; }
window, .background { background-color: #1a1a2e; color: #e0e0e0; box-shadow: none; border-radius: 0; }
decoration { margin: 0; padding: 0; border-radius: 0; box-shadow: none; border: none; }
scrolledwindow, viewport, box, eventbox, grid { background-color: #1a1a2e; color: #e0e0e0; }
separator { background-color: #2a2a4e; min-height: 1px; min-width: 1px; }
label { color: #e0e0e0; background-color: transparent; }
entry { background-color: #0d1117; color: #e0e0e0; border: 1px solid #30363d; border-radius: 4px; padding: 6px 10px; font-size: 11pt; caret-color: #00bcd4; }
entry:focus { border-color: #00bcd4; }
textview, textview text { background-color: #0d1117; color: #e0e0e0; font-size: 10pt; }
textview { border: 1px solid #30363d; border-radius: 4px; padding: 4px; }
button { background-color: #30363d; color: #e0e0e0; border: 1px solid #444; border-radius: 4px; padding: 6px 16px; font-size: 10pt; }
button:hover { background-color: #3a4249; }
checkbutton { background-color: transparent; }
checkbutton label { font-size: 10pt; color: #d0d0e8; }
checkbutton:checked label { color: #00bcd4; }
radiobutton { background-color: transparent; }
radiobutton label { font-size: 10pt; color: #d0d0e8; }
radiobutton:checked label { color: #00bcd4; font-weight: bold; }
combobox, combobox button { background-color: #0d1117; color: #e0e0e0; border: 1px solid #30363d; border-radius: 4px; }
combobox button:hover { background-color: #1a2233; }

/* ── Nav sidebar ── */
.nav-sidebar { background-color: #0d1117; border-right: 1px solid #2a2a4e; }
.nav-header { background-color: #0d1117; padding: 16px 14px 10px 14px; border-bottom: 1px solid #2a2a4e; }
.nav-title { font-size: 13pt; font-weight: bold; color: #00bcd4; background-color: transparent; }
.nav-subtitle { font-size: 8pt; color: #555577; background-color: transparent; }
.nav-row { background-color: transparent; padding: 7px 12px; }
.nav-row:hover { background-color: #16213e; }
.nav-row.selected { background-color: #1a2a4a; border-left: 3px solid #00bcd4; }
.nav-row label { font-size: 10pt; color: #aaaacc; background-color: transparent; }
.nav-row.selected label { color: #e0e0ff; font-weight: bold; }
.nav-parent label { font-size: 9pt; color: #555577; font-weight: bold; }
.nav-child { padding-left: 10px; }

/* ── Content header ── */
.content-header { background-color: #16213e; padding: 16px 24px 12px 24px; border-bottom: 1px solid #2a2a4e; }
.content-title { font-size: 14pt; font-weight: bold; color: #00bcd4; background-color: transparent; }
.content-subtitle { font-size: 9pt; color: #666688; background-color: transparent; margin-top: 2px; }

/* ── Footer ── */
.footer { background-color: #0d1117; padding: 6px 18px; border-top: 1px solid #2a2a4e; }
.footer-hint { font-size: 9pt; color: #333355; background-color: transparent; }
.mode-badge { font-size: 9pt; color: #00bcd4; font-weight: bold; background-color: #0d1a2e; border: 1px solid #00bcd4; border-radius: 4px; padding: 2px 10px; }

/* ── Jobs ── */
.job-row { padding: 10px 18px; border-bottom: 1px solid #20203a; background-color: #1a1a2e; }
.job-row:hover { background-color: #20203a; }
.job-id { font-size: 9pt; color: #555577; min-width: 36px; background-color: transparent; }
.job-desc { font-size: 11pt; color: #d0d0e8; background-color: transparent; }
.job-status { font-size: 9pt; font-weight: bold; padding: 2px 8px; border-radius: 10px; }
.status-pending { background-color: #f0a500; color: #000000; }
.status-running { background-color: #00bcd4; color: #000000; }
.status-done    { background-color: #4caf50; color: #000000; }
.status-failed  { background-color: #f44336; color: #ffffff; }
.status-blocked { background-color: #9c27b0; color: #ffffff; }

/* ── Cards ── */
.card { background-color: #16213e; border-radius: 6px; padding: 16px; margin: 6px 20px 8px 20px; border: 1px solid #2a2a4e; }
.card.active-card { border-color: #00bcd4; }
.card-title { font-size: 11pt; font-weight: bold; color: #e0e0e0; background-color: transparent; }
.card-sub { font-size: 9pt; color: #666688; background-color: transparent; }
.active-badge { font-size: 8pt; font-weight: bold; color: #000; background-color: #00bcd4; border-radius: 4px; padding: 1px 6px; }
.field-label { font-size: 10pt; color: #888888; background-color: transparent; min-width: 120px; }
.section-label { font-size: 10pt; font-weight: bold; color: #00bcd4; background-color: transparent; padding: 14px 20px 6px 20px; }

/* ── Buttons ── */
.save-btn  { background-color: #1565c0; color: #fff; border: none; border-radius: 4px; padding: 6px 20px; font-size: 10pt; }
.save-btn:hover { background-color: #1976d2; }
.apply-btn { background-color: #00695c; color: #fff; border: none; border-radius: 4px; padding: 8px 24px; font-size: 10pt; font-weight: bold; }
.apply-btn:hover { background-color: #00897b; }
.add-btn   { background-color: #1b5e20; color: #fff; border: none; border-radius: 4px; padding: 6px 18px; font-size: 10pt; }
.add-btn:hover { background-color: #2e7d32; }
.del-btn   { background-color: #4a1010; color: #cc4444; border: 1px solid #4a1010; border-radius: 4px; padding: 4px 12px; font-size: 9pt; }
.del-btn:hover { background-color: #6a1515; }
.save-ok   { font-size: 9pt; color: #4caf50; background-color: transparent; }

/* ── Agent cards ── */
.agent-card { background-color: #16213e; border-radius: 6px; padding: 16px; margin: 6px 20px 8px 20px; border: 1px solid #2a2a4e; }
.agent-name { font-size: 12pt; font-weight: bold; color: #e0e0e0; background-color: transparent; }
.agent-desc { font-size: 9pt; color: #666688; background-color: transparent; }
.login-status-ok   { font-size: 10pt; color: #4caf50; font-weight: bold; background-color: transparent; }
.login-status-none { font-size: 10pt; color: #f0a500; background-color: transparent; }
button.login-btn   { background-color: #238636; color: #fff; border: none; border-radius: 4px; padding: 6px 18px; font-size: 10pt; }
button.login-btn:hover  { background-color: #2ea043; }
button.logout-btn  { background-color: #30363d; color: #aaa; border: none; border-radius: 4px; padding: 6px 18px; font-size: 10pt; }

/* ── About ── */
.about-title   { font-size: 15pt; font-weight: bold; color: #00bcd4; background-color: transparent; }
.about-version { font-size: 10pt; color: #888888; background-color: transparent; }
.about-row-label { font-size: 10pt; color: #888888; min-width: 160px; background-color: transparent; }
.about-row-value { font-size: 10pt; color: #d0d0e8; font-family: monospace; background-color: transparent; }
/* ── Agents page ── */
.agents-editor { background-color: #0d0d1a; color: #ccccdd; font-family: monospace; font-size: 10pt; }
/* ── Notebook (task server tabs) ── */
notebook { background-color: #16213e; }
notebook > header { background-color: #0d1117; border-bottom: 1px solid #2a2a4e; }
notebook > header > tabs > tab { background-color: #0d1117; color: #888888; padding: 6px 16px; border: none; border-bottom: 2px solid transparent; }
notebook > header > tabs > tab:checked { color: #00bcd4; border-bottom: 2px solid #00bcd4; background-color: #16213e; font-weight: bold; }
notebook > header > tabs > tab:hover { color: #aaaacc; background-color: #12172a; }
notebook > stack { background-color: #16213e; padding: 12px; }
"""


def run_cmd(args):
    try:
        r = subprocess.run(args, capture_output=True, text=True, timeout=10)
        return r.returncode, r.stdout.strip(), r.stderr.strip()
    except Exception as e:
        return -1, "", str(e)


def _generate_with_llm(prompt_text):
    """Run a prompt through the Copilot CLI agent non-interactively."""
    r = subprocess.run(
        ["gh", "copilot", "--", "-p", prompt_text,
         "--allow-all-tools", "--plain-diff"],
        capture_output=True, text=True, timeout=60
    )
    if r.returncode != 0:
        raise RuntimeError(r.stderr.strip() or "gh copilot failed")
    # Strip session stats footer that copilot adds after a blank line + "Total usage"
    output = r.stdout
    cut = output.find("\nTotal usage")
    if cut >= 0:
        output = output[:cut]
    return output.strip()


def get_logged_in_user(agent):
    code, out, _ = run_cmd(agent["user_cmd"])
    return out if code == 0 and out else None


def get_version(cmd):
    code, out, _ = run_cmd(cmd)
    return out.splitlines()[0] if code == 0 and out else "not installed"


def load_settings():
    try:
        s = json.loads(SETTINGS_FILE.read_text())
    except Exception:
        s = {}
    if "modes"               not in s: s["modes"]               = [dict(m) for m in BUILTIN_MODES]
    if "active_mode"         not in s: s["active_mode"]         = "dev-work"
    if "task_servers"        not in s: s["task_servers"]        = [dict(t) for t in DEFAULT_TASK_SERVERS]
    if "active_task_server"  not in s: s["active_task_server"]  = "github-default"
    if "apps"                not in s: s["apps"]                = [dict(v, id=k) for k, v in APP_REGISTRY.items()]
    # Merge in any new registry apps not yet in saved settings
    existing_ids = {a["id"] for a in s["apps"]}
    for k, v in APP_REGISTRY.items():
        if k not in existing_ids:
            s["apps"].append(dict(v, id=k))
    return s


def save_settings(data):
    SETTINGS_FILE.parent.mkdir(parents=True, exist_ok=True)
    SETTINGS_FILE.write_text(json.dumps(data, indent=2))


def apply_mode_now():
    subprocess.Popen(["python3", APPLY_MODE_BIN],
                     stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


# -----------------------------------------------------------------------------
# Page builders
# -----------------------------------------------------------------------------

def _scroll(child):
    sw = Gtk.ScrolledWindow(hscrollbar_policy=Gtk.PolicyType.NEVER,
                             vscrollbar_policy=Gtk.PolicyType.AUTOMATIC)
    sw.add(child)
    return sw


def _vbox(*args, spacing=0):
    b = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=spacing)
    for w in args:
        b.pack_start(w, False, False, 0)
    return b


def _lbl(text, css_class=None, margin_start=0):
    l = Gtk.Label(label=text, xalign=0)
    if css_class:
        l.get_style_context().add_class(css_class)
    if margin_start:
        l.set_margin_start(margin_start)
    return l


def _section(title):
    l = _lbl(title, "section-label")
    return l


def build_jobs_page():
    """Agent sessions — active Copilot CLI sessions, scheduled tasks, workspace jobs."""
    outer = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=0)

    hdr = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL, spacing=10)
    hdr.set_margin_start(20); hdr.set_margin_top(16); hdr.set_margin_bottom(8); hdr.set_margin_end(20)
    hdr.pack_start(_lbl("Active Agent Sessions", "section-title"), True, True, 0)
    refresh_btn = Gtk.Button(label="↻  Refresh")
    refresh_btn.set_size_request(100, 28)
    hdr.pack_end(refresh_btn, False, False, 0)
    outer.pack_start(hdr, False, False, 0)

    # ── Session list ──────────────────────────────────────────────────────────
    # columns: Type, PID, Started, Status
    store = Gtk.ListStore(str, str, str, str)
    tv = Gtk.TreeView(model=store)
    tv.set_headers_visible(True)

    col_defs = [("Type", 160, False), ("PID", 60, False), ("Started", 90, False), ("Command", 0, True)]
    for i, (title, width, expand) in enumerate(col_defs):
        r = Gtk.CellRendererText()
        r.set_property("foreground", "#ccccdd")
        col = Gtk.TreeViewColumn(title, r, text=i)
        col.set_resizable(True)
        col.set_expand(expand)
        if width:
            col.set_min_width(width)
        tv.append_column(col)

    sw = Gtk.ScrolledWindow()
    sw.set_policy(Gtk.PolicyType.AUTOMATIC, Gtk.PolicyType.AUTOMATIC)
    sw.add(tv)
    sw.set_margin_start(20); sw.set_margin_end(20); sw.set_margin_bottom(8)
    sw.set_size_request(-1, 240)
    outer.pack_start(sw, True, True, 0)

    # Status line
    status_lbl = _lbl("", "card-sub", margin_start=20)
    status_lbl.set_margin_bottom(16)
    outer.pack_start(status_lbl, False, False, 0)

    AGENT_PATTERNS = [
        ("Copilot CLI",    ["gh", "copilot"]),
        ("RobOS Panel",    ["agent_panel"]),
        ("Action",         ["robos-action"]),
        ("Issues Widget",  ["task-widget"]),
        ("Issues Selector",["task-search"]),
        ("Apply Mode",     ["apply-mode"]),
        ("Workspace Build",["robos-build"]),
    ]

    def refresh(_btn=None):
        store.clear()
        try:
            result = subprocess.run(
                ["ps", "axo", "pid,lstart,args", "--no-headers"],
                capture_output=True, text=True, timeout=5
            )
            found = 0
            for line in result.stdout.splitlines():
                parts = line.split(None, 6)
                if len(parts) < 7:
                    continue
                pid = parts[0]
                # lstart is 5 fields: Dow Mon DD HH:MM:SS YYYY
                started = parts[3]   # just HH:MM:SS
                args = parts[6]
                for label, keywords in AGENT_PATTERNS:
                    if all(kw in args for kw in keywords):
                        cmd = args[:60] + "…" if len(args) > 60 else args
                        store.append([label, pid, started, cmd])
                        found += 1
                        break
            GLib.idle_add(lambda: status_lbl.set_text(
                f"{found} session{'s' if found != 1 else ''} running" if found else "No agent sessions running"
            ))
        except Exception as e:
            store.append(["Error", "—", "—", str(e)])

    refresh_btn.connect("clicked", refresh)
    threading.Thread(target=refresh, daemon=True).start()

    def auto_refresh():
        if outer.get_mapped():
            threading.Thread(target=refresh, daemon=True).start()
        return True

    GLib.timeout_add_seconds(5, auto_refresh)
    return outer




def build_modes_page(settings, refresh_footer_cb):
    s = settings
    vbox = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=0)

    # Mode selector
    hdr = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL, spacing=10)
    hdr.set_margin_top(18); hdr.set_margin_bottom(10)
    hdr.set_margin_start(20); hdr.set_margin_end(20)
    hdr.pack_start(_lbl("Active Mode"), False, False, 0)
    combo = Gtk.ComboBoxText()
    combo.set_hexpand(True)
    vbox.pack_start(hdr, False, False, 0)

    sep = Gtk.Separator(); vbox.pack_start(sep, False, False, 0)

    # Editor area
    editor = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=0)
    name_entry   = Gtk.Entry(); name_entry.set_margin_start(20); name_entry.set_margin_end(20)
    desc_view    = Gtk.TextView(); desc_view.set_wrap_mode(Gtk.WrapMode.WORD)
    desc_view.set_margin_start(20); desc_view.set_margin_end(20)
    desc_sw      = Gtk.ScrolledWindow(); desc_sw.set_min_content_height(80)
    desc_sw.set_policy(Gtk.PolicyType.NEVER, Gtk.PolicyType.AUTOMATIC)
    desc_sw.add(desc_view); desc_sw.set_margin_start(20); desc_sw.set_margin_end(20)

    app_checks = {}
    apps_box = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=4)
    apps_box.set_margin_start(20); apps_box.set_margin_end(20); apps_box.set_margin_bottom(10)
    for app_id, app_info in APP_REGISTRY.items():
        cb = Gtk.CheckButton(label=app_info["label"])
        app_checks[app_id] = cb
        apps_box.pack_start(cb, False, False, 0)

    save_ok_lbl = _lbl("", "save-ok"); save_ok_lbl.set_margin_start(20)

    btn_row = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL, spacing=10)
    btn_row.set_margin_start(20); btn_row.set_margin_end(20)
    btn_row.set_margin_top(10); btn_row.set_margin_bottom(10)
    save_btn  = Gtk.Button(label="Save")
    apply_btn = Gtk.Button(label="Save & Apply Mode")
    add_btn   = Gtk.Button(label="+ Add Mode")
    del_btn   = Gtk.Button(label="Delete")
    save_btn.get_style_context().add_class("save-btn")
    apply_btn.get_style_context().add_class("apply-btn")
    add_btn.get_style_context().add_class("add-btn")
    del_btn.get_style_context().add_class("del-btn")
    btn_row.pack_start(save_btn, False, False, 0)
    btn_row.pack_start(apply_btn, False, False, 0)
    btn_row.pack_start(add_btn, False, False, 0)
    btn_row.pack_end(del_btn, False, False, 0)

    editor.pack_start(_lbl("Mode Name", "field-label"), False, False, 2)
    editor.pack_start(name_entry, False, False, 4)
    editor.pack_start(_lbl("Description (AI agent prompt)", "field-label"), False, False, 2)
    editor.pack_start(desc_sw, False, False, 4)
    editor.pack_start(_lbl("Taskbar Apps", "field-label"), False, False, 2)
    editor.pack_start(apps_box, False, False, 0)
    editor.pack_start(save_ok_lbl, False, False, 0)
    editor.pack_start(btn_row, False, False, 0)

    hdr.pack_start(combo, True, True, 0)

    def _load_mode(mode):
        name_entry.set_text(mode.get("name", ""))
        buf = desc_view.get_buffer()
        buf.set_text(mode.get("description", ""))
        active_apps = mode.get("apps", [])
        for app_id, cb in app_checks.items():
            cb.set_active(app_id in active_apps)
        is_builtin = any(m["id"] == mode["id"] for m in BUILTIN_MODES)
        del_btn.set_sensitive(not is_builtin)

    def _save_current():
        idx = combo.get_active()
        if idx < 0: return
        mode = s["modes"][idx]
        mode["name"] = name_entry.get_text().strip()
        buf = desc_view.get_buffer()
        mode["description"] = buf.get_text(buf.get_start_iter(), buf.get_end_iter(), False)
        mode["apps"] = [aid for aid, cb in app_checks.items() if cb.get_active()]
        save_settings(s)
        save_ok_lbl.set_text("✓ Saved")
        GLib.timeout_add(2000, lambda: save_ok_lbl.set_text("") or False)

    def on_combo_changed(_):
        idx = combo.get_active()
        if idx >= 0:
            s["active_mode"] = s["modes"][idx]["id"]
            _load_mode(s["modes"][idx])

    def on_save(_):
        _save_current()

    def on_apply(_):
        _save_current()
        apply_mode_now()
        if refresh_footer_cb:
            refresh_footer_cb()

    def on_add(_):
        new_mode = {"id": str(uuid.uuid4())[:8], "name": "New Mode",
                    "description": "", "apps": ["agent-panel"]}
        s["modes"].append(new_mode)
        combo.append_text(new_mode["name"])
        combo.set_active(len(s["modes"]) - 1)

    def on_delete(_):
        idx = combo.get_active()
        if idx < 0: return
        mode = s["modes"][idx]
        if any(m["id"] == mode["id"] for m in BUILTIN_MODES): return
        s["modes"].pop(idx)
        combo.remove(idx)
        save_settings(s)
        new_idx = min(idx, len(s["modes"]) - 1)
        combo.set_active(new_idx)

    combo.connect("changed", on_combo_changed)
    save_btn.connect("clicked", on_save)
    apply_btn.connect("clicked", on_apply)
    add_btn.connect("clicked", on_add)
    del_btn.connect("clicked", on_delete)

    for mode in s["modes"]:
        combo.append_text(mode["name"])
    active_idx = next((i for i, m in enumerate(s["modes"]) if m["id"] == s.get("active_mode")), 0)
    combo.set_active(active_idx)

    outer = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=0)
    outer.pack_start(vbox, False, False, 0)
    outer.pack_start(editor, False, False, 0)
    return _scroll(outer)


def build_apps_page(settings):
    """2-pane properties editor: left = searchable list, right = form for selected app."""
    s = settings

    # ── outer paned layout ────────────────────────────────────────────────────
    outer = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=0)
    outer.pack_start(_section("Registered Applications"), False, False, 0)

    # toolbar
    tb = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL, spacing=6)
    tb.set_margin_start(14); tb.set_margin_end(14); tb.set_margin_bottom(6)
    search_e = Gtk.SearchEntry()
    search_e.set_placeholder_text("Filter apps…")
    search_e.set_hexpand(True)
    add_b   = Gtk.Button(label="+ New App"); add_b.get_style_context().add_class("add-btn")
    del_b   = Gtk.Button(label="Remove");   del_b.get_style_context().add_class("del-btn")
    tb.pack_start(search_e, True, True, 0)
    tb.pack_start(add_b,   False, False, 0)
    tb.pack_start(del_b,   False, False, 0)
    outer.pack_start(tb, False, False, 0)

    paned = Gtk.Paned(orientation=Gtk.Orientation.HORIZONTAL)
    paned.set_wide_handle(False)
    paned.set_position(230)

    # ── LEFT: ListStore + TreeView ────────────────────────────────────────────
    # columns: display label, app id
    store = Gtk.ListStore(str, str)
    tv    = Gtk.TreeView(model=store)
    tv.set_headers_visible(False)
    tv.set_activate_on_single_click(True)
    col = Gtk.TreeViewColumn("App", Gtk.CellRendererText(), text=0)
    tv.append_column(col)

    left_sw = Gtk.ScrolledWindow()
    left_sw.set_policy(Gtk.PolicyType.NEVER, Gtk.PolicyType.AUTOMATIC)
    left_sw.set_min_content_width(220)
    left_sw.add(tv)
    paned.pack1(left_sw, False, False)

    # ── RIGHT: properties form ────────────────────────────────────────────────
    right_box = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=0)
    right_sw  = Gtk.ScrolledWindow()
    right_sw.set_policy(Gtk.PolicyType.AUTOMATIC, Gtk.PolicyType.AUTOMATIC)
    right_sw.add(right_box)
    paned.pack2(right_sw, True, True)

    # form widgets (populated when selection changes)
    form_title = _lbl("Select an app to edit", "card-title")
    form_title.set_margin_start(16); form_title.set_margin_top(12); form_title.set_margin_bottom(8)
    right_box.pack_start(form_title, False, False, 0)

    def _field_row(label_text):
        row = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL, spacing=10)
        row.set_margin_start(16); row.set_margin_end(16); row.set_margin_bottom(8)
        lbl = _lbl(label_text, "field-label")
        lbl.set_size_request(110, -1)
        e   = Gtk.Entry(); e.set_hexpand(True)
        row.pack_start(lbl, False, False, 0)
        row.pack_start(e,   True,  True,  0)
        right_box.pack_start(row, False, False, 0)
        return e

    id_e    = _field_row("ID")
    label_e = _field_row("Label")
    desk_e  = _field_row(".desktop path")
    icon_e  = _field_row("Icon (optional)")

    # hint about .desktop path
    hint = _lbl("Tip: use 'which myapp' to find the binary, then create a .desktop file in /usr/local/share/applications/", "card-sub")
    hint.set_line_wrap(True); hint.set_margin_start(16); hint.set_margin_end(16); hint.set_margin_bottom(10)
    right_box.pack_start(hint, False, False, 0)

    btn_row = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL, spacing=8)
    btn_row.set_margin_start(16); btn_row.set_margin_end(16); btn_row.set_margin_top(4)
    save_b  = Gtk.Button(label="Save"); save_b.get_style_context().add_class("save-btn")
    status_lbl = _lbl("", "save-ok")
    btn_row.pack_start(save_b,     False, False, 0)
    btn_row.pack_start(status_lbl, False, False, 0)
    right_box.pack_start(btn_row, False, False, 0)

    # track which app is selected
    _sel = {"app": None}

    def _filter_text():
        return search_e.get_text().strip().lower()

    def _rebuild_list():
        store.clear()
        filt = _filter_text()
        for app in s.get("apps", []):
            label = app.get("label", app.get("id", ""))
            if filt and filt not in label.lower() and filt not in app.get("id", "").lower():
                continue
            store.append([label, app.get("id", "")])

    def _load_form(app):
        _sel["app"] = app
        form_title.set_text(app.get("label", "App Properties"))
        id_e.set_text(app.get("id", ""))
        label_e.set_text(app.get("label", ""))
        desk_e.set_text(app.get("desktop", ""))
        icon_e.set_text(app.get("icon", ""))
        status_lbl.set_text("")

    def on_selection_changed(_sel_obj):
        model, it = tv.get_selection().get_selected()
        if it is None:
            return
        app_id = model[it][1]
        app = next((a for a in s.get("apps", []) if a.get("id") == app_id), None)
        if app:
            _load_form(app)

    tv.get_selection().connect("changed", on_selection_changed)

    def on_save(_):
        app = _sel["app"]
        if not app:
            return
        new_id    = id_e.get_text().strip()
        new_label = label_e.get_text().strip()
        new_desk  = desk_e.get_text().strip()
        new_icon  = icon_e.get_text().strip()
        # if ID changed, update list entry
        if new_id and new_id != app.get("id"):
            app["id"] = new_id
        app["label"]   = new_label
        app["desktop"] = new_desk
        if new_icon:
            app["icon"] = new_icon
        save_settings(s)
        _rebuild_list()
        status_lbl.set_text("✓ Saved")
        form_title.set_text(new_label)

    save_b.connect("clicked", on_save)

    def on_add(_):
        new_app = {"id": str(uuid.uuid4())[:8], "label": "New App", "desktop": "", "icon": ""}
        s["apps"].append(new_app)
        save_settings(s)
        _rebuild_list()
        # select the new entry
        for i, row in enumerate(store):
            if row[1] == new_app["id"]:
                tv.get_selection().select_path(Gtk.TreePath(i))
                break
        right_box.show_all()

    def on_del(_):
        app = _sel["app"]
        if not app:
            return
        s["apps"] = [x for x in s["apps"] if x.get("id") != app.get("id")]
        save_settings(s)
        _sel["app"] = None
        form_title.set_text("Select an app to edit")
        id_e.set_text(""); label_e.set_text(""); desk_e.set_text(""); icon_e.set_text("")
        _rebuild_list()

    add_b.connect("clicked", on_add)
    del_b.connect("clicked", on_del)
    search_e.connect("search-changed", lambda _: _rebuild_list())

    _rebuild_list()
    outer.pack_start(paned, True, True, 0)
    outer.show_all()
    return outer


def _build_types_section(card, server, s):
    """Issue Types expander section for a task server card."""
    exp = Gtk.Expander(label="Issue Types")
    exp.set_expanded(False)
    box = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=6)
    box.set_margin_start(12); box.set_margin_end(12); box.set_margin_top(8)

    lb = Gtk.ListBox()
    lb.set_selection_mode(Gtk.SelectionMode.SINGLE)
    sw = Gtk.ScrolledWindow()
    sw.set_policy(Gtk.PolicyType.NEVER, Gtk.PolicyType.AUTOMATIC)
    sw.set_size_request(-1, 110)
    sw.add(lb)
    box.pack_start(sw, False, False, 0)

    def _refresh():
        for ch in list(lb.get_children()): lb.remove(ch)
        for t in server.get("issue_types", []):
            row = Gtk.ListBoxRow()
            hb = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL, spacing=8)
            hb.set_margin_start(8); hb.set_margin_end(8)
            hb.set_margin_top(4); hb.set_margin_bottom(4)
            lbl_w = Gtk.Label(label=t["label"]); lbl_w.set_halign(Gtk.Align.START); lbl_w.set_hexpand(True)
            id_w  = Gtk.Label(label=t["id"]);   id_w.get_style_context().add_class("card-sub")
            hb.pack_start(lbl_w, True, True, 0)
            hb.pack_end(id_w, False, False, 0)
            row.add(hb)
            lb.add(row)
        lb.show_all()

    _refresh()

    btn_row = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL, spacing=8)
    add_btn  = Gtk.Button(label="+ Add");             add_btn.get_style_context().add_class("add-btn")
    rem_btn  = Gtk.Button(label="− Remove");          rem_btn.get_style_context().add_class("del-btn")
    gen_btn  = Gtk.Button(label="✨ Generate with AI"); gen_btn.get_style_context().add_class("apply-btn")
    gen_stat = Gtk.Label(label=""); gen_stat.get_style_context().add_class("card-sub")
    btn_row.pack_start(add_btn, False, False, 0)
    btn_row.pack_start(rem_btn, False, False, 0)
    btn_row.pack_start(gen_btn, False, False, 0)
    btn_row.pack_start(gen_stat, False, False, 0)
    box.pack_start(btn_row, False, False, 0)

    def on_generate_types(_):
        gen_stat.set_text("⏳ Generating…")
        gen_btn.set_sensitive(False)
        def _run():
            import threading, json as _json
            prompt = (
                "Return ONLY a JSON array of software issue types suitable for a developer team. "
                "Each element must have keys: id (lowercase-hyphen slug), label (human name), color (hex). "
                "Include at minimum: bug, feature, task, enhancement, documentation, chore. "
                "Example element: {\"id\": \"bug\", \"label\": \"Bug\", \"color\": \"#d73a4a\"}. "
                "Return raw JSON array only, no markdown, no explanation."
            )
            try:
                raw = _generate_with_llm(prompt)
                import re as _re
                m = _re.search(r'\[.*\]', raw, _re.DOTALL)
                types = _json.loads(m.group(0)) if m else []
                if not types:
                    GLib.idle_add(lambda: gen_stat.set_text("⚠ No types generated"))
                    GLib.idle_add(lambda: gen_btn.set_sensitive(True))
                    return
                import copy
                server["issue_types"] = types
                # Add missing workflow stubs for each new type
                wfs = server.setdefault("workflows", [])
                for t in types:
                    if not any(w["type_id"] == t["id"] for w in wfs):
                        wfs.append({"id": f"{t['id']}-workflow", "name": f"{t['label']} Workflow",
                                    "type_id": t["id"], "states": [], "transitions": []})
                save_settings(s)
                GLib.idle_add(_refresh)
                GLib.idle_add(lambda: gen_stat.set_text(f"✓ {len(types)} types generated"))
            except Exception as e:
                GLib.idle_add(lambda: gen_stat.set_text(f"⚠ {e}"))
            GLib.idle_add(lambda: gen_btn.set_sensitive(True))
        import threading
        threading.Thread(target=_run, daemon=True).start()
    gen_btn.connect("clicked", on_generate_types)

    def on_add(_):
        dlg = Gtk.Dialog(title="Add Issue Type", modal=True)
        dlg.add_button("Cancel", Gtk.ResponseType.CANCEL)
        dlg.add_button("Add", Gtk.ResponseType.OK)
        ca = dlg.get_content_area()
        ca.set_spacing(6); ca.set_margin_start(12); ca.set_margin_end(12)
        ca.set_margin_top(12); ca.set_margin_bottom(12)
        id_e  = Gtk.Entry(); id_e.set_placeholder_text("id (e.g. task)")
        lbl_e = Gtk.Entry(); lbl_e.set_placeholder_text("Label (e.g. Task)")
        for w in [Gtk.Label(label="ID:"), id_e, Gtk.Label(label="Label:"), lbl_e]: ca.add(w)
        ca.show_all()
        if dlg.run() == Gtk.ResponseType.OK:
            new_id = id_e.get_text().strip(); new_lbl = lbl_e.get_text().strip()
            if new_id and new_lbl:
                server.setdefault("issue_types", []).append({"id": new_id, "label": new_lbl, "color": "#888888"})
                wfs = server.setdefault("workflows", [])
                if not any(w["type_id"] == new_id for w in wfs):
                    wfs.append({"id": f"{new_id}-workflow", "name": f"{new_lbl} Workflow",
                                "type_id": new_id, "states": [], "transitions": []})
                save_settings(s); _refresh()
        dlg.destroy()

    def on_rem(_):
        row = lb.get_selected_row()
        if row is None: return
        idx = row.get_index()
        types = server.get("issue_types", [])
        if 0 <= idx < len(types): del types[idx]
        save_settings(s); _refresh()

    add_btn.connect("clicked", on_add)
    rem_btn.connect("clicked", on_rem)
    exp.add(box)
    card.pack_start(exp, False, False, 0)


def _build_workflows_section(card, server, s):
    """Workflows expander: per-type ordered states with on_enter prompt + script editor."""
    import re as _re2
    exp = Gtk.Expander(label="Workflows")
    exp.set_expanded(True)
    outer = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=8)
    outer.set_margin_start(12); outer.set_margin_end(12); outer.set_margin_top(8)

    if not server.get("workflows"):
        import copy
        server["workflows"] = copy.deepcopy(DEFAULT_WORKFLOWS)

    # Type selector
    type_row = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL, spacing=8)
    type_row.pack_start(_lbl("Type", "field-label"), False, False, 0)
    type_combo = Gtk.ComboBoxText()
    type_combo.append_text("(select type)")
    types = server.get("issue_types") or DEFAULT_ISSUE_TYPES
    for t in types:
        type_combo.append_text(t["label"])
    type_combo.set_active(1 if types else 0)
    type_row.pack_start(type_combo, False, False, 0)
    outer.pack_start(type_row, False, False, 0)

    states_container = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=6)
    outer.pack_start(states_container, False, False, 0)

    def _get_wf(type_id):
        for w in server.get("workflows", []):
            if w["type_id"] == type_id: return w
        return None

    def _rebuild_states(workflow):
        for ch in list(states_container.get_children()): states_container.remove(ch)
        if workflow is None: return
        states = workflow.setdefault("states", [])

        ctrl_row = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL, spacing=6)
        ctrl_row.pack_start(_lbl("States", "field-label"), False, False, 0)
        add_s = Gtk.Button(label="+ Add");     add_s.get_style_context().add_class("add-btn")
        rem_s = Gtk.Button(label="− Remove");  rem_s.get_style_context().add_class("del-btn")
        up_b  = Gtk.Button(label="↑")
        dn_b  = Gtk.Button(label="↓")
        ctrl_row.pack_end(dn_b,  False, False, 0)
        ctrl_row.pack_end(up_b,  False, False, 0)
        ctrl_row.pack_end(rem_s, False, False, 0)
        ctrl_row.pack_end(add_s, False, False, 0)
        states_container.pack_start(ctrl_row, False, False, 0)

        slb = Gtk.ListBox()
        slb.set_selection_mode(Gtk.SelectionMode.SINGLE)
        ssw = Gtk.ScrolledWindow()
        ssw.set_policy(Gtk.PolicyType.NEVER, Gtk.PolicyType.AUTOMATIC)
        ssw.set_size_request(-1, 150)
        ssw.add(slb)
        states_container.pack_start(ssw, False, False, 0)

        editor_box = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=6)
        editor_box.set_margin_top(4)
        states_container.pack_start(editor_box, False, False, 0)

        def _fill_slb():
            for ch in list(slb.get_children()): slb.remove(ch)
            for st in states:
                row = Gtk.ListBoxRow()
                hb = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL, spacing=6)
                hb.set_margin_start(8); hb.set_margin_end(8)
                hb.set_margin_top(3); hb.set_margin_bottom(3)
                lw = Gtk.Label(label=st["label"]); lw.set_halign(Gtk.Align.START); lw.set_hexpand(True)
                hb.pack_start(lw, True, True, 0)
                if st.get("is_initial"):
                    b = _lbl("initial", "active-badge"); hb.pack_end(b, False, False, 0)
                if st.get("on_enter_script"):
                    b2 = _lbl("⚡", "save-ok"); hb.pack_end(b2, False, False, 0)
                row.add(hb)
                slb.add(row)
            slb.show_all()

        def _build_editor(state):
            for ch in list(editor_box.get_children()): editor_box.remove(ch)
            if state is None: editor_box.show_all(); return
            editor_box.pack_start(Gtk.Separator(orientation=Gtk.Orientation.HORIZONTAL), False, False, 4)
            editor_box.pack_start(_lbl(f"Edit: {state['label']}", "section-label"), False, False, 0)

            lr = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL, spacing=8)
            lr.pack_start(_lbl("Label", "field-label"), False, False, 0)
            lbl_e = Gtk.Entry(); lbl_e.set_text(state.get("label", "")); lbl_e.set_hexpand(True)
            lr.pack_start(lbl_e, True, True, 0)
            editor_box.pack_start(lr, False, False, 0)

            ir = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL, spacing=8)
            ir.pack_start(_lbl("Is Initial State", "field-label"), False, False, 0)
            init_chk = Gtk.CheckButton(); init_chk.set_active(state.get("is_initial", False))
            ir.pack_start(init_chk, False, False, 0)
            editor_box.pack_start(ir, False, False, 0)

            editor_box.pack_start(_lbl("On Enter Prompt", "field-label"), False, False, 4)
            hint = _lbl("Describe what happens when this state is entered. The AI agent generates the script.", "card-sub")
            hint.set_line_wrap(True); editor_box.pack_start(hint, False, False, 0)

            ptv = Gtk.TextView(); ptv.set_wrap_mode(Gtk.WrapMode.WORD)
            ptv.get_style_context().add_class("agents-editor"); ptv.set_size_request(-1, 60)
            pbuf = ptv.get_buffer(); pbuf.set_text(state.get("on_enter_prompt", ""))
            psw = Gtk.ScrolledWindow(); psw.set_policy(Gtk.PolicyType.NEVER, Gtk.PolicyType.AUTOMATIC)
            psw.add(ptv); editor_box.pack_start(psw, False, False, 0)

            br = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL, spacing=8); br.set_margin_top(4)
            sv_btn = Gtk.Button(label="💾 Save"); sv_btn.get_style_context().add_class("save-btn")
            gn_btn = Gtk.Button(label="⚡ Generate Script"); gn_btn.get_style_context().add_class("apply-btn")
            gn_st  = _lbl("", "save-ok")
            br.pack_start(sv_btn, False, False, 0); br.pack_start(gn_btn, False, False, 0); br.pack_start(gn_st, False, False, 0)
            editor_box.pack_start(br, False, False, 0)

            scr_exp = Gtk.Expander(label="Script (view/edit)")
            stv = Gtk.TextView(); stv.set_wrap_mode(Gtk.WrapMode.NONE)
            stv.get_style_context().add_class("agents-editor"); stv.set_size_request(-1, 110)
            sbuf = stv.get_buffer(); sbuf.set_text(state.get("on_enter_script", ""))
            stv_sw = Gtk.ScrolledWindow(); stv_sw.set_policy(Gtk.PolicyType.AUTOMATIC, Gtk.PolicyType.AUTOMATIC)
            stv_sw.add(stv); scr_exp.add(stv_sw)
            editor_box.pack_start(scr_exp, False, False, 0)

            def do_save(_):
                s0, e0 = pbuf.get_bounds()
                ss0, se0 = sbuf.get_bounds()
                state["label"]           = lbl_e.get_text().strip()
                state["is_initial"]      = init_chk.get_active()
                state["on_enter_prompt"] = pbuf.get_text(s0, e0, True).strip()
                state["on_enter_script"] = sbuf.get_text(ss0, se0, True).strip()
                if state["is_initial"]:
                    for st2 in states:
                        if st2 is not state: st2["is_initial"] = False
                save_settings(s); _fill_slb()
                gn_st.set_text("✓ Saved")

            def do_gen(_):
                s0, e0 = pbuf.get_bounds()
                ptxt = pbuf.get_text(s0, e0, True).strip()
                if not ptxt: gn_st.set_text("⚠ Enter a prompt first"); return
                state["on_enter_prompt"] = ptxt; save_settings(s)
                gn_st.set_text("Generating…")
                org  = server.get("gh_org", "")
                repo = server.get("gh_repo", "")
                full_prompt = (
                    f"Write a self-contained Python 3 script that does the following when a developer "
                    f"transitions an issue into this workflow state:\n\n{ptxt}\n\n"
                    f"The script receives these environment variables:\n"
                    f"  ISSUE_NUM  = the issue number (integer as string)\n"
                    f"  ORG        = GitHub org name ('{org}')\n"
                    f"  REPO       = GitHub repo name ('{repo}')\n"
                    f"  REPO_DIR   = local path ~/source/{org}/{repo}\n"
                    f"  DISPLAY    = ':0'\n"
                    f"  XAUTHORITY = ~/.Xauthority\n\n"
                    f"Use subprocess to call gh CLI and other shell tools. "
                    f"Output ONLY valid Python 3 — no markdown fences, no explanation."
                )
                def _run():
                    try:
                        out = _generate_with_llm(full_prompt)
                        m = _re2.search(r"```(?:python)?\n(.*?)```", out, _re2.DOTALL)
                        script = m.group(1).strip() if m else out.strip()
                        state["on_enter_script"] = script
                        save_settings(s)
                        GLib.idle_add(sbuf.set_text, script)
                        GLib.idle_add(lambda: gn_st.set_text("✓ Script generated"))
                        GLib.idle_add(scr_exp.set_expanded, True)
                        GLib.idle_add(_fill_slb)
                    except Exception as ex:
                        GLib.idle_add(lambda: gn_st.set_text(f"⚠ {ex}"))
                threading.Thread(target=_run, daemon=True).start()

            sv_btn.connect("clicked", do_save)
            gn_btn.connect("clicked", do_gen)
            editor_box.show_all()

        def on_sel(lb2, row):
            if row is None: _build_editor(None); return
            idx = row.get_index()
            if 0 <= idx < len(states): _build_editor(states[idx])
        slb.connect("row-selected", on_sel)

        def on_add_s(_):
            states.append({"id": f"state-{len(states)+1}", "label": "New State",
                           "is_initial": len(states)==0, "on_enter_prompt": "", "on_enter_script": ""})
            save_settings(s); _fill_slb()
            r2 = slb.get_row_at_index(len(states)-1)
            if r2: slb.select_row(r2)

        def on_rem_s(_):
            row = slb.get_selected_row()
            if row is None: return
            idx = row.get_index()
            if 0 <= idx < len(states): del states[idx]
            save_settings(s); _fill_slb(); _build_editor(None)

        def on_move(direction):
            row = slb.get_selected_row()
            if row is None: return
            idx = row.get_index(); ni = idx + direction
            if 0 <= ni < len(states):
                states[idx], states[ni] = states[ni], states[idx]
                save_settings(s); _fill_slb()
                r2 = slb.get_row_at_index(ni)
                if r2: slb.select_row(r2)

        add_s.connect("clicked", on_add_s)
        rem_s.connect("clicked", on_rem_s)
        up_b.connect("clicked",  lambda _: on_move(-1))
        dn_b.connect("clicked",  lambda _: on_move(1))
        _fill_slb()
        if states:
            first = slb.get_row_at_index(0)
            if first: slb.select_row(first); _build_editor(states[0])
        states_container.show_all()

    def on_type_changed(combo):
        idx = combo.get_active() - 1
        types2 = server.get("issue_types") or DEFAULT_ISSUE_TYPES
        if 0 <= idx < len(types2):
            tid = types2[idx]["id"]
            wf = _get_wf(tid)
            if wf is None:
                import copy
                wf = {"id": f"{tid}-workflow", "name": f"{types2[idx]['label']} Workflow",
                      "type_id": tid, "states": [], "transitions": []}
                server.setdefault("workflows", []).append(wf)
                save_settings(s)
            _rebuild_states(wf)
        else:
            _rebuild_states(None)

    type_combo.connect("changed", on_type_changed)
    on_type_changed(type_combo)
    exp.add(outer)
    card.pack_start(exp, False, False, 0)


def build_task_servers_page(settings):
    s = settings
    vbox = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=0)
    vbox.pack_start(_section("Task Servers"), False, False, 0)

    cards_box = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=0)

    def refresh_cards():
        for ch in list(cards_box.get_children()):
            cards_box.remove(ch)

        for server in s.get("task_servers", []):
            is_active = server["id"] == s.get("active_task_server")
            card = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=8)
            card.get_style_context().add_class("card")
            if is_active: card.get_style_context().add_class("active-card")

            top = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL, spacing=8)
            name_lbl = _lbl(server.get("name", "(unnamed)"), "card-title")
            name_lbl.set_hexpand(True)
            top.pack_start(name_lbl, True, True, 0)
            if is_active:
                badge = _lbl("● ACTIVE", "active-badge")
                top.pack_end(badge, False, False, 0)
            card.pack_start(top, False, False, 0)

            type_row = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL, spacing=8)
            type_row.pack_start(_lbl("Type", "field-label"), False, False, 0)
            type_combo = Gtk.ComboBoxText()
            for t in ["github", "jira", "custom"]:
                type_combo.append_text(t)
            cur_types = ["github", "jira", "custom"]
            if server.get("type") in cur_types:
                type_combo.set_active(cur_types.index(server["type"]))
            type_row.pack_start(type_combo, False, False, 0)
            card.pack_start(type_row, False, False, 0)

            name_row = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL, spacing=8)
            name_row.pack_start(_lbl("Name", "field-label"), False, False, 0)
            name_entry = Gtk.Entry(); name_entry.set_text(server.get("name", ""))
            name_entry.set_hexpand(True)
            name_row.pack_start(name_entry, True, True, 0)
            card.pack_start(name_row, False, False, 0)

            fields_box = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=6)
            card.pack_start(fields_box, False, False, 0)
            field_entries = {}

            def _rebuild_fields(server_type, fb, fe, srv):
                for ch in list(fb.get_children()):
                    fb.remove(ch)
                fe.clear()
                for key, label, placeholder, secret in SERVER_TYPE_FIELDS.get(server_type, []):
                    row = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL, spacing=8)
                    row.pack_start(_lbl(label, "field-label"), False, False, 0)
                    e = Gtk.Entry(); e.set_text(srv.get(key, ""))
                    e.set_placeholder_text(placeholder)
                    e.set_visibility(not secret)
                    e.set_hexpand(True)
                    row.pack_start(e, True, True, 0)
                    fb.pack_start(row, False, False, 0)
                    fe[key] = e
                fb.show_all()

            _rebuild_fields(server.get("type", "github"), fields_box, field_entries, server)

            def make_type_change(fb, fe, srv):
                def _on_change(combo):
                    t = combo.get_active_text() or "github"
                    srv["type"] = t
                    _rebuild_fields(t, fb, fe, srv)
                return _on_change

            type_combo.connect("changed", make_type_change(fields_box, field_entries, server))

            btn_row = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL, spacing=8)
            btn_row.set_margin_top(4)
            set_active_btn = Gtk.Button(label="Set Active")
            set_active_btn.get_style_context().add_class("apply-btn")
            save_btn = Gtk.Button(label="Save"); save_btn.get_style_context().add_class("save-btn")
            del_btn  = Gtk.Button(label="Delete"); del_btn.get_style_context().add_class("del-btn")
            btn_row.pack_start(set_active_btn, False, False, 0)
            btn_row.pack_start(save_btn,       False, False, 0)
            btn_row.pack_end(del_btn,          False, False, 0)
            card.pack_start(btn_row, False, False, 0)

            def make_save(srv, ne, fe):
                def _save(_):
                    srv["name"] = ne.get_text().strip()
                    for k, e in fe.items():
                        srv[k] = e.get_text().strip()
                    save_settings(s)
                    refresh_cards(); cards_box.show_all()
                return _save

            def make_set_active(srv):
                def _set(_):
                    s["active_task_server"] = srv["id"]
                    save_settings(s)
                    refresh_cards(); cards_box.show_all()
                return _set

            def make_del(srv):
                def _del(_):
                    s["task_servers"] = [x for x in s["task_servers"] if x["id"] != srv["id"]]
                    if s.get("active_task_server") == srv["id"]:
                        s["active_task_server"] = s["task_servers"][0]["id"] if s["task_servers"] else ""
                    save_settings(s)
                    refresh_cards(); cards_box.show_all()
                return _del

            save_btn.connect("clicked",       make_save(server, name_entry, field_entries))
            set_active_btn.connect("clicked", make_set_active(server))
            del_btn.connect("clicked",        make_del(server))

            # ── Issue query prompt + script generator ────────────────────────
            card.pack_start(_lbl("Issue Query", "section-label"), False, False, 0)
            prompt_hint = _lbl(
                "Describe which issues to show in natural language. "
                "Click 'Generate Script' — the AI agent will write a Python script that fetches them. "
                "The script is saved and re-run every few seconds to update the taskbar widget.",
                "card-sub"
            )
            prompt_hint.set_line_wrap(True); prompt_hint.set_margin_bottom(6)
            card.pack_start(prompt_hint, False, False, 0)

            prompt_tv = Gtk.TextView()
            prompt_tv.set_wrap_mode(Gtk.WrapMode.WORD)
            prompt_tv.get_style_context().add_class("agents-editor")
            prompt_tv.set_size_request(-1, 70)
            prompt_buf = prompt_tv.get_buffer()
            prompt_buf.set_text(server.get("issue_query_prompt", ""))
            prompt_sw = Gtk.ScrolledWindow()
            prompt_sw.set_policy(Gtk.PolicyType.NEVER, Gtk.PolicyType.AUTOMATIC)
            prompt_sw.add(prompt_tv)
            card.pack_start(prompt_sw, False, False, 0)

            gen_row   = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL, spacing=8)
            gen_row.set_margin_top(6)
            gen_btn   = Gtk.Button(label="⚡ Generate Script")
            gen_btn.get_style_context().add_class("apply-btn")
            gen_status = _lbl("", "save-ok")
            gen_row.pack_start(gen_btn,    False, False, 0)
            gen_row.pack_start(gen_status, False, False, 0)
            card.pack_start(gen_row, False, False, 0)

            def make_gen(srv, pbuf, gstatus):
                def _gen(_):
                    start, end = pbuf.get_bounds()
                    prompt = pbuf.get_text(start, end, True).strip()
                    if not prompt:
                        gstatus.set_text("⚠ Enter a prompt first")
                        return
                    srv["issue_query_prompt"] = prompt
                    save_settings(s)
                    gstatus.set_text("Generating…")

                    def _run():
                        try:
                            full_prompt = (
                                f"{prompt}\n\n"
                                "Write a self-contained Python 3 script that fetches these issues using the `gh` CLI "
                                "(subprocess calls to `gh issue list` or `gh api`). "
                                "Output one JSON object per line to stdout, each with keys: id (str), title (str), url (str), state (str). "
                                "Output ONLY the Python script — no markdown fences, no explanation, just valid Python starting with #!/usr/bin/env python3."
                            )
                            output = _generate_with_llm(full_prompt)
                            # Strip markdown fences if present
                            import re as _re
                            code_match = _re.search(r"```(?:python)?\n(.*?)```", output, re.DOTALL)
                            script = code_match.group(1).strip() if code_match else output.strip()
                            if not script:
                                GLib.idle_add(lambda: gstatus.set_text("⚠ No script generated"))
                                return
                            script_path = pathlib.Path.home() / ".config" / "robos" / "fetch-issues.py"
                            script_path.parent.mkdir(parents=True, exist_ok=True)
                            script_path.write_text(script)
                            srv["issue_fetch_script"] = str(script_path)
                            save_settings(s)
                            GLib.idle_add(lambda: gstatus.set_text("✓ Script saved"))
                        except Exception as e:
                            GLib.idle_add(lambda: gstatus.set_text(f"⚠ {e}"))

                    threading.Thread(target=_run, daemon=True).start()
                return _gen

            gen_btn.connect("clicked", make_gen(server, prompt_buf, gen_status))

            # ── Workspace Setup ──────────────────────────────────────────────
            card.pack_start(_lbl("Workspace Setup", "section-label"), False, False, 0)
            ws_hint = _lbl(
                "When an issue workspace is opened for the first time, this script runs to "
                "clone the repo, create a branch, and open VS Code. Leave blank to use the default setup.",
                "card-sub"
            )
            ws_hint.set_line_wrap(True); ws_hint.set_margin_bottom(6)
            card.pack_start(ws_hint, False, False, 0)

            ws_script_row = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL, spacing=8)
            ws_script_row.pack_start(_lbl("Setup Script", "field-label"), False, False, 0)
            ws_script_e = Gtk.Entry()
            ws_script_e.set_text(server.get("workspace_setup_script", ""))
            ws_script_e.set_placeholder_text("/path/to/setup.sh  (blank = default)")
            ws_script_e.set_hexpand(True)
            ws_script_row.pack_start(ws_script_e, True, True, 0)
            card.pack_start(ws_script_row, False, False, 0)

            def make_save_ws(srv, wse):
                def _save(_):
                    srv["workspace_setup_script"] = wse.get_text().strip()
                    save_settings(s)
                return _save
            ws_script_e.connect("activate", make_save_ws(server, ws_script_e))

            # ── Issue Types ─────────────────────────────────────────────────
            _build_types_section(card, server, s)

            # ── Workflows ───────────────────────────────────────────────────
            _build_workflows_section(card, server, s)

            cards_box.pack_start(card, False, False, 0)

        add_btn = Gtk.Button(label="+ Add Server")
        add_btn.get_style_context().add_class("add-btn")
        add_btn.set_margin_start(20); add_btn.set_margin_end(20)
        add_btn.set_margin_top(8); add_btn.set_margin_bottom(10)

        def on_add(_):
            new_ts = {"id": str(uuid.uuid4())[:8], "name": "New Server",
                      "type": "github", "gh_api_url": "", "gh_org": "", "gh_repo": "", "gh_labels": ""}
            s["task_servers"].append(new_ts)
            save_settings(s)
            refresh_cards(); cards_box.show_all()

        add_btn.connect("clicked", on_add)
        cards_box.pack_start(add_btn, False, False, 0)
        cards_box.show_all()

    refresh_cards()
    vbox.pack_start(cards_box, False, False, 0)
    return _scroll(vbox)


def build_desktops_page():
    """Ticket Desktops — create and manage per-ticket virtual workspaces."""
    DESKTOPS_DIR = pathlib.Path.home() / ".config" / "robos" / "desktops"
    CREATE_SCRIPT = "/usr/local/bin/create-ticket-desktop"

    outer = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=0)
    outer.pack_start(_section("Ticket Desktops"), False, False, 0)

    # intro
    intro = _lbl(
        "Each ticket gets its own named virtual desktop — Chrome on the issue URL, VS Code, and a terminal, "
        "all waiting for you on that workspace. Switch between tickets by clicking a desktop.",
        "card-sub"
    )
    intro.set_line_wrap(True)
    intro.set_margin_start(20); intro.set_margin_end(20); intro.set_margin_bottom(10)
    outer.pack_start(intro, False, False, 0)

    # ── create new ────────────────────────────────────────────────────────────
    new_card = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=8)
    new_card.get_style_context().add_class("card")
    new_card.pack_start(_lbl("Open Ticket Workspace", "card-title"), False, False, 0)

    row = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL, spacing=8)
    ticket_e = Gtk.Entry(); ticket_e.set_placeholder_text("PROJ-123")
    ticket_e.set_hexpand(True)
    url_e = Gtk.Entry(); url_e.set_placeholder_text("Issue URL (optional)")
    url_e.set_hexpand(True)
    open_b = Gtk.Button(label="🖥  Open Workspace")
    open_b.get_style_context().add_class("apply-btn")
    row.pack_start(ticket_e, True, True, 0)
    row.pack_start(url_e,    True, True, 0)
    row.pack_start(open_b,   False, False, 0)
    new_card.pack_start(row, False, False, 0)
    create_status = _lbl("", "save-ok")
    new_card.pack_start(create_status, False, False, 0)
    outer.pack_start(new_card, False, False, 0)

    # ── active desktops list ──────────────────────────────────────────────────
    outer.pack_start(_section("Active Ticket Workspaces"), False, False, 0)

    list_box = Gtk.ListBox()
    list_box.set_selection_mode(Gtk.SelectionMode.NONE)
    list_box.get_style_context().add_class("card")
    list_box.set_margin_start(20); list_box.set_margin_end(20)

    status_lbl = _lbl("", "card-sub")
    status_lbl.set_margin_start(20); status_lbl.set_margin_top(4)

    def _refresh_list():
        for ch in list(list_box.get_children()):
            list_box.remove(ch)

        entries = []
        if DESKTOPS_DIR.exists():
            for f in sorted(DESKTOPS_DIR.glob("*.json")):
                try:
                    d = json.loads(f.read_text())
                    entries.append(d)
                except Exception:
                    pass

        if not entries:
            row = Gtk.ListBoxRow(); row.set_activatable(False)
            row.add(_lbl("No ticket workspaces yet — create one above.", "card-sub"))
            list_box.add(row)
            list_box.show_all()
            return

        for entry in entries:
            ticket  = entry.get("ticket", "?")
            desk    = entry.get("desktop", "?")
            url     = entry.get("jira_url", "")
            created = entry.get("created", "")[:10]

            row_box = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL, spacing=10)
            row_box.set_margin_start(10); row_box.set_margin_end(10)
            row_box.set_margin_top(6); row_box.set_margin_bottom(6)

            badge = _lbl(ticket, "mode-badge")
            badge.set_size_request(100, -1)
            info  = _lbl(f"Desktop {desk}  •  {created}", "card-sub")
            info.set_hexpand(True)

            switch_b = Gtk.Button(label="Switch")
            switch_b.get_style_context().add_class("save-btn")
            close_b  = Gtk.Button(label="Close")
            close_b.get_style_context().add_class("del-btn")

            def make_switch(d_idx):
                def _sw(_):
                    subprocess.Popen(
                        ["bash", "-c", f"DISPLAY=:0 XAUTHORITY=$HOME/.Xauthority wmctrl -s {d_idx}"]
                    )
                return _sw

            def make_close(t, d_idx, f_path):
                def _cl(_):
                    try:
                        pathlib.Path(f_path).unlink(missing_ok=True)
                    except Exception:
                        pass
                    # rename desktop back to default label
                    subprocess.Popen([
                        "bash", "-c",
                        f"DISPLAY=:0 XAUTHORITY=$HOME/.Xauthority "
                        f"python3 /usr/local/bin/robos-rename-desktop {d_idx} 'Workspace {d_idx+1}'"
                    ])
                    GLib.idle_add(_refresh_list)
                return _cl

            switch_b.connect("clicked", make_switch(desk))
            close_b.connect("clicked",  make_close(ticket, desk, str(DESKTOPS_DIR / f"{ticket}.json")))

            row_box.pack_start(badge,    False, False, 0)
            row_box.pack_start(info,     True,  True,  0)
            row_box.pack_start(switch_b, False, False, 0)
            row_box.pack_start(close_b,  False, False, 0)

            lb_row = Gtk.ListBoxRow(); lb_row.set_activatable(False)
            lb_row.add(row_box)
            list_box.add(lb_row)

        list_box.show_all()

    def on_open(_):
        ticket = ticket_e.get_text().strip().upper()
        url    = url_e.get_text().strip()
        if not ticket:
            create_status.set_text("⚠ Enter a ticket ID first")
            return
        create_status.set_text(f"Opening workspace for {ticket}…")
        cmd = [CREATE_SCRIPT, ticket]
        if url:
            cmd.append(url)
        def _run():
            try:
                subprocess.run(cmd, timeout=30, env={
                    **os.environ, "DISPLAY": ":0",
                    "XAUTHORITY": str(pathlib.Path.home() / ".Xauthority")
                })
                GLib.idle_add(lambda: create_status.set_text(f"✓ Workspace for {ticket} ready"))
                GLib.idle_add(_refresh_list)
            except Exception as e:
                GLib.idle_add(lambda: create_status.set_text(f"Error: {e}"))
        threading.Thread(target=_run, daemon=True).start()

    open_b.connect("clicked", on_open)

    outer.pack_start(list_box,   True, True,  0)
    outer.pack_start(status_lbl, False, False, 0)

    # refresh button
    ref_b = Gtk.Button(label="↻ Refresh")
    ref_b.set_margin_start(20); ref_b.set_margin_top(6); ref_b.set_margin_bottom(10)
    ref_b.connect("clicked", lambda _: _refresh_list())
    outer.pack_start(ref_b, False, False, 0)

    _refresh_list()
    return _scroll(outer)


def build_agents_page():
    AGENTS_MD_PATH_LOCAL = "/etc/robos/AGENTS.md"

    outer = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=0)

    # ── Header ────────────────────────────────────────────────────────────────
    hdr = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL, spacing=10)
    hdr.set_margin_start(20); hdr.set_margin_top(16); hdr.set_margin_bottom(4); hdr.set_margin_end(20)
    hdr.pack_start(_lbl("AI Agent (GitHub Copilot CLI)", "section-title"), False, False, 0)
    status_lbl = _lbl("  Checking…", "login-status-none")
    hdr.pack_start(status_lbl, False, False, 0)
    outer.pack_start(hdr, False, False, 0)

    # ── Info grid ─────────────────────────────────────────────────────────────
    info_box = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL, spacing=24)
    info_box.set_margin_start(20); info_box.set_margin_top(6); info_box.set_margin_bottom(10)

    ver_grid = Gtk.Grid(column_spacing=12, row_spacing=4)
    gh_ver_lbl     = _lbl("…", "about-row-value")
    copilot_ver_lbl = _lbl("…", "about-row-value")
    user_lbl       = _lbl("…", "about-row-value")
    ver_grid.attach(_lbl("gh CLI:",        "about-row-label"), 0, 0, 1, 1)
    ver_grid.attach(gh_ver_lbl,                                1, 0, 1, 1)
    ver_grid.attach(_lbl("gh copilot:",    "about-row-label"), 0, 1, 1, 1)
    ver_grid.attach(copilot_ver_lbl,                           1, 1, 1, 1)
    ver_grid.attach(_lbl("Logged in as:",  "about-row-label"), 0, 2, 1, 1)
    ver_grid.attach(user_lbl,                                  1, 2, 1, 1)
    info_box.pack_start(ver_grid, False, False, 0)
    outer.pack_start(info_box, False, False, 0)

    # ── Action buttons ─────────────────────────────────────────────────────────
    btn_row = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL, spacing=8)
    btn_row.set_margin_start(20); btn_row.set_margin_bottom(12)

    btn_suggest = Gtk.Button(label="⚡  Suggest Command")
    btn_explain = Gtk.Button(label="🔍  Explain Command")
    btn_login   = Gtk.Button(label="🔑  Login")
    btn_refresh = Gtk.Button(label="↻")

    for b in (btn_suggest, btn_explain):
        b.get_style_context().add_class("mode-active")
        b.set_size_request(160, 32)
    btn_login.get_style_context().add_class("login-btn")
    btn_login.set_size_request(90, 32)
    btn_refresh.set_size_request(36, 32)

    btn_row.pack_start(btn_suggest, False, False, 0)
    btn_row.pack_start(btn_explain, False, False, 0)
    btn_row.pack_start(btn_login,   False, False, 0)
    btn_row.pack_start(btn_refresh, False, False, 0)
    outer.pack_start(btn_row, False, False, 0)

    # ── Terminal output area ───────────────────────────────────────────────────
    outer.pack_start(_lbl("Output", "about-row-label", margin_start=20), False, False, 0)

    tv_out = Gtk.TextView()
    tv_out.set_editable(False)
    tv_out.set_wrap_mode(Gtk.WrapMode.WORD_CHAR)
    tv_out.set_left_margin(10); tv_out.set_right_margin(10)
    tv_out.set_top_margin(8);   tv_out.set_bottom_margin(8)
    tv_out.get_style_context().add_class("agents-editor")
    buf_out = tv_out.get_buffer()
    tag_cmd  = buf_out.create_tag("cmd",  foreground="#00bcd4", weight=700)
    tag_resp = buf_out.create_tag("resp", foreground="#ccccdd")
    tag_err  = buf_out.create_tag("err",  foreground="#e74c3c")

    sw_out = Gtk.ScrolledWindow()
    sw_out.set_policy(Gtk.PolicyType.AUTOMATIC, Gtk.PolicyType.AUTOMATIC)
    sw_out.add(tv_out)
    sw_out.set_margin_start(20); sw_out.set_margin_end(20); sw_out.set_margin_bottom(8)
    sw_out.set_size_request(-1, 220)
    outer.pack_start(sw_out, True, True, 0)

    # ── Quick ask input ────────────────────────────────────────────────────────
    ask_row = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL, spacing=8)
    ask_row.set_margin_start(20); ask_row.set_margin_end(20); ask_row.set_margin_bottom(14)

    ask_entry = Gtk.Entry()
    ask_entry.set_placeholder_text("Ask the AI agent to suggest a command…")
    ask_entry.get_style_context().add_class("ask-entry")
    ask_entry.set_hexpand(True)

    ask_btn = Gtk.Button(label="Ask")
    ask_btn.get_style_context().add_class("mode-active")
    ask_btn.set_size_request(70, 32)

    ask_row.pack_start(ask_entry, True, True, 0)
    ask_row.pack_start(ask_btn,   False, False, 0)
    outer.pack_start(ask_row, False, False, 0)

    # ── Helpers ────────────────────────────────────────────────────────────────
    agent = AGENT_REGISTRY[0]

    def append_output(text, tag=None):
        def _do():
            end = buf_out.get_end_iter()
            if tag:
                buf_out.insert_with_tags_by_name(end, text + "\n", tag)
            else:
                buf_out.insert(end, text + "\n")
            tv_out.scroll_to_iter(buf_out.get_end_iter(), 0, False, 0, 0)
        GLib.idle_add(_do)

    def refresh_status():
        def _check():
            user    = get_logged_in_user(agent)
            gh_ver  = get_version(agent["host_version_cmd"])
            cop_ver = get_version(agent["version_cmd"])
            def _upd():
                gh_ver_lbl.set_text(gh_ver.splitlines()[0] if gh_ver else "not found")
                copilot_ver_lbl.set_text(cop_ver)
                if user:
                    user_lbl.set_text(user)
                    status_lbl.set_text("  ✓ Connected")
                    status_lbl.get_style_context().remove_class("login-status-none")
                    status_lbl.get_style_context().add_class("login-status-ok")
                else:
                    user_lbl.set_text("not logged in")
                    status_lbl.set_text("  ⚠ Not logged in")
                    status_lbl.get_style_context().remove_class("login-status-ok")
                    status_lbl.get_style_context().add_class("login-status-none")
            GLib.idle_add(_upd)
        threading.Thread(target=_check, daemon=True).start()

    def launch_copilot(subcmd):
        # -i = interactive mode, no query arg
        append_output(f"$ gh copilot -i {subcmd}", "cmd")
        subprocess.Popen(["tilix", "-e", f"/usr/local/bin/robos-copilot"])

    def run_ask(query, subcmd="suggest"):
        if not query.strip():
            return
        # Non-interactive: pass query directly, no -i flag
        append_output(f"$ gh copilot {subcmd} \"{query}\"", "cmd")
        def _run():
            try:
                r = subprocess.run(
                    ["gh", "copilot", subcmd, query],
                    capture_output=True, text=True, timeout=30
                )
                out = r.stdout.strip() or r.stderr.strip() or "(no output)"
                append_output(out, "resp")
            except subprocess.TimeoutExpired:
                append_output("Timed out — try opening in terminal instead.", "err")
            except Exception as e:
                append_output(str(e), "err")
        threading.Thread(target=_run, daemon=True).start()

    btn_suggest.connect("clicked", lambda _: launch_copilot("suggest"))
    btn_explain.connect("clicked", lambda _: launch_copilot("explain"))
    btn_login.connect("clicked",   lambda _: (subprocess.Popen(["tilix", "-e", "gh auth login"]), refresh_status()))
    btn_refresh.connect("clicked", lambda _: refresh_status())

    def on_ask(_w):
        q = ask_entry.get_text().strip()
        ask_entry.set_text("")
        run_ask(q, "suggest")

    ask_btn.connect("clicked",    lambda _: on_ask(ask_entry))
    ask_entry.connect("activate", on_ask)

    append_output("AI Agent ready.  Use buttons above or type a quick question below.", "resp")
    refresh_status()

    return outer



AGENTS_MD_PATH = "/etc/robos/AGENTS.md"


def build_agents_md_page():
    vbox = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=0)

    # Header row
    hdr = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL, spacing=10)
    hdr.set_margin_start(20); hdr.set_margin_top(16); hdr.set_margin_bottom(8)
    hdr.set_margin_end(20)
    title = _lbl("Agent Instructions  (AGENTS.md)", "section-title")
    hdr.pack_start(title, True, True, 0)
    save_btn = Gtk.Button(label="💾  Save")
    save_btn.get_style_context().add_class("mode-active")
    save_btn.set_size_request(90, 32)
    hdr.pack_end(save_btn, False, False, 0)
    vbox.pack_start(hdr, False, False, 0)

    # Description
    desc = _lbl(f"System-level instructions read by all AI agents on this OS.  Stored at {AGENTS_MD_PATH}", "card-sub")
    desc.set_margin_start(20); desc.set_margin_bottom(10)
    desc.set_line_wrap(True)
    vbox.pack_start(desc, False, False, 0)

    # Text editor
    tv = Gtk.TextView()
    tv.set_wrap_mode(Gtk.WrapMode.WORD)
    tv.set_left_margin(12); tv.set_right_margin(12)
    tv.set_top_margin(10);  tv.set_bottom_margin(10)
    tv.get_style_context().add_class("agents-editor")
    buf = tv.get_buffer()

    # Load file content
    try:
        with open(AGENTS_MD_PATH, "r") as f:
            buf.set_text(f.read())
    except Exception:
        buf.set_text("# AGENTS.md not found\nRun the RobOS installer to generate this file.")

    sw = Gtk.ScrolledWindow()
    sw.set_policy(Gtk.PolicyType.AUTOMATIC, Gtk.PolicyType.AUTOMATIC)
    sw.add(tv)
    sw.set_margin_start(20); sw.set_margin_end(20); sw.set_margin_bottom(16)
    vbox.pack_start(sw, True, True, 0)

    # Status label
    status = _lbl("", "card-sub")
    status.set_margin_start(20); status.set_margin_bottom(8)
    vbox.pack_start(status, False, False, 0)

    def on_save(_btn):
        start, end = buf.get_bounds()
        text = buf.get_text(start, end, True)
        try:
            # Write via pkexec/sudo if not writable directly
            import tempfile, subprocess
            with tempfile.NamedTemporaryFile("w", suffix=".md", delete=False) as tf:
                tf.write(text)
                tmp = tf.name
            result = subprocess.run(["sudo", "cp", tmp, AGENTS_MD_PATH], capture_output=True)
            os.unlink(tmp)
            if result.returncode == 0:
                status.set_text("✓ Saved to " + AGENTS_MD_PATH)
            else:
                status.set_text("✗ Save failed: " + result.stderr.decode().strip())
        except Exception as e:
            status.set_text(f"✗ Error: {e}")

    save_btn.connect("clicked", on_save)
    return vbox


def build_settings_page():
    vbox = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=0)
    vbox.pack_start(_section("General Preferences"), False, False, 0)
    placeholder = _lbl("More settings coming soon.", "card-sub")
    placeholder.set_margin_start(20); placeholder.set_margin_top(10)
    vbox.pack_start(placeholder, False, False, 0)
    return _scroll(vbox)


def build_about_page():
    vbox = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=8)
    vbox.set_margin_start(24); vbox.set_margin_top(20)

    vbox.pack_start(_lbl("RobOS Control Panel", "about-title"), False, False, 0)
    vbox.pack_start(_lbl(f"Version {APP_VERSION}", "about-version"), False, False, 0)

    grid = Gtk.Grid(column_spacing=16, row_spacing=8)
    rows = [
        ("Purpose",    "SDLC-centric AI-powered developer OS"),
        ("Desktop",    "Openbox + tint2 + LightDM on Ubuntu 22.04"),
        ("AI Runtime", "Claude / GitHub Copilot via MCP"),
        ("Config",     str(SETTINGS_FILE)),
        ("Panel",      "/usr/local/share/robos/agent_panel.py"),
    ]
    for i, (k, v) in enumerate(rows):
        grid.attach(_lbl(k, "about-row-label"), 0, i, 1, 1)
        grid.attach(_lbl(v, "about-row-value"), 1, i, 1, 1)
    vbox.pack_start(grid, False, False, 0)
    return _scroll(vbox)


# -----------------------------------------------------------------------------
# Main window
# -----------------------------------------------------------------------------

PAGE_META = {
    "jobs":         ("Jobs",         "Active agent jobs and task queue"),
    "desktops":     ("Ticket Desktops", "Virtual workspaces — one desktop per ticket"),
    "modes":        ("Modes",        "Switch workspace mode & configure taskbar apps"),
    "apps":         ("Apps",         "Manage applications available to modes"),
    "task_servers": ("Task Servers", "Configure GitHub Issues, Jira, or custom task servers"),
    "agents":       ("Agents",             "GitHub Copilot CLI — status, quick ask, and launcher"),
    "agents_md":    ("Agent Instructions", "System-level AGENTS.md — read by all AI agents on this OS"),
    "settings":     ("Settings",           "General preferences"),
    "about":        ("About",              "RobOS version and environment info"),
}


class RobOSControlPanel(Gtk.Window):
    def __init__(self):
        super().__init__(title="RobOS Control Panel")
        self.set_default_size(1050, 660)
        self.set_border_width(0)
        self.set_resizable(True)
        self.set_position(Gtk.WindowPosition.CENTER)
        # Disable CSD explicitly
        self.set_decorated(True)

        provider = Gtk.CssProvider()
        provider.load_from_data(CSS.encode())
        Gtk.StyleContext.add_provider_for_screen(
            Gdk.Screen.get_default(),
            provider,
            Gtk.STYLE_PROVIDER_PRIORITY_USER,
        )

        self.settings = load_settings()
        self._pages   = {}
        self._rows    = {}
        self._current_page = "jobs"

        outer = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=0)
        self.add(outer)

        # -- Body: sidebar + content ──
        body = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL, spacing=0)
        outer.pack_start(body, True, True, 0)

        # Sidebar
        sidebar = self._build_sidebar()
        body.pack_start(sidebar, False, False, 0)

        # Content area
        content_wrapper = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=0)
        content_wrapper.set_hexpand(True)
        body.pack_start(content_wrapper, True, True, 0)

        self._content_title    = Gtk.Label(xalign=0)
        self._content_subtitle = Gtk.Label(xalign=0)
        self._content_title.get_style_context().add_class("content-title")
        self._content_subtitle.get_style_context().add_class("content-subtitle")
        ch = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=2)
        ch.get_style_context().add_class("content-header")
        ch.pack_start(self._content_title,    False, False, 0)
        ch.pack_start(self._content_subtitle, False, False, 0)
        content_wrapper.pack_start(ch, False, False, 0)

        self._stack = Gtk.Stack()
        self._stack.set_transition_type(Gtk.StackTransitionType.SLIDE_UP_DOWN)
        self._stack.set_transition_duration(120)
        self._stack.set_hexpand(True); self._stack.set_vexpand(True)
        content_wrapper.pack_start(self._stack, True, True, 0)

        # Footer
        footer = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL, spacing=8)
        footer.get_style_context().add_class("footer")
        self._footer_mode_lbl = Gtk.Label(xalign=0)
        self._footer_mode_lbl.get_style_context().add_class("mode-badge")
        footer.pack_start(self._footer_mode_lbl, False, False, 0)
        hint = _lbl("RobOS Control Panel", "footer-hint")
        hint.set_hexpand(True); hint.set_xalign(1)
        footer.pack_end(hint, False, False, 0)
        outer.pack_start(footer, False, False, 0)
        self._refresh_footer()

        # Build all pages
        self._stack.add_named(build_jobs_page(),                                    "jobs")
        self._stack.add_named(build_desktops_page(),                                "desktops")
        self._stack.add_named(build_modes_page(self.settings, self._refresh_footer), "modes")
        self._stack.add_named(build_apps_page(self.settings),                       "apps")
        self._stack.add_named(build_task_servers_page(self.settings),               "task_servers")
        self._stack.add_named(build_agents_page(),                                  "agents")
        self._stack.add_named(build_agents_md_page(),                               "agents_md")
        self._stack.add_named(build_settings_page(),                                "settings")
        self._stack.add_named(build_about_page(),                                   "about")

        # Select default
        self._select_page("jobs")
        self.connect("destroy", Gtk.main_quit)
        self.show_all()

    def _build_sidebar(self):
        sidebar = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=0)
        sidebar.get_style_context().add_class("nav-sidebar")
        sidebar.set_size_request(200, -1)

        # Header
        nav_hdr = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=2)
        nav_hdr.get_style_context().add_class("nav-header")
        nav_hdr.pack_start(_lbl("RobOS", "nav-title"),    False, False, 0)
        nav_hdr.pack_start(_lbl("Control Panel", "nav-subtitle"), False, False, 0)
        sidebar.pack_start(nav_hdr, False, False, 0)

        # Tree
        tree_box = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=0)
        tree_box.set_margin_top(8)

        def make_row(label, page_id, child=False, parent_label=False):
            eb = Gtk.EventBox()
            row = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL, spacing=8)
            row.get_style_context().add_class("nav-row")
            if child:   row.get_style_context().add_class("nav-child")
            if parent_label: row.get_style_context().add_class("nav-parent")
            lbl = _lbl(label)
            lbl.set_xalign(0)
            lbl.set_hexpand(True)
            row.pack_start(lbl, True, True, 0)
            eb.add(row)
            eb.set_hexpand(True)
            if page_id:
                self._rows[page_id] = row

                def on_click(_, __, pid=page_id):
                    self._select_page(pid)

                eb.connect("button-press-event", on_click)
            return eb

        for item_label, icon, page_id, children in NAV_TREE:
            if children:
                # Parent separator label (not clickable)
                tree_box.pack_start(make_row(item_label, None, parent_label=True), False, False, 0)
                for child_label, _, child_page, _ in children:
                    tree_box.pack_start(make_row(child_label, child_page, child=True), False, False, 0)
            else:
                tree_box.pack_start(make_row(item_label, page_id), False, False, 0)

        sw = Gtk.ScrolledWindow(hscrollbar_policy=Gtk.PolicyType.NEVER,
                                 vscrollbar_policy=Gtk.PolicyType.AUTOMATIC)
        sw.set_vexpand(True)
        sw.add(tree_box)
        sidebar.pack_start(sw, True, True, 0)
        return sidebar

    def _select_page(self, page_id):
        # Deselect old
        for pid, row in self._rows.items():
            row.get_style_context().remove_class("selected")
        # Select new
        if page_id in self._rows:
            self._rows[page_id].get_style_context().add_class("selected")
        self._stack.set_visible_child_name(page_id)
        self._current_page = page_id
        title, subtitle = PAGE_META.get(page_id, (page_id, ""))
        self._content_title.set_text(title)
        self._content_subtitle.set_text(subtitle)

    def _refresh_footer(self):
        mode_id = self.settings.get("active_mode", "")
        mode_name = next((m["name"] for m in self.settings.get("modes", []) if m["id"] == mode_id), mode_id)
        self._footer_mode_lbl.set_text(f"⬡  {mode_name}")


def main():
    win = RobOSControlPanel()
    Gtk.main()


if __name__ == "__main__":
    main()
