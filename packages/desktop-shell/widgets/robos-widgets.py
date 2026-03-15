#!/usr/bin/env python3
"""
RobOS Desktop Widgets
Replaces conky-based widgets from the openbox desktop.
Runs as a single process; each widget is a GTK overlay window.

Widgets:
  Top-right (stacked):
    1. Copilot Quota   — premium request usage
    2. Pass Status     — GPG pass lock state
    3. AI Journal      — last 3 journal entries

  Top-left (stacked):
    4. Profile         — identity / person service
    5. Desktop Task    — active ticket for this workspace

  Right side (dynamic):
    6. Copilot Swim Lane — active streaming sessions (separate process)
"""

import gi
gi.require_version('Gtk', '3.0')
gi.require_version('Gdk', '3.0')
from gi.repository import Gtk, Gdk, GLib, Pango
import cairo
import json, os, subprocess, time, re
from datetime import datetime

# ── Shared palette ─────────────────────────────────────────────────────────────
C_BG       = (0.09, 0.11, 0.16)     # #17192a — rich dark navy
C_BG2      = (0.11, 0.14, 0.20)     # slightly lighter for header row
C_BORDER   = (0.20, 0.24, 0.32)     # #333D52 — subtle dark border
C_ACCENT   = (0.25, 0.30, 0.40)     # #404D66 — muted accent bar
C_TEXT     = '#c9d1d9'
C_DIM      = '#6e7681'
C_CYAN     = '#7eaab8'
C_GREEN    = '#56d364'
C_YELLOW   = '#e3b341'
C_ORANGE   = '#f0883e'
C_RED      = '#f85149'

# CSS colors for labels
CC_TEXT  = C_TEXT
CC_DIM   = C_DIM
CC_CYAN  = C_CYAN
CC_GREEN = C_GREEN
CC_YELLOW= C_YELLOW
CC_ORANGE= C_ORANGE
CC_RED   = C_RED

GAP        = 16   # px from screen edge
TOP_BAR    = 36   # height of GNOME top panel
WIDGET_W   = 360  # right-side widget width
LEFT_W     = 320  # left-side widget width
POLL_MS    = 5000 # default refresh interval
RADIUS     = 10   # corner radius px
ACCENT_H   = 4    # top accent bar height px

SHARED_CSS = f"""
* {{
    background: transparent;
}}
.widget-title {{
    color: {C_CYAN};
    font-weight: 500;
    font-size: 13px;
    letter-spacing: 1.5px;
}}
.widget-title-icon {{
    color: {C_CYAN};
    font-size: 15px;
}}
.widget-text {{
    color: {C_TEXT};
    font-size: 13px;
}}
.widget-text-sm {{
    color: {C_TEXT};
    font-size: 12px;
}}
.widget-dim {{
    color: {C_DIM};
    font-size: 11px;
}}
.widget-name {{
    color: #dce8ff;
    font-size: 15px;
    font-weight: bold;
}}
.widget-key {{
    color: {C_CYAN};
    font-size: 14px;
    font-weight: bold;
}}
separator.robos-sep {{
    background-color: rgba(48,58,74,1);
    min-height: 1px;
    margin-top: 2px;
    margin-bottom: 2px;
}}
""".encode()


def get_monitor_geometry():
    display = Gdk.Display.get_default()
    mon = display.get_primary_monitor() or display.get_monitor(0)
    return mon.get_geometry()


def read_json(path, default=None):
    try:
        return json.loads(open(os.path.expanduser(path)).read())
    except Exception:
        return default if default is not None else {}


# ── Base overlay window ────────────────────────────────────────────────────────
def _hex_to_rgb(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i+2], 16) / 255.0 for i in (0, 2, 4))

def _rounded_rect(cr, x, y, w, h, r):
    cr.new_sub_path()
    cr.arc(x + r,     y + r,     r, 3.14159, 3.0*3.14159/2)
    cr.arc(x + w - r, y + r,     r, 3.0*3.14159/2, 0)
    cr.arc(x + w - r, y + h - r, r, 0, 3.14159/2)
    cr.arc(x + r,     y + h - r, r, 3.14159/2, 3.14159)
    cr.close_path()

class DesktopWidget(Gtk.Window):
    def __init__(self, width, poll_ms=POLL_MS):
        super().__init__()
        self._width = width
        self._poll_ms = poll_ms

        self.set_decorated(False)
        self.set_resizable(False)
        self.set_skip_taskbar_hint(True)
        self.set_skip_pager_hint(True)
        self.set_keep_above(False)
        self.set_keep_below(True)
        self.set_accept_focus(False)
        self.set_type_hint(Gdk.WindowTypeHint.DESKTOP)
        self.set_app_paintable(True)

        screen = self.get_screen()
        visual = screen.get_rgba_visual()
        if visual:
            self.set_visual(visual)

        css = Gtk.CssProvider()
        css.load_from_data(SHARED_CSS)
        Gtk.StyleContext.add_provider_for_screen(
            screen, css, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION)

        # Outer wrapper with padding for content
        self._outer = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=0)
        self._outer.set_margin_top(ACCENT_H + 10)
        self._outer.set_margin_bottom(14)
        self._outer.set_margin_start(16)
        self._outer.set_margin_end(16)
        self.add(self._outer)

        self.connect('realize', self._on_realize)
        self.connect('draw', self._on_draw)

    def _on_draw(self, widget, cr):
        w = widget.get_allocated_width()
        h = widget.get_allocated_height()
        r = RADIUS

        # Clear to transparent
        cr.set_operator(cairo.OPERATOR_CLEAR)
        cr.paint()
        cr.set_operator(cairo.OPERATOR_OVER)

        # Main background fill — solid dark navy
        _rounded_rect(cr, 0, 0, w, h, r)
        cr.set_source_rgba(*C_BG, 0.97)
        cr.fill_preserve()

        # Border stroke
        cr.set_source_rgba(*C_BORDER, 0.9)
        cr.set_line_width(2)
        cr.stroke()

        # Top accent bar
        cr.rectangle(r, 0, w - 2*r, ACCENT_H)
        cr.arc(w - r, r, r, -3.14159/2, 0)
        cr.arc(r, r, r, 3.14159, 3.0*3.14159/2)
        cr.close_path()
        cr.set_source_rgba(*C_ACCENT, 1.0)
        cr.fill()

        return False  # let children draw on top

    def _on_realize(self, *_):
        self._place()
        self._push_to_bottom()
        if self._poll_ms:
            GLib.timeout_add(self._poll_ms, self._refresh_and_place)

    def _push_to_bottom(self):
        """Lower this window below all others via X11 WM call."""
        gdkwin = self.get_window()
        if gdkwin:
            gdkwin.lower()
            display = gdkwin.get_display()
            display.flush()

    def _place(self):
        pass

    def _refresh_and_place(self):
        self._build_content()
        self.show_all()
        self._place()
        self._push_to_bottom()
        return True

    def _clear(self):
        for child in self._outer.get_children():
            self._outer.remove(child)

    def _add_title(self, text, icon='◈'):
        row = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL, spacing=6)
        icon_lbl = Gtk.Label(label=icon)
        icon_lbl.get_style_context().add_class('widget-title-icon')
        row.pack_start(icon_lbl, False, False, 0)
        title_lbl = Gtk.Label(label=text.upper())
        title_lbl.get_style_context().add_class('widget-title')
        title_lbl.set_xalign(0)
        row.pack_start(title_lbl, True, True, 0)
        row.set_margin_bottom(6)
        self._outer.pack_start(row, False, False, 0)
        sep = Gtk.Separator()
        sep.get_style_context().add_class('robos-sep')
        self._outer.pack_start(sep, False, False, 0)

    def _add_sep(self):
        sep = Gtk.Separator()
        sep.get_style_context().add_class('robos-sep')
        self._outer.pack_start(sep, False, False, 4)

    def _add_label(self, markup, css_class='widget-text', xalign=0, margin_top=0):
        lbl = Gtk.Label()
        lbl.set_markup(markup)
        lbl.get_style_context().add_class(css_class)
        lbl.set_xalign(xalign)
        lbl.set_line_wrap(True)
        lbl.set_line_wrap_mode(Pango.WrapMode.WORD_CHAR)
        lbl.set_max_width_chars(self._width // 8)
        if margin_top:
            lbl.set_margin_top(margin_top)
        self._outer.pack_start(lbl, False, False, 3)

    def _build_content(self):
        pass

    def show_all_widgets(self):
        self._build_content()
        self.show_all()
        self._push_to_bottom()


# ── 1. Copilot Quota ───────────────────────────────────────────────────────────
class CopilotQuotaWidget(DesktopWidget):
    def __init__(self):
        super().__init__(width=WIDGET_W, poll_ms=30_000)

    def _place(self):
        geom = get_monitor_geometry()
        self.set_size_request(WIDGET_W, -1)
        self.show_all()
        self.move(geom.width - WIDGET_W - GAP, TOP_BAR + GAP)

    def _build_content(self):
        self._clear()
        self._add_title('COPILOT PREMIUM REQUESTS', '🤖')

        cache = read_json('/tmp/robos-copilot-quota.cache')
        # Discard cache if it contains an API error (e.g. 401 auth failure)
        if cache and ('quota_snapshots' not in cache):
            import os; os.remove('/tmp/robos-copilot-quota.cache')
            cache = None
        if not cache:
            subprocess.Popen(
                ['bash', '-c',
                 'DATA=$(gh api /copilot_internal/user 2>/dev/null); '
                 'echo "$DATA" | python3 -c "import sys,json; d=json.load(sys.stdin); assert \'quota_snapshots\' in d" 2>/dev/null '
                 '&& echo "$DATA" > /tmp/robos-copilot-quota.cache'],
                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            self._add_label(f'<span foreground="{C_DIM}">Loading…</span>')
            return

        try:
            pi          = cache['quota_snapshots']['premium_interactions']
            remaining   = pi['remaining']
            entitlement = pi['entitlement']
            pct         = pi['percent_remaining']
            unlimited   = pi.get('unlimited', False)
            reset_date  = cache.get('quota_reset_date', '?')

            if unlimited:
                self._add_label(f'<span foreground="{C_GREEN}">∞  Unlimited requests</span>', 'widget-text')
                return

            if pct >= 60:   color = C_GREEN
            elif pct >= 30: color = C_YELLOW
            elif pct >= 10: color = C_ORANGE
            else:           color = C_RED

            pct_int    = int(round(pct))
            bar_filled = round(pct_int / 5)
            bar        = '█' * bar_filled + '░' * (20 - bar_filled)

            self._add_label(
                f'<span foreground="{C_DIM}">Remaining  </span>'
                f'<span foreground="{color}" size="large"><b>{remaining}</b></span>'
                f'<span foreground="{C_DIM}"> / {entitlement}</span>',
                margin_top=4)
            self._add_label(
                f'<span foreground="{C_DIM}">Used       </span>'
                f'<span foreground="{C_TEXT}">{entitlement - remaining}</span>')
            self._add_label(
                f'<span foreground="{C_DIM}">Resets     </span>'
                f'<span foreground="{C_TEXT}">{reset_date}</span>')
            self._add_sep()
            self._add_label(
                f'<span foreground="{color}" font_family="monospace" size="small">{bar}</span>')
            self._add_label(f'<span foreground="{color}"><b>{pct_int}%</b> remaining</span>', 'widget-text')
        except Exception as e:
            self._add_label(f'<span foreground="{C_DIM}">Error: {GLib.markup_escape_text(str(e))}</span>')


# ── 2. Pass Status ─────────────────────────────────────────────────────────────
class PassStatusWidget(DesktopWidget):
    def __init__(self, quota_widget):
        super().__init__(width=WIDGET_W, poll_ms=5_000)
        self._quota = quota_widget

    def _place(self):
        geom = get_monitor_geometry()
        self.set_size_request(WIDGET_W, -1)
        self.show_all()
        _, qh = self._quota.get_size()
        self.move(geom.width - WIDGET_W - GAP, TOP_BAR + GAP + qh + GAP)

    def _build_content(self):
        self._clear()
        self._add_title('AGENT PASS STORE', '🔐')

        script = None
        for p in ['~/.local/bin/pass-status.sh', '/usr/local/share/robos/pass-status.sh']:
            expanded = os.path.expanduser(p)
            if os.path.exists(expanded):
                script = expanded
                break

        lines = []
        if script:
            try:
                result = subprocess.run(['bash', script], capture_output=True, text=True, timeout=10)
                lines = [l.strip() for l in result.stdout.strip().split('\n') if l.strip()]
            except Exception as e:
                lines = [f'>> Pass: status check failed ({e.__class__.__name__})']

        if lines:
            for line in lines:
                if 'unlocked' in line.lower():
                    color = C_GREEN
                elif 'locked' in line.lower() or 'failed' in line.lower():
                    color = C_RED
                else:
                    color = C_TEXT
                self._add_label(f'<span foreground="{color}">{GLib.markup_escape_text(line)}</span>')
        else:
            self._add_label(f'<span foreground="{C_DIM}">pass not initialized</span>')

        self._add_sep()
        self._add_label(
            f'<span foreground="{C_DIM}">Secrets managed by pass + gpg-agent</span>',
            css_class='widget-dim')


# ── 3. AI Journal ──────────────────────────────────────────────────────────────
class JournalWidget(DesktopWidget):
    def __init__(self, quota_widget, pass_widget):
        super().__init__(width=WIDGET_W, poll_ms=30_000)
        self._quota = quota_widget
        self._pass  = pass_widget

    def _place(self):
        geom = get_monitor_geometry()
        self.set_size_request(WIDGET_W, -1)
        self.show_all()
        _, qh = self._quota.get_size()
        _, ph = self._pass.get_size()
        self.move(geom.width - WIDGET_W - GAP, TOP_BAR + GAP + qh + GAP + ph + GAP)

    def _build_content(self):
        self._clear()
        self._add_title('AI JOURNAL', '📓')

        data    = read_json('~/.config/robos/journal-events.json', default=[])
        entries = [e for e in data if e.get('type') == 'journal-entry']
        entries.sort(key=lambda e: e.get('timestamp', ''), reverse=True)
        latest  = entries[:3]

        if not latest:
            self._add_label(f'<span foreground="{C_DIM}">No journal entries yet</span>')
        else:
            for i, e in enumerate(latest):
                if i > 0:
                    self._add_sep()
                title   = re.sub(r'^[📓📋]\s*', '', e.get('title', 'Journal Entry'))
                detail  = e.get('detail', '')
                snippet = (detail[:80].rsplit(' ', 1)[0] + '…') if len(detail) > 80 else detail
                ts_str  = e.get('timestamp', '')
                try:
                    dt = datetime.fromisoformat(ts_str.replace('Z', '+00:00'))
                    date_label = dt.strftime('%-d %b %Y')
                except Exception:
                    date_label = ts_str[:10]
                self._add_label(
                    f'<span foreground="{C_GREEN}" size="medium"><b>{GLib.markup_escape_text(title)}</b></span>')
                self._add_label(f'<span foreground="{C_DIM}">{date_label}</span>', 'widget-dim')
                if snippet:
                    self._add_label(
                        f'<span foreground="{C_TEXT}">{GLib.markup_escape_text(snippet)}</span>', 'widget-text-sm')

        self._add_sep()
        self._add_label(f'<span foreground="{C_DIM}">Updated every 30s</span>', css_class='widget-dim')


# ── 4. Profile ─────────────────────────────────────────────────────────────────
class ProfileWidget(DesktopWidget):
    def __init__(self):
        super().__init__(width=LEFT_W, poll_ms=30_000)

    def _place(self):
        self.set_size_request(LEFT_W, -1)
        self.show_all()
        self.move(GAP, TOP_BAR + GAP)

    def _build_content(self):
        self._clear()
        self._add_title('IDENTITY', '👤')

        settings = read_json('~/.config/robos/settings.json')
        uid      = settings.get('myProfileUid', 'robos')
        person   = read_json(f'~/.config/robos/people/{uid}.json')

        if not person:
            self._add_label(f'<span foreground="{C_DIM}">No profile linked</span>')
        else:
            first    = person.get('firstName', '')
            last     = person.get('lastName', '')
            initials = (first[:1] + last[:1]).upper() or '?'
            name     = person.get('displayName') or f'{first} {last}'.strip() or uid
            title    = person.get('title', '')
            dept     = person.get('department', '')
            loc      = person.get('location', '')

            # Avatar circle + name row
            avatar_box = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL, spacing=10)
            circle = Gtk.Label(label=initials)
            circle.set_size_request(42, 42)
            avatar_attr = Pango.AttrList()
            avatar_attr.insert(Pango.AttrSize.new(14 * 1024))
            circle.set_attributes(avatar_attr)
            circle_frame = Gtk.Frame()
            circle_frame.set_shadow_type(Gtk.ShadowType.NONE)
            circle_frame.add(circle)
            avatar_box.pack_start(circle_frame, False, False, 0)

            name_col = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=2)
            name_lbl = Gtk.Label(label=name)
            name_lbl.get_style_context().add_class('widget-name')
            name_lbl.set_xalign(0)
            name_col.pack_start(name_lbl, False, False, 0)
            if title:
                title_lbl = Gtk.Label(label=title)
                title_lbl.get_style_context().add_class('widget-dim')
                title_lbl.set_xalign(0)
                name_col.pack_start(title_lbl, False, False, 0)
            avatar_box.pack_start(name_col, True, True, 0)
            avatar_box.set_margin_top(6)
            avatar_box.set_margin_bottom(4)
            self._outer.pack_start(avatar_box, False, False, 0)

            if dept:
                self._add_label(f'<span foreground="{C_DIM}">⬡  {GLib.markup_escape_text(dept)}</span>', 'widget-text-sm')
            if loc:
                self._add_label(f'<span foreground="{C_DIM}">📍  {GLib.markup_escape_text(loc)}</span>', 'widget-text-sm')

        self._add_sep()
        self._add_label(f'<span foreground="{C_DIM}">uid: {uid}</span>', css_class='widget-dim')


# ── 5. Desktop Task ────────────────────────────────────────────────────────────
class DesktopTaskWidget(DesktopWidget):
    def __init__(self, profile_widget):
        super().__init__(width=LEFT_W, poll_ms=4_000)
        self._profile = profile_widget

    def _place(self):
        self.set_size_request(LEFT_W, -1)
        self.show_all()
        _, ph = self._profile.get_size()
        self.move(GAP, TOP_BAR + GAP + ph + GAP)

    def _build_content(self):
        self._clear()

        try:
            out  = subprocess.check_output(['wmctrl', '-d'], text=True, timeout=3)
            desk = next((int(l.split()[0]) + 1 for l in out.splitlines() if '*' in l), 1)
        except Exception:
            desk = 1

        self._add_title(f'WORKSPACE {desk} TASK', '🎯')

        data = read_json('~/.config/robos/desktop-tasks.json')
        task = data.get('desktops', {}).get(str(desk))

        if task:
            key   = task.get('key', '').strip()
            title = task.get('title', '').strip()
            if key:
                self._add_label(
                    f'<span foreground="{C_CYAN}"><b>{GLib.markup_escape_text(key)}</b></span>',
                    'widget-key', margin_top=4)
            if title:
                if len(title) > 60:
                    title = title[:60] + '…'
                self._add_label(
                    f'<span foreground="{C_TEXT}">{GLib.markup_escape_text(title)}</span>',
                    'widget-text-sm')
            if task.get('status'):
                self._add_sep()
                self._add_label(
                    f'<span foreground="{C_DIM}">Status  </span>'
                    f'<span foreground="{C_YELLOW}"><b>{GLib.markup_escape_text(task["status"])}</b></span>')
        else:
            self._add_label(f'<span foreground="{C_DIM}">No task assigned</span>')

        self._add_sep()
        self._add_label(
            f'<span foreground="{C_DIM}">desktop-tasks.json · wmctrl</span>',
            css_class='widget-dim')


# ── Main ───────────────────────────────────────────────────────────────────────
def main():
    quota   = CopilotQuotaWidget()
    passwid = PassStatusWidget(quota_widget=quota)
    journal = JournalWidget(quota_widget=quota, pass_widget=passwid)
    profile = ProfileWidget()
    task    = DesktopTaskWidget(profile_widget=profile)

    def _reposition_all():
        # Full rebuild+reposition in dependency order (independent first).
        # _refresh_and_place rebuilds content + show_all + _place + _push_to_bottom,
        # which is required to force GTK to actually repaint at the new position.
        for w in [quota, profile]:
            w._refresh_and_place()
        for w in [passwid, task]:
            w._refresh_and_place()
        journal._refresh_and_place()

    # Capture initial geometry so the first tick doesn't trigger a spurious reposition.
    _g = get_monitor_geometry()
    _last_geom = [(_g.width, _g.height)]

    def _poll_geometry():
        geom = get_monitor_geometry()
        current = (geom.width, geom.height)
        if current != _last_geom[0]:
            _last_geom[0] = current
            _reposition_all()
        return True  # keep polling

    GLib.timeout_add(500, _poll_geometry)

    for w in [quota, passwid, journal, profile, task]:
        w.show_all_widgets()

    Gtk.main()


if __name__ == '__main__':
    main()
