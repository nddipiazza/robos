#!/usr/bin/env bash
# install.sh — deploy RobOS desktop-shell files onto the current user's system
# Run inside the VM (or on any Ubuntu machine) to apply the desktop config.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
USER_HOME="${HOME}"

echo "==> Installing RobOS desktop-shell for user: $(whoami)"

# ── 1. System packages ───────────────────────────────────────────────────────
echo "--> Installing packages..."
sudo apt-get update -qq
sudo apt-get install -y --no-install-recommends \
  xfwm4 \
  xfwm4-theme-breeze \
  imagemagick \
  tint2 \
  lightdm \
  lightdm-gtk-greeter \
  python3 \
  python3-gi \
  python3-gi-cairo \
  gir1.2-gtk-3.0 \
  tilix \
  zsh \
  x11-xserver-utils \
  librsvg2-common \
  curl \
  gnupg \
  pass \
  gopass \
  pinentry-gtk2 \
  gnome-system-monitor

# ── 2. Essential developer CLI tools ─────────────────────────────────────────
echo "--> Installing essential developer tools..."
sudo apt-get install -y --no-install-recommends \
  unzip \
  zip \
  wget \
  curl \
  jq \
  git \
  rsync \
  tree \
  less \
  file \
  lsof \
  net-tools \
  nmap \
  dnsutils \
  traceroute \
  whois \
  tmux \
  screen \
  vim \
  nano \
  htop \
  fzf \
  ripgrep \
  fd-find \
  bat \
  python3-pip \
  python3-venv \
  build-essential \
  software-properties-common \
  apt-transport-https \
  ca-certificates \
  gnupg \
  lsb-release

# ── 3. GitHub CLI (gh) ───────────────────────────────────────────────────────
if ! command -v gh &>/dev/null; then
  echo "--> Installing GitHub CLI..."
  curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
    | sudo dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] \
https://cli.github.com/packages stable main" \
    | sudo tee /etc/apt/sources.list.d/github-cli.list > /dev/null
  sudo apt-get update -qq
  sudo apt-get install -y gh
fi

# ── VS Code ───────────────────────────────────────────────────────────────────
if ! command -v code &>/dev/null; then
  echo "--> Installing VS Code..."
  wget -qO- https://packages.microsoft.com/keys/microsoft.asc \
    | sudo gpg --dearmor -o /usr/share/keyrings/microsoft.gpg
  echo "deb [arch=amd64 signed-by=/usr/share/keyrings/microsoft.gpg] https://packages.microsoft.com/repos/code stable main" \
    | sudo tee /etc/apt/sources.list.d/vscode.list > /dev/null
  sudo apt-get update -qq
  sudo apt-get install -y code
fi

# ── Chromium ──────────────────────────────────────────────────────────────────
if ! command -v chromium-browser &>/dev/null && ! command -v chromium &>/dev/null; then
  echo "--> Installing Chromium..."
  sudo apt-get install -y chromium-browser
fi

# ── 3. GitHub Copilot CLI extension ──────────────────────────────────────────
if gh extension list 2>/dev/null | grep -q "gh-copilot"; then
  echo "--> gh copilot extension already installed, upgrading..."
  gh extension upgrade gh-copilot 2>/dev/null || true
else
  echo "--> Installing gh copilot extension..."
  gh extension install github/gh-copilot 2>/dev/null || \
    echo "    (Skipping — run 'gh extension install github/gh-copilot' after 'gh auth login')"
fi

# ── 3a. GitHub Copilot CLI binary ─────────────────────────────────────────────
# The copilot binary must be copied manually from a machine that has it installed.
# On the host: scp /path/to/copilot robos@localhost:2222:/tmp/ && sudo mv /tmp/copilot /usr/local/bin/ && sudo chmod +x /usr/local/bin/copilot
if ! command -v copilot &>/dev/null; then
  echo "    [WARN] copilot CLI not found at /usr/local/bin/copilot"
  echo "    Copy the binary manually: scp <host-path>/copilot robos@<vm>:/tmp/ then sudo mv to /usr/local/bin/"
else
  echo "--> copilot CLI already installed: $(copilot --version 2>&1 | head -1)"
fi

# ── 3. zsh + oh-my-zsh ───────────────────────────────────────────────────────
echo "--> Setting zsh as default shell..."
sudo chsh -s /usr/bin/zsh "$(whoami)"

if [[ ! -d "$USER_HOME/.oh-my-zsh" ]]; then
  echo "--> Installing oh-my-zsh..."
  RUNZSH=no CHSH=no sh -c "$(curl -fsSL https://raw.githubusercontent.com/ohmyzsh/ohmyzsh/master/tools/install.sh)"
  sed -i 's/ZSH_THEME=.*/ZSH_THEME="robbyrussell"/' "$USER_HOME/.zshrc"
fi


echo "--> Installing agent panel..."
sudo mkdir -p /usr/local/bin /usr/local/share/robos /usr/local/share/applications /usr/local/share/pixmaps

sudo cp "$SCRIPT_DIR/agent-panel/agent_panel.py"     /usr/local/share/robos/agent_panel.py
sudo cp "$SCRIPT_DIR/agent-panel/icon.svg"            /usr/local/share/robos/icon.svg
sudo cp "$SCRIPT_DIR/agent-panel/agent-panel.desktop" /usr/local/share/applications/

# Wrapper executable
sudo tee /usr/local/bin/robos-agent-panel > /dev/null << 'EOF'
#!/usr/bin/env bash
exec python3 /usr/local/share/robos/agent_panel.py "$@"
EOF
sudo chmod +x /usr/local/bin/robos-agent-panel

# ── tint2 scripts & launchers ────────────────────────────────────────────────
echo "--> Installing tint2 scripts and launchers..."

sudo cp "$SCRIPT_DIR/tint2/task-widget.sh"    /usr/local/share/robos/task-widget.sh
sudo cp "$SCRIPT_DIR/tint2/task-search.py"    /usr/local/share/robos/task-search.py
sudo cp "$SCRIPT_DIR/tint2/agents-widget.sh"  /usr/local/share/robos/agents-widget.sh
sudo cp "$SCRIPT_DIR/tint2/robos-copilot.sh"  /usr/local/share/robos/robos-copilot.sh
sudo chmod +x /usr/local/share/robos/task-widget.sh \
              /usr/local/share/robos/agents-widget.sh \
              /usr/local/share/robos/robos-copilot.sh

sudo cp "$SCRIPT_DIR/tint2/copilot-cli-icon.svg"     /usr/local/share/pixmaps/copilot-cli.svg
sudo cp "$SCRIPT_DIR/tint2/copilot-cli.desktop"      /usr/local/share/applications/
sudo cp "$SCRIPT_DIR/tint2/robos-gnome-sysmon.desktop" /usr/local/share/applications/
sudo cp "$SCRIPT_DIR/tint2/robos-chrome.desktop"     /usr/local/share/applications/

# robos-copilot wrapper
sudo tee /usr/local/bin/robos-copilot > /dev/null << 'EOF'
#!/usr/bin/env bash
exec /usr/local/share/robos/robos-copilot.sh "$@"
EOF
sudo chmod +x /usr/local/bin/robos-copilot

# ── Shared Libraries (must install before any Electron app) ─────────────────

# robos-ui — Web Component library used by all Electron renderer processes
echo "--> Installing robos-ui (shared UI component library)..."
sudo rm -rf /usr/local/share/robos/robos-ui
sudo mkdir -p /usr/local/share/robos/robos-ui
sudo cp "$SCRIPT_DIR/../robos-ui/robos-ui.js"    /usr/local/share/robos/robos-ui/
sudo cp "$SCRIPT_DIR/../robos-ui/package.json"   /usr/local/share/robos/robos-ui/

# robos-cli — shared Node.js copilot runner + bash helper scripts
echo "--> Installing robos-cli (shared copilot lib & CLI helpers)..."
sudo rm -rf /usr/local/share/robos/robos-copilot-lib
sudo mkdir -p /usr/local/share/robos/robos-copilot-lib
sudo cp "$SCRIPT_DIR/../robos-cli/robos-copilot-lib.js" /usr/local/share/robos/robos-copilot-lib/index.js
sudo cp "$SCRIPT_DIR/../robos-cli/package.json"         /usr/local/share/robos/robos-copilot-lib/
sudo cp "$SCRIPT_DIR/../robos-cli/robos-active-task"    /usr/local/share/robos/robos-copilot-lib/
sudo cp "$SCRIPT_DIR/../robos-cli/robos-notify"         /usr/local/share/robos/robos-copilot-lib/
sudo cp "$SCRIPT_DIR/../robos-cli/robos-journal-append" /usr/local/share/robos/robos-copilot-lib/
sudo cp "$SCRIPT_DIR/../robos-cli/robos-context.md"     /usr/local/share/robos/robos-copilot-lib/
# Symlink the CLI tools into /usr/local/bin
for tool in robos-active-task robos-notify robos-journal-append; do
  sudo ln -sf /usr/local/share/robos/robos-copilot-lib/$tool /usr/local/bin/$tool
  sudo chmod +x /usr/local/share/robos/robos-copilot-lib/$tool
done

# ── Workflow Studio (Electron app) ────────────────────────────────────────────
echo "--> Installing Workflow Studio..."
sudo rm -rf /usr/local/share/robos/workflow-studio
sudo cp -r "$SCRIPT_DIR/../workflow-studio" /usr/local/share/robos/workflow-studio
sudo cp "$SCRIPT_DIR/../workflow-studio/workflow-studio.desktop" /usr/local/share/applications/
cd /usr/local/share/robos/workflow-studio && sudo npm install --quiet

# ── Task Planner (Electron app) ──────────────────────────────────────────────
echo "--> Installing Task Planner..."
sudo rm -rf /usr/local/share/robos/task-planner
sudo cp -r "$SCRIPT_DIR/../task-planner" /usr/local/share/robos/task-planner
sudo cp "$SCRIPT_DIR/../task-planner/task-planner.desktop" /usr/local/share/applications/
cd /usr/local/share/robos/task-planner && sudo npm install --quiet

sudo tee /usr/local/bin/task-planner > /dev/null << 'EOF'
#!/usr/bin/env bash
exec /usr/local/share/robos/task-planner/task-planner.sh "$@"
EOF
sudo chmod +x /usr/local/bin/task-planner

# ── git-projects ─────────────────────────────────────────────────────────────
echo "--> Installing git-projects..."
sudo rm -rf /usr/local/share/robos/git-projects
sudo cp -r "$SCRIPT_DIR/../git-projects" /usr/local/share/robos/git-projects
sudo cp "$SCRIPT_DIR/../git-projects/git-projects.desktop" /usr/local/share/applications/
cd /usr/local/share/robos/git-projects && sudo npm install --quiet

sudo tee /usr/local/bin/git-projects > /dev/null << 'EOF'
#!/usr/bin/env bash
exec /usr/local/share/robos/git-projects/git-projects.sh "$@"
EOF
sudo chmod +x /usr/local/bin/git-projects

# ── App Launcher (Electron app) ──────────────────────────────────────────────
echo "--> Installing App Launcher..."
sudo rm -rf /usr/local/share/robos/app-launcher
sudo cp -r "$SCRIPT_DIR/../app-launcher" /usr/local/share/robos/app-launcher
sudo cp "$SCRIPT_DIR/../app-launcher/app-launcher.desktop" /usr/local/share/applications/
cd /usr/local/share/robos/app-launcher && sudo npm install --quiet

sudo tee /usr/local/bin/app-launcher > /dev/null << 'EOF'
#!/usr/bin/env bash
exec /usr/local/share/robos/app-launcher/app-launcher.sh "$@"
EOF
sudo chmod +x /usr/local/bin/app-launcher

# ── Task Manager (Electron app) ───────────────────────────────────────────────
echo "--> Installing Task Manager..."
sudo rm -rf /usr/local/share/robos/task-manager
sudo cp -r "$SCRIPT_DIR/../task-manager" /usr/local/share/robos/task-manager
sudo cp "$SCRIPT_DIR/../task-manager/task-manager.desktop" /usr/local/share/applications/
cd /usr/local/share/robos/task-manager && sudo npm install --quiet

# ── Task Servers (Electron app) ───────────────────────────────────────────────
echo "--> Installing Task Servers..."
sudo rm -rf /usr/local/share/robos/task-servers
sudo cp -r "$SCRIPT_DIR/../task-servers" /usr/local/share/robos/task-servers
sudo cp "$SCRIPT_DIR/../task-servers/task-servers.desktop" /usr/local/share/applications/
cd /usr/local/share/robos/task-servers && sudo npm install --quiet


# ── Agent Monitor (Electron app) ──────────────────────────────────────────────
echo "--> Installing Agent Monitor..."
sudo rm -rf /usr/local/share/robos/agent-monitor
sudo cp -r "$SCRIPT_DIR/../agent-monitor" /usr/local/share/robos/agent-monitor
sudo cp "$SCRIPT_DIR/../agent-monitor/agent-monitor.desktop" /usr/local/share/applications/
cd /usr/local/share/robos/agent-monitor && sudo npm install --quiet

# ── Copilot Session Viewer (Electron app) ────────────────────────────────────
echo "--> Installing Copilot Session Viewer..."
sudo rm -rf /usr/local/share/robos/copilot-session-viewer
sudo cp -r "$SCRIPT_DIR/../copilot-session-viewer" /usr/local/share/robos/copilot-session-viewer
sudo cp "$SCRIPT_DIR/../copilot-session-viewer/copilot-session-viewer.desktop" /usr/local/share/applications/
cd /usr/local/share/robos/copilot-session-viewer && sudo npm install --quiet

# ── Claude Console (Electron app) ────────────────────────────────────────────
echo "--> Installing Claude Console..."
sudo rm -rf /usr/local/share/robos/claude-console
sudo cp -r "$SCRIPT_DIR/../claude-console" /usr/local/share/robos/claude-console
sudo cp "$SCRIPT_DIR/../claude-console/claude-console.desktop" /usr/local/share/applications/
cd /usr/local/share/robos/claude-console && sudo npm install --quiet

sudo chmod +x /usr/local/bin/robos-launch

# ── IDE Manager (Electron app) ────────────────────────────────────────────────
echo "--> Installing IDE Manager..."
sudo rm -rf /usr/local/share/robos/ide-manager
sudo cp -r "$SCRIPT_DIR/../ide-manager" /usr/local/share/robos/ide-manager
sudo cp "$SCRIPT_DIR/../ide-manager/dev-tool-manager.desktop" /usr/local/share/applications/
cd /usr/local/share/robos/ide-manager && sudo npm install --quiet

# ── robos-intellij-plugin (deploy + auto-install) ─────────────────────────────
echo "--> Deploying RobOS IntelliJ Plugin..."
PLUGIN_SRC="$SCRIPT_DIR/../robos-intellij-plugin"
PLUGIN_DEPLOY_DIR="/usr/local/share/robos/robos-intellij-plugin"
sudo mkdir -p "$PLUGIN_DEPLOY_DIR"

# Prefer the pre-built dist ZIP checked into the repo; fall back to a local
# Gradle build (requires JDK 21 + a locally installed IntelliJ).
DIST_ZIP="$PLUGIN_SRC/dist/robos-plugin.zip"
if [ -f "$DIST_ZIP" ]; then
  sudo cp "$DIST_ZIP" "$PLUGIN_DEPLOY_DIR/robos-plugin.zip"
  echo "  --> Pre-built plugin deployed to $PLUGIN_DEPLOY_DIR/robos-plugin.zip"
elif [ -f "$PLUGIN_SRC/gradlew" ]; then
  echo "  --> Pre-built ZIP not found; attempting Gradle build..."
  if ! java -version 2>&1 | grep -q ' 21'; then
    echo "  --> JDK 21 not found, installing via apt..."
    sudo apt-get install -y --no-install-recommends openjdk-21-jdk-headless 2>/dev/null || true
  fi
  cd "$PLUGIN_SRC"
  chmod +x gradlew
  if ./gradlew :platform:robos:buildPlugin --quiet --no-daemon 2>/dev/null; then
    BUILT_ZIP=$(ls platform/robos/build/distributions/robos-*.zip 2>/dev/null | sort | tail -1)
    if [ -n "$BUILT_ZIP" ]; then
      sudo cp "$BUILT_ZIP" "$PLUGIN_DEPLOY_DIR/robos-plugin.zip"
      echo "  --> Plugin built and deployed to $PLUGIN_DEPLOY_DIR/robos-plugin.zip"
    fi
  else
    echo "  --> Plugin build failed (requires a locally installed IntelliJ for first build)"
  fi
else
  echo "  --> Plugin source not found, skipping"
fi

# ── Install the auto-install helper script ────────────────────────────────────
sudo cp "$SCRIPT_DIR/robos-install-intellij-plugin.sh" /usr/local/bin/robos-install-intellij-plugin
sudo chmod +x /usr/local/bin/robos-install-intellij-plugin

# ── XDG autostart: run on every login so newly-installed IDEs get the plugin ──
mkdir -p "$USER_HOME/.config/autostart"
cp "$SCRIPT_DIR/autostart/robos-intellij-plugin.desktop" "$USER_HOME/.config/autostart/robos-intellij-plugin.desktop"

# ── XDG autostart: check AI provider at login ─────────────────────────────────
cp "$SCRIPT_DIR/autostart/robos-ai-provider-check.desktop" "$USER_HOME/.config/autostart/robos-ai-provider-check.desktop"

# ── Auto-install to any JetBrains IDEs already present on this machine ────────
if [ -f "$PLUGIN_DEPLOY_DIR/robos-plugin.zip" ]; then
  echo "--> Auto-installing RobOS plugin to detected JetBrains IDEs..."
  bash /usr/local/bin/robos-install-intellij-plugin || true
fi


echo "--> Installing xfwm4 session and theme..."

# Session entry point
sudo cp "$SCRIPT_DIR/xfwm4/robos-session" /usr/local/bin/robos-session
sudo chmod +x /usr/local/bin/robos-session
sudo cp "$SCRIPT_DIR/xfwm4/robos.desktop" /usr/share/xsessions/robos.desktop

# Build RobOS xfwm4 theme by recoloring Kokodi
THEME_SRC=/usr/share/themes/Kokodi/xfwm4
THEME_DST=/usr/share/themes/RobOS/xfwm4
sudo mkdir -p "$THEME_DST"
sudo cp -r "$THEME_SRC/." "$THEME_DST/"

for f in title-1 title-2 title-3 title-4 title-5; do
  sudo convert "$THEME_SRC/${f}-active.png"   -fill '#262636' -colorize 100 "$THEME_DST/${f}-active.png"
  sudo convert "$THEME_SRC/${f}-inactive.png" -fill '#1a1a26' -colorize 100 "$THEME_DST/${f}-inactive.png"
done
for f in left right bottom bottom-left bottom-right top-left top-right; do
  sudo convert "$THEME_SRC/${f}-active.png"   -fill '#2a2a3c' -colorize 80 "$THEME_DST/${f}-active.png"
  sudo convert "$THEME_SRC/${f}-inactive.png" -fill '#1a1a26' -colorize 90 "$THEME_DST/${f}-inactive.png"
done
sudo convert "$THEME_SRC/close-active.png"    -fill '#2a2a3c' -colorize 80 "$THEME_DST/close-active.png"
sudo convert "$THEME_SRC/close-inactive.png"  -fill '#1a1a26' -colorize 90 "$THEME_DST/close-inactive.png"
sudo convert "$THEME_SRC/close-prelight.png"  -fill '#c0392b' -colorize 80 "$THEME_DST/close-prelight.png"
sudo convert "$THEME_SRC/close-pressed.png"   -fill '#922b21' -colorize 80 "$THEME_DST/close-pressed.png"
sudo convert "$THEME_SRC/maximize-active.png"  -fill '#2a2a3c' -colorize 80 "$THEME_DST/maximize-active.png"
sudo convert "$THEME_SRC/maximize-prelight.png" -fill '#27ae60' -colorize 80 "$THEME_DST/maximize-prelight.png"
sudo convert "$THEME_SRC/maximize-pressed.png"  -fill '#1e8449' -colorize 80 "$THEME_DST/maximize-pressed.png"
sudo convert "$THEME_SRC/hide-active.png"      -fill '#2a2a3c' -colorize 80 "$THEME_DST/hide-active.png"
sudo convert "$THEME_SRC/hide-prelight.png"    -fill '#d4a017' -colorize 80 "$THEME_DST/hide-prelight.png"
sudo convert "$THEME_SRC/hide-pressed.png"     -fill '#a07810' -colorize 80 "$THEME_DST/hide-pressed.png"
for btn in menu shade stick; do
  for state in active inactive prelight pressed; do
    [ -f "$THEME_SRC/${btn}-${state}.png" ] && sudo convert "$THEME_SRC/${btn}-${state}.png" -fill '#2a2a3c' -colorize 70 "$THEME_DST/${btn}-${state}.png"
  done
done

sudo tee "$THEME_DST/themerc" > /dev/null << 'THEMEEOF'
active_text_color=#d0d0e8
active_text_shadow_color=#000000
inactive_text_color=#383850
inactive_text_shadow_color=#000000
button_offset=2
button_spacing=2
full_width_title=true
frame_border_top=0
show_app_icon=false
shadow_delta_height=0
shadow_delta_width=0
shadow_delta_x=0
shadow_delta_y=4
shadow_opacity=50
title_horizontal_offset=4
title_shadow_active=false
title_shadow_inactive=false
title_vertical_offset_active=2
title_vertical_offset_inactive=2
THEMEEOF

# xfwm4 user config: click-to-focus, raise on click
mkdir -p "$USER_HOME/.config/xfce4/xfconf/xfce-perchannel-xml"
cat > "$USER_HOME/.config/xfce4/xfconf/xfce-perchannel-xml/xfwm4.xml" << 'XMLEOF'
<?xml version="1.0" encoding="UTF-8"?>
<channel name="xfwm4" version="1.0">
  <property name="/general" type="empty">
    <property name="theme" type="string" value="RobOS"/>
    <property name="title_font" type="string" value="Ubuntu Bold 11"/>
    <property name="button_layout" type="string" value="NHM|C"/>
    <property name="click_to_focus" type="bool" value="true"/>
    <property name="focus_raise" type="bool" value="true"/>
    <property name="raise_on_click" type="bool" value="true"/>
    <property name="raise_on_focus" type="bool" value="false"/>
    <property name="snap_to_windows" type="bool" value="true"/>
    <property name="snap_to_border" type="bool" value="true"/>
    <property name="use_compositing" type="bool" value="true"/>
    <property name="frame_opacity" type="int" value="100"/>
    <property name="inactive_opacity" type="int" value="100"/>
    <property name="show_dock_shadow" type="bool" value="false"/>
    <property name="show_frame_shadow" type="bool" value="true"/>
  </property>
</channel>
XMLEOF

# Switch LightDM to robos session
sudo sed -i 's/user-session=.*/user-session=robos/' /etc/lightdm/lightdm.conf

# GTK3 override (no white border bleed)
mkdir -p "$USER_HOME/.config/gtk-3.0"
cp "$SCRIPT_DIR/gtk/gtk.css" "$USER_HOME/.config/gtk-3.0/gtk.css"

# ── RobOS agent instructions (written once; user may customise) ──────────────
ROBOS_INSTRUCTIONS_FILE="$USER_HOME/.config/robos/robos-instructions.txt"
if [ ! -f "$ROBOS_INSTRUCTIONS_FILE" ]; then
  mkdir -p "$USER_HOME/.config/robos"
  cat > "$ROBOS_INSTRUCTIONS_FILE" << 'INSTREOF'
You are an AI agent running inside RobOS — an AI-powered developer-lifecycle OS built on Ubuntu Linux.
RobOS apps: Task Planner (decomposes work into GitHub issues), Workflow Studio (configures issue types & lifecycle states), Agent Scheduler (schedules recurring AI tasks), Work Journal (daily developer log), Dev Central (GitHub PR/issue dashboard), Notifications (system-wide notification hub).
Config files live in ~/.config/robos/. Agent logs in ~/.config/robos/agent-scheduler/logs/.
INSTREOF
  echo "--> Created $ROBOS_INSTRUCTIONS_FILE"
else
  echo "--> $ROBOS_INSTRUCTIONS_FILE already exists, skipping."
fi

# ── 6. tint2 config ──────────────────────────────────────────────────────────
echo "--> Configuring tint2..."
mkdir -p "$USER_HOME/.config/tint2"
cp "$SCRIPT_DIR/tint2/tint2rc" "$USER_HOME/.config/tint2/tint2rc"

# ── 7. LightDM session ───────────────────────────────────────────────────────
echo "--> Enabling LightDM..."
sudo systemctl enable lightdm 2>/dev/null || true

# ── 8. Nautilus / file manager defaults ──────────────────────────────────────
echo "--> Configuring Nautilus defaults..."

# Create and compile RobOS custom locale (ISO date + 12-hour time with seconds)
if [ ! -f /usr/share/i18n/locales/en_ROBOS ]; then
  sudo tee /usr/share/i18n/locales/en_ROBOS > /dev/null << 'LOCEOF'
comment_char %
escape_char /

LC_IDENTIFICATION
title      "RobOS developer locale"
source     ""
address    ""
contact    ""
email      ""
tel        ""
fax        ""
language   "English"
territory  "RobOS"
revision   "1.0"
date       "2024-01-01"
category  "i18n:2012";LC_IDENTIFICATION
category  "i18n:2012";LC_CTYPE
category  "i18n:2012";LC_COLLATE
category  "i18n:2012";LC_TIME
category  "i18n:2012";LC_NUMERIC
category  "i18n:2012";LC_MONETARY
category  "i18n:2012";LC_MESSAGES
category  "i18n:2012";LC_PAPER
category  "i18n:2012";LC_NAME
category  "i18n:2012";LC_ADDRESS
category  "i18n:2012";LC_TELEPHONE
category  "i18n:2012";LC_MEASUREMENT
END LC_IDENTIFICATION

LC_CTYPE
copy "en_US"
END LC_CTYPE

LC_COLLATE
copy "en_US"
END LC_COLLATE

LC_MESSAGES
copy "en_US"
END LC_MESSAGES

LC_MONETARY
copy "en_US"
END LC_MONETARY

LC_NUMERIC
copy "en_US"
END LC_NUMERIC

LC_PAPER
copy "en_US"
END LC_PAPER

LC_NAME
copy "en_US"
END LC_NAME

LC_ADDRESS
copy "en_US"
END LC_ADDRESS

LC_TELEPHONE
copy "en_US"
END LC_TELEPHONE

LC_MEASUREMENT
copy "en_US"
END LC_MEASUREMENT

LC_TIME
abday  "Sun";"Mon";"Tue";"Wed";"Thu";"Fri";"Sat"
day    "Sunday";"Monday";"Tuesday";"Wednesday";"Thursday";"Friday";"Saturday"
abmon  "Jan";"Feb";"Mar";"Apr";"May";"Jun";"Jul";"Aug";"Sep";"Oct";"Nov";"Dec"
mon    "January";"February";"March";"April";"May";"June";"July";"August";"September";"October";"November";"December"
am_pm  "AM";"PM"
d_t_fmt "%Y-%m-%d %I:%M:%S %p"
d_fmt   "%Y-%m-%d"
t_fmt   "%I:%M:%S %p"
t_fmt_ampm "%I:%M:%S %p"
week    7;19971130;4
first_weekday 1
END LC_TIME
LOCEOF
fi
sudo localedef -i en_ROBOS -f UTF-8 en_ROBOS.UTF-8 2>/dev/null || true

# Apply LC_TIME for the user's systemd environment (picked up by GNOME/Nautilus)
mkdir -p "$USER_HOME/.config/environment.d"
echo "LC_TIME=en_ROBOS.UTF-8" > "$USER_HOME/.config/environment.d/robos-locale.conf"

# Bookmark ~/source in Nautilus sidebar
mkdir -p "$USER_HOME/source"
BOOKMARKS_FILE="$USER_HOME/.config/gtk-3.0/bookmarks"
mkdir -p "$USER_HOME/.config/gtk-3.0"
if ! grep -q "file:///home/robos/source" "$BOOKMARKS_FILE" 2>/dev/null; then
  echo "file:///home/robos/source Source" >> "$BOOKMARKS_FILE"
fi

# Apply Nautilus settings via dconf policy (survives re-login, applies to all users)
sudo python3 - << 'PYEOF'
import pathlib, re

f = pathlib.Path("/etc/dconf/db/local.d/01-robos")
txt = f.read_text() if f.exists() else ""

# Nautilus defaults
nautilus_block = """
[org/gnome/nautilus/preferences]
default-folder-viewer="list-view"
show-hidden-files=true

[org/gnome/nautilus/list-view]
default-visible-columns=["name", "size", "type", "date_modified_with_time", "date_created"]
default-column-order=["name", "size", "type", "date_modified_with_time", "date_created"]
"""

if "[org/gnome/nautilus/preferences]" not in txt:
    txt = txt.rstrip() + "\n" + nautilus_block
    print("  Added Nautilus dconf policy.")
else:
    print("  Nautilus dconf policy already present.")

# Clock: 12-hour AM/PM with seconds
iface_section = "[org/gnome/desktop/interface]"
clock_keys = {
    "clock-format": "'12h'",
    "clock-show-seconds": "true",
}
for key, val in clock_keys.items():
    pat = rf"^{re.escape(key)}\s*=.*$"
    line = f"{key}={val}"
    if re.search(pat, txt, re.MULTILINE):
        txt = re.sub(pat, line, txt, flags=re.MULTILINE)
    elif iface_section in txt:
        txt = txt.replace(iface_section, iface_section + "\n" + line)
    else:
        txt = txt.rstrip() + f"\n\n{iface_section}\n{line}\n"

f.write_text(txt)
print("  Clock format set to 12h AM/PM with seconds.")
PYEOF
sudo dconf update

# ── 9. Automatic timezone detection at login ──────────────────────────────────
echo "--> Installing timezone auto-sync..."

# polkit rule: allow robos user to run timedatectl set-timezone without password
sudo tee /etc/polkit-1/localauthority/50-local.d/10-robos-timezone.pkla > /dev/null << 'PKLAEOF'
[RobOS Timezone Sync]
Identity=unix-user:robos
Action=org.freedesktop.timedate1.set-timezone
ResultAny=yes
ResultInactive=yes
ResultActive=yes
PKLAEOF

# Install the sync script
sudo cp "$SCRIPT_DIR/scripts/robos-timezone-sync.sh" /usr/local/bin/robos-timezone-sync
sudo chmod +x /usr/local/bin/robos-timezone-sync

# Autostart entry (runs once per login session)
sudo cp "$SCRIPT_DIR/autostart/robos-timezone-sync.desktop" /etc/xdg/autostart/robos-timezone-sync.desktop
mkdir -p "$USER_HOME/.config/autostart"
cp "$SCRIPT_DIR/autostart/robos-timezone-sync.desktop" "$USER_HOME/.config/autostart/robos-timezone-sync.desktop"

# Enable GNOME automatic-timezone + location services (works on physical hardware)
gsettings set org.gnome.system.location enabled true 2>/dev/null || true
gsettings set org.gnome.desktop.datetime automatic-timezone true 2>/dev/null || true

# Install geoclue2 for GNOME location services (physical hardware / WiFi-equipped machines)
sudo apt-get install -y --no-install-recommends geoclue-2-core 2>/dev/null || true

# Persist location + auto-timezone to dconf policy
sudo python3 - << 'PYEOF'
import pathlib, re

f = pathlib.Path("/etc/dconf/db/local.d/01-robos")
txt = f.read_text() if f.exists() else ""

additions = {
    "[org/gnome/system/location]": {"enabled": "true"},
    "[org/gnome/desktop/datetime]": {"automatic-timezone": "true"},
}

for section, keys in additions.items():
    for key, val in keys.items():
        pat = rf"^{re.escape(key)}\s*=.*$"
        line = f"{key}={val}"
        if re.search(pat, txt, re.MULTILINE):
            txt = re.sub(pat, line, txt, flags=re.MULTILINE)
        elif section in txt:
            txt = txt.replace(section, section + "\n" + line)
        else:
            txt = txt.rstrip() + f"\n\n{section}\n{line}\n"

f.write_text(txt)
print("  Location services and auto-timezone added to dconf policy.")
PYEOF
sudo dconf update

# Run it now so the timezone is set immediately
echo "--> Detecting timezone now..."
/usr/local/bin/robos-timezone-sync && echo "    Timezone sync complete."

echo ""
echo "✓  RobOS desktop-shell installed."
echo "   Log out and select 'Openbox' session at the LightDM login screen."
echo "   Or test the agent panel right now: robos-agent-panel"
