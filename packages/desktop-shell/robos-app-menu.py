#!/usr/bin/env python3
"""
robos-app-menu.py — Large icon-grid app launcher popup for RobOS.
Opens a full-size GTK3 window above the taskbar with a search bar and
grouped icon cards, styled to match the RobOS Icons app.
"""
import gi, subprocess, os, re, json
gi.require_version('Gtk', '3.0')
gi.require_version('Gdk', '3.0')
gi.require_version('GdkPixbuf', '2.0')
from gi.repository import Gtk, Gdk, GdkPixbuf, GLib

# ── Category display metadata (id -> (label, sort_order)) ─────────────────────
CATEGORY_META = {
    'Dev':      ('💻  Dev',              1),
    'AI':       ('🤖  AI & Agents',      2),
    'Security': ('🔒  Security',          3),
    'People':   ('👥  People & Org',      4),
    'Journal':  ('📓  Info & Journal',    5),
    'System':   ('🖥  System',            6),
    'Internet': ('🌐  Internet',           7),
    'Tools':    ('⚙  Terminal & Code',   8),
}

ROBOS_DESKTOP_DIR = '/usr/local/share/applications'
RECENT_FILE       = os.path.expanduser('~/.config/robos/recent-apps.json')
MAX_RECENT        = 5
ICON_SIZE         = 52   # px for the app icon inside each card
CARD_W            = 110  # min card width

# ── Recent apps ────────────────────────────────────────────────────────────────
def _load_recent():
    try:
        with open(RECENT_FILE) as f:
            return json.load(f)
    except Exception:
        return []

def _save_recent(entries):
    os.makedirs(os.path.dirname(RECENT_FILE), exist_ok=True)
    with open(RECENT_FILE, 'w') as f:
        json.dump(entries, f)

def _record_recent(name, desktop_path):
    entries = [e for e in _load_recent() if e.get('desktop_path') != desktop_path]
    entries.insert(0, {'name': name, 'desktop_path': desktop_path})
    _save_recent(entries[:MAX_RECENT])

# ── .desktop parsing ───────────────────────────────────────────────────────────
def _parse_desktop(path):
    kv = {}
    in_section = False
    try:
        with open(path, encoding='utf-8', errors='replace') as f:
            for line in f:
                line = line.rstrip()
                if line == '[Desktop Entry]':
                    in_section = True; continue
                if line.startswith('[') and line.endswith(']'):
                    in_section = False; continue
                if not in_section or not line or line.startswith('#'):
                    continue
                eq = line.find('=')
                if eq < 1: continue
                kv[line[:eq].strip()] = line[eq+1:].strip()
    except OSError:
        pass
    return kv

def _load_robos_categories():
    buckets = {}
    try:
        entries = sorted(os.listdir(ROBOS_DESKTOP_DIR))
    except OSError:
        entries = []
    for fname in entries:
        if not fname.endswith('.desktop'):
            continue
        fp = os.path.join(ROBOS_DESKTOP_DIR, fname)
        kv = _parse_desktop(fp)
        if kv.get('X-RobOS-App') != 'true':
            continue
        cat_id = kv.get('X-RobOS-Category', '')
        name   = kv.get('Name', '')
        icon   = kv.get('Icon', '')
        if not cat_id or cat_id not in CATEGORY_META or not name:
            continue
        buckets.setdefault(cat_id, []).append((name, fp, icon))
    for apps in buckets.values():
        apps.sort(key=lambda x: x[0].lower())
    ordered = sorted(buckets.keys(), key=lambda cid: CATEGORY_META[cid][1])
    return [(CATEGORY_META[cid][0], buckets[cid]) for cid in ordered]

CATEGORIES = _load_robos_categories()
ALL_APPS = [
    (name, dp, icon, cat)
    for (cat, apps) in CATEGORIES
    for (name, dp, icon) in apps
    if os.path.exists(dp)
]

# ── Exec / launch ──────────────────────────────────────────────────────────────
def get_exec(desktop_path):
    try:
        with open(desktop_path) as f:
            for line in f:
                if line.startswith('Exec='):
                    cmd = line[5:].strip()
                    return re.sub(r'\s*%[a-zA-Z]', '', cmd).strip()
    except Exception:
        pass
    return None

def launch(name, desktop_path, window):
    _record_recent(name, desktop_path)
    cmd = get_exec(desktop_path)
    if cmd:
        env = {**os.environ, 'DISPLAY': ':0'}
        subprocess.Popen(cmd, shell=True, env=env, start_new_session=True,
                         stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    window.hide()
    Gtk.main_quit()

# ── Icon loading ───────────────────────────────────────────────────────────────
_icon_cache = {}

def _resolve_icon(icon_path):
    """Return an existing file path: try as-is, then .svg sibling, then .png sibling."""
    if not icon_path:
        return None
    if os.path.exists(icon_path):
        return icon_path
    base = os.path.splitext(icon_path)[0]
    for ext in ('.svg', '.png'):
        p = base + ext
        if os.path.exists(p):
            return p
    return None

def _load_pixbuf(icon_path, size):
    key = (icon_path, size)
    if key in _icon_cache:
        return _icon_cache[key]
    pb = None
    resolved = _resolve_icon(icon_path)
    if resolved:
        try:
            pb = GdkPixbuf.Pixbuf.new_from_file_at_size(resolved, size, size)
        except Exception:
            pb = None
    _icon_cache[key] = pb
    return pb

# ── CSS ────────────────────────────────────────────────────────────────────────
CSS = """
window {
  background: #0d1117;
  border: 1px solid #30363d;
  border-radius: 10px;
}
.launcher-wrap {
  background: #0d1117;
  border-radius: 10px;
}
/* ── Search ── */
.search-bar {
  background: #0d1117;
  padding: 12px 16px 8px 16px;
  border-bottom: 1px solid #21262d;
}
.search-entry {
  background: #161b22;
  border: 1px solid #30363d;
  border-radius: 7px;
  color: #c9d1d9;
  font-size: 14px;
  padding: 8px 12px;
}
.search-entry:focus {
  border-color: #00bcd4;
}
/* ── Scroll area ── */
.scroll-area {
  background: #0d1117;
}
/* ── Category header ── */
.cat-header-label {
  font-size: 11px;
  font-weight: bold;
  color: #8b949e;
  padding: 14px 18px 6px 18px;
}
.recent-header-label {
  font-size: 11px;
  font-weight: bold;
  color: #00bcd4;
  padding: 12px 18px 6px 18px;
}
/* ── App card ── */
.app-card {
  background: #161b22;
  border: 1px solid #21262d;
  border-radius: 8px;
  padding: 12px 6px 10px 6px;
  color: #c9d1d9;
}
.app-card:hover {
  background: #1a2332;
  border-color: #00bcd4;
  color: #e0e0ff;
}
.app-card:focus {
  background: #1a2332;
  border-color: #58a6ff;
}
.app-card-label {
  font-size: 11px;
  color: #c9d1d9;
}
.app-card:hover .app-card-label {
  color: #e0e0ff;
}
/* ── Section separator ── */
.cat-sep {
  background: #21262d;
  min-height: 1px;
  margin: 2px 16px;
}
"""

# ── App card widget ────────────────────────────────────────────────────────────
def _make_card(name, desktop_path, icon_path, win):
    btn = Gtk.Button()
    btn.set_relief(Gtk.ReliefStyle.NONE)
    btn.get_style_context().add_class('app-card')

    vbox = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=6)
    vbox.set_halign(Gtk.Align.CENTER)

    # Icon
    pb = _load_pixbuf(icon_path, ICON_SIZE)
    if pb:
        img = Gtk.Image.new_from_pixbuf(pb)
    else:
        img = Gtk.Image.new_from_icon_name('application-x-executable', Gtk.IconSize.DIALOG)
    img.set_halign(Gtk.Align.CENTER)
    vbox.pack_start(img, False, False, 0)

    # Label — wrap at 2 lines
    lbl = Gtk.Label(label=re.sub(r'^RobOS\s+', '', name))
    lbl.set_halign(Gtk.Align.CENTER)
    lbl.set_justify(Gtk.Justification.CENTER)
    lbl.set_line_wrap(True)
    lbl.set_max_width_chars(12)
    lbl.set_lines(2)
    lbl.set_ellipsize(3)  # PANGO_ELLIPSIZE_END
    lbl.get_style_context().add_class('app-card-label')
    vbox.pack_start(lbl, False, False, 0)

    btn.add(vbox)
    btn.set_size_request(CARD_W, -1)
    btn.set_can_focus(False)  # let FlowBoxChild handle focus; Enter handled at window level
    btn.connect('clicked', lambda b: launch(name, desktop_path, win))
    return btn

# ── FlowBox section ────────────────────────────────────────────────────────────
def _make_section(header_text, apps, win, header_class='cat-header-label'):
    section = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=0)

    hdr = Gtk.Label(label=header_text)
    hdr.get_style_context().add_class(header_class)
    hdr.set_xalign(0.0)
    section.pack_start(hdr, False, False, 0)

    flow = Gtk.FlowBox()
    flow.set_homogeneous(True)
    flow.set_min_children_per_line(3)
    flow.set_max_children_per_line(20)
    flow.set_column_spacing(10)
    flow.set_row_spacing(10)
    flow.set_selection_mode(Gtk.SelectionMode.NONE)
    flow.set_margin_start(14)
    flow.set_margin_end(14)
    flow.set_margin_bottom(8)

    for (name, dp, icon) in apps:
        card = _make_card(name, dp, icon, win)
        flow.add(card)

    section.pack_start(flow, False, False, 0)
    return section

# ── Build window ───────────────────────────────────────────────────────────────
def build_window():
    win = Gtk.Window(type=Gtk.WindowType.TOPLEVEL)
    win.set_skip_taskbar_hint(True)
    win.set_skip_pager_hint(True)
    win.set_decorated(False)
    win.set_resizable(False)
    win.set_keep_above(True)
    win.set_type_hint(Gdk.WindowTypeHint.NORMAL)
    win.set_has_tooltip(False)
    win.set_default_size(860, 600)

    provider = Gtk.CssProvider()
    provider.load_from_data(CSS.encode('utf-8'))
    Gtk.StyleContext.add_provider_for_screen(
        Gdk.Screen.get_default(), provider,
        Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION
    )

    outer = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=0)
    outer.get_style_context().add_class('launcher-wrap')

    # ── Search bar ─────────────────────────────────────────────────────────────
    search_bar = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL)
    search_bar.get_style_context().add_class('search-bar')
    search = Gtk.Entry()
    search.set_placeholder_text('🔍   Search apps…')
    search.get_style_context().add_class('search-entry')
    search.set_has_tooltip(False)
    search_bar.pack_start(search, True, True, 0)
    outer.pack_start(search_bar, False, False, 0)

    # ── Scrollable content ─────────────────────────────────────────────────────
    scroll = Gtk.ScrolledWindow()
    scroll.set_policy(Gtk.PolicyType.NEVER, Gtk.PolicyType.AUTOMATIC)
    scroll.get_style_context().add_class('scroll-area')

    content_box = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=0)
    scroll.add(content_box)
    outer.pack_start(scroll, True, True, 0)
    win.add(outer)

    # ── Render ─────────────────────────────────────────────────────────────────
    def render_apps(query=''):
        for child in content_box.get_children():
            content_box.remove(child)

        q = query.strip().lower()

        if q:
            matches = [(n, dp, icon) for (n, dp, icon, _) in ALL_APPS if q in n.lower()]
            if not matches:
                lbl = Gtk.Label(label='No apps found')
                lbl.get_style_context().add_class('cat-header-label')
                lbl.set_margin_top(30)
                content_box.pack_start(lbl, False, False, 0)
            else:
                content_box.pack_start(
                    _make_section('Results', matches, win), False, False, 0)
        else:
            # Recent
            recent = [
                e for e in _load_recent()
                if os.path.exists(e.get('desktop_path', ''))
            ][:MAX_RECENT]
            if recent:
                recent_apps = []
                for e in recent:
                    kv = _parse_desktop(e['desktop_path'])
                    recent_apps.append((e['name'], e['desktop_path'], kv.get('Icon', '')))
                content_box.pack_start(
                    _make_section('🕐  Recent', recent_apps, win, 'recent-header-label'),
                    False, False, 0)
                sep = Gtk.Separator()
                sep.get_style_context().add_class('cat-sep')
                content_box.pack_start(sep, False, False, 0)

            # Categories
            for (cat_name, apps) in CATEGORIES:
                cat_apps = [(n, dp, icon) for (n, dp, icon) in apps if os.path.exists(dp)]
                if not cat_apps:
                    continue
                content_box.pack_start(
                    _make_section(cat_name, cat_apps, win), False, False, 0)

        content_box.show_all()

    render_apps()
    search.connect('changed', lambda e: render_apps(e.get_text()))

    # ── Keyboard ───────────────────────────────────────────────────────────────
    def on_key(widget, event):
        kv = event.keyval
        if kv == Gdk.KEY_Escape:
            win.hide(); Gtk.main_quit(); return True
        if kv in (Gdk.KEY_Return, Gdk.KEY_KP_Enter):
            focused = widget.get_focus()
            # Search box focused → launch first match
            if focused == search:
                q = search.get_text().strip().lower()
                if q:
                    matches = [(n, dp, icon) for (n, dp, icon, _) in ALL_APPS if q in n.lower()]
                else:
                    matches = [(n, dp, icon) for (n, dp, icon, _) in ALL_APPS]
                if matches:
                    name, dp, _icon = matches[0]
                    launch(name, dp, win)
                return True
            # FlowBoxChild wrapper focused → activate the button inside
            if isinstance(focused, Gtk.FlowBoxChild):
                btn = focused.get_child()
                if btn:
                    btn.clicked()
                return True
            return False
        return False

    win.connect('key-press-event', on_key)

    # ── Click-away closes ──────────────────────────────────────────────────────
    def on_outside_click(widget, event):
        wx, wy = win.get_position()
        ww, wh = win.get_size()
        if not (wx <= event.x_root <= wx + ww and wy <= event.y_root <= wy + wh):
            Gdk.Display.get_default().get_default_seat().ungrab()
            Gtk.main_quit()
        return False

    win.add_events(Gdk.EventMask.BUTTON_PRESS_MASK)
    win.connect('button-press-event', on_outside_click)

    return win, search


def main():
    win, search_entry = build_window()
    win.show_all()

    display = Gdk.Display.get_default()
    seat    = display.get_default_seat()
    pointer = seat.get_pointer()
    screen, cx, cy = pointer.get_position()

    win.realize()
    w, h = win.get_size()
    mon  = display.get_primary_monitor()
    geom = mon.get_geometry()

    # Bottom-left above taskbar
    x = 4
    y = geom.height - h - 36

    win.move(x, y)
    win.present()
    win.grab_focus()
    GLib.idle_add(search_entry.grab_focus)

    def do_seat_grab():
        try:
            gdk_win = win.get_window()
            if gdk_win:
                s = Gdk.Display.get_default().get_default_seat()
                s.grab(gdk_win, Gdk.SeatCapabilities.ALL_POINTING,
                       True, None, None, None)
        except Exception as e:
            print(f'seat grab failed: {e}', flush=True)
        return False

    def on_map(widget, event):
        GLib.timeout_add(100, do_seat_grab)
        return False

    win.connect('map-event', on_map)
    Gtk.main()

if __name__ == '__main__':
    main()
