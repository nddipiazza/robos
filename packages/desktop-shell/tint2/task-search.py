#!/usr/bin/env python3
"""
RobOS Issues selector — popup dialog.
Launched when user clicks the issue widget in the tint2 taskbar.
Reads ~/.config/robos/active-issue, fetches issues via ~/.config/robos/fetch-issues.py
"""
import gi, pathlib, json, subprocess, threading
gi.require_version('Gtk', '3.0')
from gi.repository import Gtk, Gdk, GLib

SETTINGS_FILE  = pathlib.Path.home() / ".config" / "robos" / "settings.json"
ISSUE_FILE     = pathlib.Path.home() / ".config" / "robos" / "active-issue"
FETCH_SCRIPT   = pathlib.Path.home() / ".config" / "robos" / "fetch-issues.py"
RECENT_FILE    = pathlib.Path.home() / ".config" / "robos" / "recent-issues.json"

CSS = b"""
* { background-color: #1a1a2e; color: #e0e0e0; }
window, .background { background-color: #1a1a2e; }
entry {
    background-color: #0d1117;
    color: #e0e0e0;
    border: 1px solid #00bcd4;
    border-radius: 4px;
    padding: 6px 10px;
    font-size: 12pt;
    caret-color: #00bcd4;
}
.title-lbl {
    font-size: 12pt; font-weight: bold; color: #00bcd4;
    background-color: transparent; padding: 14px 16px 6px 16px;
}
.hint-lbl {
    font-size: 9pt; color: #555577;
    background-color: transparent; padding: 0 16px 10px 16px;
}
.issue-id {
    font-size: 11pt; font-weight: bold; color: #00bcd4;
    background-color: transparent; min-width: 80px;
}
.issue-title {
    font-size: 10pt; color: #aaaacc; background-color: transparent;
}
.active-id { color: #4caf50; }
button {
    background-color: #30363d; color: #e0e0e0;
    border: 1px solid #444; border-radius: 4px; padding: 5px 14px;
}
button.select-btn { background-color: #1565c0; color: #fff; border: none; border-radius: 4px; }
button.select-btn:hover { background-color: #1976d2; }
button.clear-btn { background-color: #4a1010; color: #ffaaaa; border: none; border-radius: 4px; }
scrolledwindow, viewport { background-color: #1a1a2e; }
separator { background-color: #2a2a4e; min-height: 1px; }
label { background-color: transparent; }
row { background-color: #1a1a2e; padding: 8px 16px; border-bottom: 1px solid #20203a; }
row:hover { background-color: #20203a; }
row:selected { background-color: #1565c0; }
"""


def load_recent():
    try:
        return json.loads(RECENT_FILE.read_text())
    except Exception:
        return []


def save_recent(entries):
    RECENT_FILE.parent.mkdir(parents=True, exist_ok=True)
    RECENT_FILE.write_text(json.dumps(entries[:30], indent=2))


def get_active():
    try:
        return ISSUE_FILE.read_text().strip()
    except Exception:
        return ""


def set_active(issue_id, title=""):
    ISSUE_FILE.parent.mkdir(parents=True, exist_ok=True)
    ISSUE_FILE.write_text(str(issue_id).strip())
    recent = load_recent()
    entry = {"id": str(issue_id).strip(), "title": title}
    recent = [e for e in recent if e.get("id") != entry["id"]]
    recent.insert(0, entry)
    save_recent(recent)
    # Launch Issue Manager (Electron)
    env = {**__import__('os').environ, "DISPLAY": ":0",
           "XAUTHORITY": str(pathlib.Path.home() / ".Xauthority")}
    subprocess.Popen(
        ["/usr/local/bin/issue-manager", str(issue_id).strip()],
        env=env
    )


def fetch_issues():
    """Run the generated fetch script, return list of {id, title, url, state}."""
    if not FETCH_SCRIPT.exists():
        # Fallback: use gh CLI directly
        try:
            r = subprocess.run(
                ["gh", "issue", "list", "--assignee", "@me",
                 "--json", "number,title,url,state", "--limit", "50"],
                capture_output=True, text=True, timeout=15
            )
            if r.returncode == 0:
                data = json.loads(r.stdout)
                return [{"id": f"#{d['number']}", "title": d["title"],
                         "url": d.get("url", ""), "state": d.get("state", "")} for d in data]
        except Exception:
            pass
        return []
    try:
        r = subprocess.run(["python3", str(FETCH_SCRIPT)],
                           capture_output=True, text=True, timeout=20)
        issues = []
        for line in r.stdout.splitlines():
            line = line.strip()
            if line.startswith("{"):
                try:
                    issues.append(json.loads(line))
                except Exception:
                    pass
        return issues
    except Exception:
        return []


class IssueSelector(Gtk.Window):
    def __init__(self):
        super().__init__(title="Select Active Issue")
        self.set_default_size(520, 480)
        self.set_border_width(0)
        self.set_resizable(True)
        self.set_position(Gtk.WindowPosition.CENTER)
        self.set_keep_above(True)

        provider = Gtk.CssProvider()
        provider.load_from_data(CSS)
        Gtk.StyleContext.add_provider_for_screen(
            Gdk.Screen.get_default(), provider, Gtk.STYLE_PROVIDER_PRIORITY_USER)
        s = Gtk.Settings.get_default()
        s.set_property("gtk-application-prefer-dark-theme", True)
        s.set_property("gtk-theme-name", "Adwaita")

        root = Gtk.Box(orientation=Gtk.Orientation.VERTICAL)
        self.add(root)

        title = Gtk.Label(label="Select Active Issue")
        title.get_style_context().add_class("title-lbl")
        title.set_halign(Gtk.Align.START)
        root.pack_start(title, False, False, 0)

        # Search bar
        search_box = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL, spacing=8)
        search_box.set_margin_start(16); search_box.set_margin_end(16); search_box.set_margin_bottom(8)
        self._entry = Gtk.SearchEntry()
        self._entry.set_placeholder_text("Filter issues…")
        self._entry.set_hexpand(True)
        self._entry.connect("search-changed", self._on_filter)
        self._entry.connect("activate", self._on_enter)
        clear_btn = Gtk.Button(label="Clear Active")
        clear_btn.get_style_context().add_class("clear-btn")
        clear_btn.connect("clicked", self._on_clear)
        search_box.pack_start(self._entry, True, True, 0)
        search_box.pack_start(clear_btn, False, False, 0)
        root.pack_start(search_box, False, False, 0)

        root.pack_start(Gtk.Separator(), False, False, 0)

        # Status bar (loading / count)
        self._status = Gtk.Label(label="Loading issues…")
        self._status.get_style_context().add_class("hint-lbl")
        self._status.set_halign(Gtk.Align.START)
        root.pack_start(self._status, False, False, 0)

        # Issue list
        self._listbox = Gtk.ListBox()
        self._listbox.set_selection_mode(Gtk.SelectionMode.SINGLE)
        self._listbox.set_activate_on_single_click(True)
        self._listbox.connect("row-activated", self._on_row_activate)

        sw = Gtk.ScrolledWindow()
        sw.set_policy(Gtk.PolicyType.NEVER, Gtk.PolicyType.AUTOMATIC)
        sw.add(self._listbox)
        root.pack_start(sw, True, True, 0)

        self._all_issues = []
        self.connect("key-press-event", lambda w, e: Gtk.main_quit() if e.keyval == Gdk.KEY_Escape else None)

        # Load issues in background
        threading.Thread(target=self._load_issues, daemon=True).start()

    def _load_issues(self):
        issues = fetch_issues()
        # Merge with recents so recently-used items appear even if not in live list
        recent = load_recent()
        seen_ids = {str(i["id"]) for i in issues}
        for r in recent:
            if r["id"] not in seen_ids:
                issues.append({"id": r["id"], "title": r.get("title", ""), "url": "", "state": "recent"})
        self._all_issues = issues
        GLib.idle_add(self._populate, issues)

    def _populate(self, issues):
        filt = self._entry.get_text().strip().lower()
        for ch in list(self._listbox.get_children()):
            self._listbox.remove(ch)

        active = get_active()
        shown = [i for i in issues if not filt or filt in i.get("id","").lower() or filt in i.get("title","").lower()]

        if not shown:
            row = Gtk.ListBoxRow(); row.set_activatable(False)
            lbl = Gtk.Label(label="No issues found")
            lbl.get_style_context().add_class("hint-lbl")
            row.add(lbl); self._listbox.add(row)
        else:
            for issue in shown:
                row = Gtk.ListBoxRow()
                row._issue = issue
                box = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL, spacing=12)
                box.set_margin_start(16); box.set_margin_end(16)
                box.set_margin_top(8); box.set_margin_bottom(8)
                id_lbl = Gtk.Label(label=str(issue.get("id", "")))
                id_lbl.get_style_context().add_class("issue-id")
                if str(issue.get("id","")) == str(active):
                    id_lbl.get_style_context().add_class("active-id")
                id_lbl.set_size_request(80, -1)
                title_lbl = Gtk.Label(label=issue.get("title", ""))
                title_lbl.get_style_context().add_class("issue-title")
                title_lbl.set_halign(Gtk.Align.START)
                title_lbl.set_ellipsize(3)
                title_lbl.set_hexpand(True)
                state_lbl = Gtk.Label(label=issue.get("state",""))
                state_lbl.get_style_context().add_class("hint-lbl")
                box.pack_start(id_lbl, False, False, 0)
                box.pack_start(title_lbl, True, True, 0)
                box.pack_start(state_lbl, False, False, 0)
                row.add(box)
                self._listbox.add(row)

        self._status.set_text(f"{len(shown)} issue(s)")
        self._listbox.show_all()

    def _on_filter(self, _):
        self._populate(self._all_issues)

    def _on_enter(self, entry):
        # If there's exactly one match, select it
        text = entry.get_text().strip()
        if not text:
            return
        matches = [i for i in self._all_issues
                   if text.lower() in i.get("id","").lower() or text.lower() in i.get("title","").lower()]
        if len(matches) == 1:
            set_active(matches[0]["id"], matches[0].get("title",""))
            Gtk.main_quit()

    def _on_row_activate(self, lb, row):
        if hasattr(row, "_issue"):
            issue = row._issue
            set_active(issue["id"], issue.get("title",""))
            Gtk.main_quit()

    def _on_clear(self, _):
        ISSUE_FILE.unlink(missing_ok=True)
        Gtk.main_quit()


if __name__ == "__main__":
    win = IssueSelector()
    win.connect("destroy", Gtk.main_quit)
    win.show_all()
    Gtk.main()

