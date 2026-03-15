#!/usr/bin/env python3
"""
RobOS Copilot Swim Lane Overlay

Shows active copilot streaming sessions as swim lanes on the right side of the desktop.

Sources:
  1. ~/.config/robos/copilot-streams/*.json  (written by agents-manager / robos-copilot-lib)
  2. Live `gh copilot` processes detected via /proc scanning (terminal sessions)

Each active session = one horizontal lane:
  ⟳ Session name           [streaming]
    › last output line (up to 100 chars)...
  ✓ Session name           [done 5s ago]
"""

import gi
gi.require_version('Gtk', '3.0')
gi.require_version('Gdk', '3.0')
from gi.repository import Gtk, Gdk, GLib
import json, os, time, glob, subprocess, re

STREAMS_DIR    = os.path.expanduser('~/.config/robos/copilot-streams')
CLEANUP_AFTER  = 20    # seconds after 'done' before removing lane
STALE_AFTER    = 7200  # seconds — remove streaming entries with no update (2 hours)
POLL_INTERVAL  = 1500  # ms — poll streams + ps every 1.5s
TEXT_MAXLEN    = 100   # max chars of last output line to show


class SwimLane(Gtk.Box):
    """One horizontal lane for a single copilot stream."""

    def __init__(self, data):
        super().__init__(orientation=Gtk.Orientation.VERTICAL, spacing=1)
        self.set_margin_top(4)
        self.set_margin_bottom(4)

        status = data.get('status', 'streaming')
        title  = data.get('title', '')[:58]
        lines  = data.get('output_lines', [])
        last   = (lines[-1] if lines else data.get('last_line', ''))[:TEXT_MAXLEN]

        if status == 'streaming':
            icon, icol = '⟳', '#00e5ff'
            started = data.get('started', 0)
            elapsed = int(time.time() - started / 1000) if started else 0
            source = data.get('source', '')
            elapsed_str = f'{elapsed}s' if elapsed < 3600 else f'{elapsed//3600}h{(elapsed%3600)//60}m'
            stat_label = f'{elapsed_str}' + (f' · {source}' if source else '')
            stat_col, stat_txt = '#00bcd4', stat_label
        elif status == 'done':
            icon, icol = '✓', '#69f0ae'
            ended = data.get('ended', 0)
            ago = int(time.time() - ended / 1000) if ended else 0
            stat_col, stat_txt = '#4caf50', f'done {ago}s ago' if ago < 60 else 'done'
        else:
            icon, icol = '✗', '#ff5252'
            stat_col, stat_txt = '#f44336', 'error'

        # Top row: icon + title + status badge
        top = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL, spacing=6)

        icon_lbl = Gtk.Label()
        icon_lbl.set_markup(
            f'<span foreground="{icol}" font="DejaVu Sans 10">{icon}</span>')
        top.pack_start(icon_lbl, False, False, 0)

        title_lbl = Gtk.Label()
        title_lbl.set_markup(
            f'<span foreground="#dde0ff" font="DejaVu Sans Bold 8">'
            f'{GLib.markup_escape_text(title)}</span>')
        title_lbl.set_xalign(0)
        title_lbl.set_ellipsize(3)   # PANGO_ELLIPSIZE_END
        top.pack_start(title_lbl, True, True, 0)

        badge = Gtk.Label()
        badge.set_markup(
            f'<span foreground="{stat_col}" font="DejaVu Sans 7">[{stat_txt}]</span>')
        top.pack_end(badge, False, False, 0)

        self.pack_start(top, False, False, 0)

        # Output lines (up to 4)
        output_lines = data.get('output_lines', [])
        if not output_lines and last:
            output_lines = [last]
        for ol in output_lines[-4:]:
            ol = ol[:TEXT_MAXLEN].strip()
            if not ol:
                continue
            line_lbl = Gtk.Label()
            line_lbl.set_markup(
                f'<span foreground="#556688" font="DejaVu Sans 7">'
                f'  › {GLib.markup_escape_text(ol)}</span>')
            line_lbl.set_xalign(0)
            line_lbl.set_ellipsize(3)
            line_lbl.set_max_width_chars(60)
            self.pack_start(line_lbl, False, False, 0)

        # Separator
        sep = Gtk.Separator(orientation=Gtk.Orientation.HORIZONTAL)
        sep.set_margin_top(3)
        self.pack_start(sep, False, False, 0)


class CopilotSwimLaneOverlay(Gtk.Window):
    def __init__(self):
        super().__init__(type=Gtk.WindowType.TOPLEVEL)
        self.set_decorated(False)
        self.set_app_paintable(True)
        self.set_skip_taskbar_hint(True)
        self.set_skip_pager_hint(True)
        self.set_keep_below(True)
        self.set_type_hint(Gdk.WindowTypeHint.DOCK)
        self.set_accept_focus(False)

        screen = self.get_screen()
        visual = screen.get_rgba_visual()
        if visual:
            self.set_visual(visual)

        display = Gdk.Display.get_default()
        monitor = display.get_primary_monitor() or display.get_monitor(0)
        geom = monitor.get_geometry()
        self.screen_w = geom.width
        self.screen_h = geom.height

        self.set_size_request(370, 10)

        self.outer = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=0)
        self.outer.set_margin_start(10)
        self.outer.set_margin_end(10)
        self.outer.set_margin_top(6)
        self.outer.set_margin_bottom(6)
        self.add(self.outer)

        self.connect('draw', self._on_draw)

        self.streams = {}    # id -> data dict
        self._visible = False

        GLib.timeout_add(POLL_INTERVAL, self._refresh)
        self._refresh()

    # ── drawing ──────────────────────────────────────────────────────────────

    def _on_draw(self, _widget, cr):
        cr.set_source_rgba(0.04, 0.08, 0.18, 0.93)
        cr.paint()
        return False

    # ── poll loop ─────────────────────────────────────────────────────────────

    def _scan_proc_sessions(self):
        """Detect live `gh copilot` terminal processes via /proc."""
        sessions = {}
        try:
            for pid in os.listdir('/proc'):
                if not pid.isdigit():
                    continue
                try:
                    cmdline = open(f'/proc/{pid}/cmdline').read().replace('\0', ' ').strip()
                except:
                    continue
                if 'gh' not in cmdline or 'copilot' not in cmdline:
                    continue
                # Skip our own agents-manager spawned ones (they write JSON themselves)
                # Only pick up interactive/terminal sessions
                sid = f'proc-{pid}'
                # Get start time from /proc/<pid>/stat field 22 (starttime in jiffies)
                try:
                    stat = open(f'/proc/{pid}/stat').read().split()
                    boot_time = int(open('/proc/stat').read().split('\nbtime ')[1].split()[0])
                    hz = os.sysconf('SC_CLK_TCK')
                    start_sec = boot_time + int(stat[21]) / hz
                    started_ms = int(start_sec * 1000)
                except:
                    started_ms = int(time.time() * 1000)
                # Derive a readable title from cmdline
                cmd_parts = cmdline.strip().split()
                # e.g. "gh copilot suggest ..." or "gh copilot -- -p ..."
                title_parts = [p for p in cmd_parts[2:] if not p.startswith('-')]
                title = ' '.join(title_parts)[:55] or 'gh copilot'
                sessions[sid] = {
                    'id': sid,
                    'title': title,
                    'status': 'streaming',
                    'last_line': cmdline[:TEXT_MAXLEN],
                    'output_lines': [],
                    'started': started_ms,
                    'ended': None,
                    'source': 'terminal',
                    'pid': int(pid),
                }
        except:
            pass
        return sessions

    def _refresh(self):
        os.makedirs(STREAMS_DIR, exist_ok=True)
        files = glob.glob(os.path.join(STREAMS_DIR, '*.json'))

        seen = set()
        changed = False

        # ── 1. Read stream JSON files (agents-manager / robos-copilot-lib) ──
        for f in files:
            try:
                data = json.load(open(f))
            except Exception:
                continue
            sid = data.get('id', '')
            if not sid:
                continue
            seen.add(sid)

            # Auto-clean finished streams past TTL
            if data.get('status') in ('done', 'error') and data.get('ended'):
                age = time.time() - data['ended'] / 1000
                if age > CLEANUP_AFTER:
                    try: os.unlink(f)
                    except: pass
                    continue

            # Auto-clean streaming entries that are stale (no update for STALE_AFTER seconds)
            if data.get('status') == 'streaming' and data.get('started'):
                age = time.time() - data['started'] / 1000
                if age > STALE_AFTER:
                    try: os.unlink(f)
                    except: pass
                    continue

            if self.streams.get(sid) != data:
                self.streams[sid] = data
                changed = True

        # ── 2. Scan /proc for live `gh copilot` terminal processes ──────────
        proc_sessions = self._scan_proc_sessions()
        # Add new proc sessions; remove ones that have a JSON file already
        for sid, data in proc_sessions.items():
            # Don't show if already tracked via JSON (agents-manager handles it)
            managed_pids = {d.get('pid') for d in self.streams.values() if 'pid' not in d.__class__.__name__}
            seen.add(sid)
            if self.streams.get(sid) != data:
                self.streams[sid] = data
                changed = True

        # ── 3. Remove streams whose files disappeared and procs that exited ─
        for sid in list(self.streams):
            if sid not in seen:
                del self.streams[sid]
                changed = True

        if changed:
            self._rebuild()
        elif self.streams:
            # Redraw even without data changes so elapsed timers update
            self._rebuild()

        return True   # keep timer alive

    # ── rebuild lanes ─────────────────────────────────────────────────────────

    def _rebuild(self):
        for w in self.outer.get_children():
            self.outer.remove(w)

        # Show streaming first, then recently-done
        active  = [(sid, d) for sid, d in self.streams.items()
                   if d.get('status') == 'streaming']
        recent  = [(sid, d) for sid, d in self.streams.items()
                   if d.get('status') in ('done', 'error')]

        visible = sorted(active,  key=lambda x: x[1].get('started', 0)) + \
                  sorted(recent,  key=lambda x: x[1].get('ended', 0), reverse=True)

        # Header
        hdr = Gtk.Label()
        hdr.set_markup(
            '<span foreground="#00bcd4" font="DejaVu Sans Bold 8">'
            '⟳  COPILOT AGENTS</span>')
        hdr.set_xalign(0)
        hdr.set_margin_bottom(4)
        self.outer.pack_start(hdr, False, False, 0)

        if not visible:
            empty = Gtk.Label()
            empty.set_markup(
                '<span foreground="#30363d" font="DejaVu Sans 8">'
                '  no active agents</span>')
            empty.set_xalign(0)
            self.outer.pack_start(empty, False, False, 0)
        else:
            for _sid, data in visible:
                lane = SwimLane(data)
                self.outer.pack_start(lane, False, False, 0)

        self._set_visible(True)
        self._reposition()

    # ── helpers ───────────────────────────────────────────────────────────────

    def _set_visible(self, vis):
        if vis:
            self.show_all()
            self._visible = True
        elif self._visible:
            self.hide()
            self._visible = False

    def _reposition(self):
        self.show_all()
        # Defer move until after the window is mapped so WM respects it
        GLib.idle_add(self._do_move)

    def _do_move(self):
        # copilot-quota conky actual position: x=1588, y=8 (from wmctrl)
        CONKY_LEFT  = 1588  # actual left edge of copilot-quota conky
        SWIM_WIDTH  = 370
        x = CONKY_LEFT - SWIM_WIDTH + 30 - 60
        y = 8              # matches actual conky top y
        _w, h = self.get_size()
        self.move(x, y)
        self.resize(SWIM_WIDTH, max(h, 40))
        return False  # don't repeat


def main():
    overlay = CopilotSwimLaneOverlay()
    Gtk.main()


if __name__ == '__main__':
    main()
