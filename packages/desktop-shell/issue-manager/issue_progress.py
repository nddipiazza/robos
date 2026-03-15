#!/usr/bin/env python3
"""
RobOS Issue Progress Manager
Tracks an issue through the SDLC pipeline and allows state transitions.
Usage: issue_progress.py [ISSUE_ID]
"""

import gi
gi.require_version("Gtk", "3.0")
from gi.repository import Gtk, Gdk, GLib
import json
import os
import sys
import subprocess
import pathlib
import re

CONFIG_DIR   = pathlib.Path.home() / ".config" / "robos"
TASKS_FILE   = CONFIG_DIR / "desktop-tasks.json"
STATE_FILE   = CONFIG_DIR / "issue-states.json"

PIPELINE = [
    ("not-started",          "⏳ Not Started",      "#555577"),
    ("in-progress",          "🔧 In Progress",       "#e3b341"),
    ("bot-pr-review",        "🤖 Bot PR Review",     "#58a6ff"),
    ("pr-review",            "👁 PR Review",          "#58a6ff"),
    ("additional-testing",   "🔬 Extra Testing",      "#f0883e"),
    ("bot-issue-reject",     "❌ Bot Rejected",       "#f85149"),
    ("done",                 "✅ Done",               "#3fb950"),
]

STATE_IDS     = [s[0] for s in PIPELINE]
TRANSITIONS   = {
    "not-started":        ["in-progress"],
    "in-progress":        ["bot-pr-review", "pr-review"],
    "bot-pr-review":      ["pr-review", "bot-issue-reject", "in-progress"],
    "pr-review":          ["additional-testing", "done", "in-progress"],
    "additional-testing": ["in-progress", "done"],
    "bot-issue-reject":   ["in-progress"],
    "done":               [],
}

CSS = """
* { background-color: #1a1a2e; color: #e0e0e0; }
window, .background { background-color: #1a1a2e; color: #e0e0e0; box-shadow: none; border-radius: 0; }
decoration { margin: 0; padding: 0; border-radius: 0; box-shadow: none; border: none; }
scrolledwindow, viewport, box, eventbox { background-color: #1a1a2e; }
separator { background-color: #2a2a4e; min-height: 1px; }
label { color: #e0e0e0; background-color: transparent; }
button { background-color: #30363d; color: #e0e0e0; border: 1px solid #444; border-radius: 4px; padding: 6px 14px; font-size: 10pt; }
button:hover { background-color: #3a4249; }
.title-label { font-size: 13pt; font-weight: bold; color: #e0e0ff; }
.issue-key  { font-size: 11pt; font-weight: bold; color: #00bcd4; }
.state-badge { font-size: 10pt; font-weight: bold; padding: 4px 10px; border-radius: 12px; border: 1px solid #30363d; }
.state-not-started      { color: #8b8baa; border-color: #555577; }
.state-in-progress      { color: #e3b341; border-color: #6b5300; }
.state-bot-pr-review    { color: #58a6ff; border-color: #1a3a6e; }
.state-pr-review        { color: #79c0ff; border-color: #1a3a6e; }
.state-additional-testing { color: #f0883e; border-color: #6b3a00; }
.state-bot-issue-reject { color: #f85149; border-color: #6b1a1a; }
.state-done             { color: #3fb950; border-color: #1a4a1a; }
.pipeline-step { padding: 6px 8px; border-radius: 6px; border: 1px solid transparent; }
.pipeline-step.current  { background-color: #1e3a5f; border-color: #00bcd4; }
.pipeline-step.done-step { background-color: #12261e; border-color: #238636; }
.pipeline-step.pending-step { background-color: #1a1a2e; border-color: #2a2a4e; }
.pipeline-label { font-size: 9pt; }
.section-hdr  { font-size: 10pt; font-weight: bold; color: #00bcd4; padding: 12px 0 4px 0; }
.action-btn   { background-color: #1a3a6e; border-color: #58a6ff; color: #79c0ff; }
.action-btn:hover { background-color: #1e4a8e; }
.notes-view, .notes-view text { background-color: #0d1117; color: #e0e0e0; font-size: 10pt; }
.notes-view { border: 1px solid #30363d; border-radius: 4px; }
.open-url-btn { background-color: #12261e; border-color: #238636; color: #3fb950; }
.open-url-btn:hover { background-color: #1a3a28; }
"""


def load_states():
    if STATE_FILE.exists():
        try:
            return json.loads(STATE_FILE.read_text())
        except Exception:
            pass
    return {}


def save_states(data):
    STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
    STATE_FILE.write_text(json.dumps(data, indent=2))


def get_issue_state(issue_id):
    return load_states().get(issue_id, {"state": "not-started", "notes": ""})


def set_issue_state(issue_id, state, notes=""):
    data = load_states()
    data[issue_id] = {"state": state, "notes": notes}
    save_states(data)


def _lbl(text, css_class=None):
    l = Gtk.Label(label=text)
    l.set_xalign(0)
    l.set_line_wrap(True)
    if css_class:
        l.get_style_context().add_class(css_class)
    return l


class IssueProgressWindow(Gtk.Window):
    def __init__(self, issue_id=None, issue_title=None, issue_url=None):
        super().__init__(title="RobOS — Issue Progress")
        self.set_default_size(640, 520)
        self.set_border_width(0)
        self.set_resizable(True)
        self.set_position(Gtk.WindowPosition.CENTER)

        provider = Gtk.CssProvider()
        provider.load_from_data(CSS.encode())
        Gtk.StyleContext.add_provider_for_screen(
            Gdk.Screen.get_default(),
            provider,
            Gtk.STYLE_PROVIDER_PRIORITY_USER,
        )

        # Resolve issue from args or active desktop task
        self.issue_id    = issue_id
        self.issue_title = issue_title or ""
        self.issue_url   = issue_url or ""

        if not self.issue_id:
            self._load_from_desktop_tasks()

        issue_data = get_issue_state(self.issue_id or "unknown")
        self.current_state = issue_data.get("state", "not-started")
        self.notes_text    = issue_data.get("notes", "")

        self._build_ui()

    def _load_from_desktop_tasks(self):
        """Fall back to the first assigned desktop task."""
        try:
            data = json.loads(TASKS_FILE.read_text())
            for _k, v in data.get("desktops", {}).items():
                if v:
                    self.issue_id    = v.get("key", "")
                    self.issue_title = v.get("title", "")
                    self.issue_url   = v.get("url", "")
                    return
        except Exception:
            pass
        self.issue_id    = "UNKNOWN-0"
        self.issue_title = "No issue assigned"
        self.issue_url   = ""

    def _build_ui(self):
        outer = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=0)
        self.add(outer)

        # ── Header ────────────────────────────────────────────────────────────
        hdr = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL, spacing=10)
        hdr.set_margin_start(20); hdr.set_margin_end(20)
        hdr.set_margin_top(16);   hdr.set_margin_bottom(8)

        key_lbl = _lbl(self.issue_id or "", "issue-key")
        hdr.pack_start(key_lbl, False, False, 0)

        title_lbl = _lbl(self.issue_title or "", "title-label")
        hdr.pack_start(title_lbl, True, True, 0)

        if self.issue_url:
            url_btn = Gtk.Button(label="🔗 Open")
            url_btn.get_style_context().add_class("open-url-btn")
            url_btn.connect("clicked", lambda _: subprocess.Popen(
                ["xdg-open", self.issue_url],
                env={**os.environ, "DISPLAY": os.environ.get("DISPLAY", ":0")}
            ))
            hdr.pack_end(url_btn, False, False, 0)

        outer.pack_start(hdr, False, False, 0)
        outer.pack_start(Gtk.Separator(), False, False, 0)

        # ── Main scroll ───────────────────────────────────────────────────────
        scroll = Gtk.ScrolledWindow()
        scroll.set_policy(Gtk.PolicyType.NEVER, Gtk.PolicyType.AUTOMATIC)
        outer.pack_start(scroll, True, True, 0)

        body = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=0)
        body.set_margin_start(20); body.set_margin_end(20)
        body.set_margin_top(8);    body.set_margin_bottom(20)
        scroll.add(body)

        # ── Current state badge ───────────────────────────────────────────────
        badge_box = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL, spacing=8)
        badge_box.set_margin_bottom(4)
        badge_box.pack_start(_lbl("Current state:", None), False, False, 0)
        self.badge_lbl = Gtk.Label()
        self.badge_lbl.set_xalign(0)
        badge_box.pack_start(self.badge_lbl, False, False, 0)
        body.pack_start(badge_box, False, False, 0)
        self._refresh_badge()

        # ── Pipeline visualization ────────────────────────────────────────────
        body.pack_start(_lbl("Pipeline", "section-hdr"), False, False, 0)
        self.pipeline_box = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=4)
        body.pack_start(self.pipeline_box, False, False, 0)
        self._refresh_pipeline()

        # ── Transitions ───────────────────────────────────────────────────────
        body.pack_start(_lbl("Transition To", "section-hdr"), False, False, 0)
        self.transition_box = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL, spacing=8)
        self.transition_box.set_margin_bottom(8)
        body.pack_start(self.transition_box, False, False, 0)
        self._refresh_transitions()

        # ── Notes ─────────────────────────────────────────────────────────────
        body.pack_start(_lbl("Notes", "section-hdr"), False, False, 0)
        notes_scroll = Gtk.ScrolledWindow()
        notes_scroll.set_policy(Gtk.PolicyType.NEVER, Gtk.PolicyType.AUTOMATIC)
        notes_scroll.set_min_content_height(80)
        self.notes_view = Gtk.TextView()
        self.notes_view.set_wrap_mode(Gtk.WrapMode.WORD)
        self.notes_view.get_style_context().add_class("notes-view")
        self.notes_view.get_buffer().set_text(self.notes_text)
        notes_scroll.add(self.notes_view)
        body.pack_start(notes_scroll, False, False, 0)

        save_btn = Gtk.Button(label="💾 Save Notes")
        save_btn.set_margin_top(6)
        save_btn.connect("clicked", self._save_notes)
        body.pack_start(save_btn, False, False, 0)

        outer.show_all()

    def _refresh_badge(self):
        state_info = next((s for s in PIPELINE if s[0] == self.current_state), PIPELINE[0])
        css_cls = "state-" + self.current_state.replace("-", "-")
        self.badge_lbl.set_text(state_info[1])
        ctx = self.badge_lbl.get_style_context()
        for s in PIPELINE:
            ctx.remove_class("state-" + s[0])
        ctx.add_class("state-badge")
        ctx.add_class("state-" + self.current_state)

    def _refresh_pipeline(self):
        for child in self.pipeline_box.get_children():
            self.pipeline_box.remove(child)

        current_idx = STATE_IDS.index(self.current_state) if self.current_state in STATE_IDS else 0

        for i, (sid, label, _color) in enumerate(PIPELINE):
            row = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL, spacing=8)
            row.get_style_context().add_class("pipeline-step")
            if i < current_idx:
                row.get_style_context().add_class("done-step")
                icon = "✓ "
            elif i == current_idx:
                row.get_style_context().add_class("current")
                icon = "▶ "
            else:
                row.get_style_context().add_class("pending-step")
                icon = "· "
            lbl = _lbl(icon + label, "pipeline-label")
            row.pack_start(lbl, True, True, 0)
            self.pipeline_box.pack_start(row, False, False, 2)

        self.pipeline_box.show_all()

    def _refresh_transitions(self):
        for child in self.transition_box.get_children():
            self.transition_box.remove(child)

        nexts = TRANSITIONS.get(self.current_state, [])
        if not nexts:
            self.transition_box.pack_start(_lbl("— final state —"), False, False, 0)
        else:
            for next_state in nexts:
                info = next((s for s in PIPELINE if s[0] == next_state), None)
                if not info:
                    continue
                btn = Gtk.Button(label=info[1])
                btn.get_style_context().add_class("action-btn")
                btn.connect("clicked", self._transition_to, next_state)
                self.transition_box.pack_start(btn, False, False, 0)

        self.transition_box.show_all()

    def _transition_to(self, _btn, new_state):
        buf = self.notes_view.get_buffer()
        notes = buf.get_text(buf.get_start_iter(), buf.get_end_iter(), False)
        self.current_state = new_state
        self.notes_text    = notes
        set_issue_state(self.issue_id, new_state, notes)
        self._refresh_badge()
        self._refresh_pipeline()
        self._refresh_transitions()

    def _save_notes(self, _btn):
        buf = self.notes_view.get_buffer()
        notes = buf.get_text(buf.get_start_iter(), buf.get_end_iter(), False)
        self.notes_text = notes
        set_issue_state(self.issue_id, self.current_state, notes)


def main():
    issue_id = None
    issue_title = None
    issue_url   = None

    if len(sys.argv) >= 2:
        issue_id = sys.argv[1]
    if len(sys.argv) >= 3:
        issue_title = sys.argv[2]
    if len(sys.argv) >= 4:
        issue_url   = sys.argv[3]

    win = IssueProgressWindow(issue_id, issue_title, issue_url)
    win.connect("destroy", Gtk.main_quit)
    win.show_all()
    Gtk.main()


if __name__ == "__main__":
    main()
