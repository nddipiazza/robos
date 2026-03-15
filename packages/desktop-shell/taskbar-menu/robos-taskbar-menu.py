#!/usr/bin/env python3
"""RobOS Taskbar Context Menu Daemon

Uses the X RECORD extension to passively observe button-3 presses
in the tint2 panel area. Shows a menu only for the window whose
taskbar button was right-clicked.
"""
import subprocess, sys, os, time, threading, tempfile

os.environ.setdefault('DISPLAY', ':0')

from Xlib import X, display as xdisplay, Xatom
from Xlib.ext import record
from Xlib.protocol import rq

PANEL_HEIGHT  = 46    # px from bottom
DEBOUNCE      = 0.5   # seconds
LAUNCHER_W    = 380   # 11 icons * ~34px each (icon_size=24 + padding 4+6)
RIGHT_W       = 290   # systray + clock + executor on right
SCREEN_W      = 1920
MAX_BTN_W     = 200   # task_maximum_size from tint2rc

def run(*cmd):
    try:
        return subprocess.run(
            cmd, capture_output=True, text=True, timeout=6,
            env={**os.environ, 'DISPLAY': ':0'})
    except Exception:
        return None

def get_client_list(d):
    """Return (wid, title) list in _NET_CLIENT_LIST order (= taskbar order)."""
    root  = d.screen().root
    atom  = d.intern_atom('_NET_CLIENT_LIST')
    name_atom = d.intern_atom('_NET_WM_NAME')
    prop  = root.get_full_property(atom, Xatom.WINDOW)
    wins  = []
    if not prop:
        return wins
    for wid in prop.value:
        w = d.create_resource_object('window', wid)
        try:
            cls = w.get_wm_class()
            if cls and cls[0] and 'tint2' in cls[0].lower():
                continue
            p = w.get_full_property(name_atom, 0)
            title = p.value.decode('utf-8', errors='replace') if p else '?'
            wins.append((wid, title))
        except Exception:
            pass
    return wins

def pick_window_by_x(click_x, wins):
    """Map taskbar click X to a window using button geometry estimates."""
    if not wins:
        return None
    n = len(wins)
    avail = SCREEN_W - LAUNCHER_W - RIGHT_W
    btn_w = min(MAX_BTN_W, avail // n)
    rel   = click_x - LAUNCHER_W
    if rel < 0:
        return None   # clicked a launcher icon, not a task button
    idx = int(rel // btn_w)
    if 0 <= idx < n:
        return wins[idx]
    return None

def escape_title(t):
    return t.replace('&', '&amp;').replace('<', '').replace('>', '').replace('"', "'")

def show_menu_for(wid, title):
    short = escape_title((title[:40] + '...') if len(title) > 40 else title)
    D = 'DISPLAY=:0'
    lines = [
        f'{short},',
        f'Minimize,{D} xdotool windowminimize {wid}',
        f'Maximize / Restore,{D} xdotool windowstate --toggle MAXIMIZED_VERT {wid}; {D} xdotool windowstate --toggle MAXIMIZED_HORZ {wid}',
        f'Send to Workspace 1,{D} xdotool set_desktop_for_window {wid} 0',
        f'Send to Workspace 2,{D} xdotool set_desktop_for_window {wid} 1',
        f'Close,{D} wmctrl -ic {wid}',
    ]
    with tempfile.NamedTemporaryFile(mode='w', suffix='.csv', delete=False) as f:
        f.write('\n'.join(lines) + '\n')
        tmpfile = f.name
    try:
        proc = subprocess.Popen(
            ['jgmenu', '--vsimple', '--at-pointer', f'--csv-file={tmpfile}'],
            env={**os.environ, 'DISPLAY': ':0'})
        proc.wait(timeout=60)
    except Exception as e:
        print(f'jgmenu error: {e}', file=sys.stderr)
    finally:
        try: os.unlink(tmpfile)
        except Exception: pass

def handle_click(click_x, local_dpy):
    wins = get_client_list(local_dpy)
    target = pick_window_by_x(click_x, wins)
    if target is None and wins:
        # Fallback: use active window
        r = run('xdotool', 'getactivewindow')
        if r and r.stdout.strip().isdigit():
            active = int(r.stdout.strip())
            target = next((w for w in wins if w[0] == active), wins[0])
        else:
            target = wins[0]
    if target:
        show_menu_for(*target)

def main():
    local_dpy  = xdisplay.Display()
    record_dpy = xdisplay.Display()

    if not record_dpy.has_extension('RECORD'):
        print('ERROR: X RECORD extension not available', file=sys.stderr)
        sys.exit(1)

    screen_h  = local_dpy.screen().height_in_pixels
    taskbar_y = screen_h - PANEL_HEIGHT
    print(f'RobOS taskbar menu: screen={screen_h}px, taskbar_y>={taskbar_y}', flush=True)

    last_trigger = [0.0]

    def callback(reply):
        if reply.category != record.FromServer:
            return
        if reply.client_swapped:
            return
        if not reply.data or reply.data[0] < 2:
            return
        data = reply.data
        while data:
            event, data = rq.EventField(None).parse_binary_value(
                data, local_dpy.display, None, None)
            if event.type == X.ButtonPress and event.detail == 3:
                if event.root_y >= taskbar_y:
                    now = time.time()
                    if now - last_trigger[0] > DEBOUNCE:
                        last_trigger[0] = now
                        click_x = event.root_x
                        threading.Thread(
                            target=handle_click,
                            args=(click_x, local_dpy),
                            daemon=True).start()

    ctx = record_dpy.record_create_context(
        0, [record.AllClients],
        [{'core_requests': (0,0), 'core_replies': (0,0),
          'ext_requests': (0,0,0,0), 'ext_replies': (0,0,0,0),
          'delivered_events': (0,0),
          'device_events': (X.ButtonPressMask, X.ButtonPressMask),
          'errors': (0,0), 'client_started': False, 'client_died': False}])

    print('Listening via RECORD extension…', flush=True)
    record_dpy.record_enable_context(ctx, callback)
    record_dpy.record_free_context(ctx)

if __name__ == '__main__':
    main()
