#!/usr/bin/env python3
"""
RobOS Issue Progress Manager
Launched when a user selects an issue. Shows state pipeline, issue details,
transition actions, and workspace setup.

Usage: issue-progress.py <issue-id> [repo]
  issue-id: e.g. "#1" or "1"
  repo: e.g. "nddipiazza/hello-robos" (optional, read from settings otherwise)
"""
import os
os.environ["GTK_CSD"] = "0"

import gi, pathlib, json, subprocess, threading, sys, re
gi.require_version('Gtk', '3.0')
from gi.repository import Gtk, Gdk, GLib, Pango

SETTINGS_FILE  = pathlib.Path.home() / ".config" / "robos" / "settings.json"
ACTIVE_ISSUE   = pathlib.Path.home() / ".config" / "robos" / "active-issue"
WORKSPACE_DIR  = pathlib.Path.home() / "workspace"

# ── Workflow states ────────────────────────────────────────────────────────────
DEFAULT_STATES = [
    {"id": "state:not-started",             "label": "Not Started",             "color": "#555577"},
    {"id": "state:bot-pr-review",           "label": "Bot PR Review",           "color": "#f0a500"},
    {"id": "state:bot-issue-reject",        "label": "Bot Issue Reject",        "color": "#f44336"},
    {"id": "state:pr-review",               "label": "PR Review",               "color": "#2196f3"},
    {"id": "state:additional-testing-needed","label": "Additional Testing Needed","color": "#9c27b0"},
    {"id": "state:done",                    "label": "Done",                    "color": "#4caf50"},
]

STATE_TRANSITIONS = {
    "state:not-started":              ["state:bot-pr-review", "state:pr-review"],
    "state:bot-pr-review":            ["state:bot-issue-reject", "state:pr-review"],
    "state:bot-issue-reject":         ["state:not-started", "state:bot-pr-review"],
    "state:pr-review":                ["state:additional-testing-needed", "state:done"],
    "state:additional-testing-needed":["state:pr-review", "state:done"],
    "state:done":                     [],
}

CSS = b"""
* { background-color: #1a1a2e; color: #e0e0e0; font-family: sans; }
window, .background { background-color: #1a1a2e; }
decoration { margin: 0; padding: 0; border-radius: 0; box-shadow: none; }
label { background-color: transparent; }
button { background-color: #30363d; color: #e0e0e0; border: 1px solid #444;
         border-radius: 4px; padding: 6px 16px; font-size: 10pt; }
button:hover { background-color: #3a4249; }
button.primary { background-color: #1565c0; color: #fff; border: none; font-weight: bold; }
button.primary:hover { background-color: #1976d2; }
button.success { background-color: #1b5e20; color: #fff; border: none; }
button.success:hover { background-color: #2e7d32; }
button.danger  { background-color: #4a1010; color: #ff8080; border: none; }
button.danger:hover  { background-color: #6a1515; }
button.trans-btn { padding: 5px 12px; font-size: 9pt; border-radius: 10px; }
entry { background-color: #0d1117; color: #e0e0e0; border: 1px solid #30363d;
        border-radius: 4px; padding: 5px 8px; }
textview, textview text { background-color: #0d1117; color: #e0e0e0; font-size: 10pt; }
textview { border: 1px solid #30363d; border-radius: 4px; }
scrolledwindow, viewport { background-color: #1a1a2e; }
separator { background-color: #2a2a4e; min-height: 1px; min-width: 1px; }

.issue-title  { font-size: 14pt; font-weight: bold; color: #ffffff; }
.issue-number { font-size: 11pt; color: #555577; }
.issue-body   { font-size: 10pt; color: #aaaacc; }
.type-badge   { font-size: 9pt; font-weight: bold; padding: 2px 10px;
                border-radius: 10px; }
.type-bug     { background-color: #5d0a0a; color: #ff8080; }
.type-feature { background-color: #0a2a5d; color: #80b0ff; }
.section-hdr  { font-size: 10pt; font-weight: bold; color: #00bcd4;
                padding: 12px 0 6px 0; }
.state-pill   { font-size: 9pt; font-weight: bold; padding: 3px 12px;
                border-radius: 10px; border: 1px solid #444; }
.state-active { border: 2px solid #00bcd4; }
.field-label  { font-size: 9pt; color: #888888; min-width: 120px; }
.save-ok      { font-size: 9pt; color: #4caf50; }
.log-lbl      { font-size: 9pt; color: #888888; font-family: monospace; }
"""


DEFAULT_ISSUE_TYPES = [
    {"id": "bug",     "label": "Bug",     "color": "#d73a4a"},
    {"id": "feature", "label": "Feature", "color": "#0075ca"},
    {"id": "task",    "label": "Task",    "color": "#e4e669"},
]

DEFAULT_WORKFLOWS = [
    {
        "id": "bug-workflow", "name": "Bug Workflow", "type_id": "bug",
        "states": [
            {"id": "not-started",        "label": "Not Started",        "is_initial": True,
             "on_enter_prompt": "Clone the GitHub repo to ~/source/{org}/{repo} if it doesn't exist. Checkout or create branch issue-{number}. Find the most relevant source file from the issue body and open VS Code there.",
             "on_enter_script": ""},
            {"id": "in-progress",        "label": "In Progress",        "is_initial": False, "on_enter_prompt": "", "on_enter_script": ""},
            {"id": "pr-review",          "label": "PR Review",          "is_initial": False,
             "on_enter_prompt": "Push the current branch and create a PR for issue {number} in repo {org}/{repo}.",
             "on_enter_script": ""},
            {"id": "additional-testing", "label": "Additional Testing", "is_initial": False, "on_enter_prompt": "", "on_enter_script": ""},
            {"id": "done",               "label": "Done",               "is_initial": False,
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
            {"id": "not-started", "label": "Not Started",       "is_initial": True,
             "on_enter_prompt": "Clone the GitHub repo to ~/source/{org}/{repo} if it doesn't exist. Checkout or create branch issue-{number}. Open VS Code at the project root.",
             "on_enter_script": ""},
            {"id": "design",      "label": "Design / Planning", "is_initial": False, "on_enter_prompt": "", "on_enter_script": ""},
            {"id": "in-progress", "label": "In Progress",       "is_initial": False, "on_enter_prompt": "", "on_enter_script": ""},
            {"id": "pr-review",   "label": "PR Review",         "is_initial": False,
             "on_enter_prompt": "Push the current branch and create a PR for issue {number} in repo {org}/{repo}.",
             "on_enter_script": ""},
            {"id": "qa-testing",  "label": "QA / Testing",      "is_initial": False, "on_enter_prompt": "", "on_enter_script": ""},
            {"id": "done",        "label": "Done",               "is_initial": False,
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
    {
        "id": "task-workflow", "name": "Task Workflow", "type_id": "task",
        "states": [
            {"id": "not-started",  "label": "Not Started", "is_initial": True,  "on_enter_prompt": "", "on_enter_script": ""},
            {"id": "in-progress",  "label": "In Progress", "is_initial": False, "on_enter_prompt": "", "on_enter_script": ""},
            {"id": "pr-review",    "label": "PR Review",   "is_initial": False, "on_enter_prompt": "", "on_enter_script": ""},
            {"id": "done",         "label": "Done",         "is_initial": False, "on_enter_prompt": "", "on_enter_script": ""},
        ],
        "transitions": [
            {"from": "not-started", "to": "in-progress"},
            {"from": "in-progress", "to": "pr-review"},
            {"from": "pr-review",   "to": "done"},
            {"from": "pr-review",   "to": "in-progress"},
        ]
    },
]


def load_settings():
    try:
        s = json.loads(SETTINGS_FILE.read_text())
    except Exception:
        s = {}

    # Ensure basic structure exists (but don't auto-populate types/workflows)
    if not s.get("task_servers"):
        s["task_servers"] = [{"id": "github-default", "name": "GitHub (default)",
                               "issue_types": [], "workflows": []}]
    if not s.get("active_task_server"):
        s["active_task_server"] = "github-default"

    return s


def active_task_server(settings):
    ts_id = settings.get("active_task_server", "")
    for ts in settings.get("task_servers", []):
        if ts["id"] == ts_id:
            return ts
    servers = settings.get("task_servers", [])
    return servers[0] if servers else {}


def get_repo(settings):
    ts = active_task_server(settings)
    org  = ts.get("gh_org", "")
    repo = ts.get("gh_repo", "")
    if org and repo:
        return f"{org}/{repo}"
    return ""


def get_workflow_for_type(settings, issue_type):
    """Return the workflow dict (with states/transitions) for the given issue type."""
    ts = active_task_server(settings)
    for wf in ts.get("workflows", []):
        if wf.get("type_id") == issue_type and wf.get("states"):
            return wf
    # Fall back to DEFAULT_STATES as a synthetic workflow
    return {"states": DEFAULT_STATES, "transitions": {k: v for k, v in STATE_TRANSITIONS.items()}}


def state_gh_label(state):
    """GitHub label name for a state (adds 'state:' prefix if not already present)."""
    sid = state["id"]
    return sid if sid.startswith("state:") else f"state:{sid}"


def transitions_dict(workflow):
    """Build {from_state_id: [to_state_id, ...]} from a workflow's transitions list."""
    if isinstance(workflow.get("transitions"), dict):
        return workflow["transitions"]
    d = {}
    for t in workflow.get("transitions", []):
        d.setdefault(t["from"], []).append(t["to"])
    return d


def fetch_issue(repo, issue_num):
    """Fetch issue details from GitHub via gh CLI."""
    try:
        r = subprocess.run(
            ["gh", "issue", "view", str(issue_num), "--repo", repo,
             "--json", "number,title,body,labels,state,url,assignees"],
            capture_output=True, text=True, timeout=15
        )
        if r.returncode == 0:
            return json.loads(r.stdout)
    except Exception:
        pass
    return None


def get_current_state(issue_data, all_states):
    """Determine current state from issue labels."""
    label_names = {l["name"] for l in issue_data.get("labels", [])}
    for state in all_states:
        if state_gh_label(state) in label_names:
            return state
    return all_states[0]  # default: not-started


def get_issue_type(issue_data):
    label_names = {l["name"] for l in issue_data.get("labels", [])}
    if "type:bug" in label_names:
        return "bug"
    if "type:feature" in label_names:
        return "feature"
    return None


def transition_state(repo, issue_num, from_state_id, to_state_id, all_states):
    """Remove old state label, add new state label on GitHub."""
    state_by_id = {s["id"]: s for s in all_states}
    cmds = []
    if from_state_id and from_state_id in state_by_id:
        cmds.append(["gh", "issue", "edit", str(issue_num), "--repo", repo,
                      "--remove-label", state_gh_label(state_by_id[from_state_id])])
    if to_state_id in state_by_id:
        gh_lbl = state_gh_label(state_by_id[to_state_id])
        # Ensure label exists on the repo
        subprocess.run(["gh", "label", "create", gh_lbl, "--repo", repo, "--color", "5319e7"],
                       capture_output=True, timeout=10)
        cmds.append(["gh", "issue", "edit", str(issue_num), "--repo", repo,
                      "--add-label", gh_lbl])
    for cmd in cmds:
        subprocess.run(cmd, capture_output=True, timeout=15)


def run_state_script(state, repo, issue_num, settings, log_callback):
    """Execute the on_enter_script for a state if present, else run default workspace setup."""
    script = state.get("on_enter_script", "").strip()
    if not script:
        return  # no script, nothing to run
    ts = active_task_server(settings)
    org  = ts.get("gh_org", "")
    repo_name = repo.split("/")[-1] if "/" in repo else repo
    repo_dir  = pathlib.Path.home() / "source" / (org or repo_name) / repo_name
    env = {
        **os.environ,
        "ISSUE_NUM":  str(issue_num),
        "ORG":        org,
        "REPO":       repo_name,
        "REPO_DIR":   str(repo_dir),
        "DISPLAY":    ":0",
        "XAUTHORITY": str(pathlib.Path.home() / ".Xauthority"),
    }
    def log(msg):
        GLib.idle_add(log_callback, msg)
    log(f"Running on-enter script for state '{state.get('label', state['id'])}'…")
    try:
        r = subprocess.run(["python3", "-c", script], capture_output=True, text=True,
                           env=env, timeout=120)
        for line in (r.stdout + r.stderr).strip().splitlines():
            log(line)
        if r.returncode != 0:
            log(f"⚠ Script exited with code {r.returncode}")
        else:
            log("✓ Script completed")
    except Exception as e:
        log(f"⚠ Script error: {e}")


def run_workspace_setup(repo, issue_num, issue_data, settings, log_callback):
    """Clone repo, create branch, open VS Code at relevant file."""
    ts = active_task_server(settings)
    setup_script = ts.get("workspace_setup_script", "")

    workspace = WORKSPACE_DIR
    workspace.mkdir(parents=True, exist_ok=True)
    repo_name = repo.split("/")[-1]
    repo_dir  = workspace / repo_name

    def log(msg):
        GLib.idle_add(log_callback, msg)

    log(f"Setting up workspace for {repo} #{issue_num}…")

    # If a custom script exists, run it
    if setup_script and pathlib.Path(setup_script).exists():
        log(f"Running custom setup script: {setup_script}")
        env = {**os.environ, "ISSUE_NUM": str(issue_num),
               "REPO": repo, "REPO_DIR": str(repo_dir),
               "DISPLAY": ":0", "XAUTHORITY": str(pathlib.Path.home() / ".Xauthority")}
        r = subprocess.run(["bash", setup_script], capture_output=True, text=True, env=env)
        log(r.stdout.strip() or "(no output)")
        if r.returncode != 0:
            log(f"⚠ Script error: {r.stderr.strip()}")
        return

    # Default setup
    if not repo_dir.exists():
        log(f"Cloning {repo}…")
        r = subprocess.run(["gh", "repo", "clone", repo, str(repo_dir)],
                           capture_output=True, text=True)
        if r.returncode != 0:
            log(f"⚠ Clone failed: {r.stderr.strip()}")
            return
        log(f"✓ Cloned to {repo_dir}")
    else:
        log(f"✓ Repo exists at {repo_dir}, pulling latest…")
        subprocess.run(["git", "pull"], cwd=str(repo_dir), capture_output=True)

    # Create/checkout issue branch
    branch = f"issue-{issue_num}"
    r = subprocess.run(["git", "checkout", "-B", branch],
                       cwd=str(repo_dir), capture_output=True, text=True)
    log(f"✓ On branch {branch}")

    # Find relevant file from issue body (look for filenames mentioned)
    body = issue_data.get("body", "")
    file_hint = None
    matches = re.findall(r"`([a-zA-Z0-9_/.-]+\.[a-zA-Z]+)`", body)
    for m in matches:
        candidate = repo_dir / m
        if candidate.exists():
            file_hint = str(candidate)
            break
    if not file_hint:
        # default: open repo root
        file_hint = str(repo_dir)

    log(f"Opening VS Code at {file_hint}…")
    env = {**os.environ, "DISPLAY": ":0",
           "XAUTHORITY": str(pathlib.Path.home() / ".Xauthority")}
    subprocess.Popen(["code", file_hint], env=env)
    log("✓ VS Code launched")


# ── Main window ───────────────────────────────────────────────────────────────

class IssueProgressManager(Gtk.Window):
    def __init__(self, issue_id, repo_override=None):
        super().__init__(title="Issue Progress Manager")
        self.set_default_size(700, 600)
        self.set_border_width(0)
        self.set_resizable(True)
        self.set_position(Gtk.WindowPosition.CENTER)

        provider = Gtk.CssProvider()
        provider.load_from_data(CSS)
        Gtk.StyleContext.add_provider_for_screen(
            Gdk.Screen.get_default(), provider, Gtk.STYLE_PROVIDER_PRIORITY_USER)

        self._settings   = load_settings()
        self._all_states = DEFAULT_STATES
        self._transitions = STATE_TRANSITIONS.copy()
        self._repo       = repo_override or get_repo(self._settings)
        # Normalize issue id: strip "#"
        self._issue_num  = str(issue_id).lstrip("#").strip()
        self._issue_data = None
        self._cur_state  = None

        outer = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=0)
        self.add(outer)

        # ── Header bar ────────────────────────────────────────────────────────
        hdr = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL, spacing=10)
        hdr.set_margin_start(20); hdr.set_margin_end(20)
        hdr.set_margin_top(14); hdr.set_margin_bottom(10)

        self._num_lbl   = Gtk.Label(label=f"#{self._issue_num}")
        self._num_lbl.get_style_context().add_class("issue-number")
        self._type_badge = Gtk.Label(label="")
        self._type_badge.get_style_context().add_class("type-badge")
        self._title_lbl = Gtk.Label(label="Loading…")
        self._title_lbl.get_style_context().add_class("issue-title")
        self._title_lbl.set_hexpand(True)
        self._title_lbl.set_halign(Gtk.Align.START)
        self._title_lbl.set_ellipsize(Pango.EllipsizeMode.END)

        open_btn = Gtk.Button(label="Open on GitHub")
        open_btn.connect("clicked", self._open_browser)

        hdr.pack_start(self._num_lbl,   False, False, 0)
        hdr.pack_start(self._type_badge,False, False, 0)
        hdr.pack_start(self._title_lbl, True,  True,  0)
        hdr.pack_end(open_btn,          False, False, 0)
        outer.pack_start(hdr, False, False, 0)
        outer.pack_start(Gtk.Separator(), False, False, 0)

        # ── State pipeline ────────────────────────────────────────────────────
        pipeline_box = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=6)
        pipeline_box.set_margin_start(20); pipeline_box.set_margin_end(20)
        pipeline_box.set_margin_top(10)
        lbl = Gtk.Label(label="Workflow State")
        lbl.get_style_context().add_class("section-hdr")
        lbl.set_halign(Gtk.Align.START)
        pipeline_box.pack_start(lbl, False, False, 0)

        self._pills_box = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL, spacing=8)
        pipeline_box.pack_start(self._pills_box, False, False, 0)

        # Transition buttons row
        trans_lbl = Gtk.Label(label="Transition to:")
        trans_lbl.get_style_context().add_class("field-label")
        trans_lbl.set_halign(Gtk.Align.START)
        trans_lbl.set_margin_top(8)
        pipeline_box.pack_start(trans_lbl, False, False, 0)
        self._trans_box = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL, spacing=8)
        pipeline_box.pack_start(self._trans_box, False, False, 0)

        outer.pack_start(pipeline_box, False, False, 0)
        outer.pack_start(Gtk.Separator(), False, False, 4)

        # ── Workspace setup ───────────────────────────────────────────────────
        ws_box = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=6)
        ws_box.set_margin_start(20); ws_box.set_margin_end(20); ws_box.set_margin_top(4)
        ws_hdr = Gtk.Label(label="Workspace")
        ws_hdr.get_style_context().add_class("section-hdr")
        ws_hdr.set_halign(Gtk.Align.START)
        ws_box.pack_start(ws_hdr, False, False, 0)

        ws_btn_row = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL, spacing=8)
        setup_btn = Gtk.Button(label="🚀  Set Up Workspace")
        setup_btn.get_style_context().add_class("primary")
        setup_btn.connect("clicked", self._on_setup_workspace)
        open_ws_btn = Gtk.Button(label="📁  Open in VS Code")
        open_ws_btn.connect("clicked", self._on_open_vscode)
        ws_btn_row.pack_start(setup_btn,   False, False, 0)
        ws_btn_row.pack_start(open_ws_btn, False, False, 0)
        ws_box.pack_start(ws_btn_row, False, False, 0)

        # Log output
        self._log_tv = Gtk.TextView()
        self._log_tv.set_editable(False)
        self._log_tv.set_wrap_mode(Gtk.WrapMode.WORD_CHAR)
        self._log_buf = self._log_tv.get_buffer()
        log_sw = Gtk.ScrolledWindow()
        log_sw.set_policy(Gtk.PolicyType.NEVER, Gtk.PolicyType.AUTOMATIC)
        log_sw.set_min_content_height(80)
        log_sw.add(self._log_tv)
        ws_box.pack_start(log_sw, False, False, 0)
        outer.pack_start(ws_box, False, False, 0)

        outer.pack_start(Gtk.Separator(), False, False, 4)

        # ── Issue body ────────────────────────────────────────────────────────
        body_box = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=4)
        body_box.set_margin_start(20); body_box.set_margin_end(20)
        body_hdr = Gtk.Label(label="Issue Description")
        body_hdr.get_style_context().add_class("section-hdr")
        body_hdr.set_halign(Gtk.Align.START)
        body_box.pack_start(body_hdr, False, False, 0)
        self._body_tv = Gtk.TextView()
        self._body_tv.set_editable(False)
        self._body_tv.set_wrap_mode(Gtk.WrapMode.WORD_CHAR)
        self._body_buf = self._body_tv.get_buffer()
        body_sw = Gtk.ScrolledWindow()
        body_sw.set_policy(Gtk.PolicyType.NEVER, Gtk.PolicyType.AUTOMATIC)
        body_sw.add(self._body_tv)
        body_box.pack_start(body_sw, True, True, 0)
        outer.pack_start(body_box, True, True, 0)

        self.connect("destroy", Gtk.main_quit)

        # Load issue data in background
        threading.Thread(target=self._load_issue, daemon=True).start()

    def _load_issue(self):
        if not self._repo:
            GLib.idle_add(self._set_error, "No repo configured — set Owner/Org and Repo in Task Servers settings")
            return
        data = fetch_issue(self._repo, self._issue_num)
        if not data:
            GLib.idle_add(self._set_error, f"Could not fetch issue #{self._issue_num} from {self._repo}")
            return
        self._issue_data = data
        GLib.idle_add(self._populate, data)

    def _populate(self, data):
        self._title_lbl.set_text(data.get("title", ""))
        self.set_title(f"Issue #{self._issue_num} — {data.get('title','')[:60]}")
        self._body_buf.set_text(data.get("body", "(no description)"))

        itype = get_issue_type(data)
        if itype == "bug":
            self._type_badge.set_text("  bug  ")
            self._type_badge.get_style_context().add_class("type-bug")
        elif itype == "feature":
            self._type_badge.set_text("  feature  ")
            self._type_badge.get_style_context().add_class("type-feature")

        # Load workflow for this issue type
        wf = get_workflow_for_type(self._settings, itype)
        if wf and wf.get("states"):
            self._all_states = wf["states"]
            self._transitions = transitions_dict(wf)

        self._cur_state = get_current_state(data, self._all_states)
        self._refresh_pipeline()
        self.show_all()

    def _refresh_pipeline(self):
        for ch in list(self._pills_box.get_children()):
            self._pills_box.remove(ch)
        for ch in list(self._trans_box.get_children()):
            self._trans_box.remove(ch)

        cur_id = self._cur_state["id"] if self._cur_state else ""

        for i, state in enumerate(self._all_states):
            pill = Gtk.Label(label=f" {state['label']} ")
            pill.get_style_context().add_class("state-pill")
            pill.override_color(Gtk.StateFlags.NORMAL, Gdk.RGBA(*[int(state["color"].lstrip("#")[j:j+2], 16)/255.0 for j in (0,2,4)], 1.0))
            if state["id"] == cur_id:
                pill.get_style_context().add_class("state-active")
                pill.set_markup(f"<b> ● {state['label']} </b>")
            if i < len(self._all_states) - 1:
                arrow = Gtk.Label(label=" → ")
                arrow.get_style_context().add_class("field-label")
                self._pills_box.pack_start(pill,  False, False, 0)
                self._pills_box.pack_start(arrow, False, False, 0)
            else:
                self._pills_box.pack_start(pill, False, False, 0)

        # Transition buttons
        nexts = self._transitions.get(cur_id, [])
        if not nexts:
            done_lbl = Gtk.Label(label="Issue is Done ✓")
            done_lbl.get_style_context().add_class("save-ok")
            self._trans_box.pack_start(done_lbl, False, False, 0)
        for next_id in nexts:
            state_info = next((s for s in self._all_states if s["id"] == next_id), None)
            if not state_info:
                continue
            btn = Gtk.Button(label=f"→ {state_info['label']}")
            btn.get_style_context().add_class("trans-btn")
            btn.connect("clicked", self._make_transition(cur_id, next_id))
            self._trans_box.pack_start(btn, False, False, 0)

        self._pills_box.show_all()
        self._trans_box.show_all()

    def _make_transition(self, from_id, to_id):
        def _do(_):
            if not self._repo:
                return
            new_state = next((s for s in self._all_states if s["id"] == to_id), None)
            if not new_state:
                return
            def _run():
                transition_state(self._repo, self._issue_num, from_id, to_id, self._all_states)
                # Run on_enter_script if present
                if new_state.get("on_enter_script"):
                    run_state_script(new_state, self._repo, self._issue_num,
                                     self._settings, self._log)
                # Reload issue data
                data = fetch_issue(self._repo, self._issue_num)
                if data:
                    self._issue_data = data
                    self._cur_state = get_current_state(data, self._all_states)
                    GLib.idle_add(self._refresh_pipeline)
            threading.Thread(target=_run, daemon=True).start()
        return _do

    def _on_setup_workspace(self, _):
        if not self._issue_data:
            return
        self._log("Starting workspace setup…")

        # Check for initial state's on_enter_script
        initial_state = next((s for s in self._all_states if s.get("is_initial")), None)
        if initial_state and initial_state.get("on_enter_script"):
            threading.Thread(
                target=run_state_script,
                args=(initial_state, self._repo, self._issue_num, self._settings, self._log),
                daemon=True
            ).start()
            return

        threading.Thread(
            target=run_workspace_setup,
            args=(self._repo, self._issue_num, self._issue_data, self._settings, self._log),
            daemon=True
        ).start()

    def _on_open_vscode(self, _):
        repo_name = self._repo.split("/")[-1] if self._repo else ""
        repo_dir  = WORKSPACE_DIR / repo_name
        target    = str(repo_dir) if repo_dir.exists() else str(WORKSPACE_DIR)
        env = {**os.environ, "DISPLAY": ":0",
               "XAUTHORITY": str(pathlib.Path.home() / ".Xauthority")}
        subprocess.Popen(["code", target], env=env)

    def _log(self, msg):
        end = self._log_buf.get_end_iter()
        self._log_buf.insert(end, f"{msg}\n")
        # Auto-scroll
        adj = self._log_tv.get_vadjustment()
        adj.set_value(adj.get_upper())

    def _set_error(self, msg):
        self._title_lbl.set_text(f"Error: {msg}")

    def _open_browser(self, _):
        if self._issue_data:
            url = self._issue_data.get("url", "")
            if url:
                env = {**os.environ, "DISPLAY": ":0",
                       "XAUTHORITY": str(pathlib.Path.home() / ".Xauthority")}
                subprocess.Popen(["xdg-open", url], env=env)


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: issue-progress.py <issue-id> [repo]")
        sys.exit(1)
    issue_id     = sys.argv[1]
    repo_override = sys.argv[2] if len(sys.argv) > 2 else None
    win = IssueProgressManager(issue_id, repo_override)
    win.show_all()
    Gtk.main()
