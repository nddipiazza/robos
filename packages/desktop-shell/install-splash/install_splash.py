#!/usr/bin/env python3
"""
RobOS Installation Splash — runs on tty1 during cloud-init first-boot.
Reads /tmp/robos-install-status for current step/message.
Format of status file:  line1=message  line2=step_index (0-based)
"""

import sys, time, os, signal

STATUS_FILE = '/tmp/robos-install-status'
DONE_FILE   = '/tmp/robos-install-done'

CYAN   = '\033[96m'
DIM    = '\033[2m'
BOLD   = '\033[1m'
RESET  = '\033[0m'
GREEN  = '\033[92m'
YELLOW = '\033[93m'
WHITE  = '\033[97m'
GREY   = '\033[90m'

LOGO = [
    r"  ██████╗  ██████╗ ██████╗  ██████╗ ███████╗",
    r"  ██╔══██╗██╔═══██╗██╔══██╗██╔═══██╗██╔════╝",
    r"  ██████╔╝██║   ██║██████╔╝██║   ██║███████╗",
    r"  ██╔══██╗██║   ██║██╔══██╗██║   ██║╚════██║",
    r"  ██║  ██║╚██████╔╝██████╔╝╚██████╔╝███████║",
    r"  ╚═╝  ╚═╝ ╚═════╝ ╚═════╝  ╚═════╝ ╚══════╝",
]

STEPS = [
    "Base system",
    "Display manager",
    "Shell (zsh + oh-my-zsh)",
    "GitHub CLI",
    "VS Code",
    "Google Chrome",
    "Plymouth boot theme",
    "Finalising",
]

TOTAL = len(STEPS)


def clear():
    sys.stdout.write('\033[2J\033[H')
    sys.stdout.flush()


def move(row, col):
    sys.stdout.write(f'\033[{row};{col}H')


def draw(status, step_idx):
    try:
        cols, rows = os.get_terminal_size()
    except Exception:
        cols, rows = 80, 24

    clear()

    # ── Logo ───────────────────────────────────────────────────────────────
    logo_row = 2
    for i, line in enumerate(LOGO):
        col = max(1, (cols - len(line)) // 2 + 1)
        move(logo_row + i, col)
        sys.stdout.write(f'{CYAN}{BOLD}{line}{RESET}')

    sub = "AI-Powered SDLC Operating System"
    move(logo_row + len(LOGO) + 1, (cols - len(sub)) // 2 + 1)
    sys.stdout.write(f'{DIM}{WHITE}{sub}{RESET}')

    # ── Progress bar ───────────────────────────────────────────────────────
    bar_row = logo_row + len(LOGO) + 3
    bar_w   = min(52, cols - 14)
    pct     = min(100, int(100 * step_idx / TOTAL))
    filled  = int(bar_w * pct / 100)
    empty   = bar_w - filled

    move(bar_row, (cols - bar_w - 8) // 2 + 1)
    sys.stdout.write(
        f'{DIM}[{RESET}'
        f'{CYAN}{"█" * filled}{RESET}'
        f'{GREY}{"░" * empty}{RESET}'
        f'{DIM}]{RESET} '
        f'{BOLD}{WHITE}{pct:3d}%{RESET}'
    )

    # ── Current action ─────────────────────────────────────────────────────
    move(bar_row + 2, (cols - len(status)) // 2 + 1)
    sys.stdout.write(f'{BOLD}{CYAN}▶  {WHITE}{status}{RESET}')

    # ── Full step checklist ────────────────────────────────────────────────
    list_row = bar_row + 4
    list_col = max(1, (cols - 36) // 2 + 1)
    for j, s in enumerate(STEPS):
        move(list_row + j, list_col)
        if j < step_idx:
            sys.stdout.write(f'  {GREEN}✓  {DIM}{s}{RESET}')
        elif j == step_idx:
            sys.stdout.write(f'  {CYAN}▶  {BOLD}{WHITE}{s}  {DIM}(installing…){RESET}')
        else:
            sys.stdout.write(f'  {GREY}○  {s}{RESET}')

    sys.stdout.flush()


def main():
    signal.signal(signal.SIGTERM, lambda *_: sys.exit(0))
    sys.stdout.write('\033[?25l')  # hide cursor
    try:
        status   = "Preparing installation…"
        step_idx = 0
        while not os.path.exists(DONE_FILE):
            try:
                if os.path.exists(STATUS_FILE):
                    lines = open(STATUS_FILE).read().strip().splitlines()
                    status   = lines[0] if lines else status
                    step_idx = int(lines[1]) if len(lines) > 1 else step_idx
            except Exception:
                pass
            draw(status, step_idx)
            time.sleep(0.4)

        # Final frame
        draw("Installation complete — rebooting into desktop…", TOTAL)
        time.sleep(3)
    finally:
        sys.stdout.write('\033[?25h')  # restore cursor
        clear()


if __name__ == '__main__':
    main()
