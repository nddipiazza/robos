#!/usr/bin/env bash
# Configure Tilix with RobOS dark profile (runs once per user)
FLAG="$HOME/.config/tilix/.robos-configured"
[ -f "$FLAG" ] && exit 0

mkdir -p "$HOME/.config/tilix"

dconf load /com/gexperts/Tilix/ <<'TILIX_EOF'
[profiles/list]
list=['robos-profile-1111-2222-3333-444444444444']
default='robos-profile-1111-2222-3333-444444444444'

[profiles/robos-profile-1111-2222-3333-444444444444]
background-color='#1A1A2E'
foreground-color='#E0E0E0'
cursor-colors-set=true
cursor-background-color='#00BCD4'
cursor-foreground-color='#1A1A2E'
badge-color-set=false
bold-color-set=false
font='Monospace 11'
use-system-font=false
use-theme-colors=false
visible-name='RobOS'
terminal-title-style='none'
palette=['#1a1a2e', '#ef5350', '#00bcd4', '#ffb74d', '#42a5f5', '#ce93d8', '#26c6da', '#bdbdbd', '#616161', '#ef9a9a', '#80deea', '#ffe082', '#90caf9', '#f48fb1', '#80cbc4', '#e0e0e0']

[/]
theme-variant='dark'
TILIX_EOF

touch "$FLAG"
