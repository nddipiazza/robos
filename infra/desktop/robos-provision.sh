#!/bin/bash
# RobOS Post-Install Provisioner
# Transforms a base Ubuntu 26.04 installation into a fully configured RobOS desktop.
# Called by Ubuntu autoinstall late-commands or manually after a fresh Ubuntu install.
#
# Expects:
#   /tmp/robos-packages.tar.gz — all RobOS Electron app packages
#   /tmp/robos-logo.png — RobOS branding logo (optional)
#
# Usage:
#   sudo bash robos-provision.sh

set -euo pipefail
export DEBIAN_FRONTEND=noninteractive

ROBOS_BASE="/usr/local/share/robos"
PACKAGES_TAR="/tmp/robos-packages.tar.gz"
LOGO_FILE="/tmp/robos-logo.png"

log() { echo "[RobOS] $*"; }

# ── Step 1: Base system ───────────────────────────────────────────────────────
log "Step 1/7: Configuring base system..."

# Set robos password
echo "robos:robos" | chpasswd 2>/dev/null || true

# SSH hardening
mkdir -p /etc/ssh/sshd_config.d
cat > /etc/ssh/sshd_config.d/50-robos.conf << 'EOF'
PasswordAuthentication yes
PermitRootLogin no
MaxAuthTries 6
X11Forwarding yes
EOF

# ── Step 2: Install GNOME desktop ─────────────────────────────────────────────
log "Step 2/7: Installing GNOME desktop..."

apt-get update -qq
apt-get install -y -qq \
  ubuntu-desktop-minimal \
  gdm3 \
  gnome-session-xsession \
  gnome-tweaks \
  dconf-cli \
  gnome-shell-extensions \
  gnome-shell-extension-manager \
  curl wget gnupg python3 unzip spice-vdagent pass \
  xdotool wmctrl x11-utils x11-xserver-utils xclip xsel \
  2>&1 | tail -5
apt-get purge -y gnome-initial-setup gnome-tour yelp ubuntu-docs gnome-user-docs ubuntu-welcome ubuntu-desktop-provision ubuntu-desktop-bootstrap ubuntu-report canonical-livepatch ubuntu-release-upgrader-gtk update-notifier update-notifier-common apport apport-gtk 2>/dev/null || true
snap remove ubuntu-desktop-provision 2>/dev/null || true
apt-get autoremove -y 2>/dev/null || true

# Hard binary deletion & override to prevent gnome-initial-setup from launching under --upgrade-user
rm -rf /usr/libexec/gnome-initial-setup /usr/bin/gnome-initial-setup /usr/bin/ubuntu-welcome /usr/lib/ubuntu-release-upgrader/check-new-release-gtk /usr/bin/check-new-release
mkdir -p /usr/libexec /usr/bin
ln -sf /bin/true /usr/libexec/gnome-initial-setup 2>/dev/null || true
ln -sf /bin/true /usr/bin/gnome-initial-setup 2>/dev/null || true

# Systemd user service masking
systemctl --global mask gnome-initial-setup.service gnome-initial-setup-first-login.service gnome-initial-setup-copy-worker.service 2>/dev/null || true

# Disable dynamic MOTD, motd-news, issue banners, and pam_motd
chmod -x /etc/update-motd.d/* 2>/dev/null || true
mkdir -p /etc/default
echo 'ENABLED=0' > /etc/default/motd-news
mkdir -p /etc/skel /home/robos /root
touch /etc/skel/.hushlogin /home/robos/.hushlogin /root/.hushlogin
chown robos:robos /home/robos/.hushlogin 2>/dev/null || true
echo "RobOS 26.04 LTS \n \l" > /etc/issue
echo "RobOS 26.04 LTS" > /etc/issue.net
> /etc/motd
> /etc/legal
sed -i 's/.*pam_motd\.so.*/# &/' /etc/pam.d/sshd /etc/pam.d/login /etc/pam.d/gdm-autologin /etc/pam.d/gdm-password 2>/dev/null || true

mkdir -p /etc/update-manager /etc/default
printf '[DEFAULT]\nPrompt=never\n' > /etc/update-manager/release-upgrades
echo 'enabled=0' > /etc/default/apport
chmod -x /usr/bin/yelp 2>/dev/null || true

# ── Step 3: Install dash-to-panel v56 ────────────────────────────────────────
log "Step 3/7: Installing dash-to-panel extension..."

EXTENSION_DIR="/usr/share/gnome-shell/extensions/dash-to-panel@jderose9.github.com"
mkdir -p "$EXTENSION_DIR"
cd /tmp
wget -q "https://extensions.gnome.org/extension-data/dash-to-paneljderose9.github.com.v56.shell-extension.zip" -O dash-to-panel.zip
unzip -o dash-to-panel.zip -d "$EXTENSION_DIR"
# Null guard patches
if [ -f "$EXTENSION_DIR/panel.js" ]; then
  sed -i 's/this\._panel\._leftBox\.get_children/this._panel._leftBox?.get_children/g' "$EXTENSION_DIR/panel.js"
  sed -i 's/this\._panel\._centerBox\.get_children/this._panel._centerBox?.get_children/g' "$EXTENSION_DIR/panel.js"
  sed -i 's/this\._panel\._rightBox\.get_children/this._panel._rightBox?.get_children/g' "$EXTENSION_DIR/panel.js"
fi
# Silence update & welcome notifications in dash-to-panel
find "$EXTENSION_DIR" -type f -name "*.js" -exec sed -i 's/.*has been updated.*/ /g' {} + 2>/dev/null || true
find "$EXTENSION_DIR" -type f -name "*.js" -exec sed -i 's/showUpdateNotification/function(){}/g' {} + 2>/dev/null || true
find "$EXTENSION_DIR" -type f -name "*.js" -exec sed -i 's/showWelcomeDialog/function(){}/g' {} + 2>/dev/null || true
chmod -R 755 "$EXTENSION_DIR"
mkdir -p /etc/skel/.local/share/gnome-shell/extensions/
cp -r "$EXTENSION_DIR" /etc/skel/.local/share/gnome-shell/extensions/
rm -f /tmp/dash-to-panel.zip

# ── Step 4: Configure display manager ────────────────────────────────────────
log "Step 4/7: Configuring display manager..."

mkdir -p /etc/gdm3
printf '%s\n' '[daemon]' 'AutomaticLoginEnable=true' 'AutomaticLogin=robos' 'WaylandEnable=false' '' '[security]' '' '[xdmcp]' '' '[chooser]' '' '[debug]' > /etc/gdm3/custom.conf
systemctl set-default graphical.target

mkdir -p /home/robos/.config/robos
echo yes > /home/robos/.config/gnome-initial-setup-done
echo yes > /home/robos/.config/ubuntu-desktop-provision-done
touch /etc/gnome-initial-setup-done /etc/ubuntu-desktop-provision-done 2>/dev/null || true
echo '{"completed": false}' > /home/robos/.config/robos/onboarding-completed.json
chown -R robos:robos /home/robos/.config

# Configure AccountsService for user robos
mkdir -p /var/lib/AccountsService/users
cat > /var/lib/AccountsService/users/robos << 'ACCEOF'
[User]
SystemAccount=false
InitialSetupDone=true
Session=ubuntu-xorg
ACCEOF

# Disable GNOME initial setup & welcome autostarts
mkdir -p /etc/xdg/autostart /home/robos/.config/autostart /etc/skel/.config/autostart
rm -rf /etc/xdg/autostart/gnome-initial-setup*.desktop
rm -rf /etc/xdg/autostart/ubuntu-welcome*.desktop
rm -rf /etc/xdg/autostart/ubuntu-desktop-provision*.desktop
rm -rf /etc/xdg/autostart/ubuntu-desktop-bootstrap*.desktop
rm -rf /etc/xdg/autostart/ubuntu-report*.desktop
rm -rf /etc/xdg/autostart/canonical-livepatch*.desktop
rm -rf /etc/xdg/autostart/org.gnome.Tour*.desktop
rm -rf /etc/xdg/autostart/ubuntu-release-upgrader*.desktop
rm -rf /etc/xdg/autostart/update-notifier*.desktop

for app in gnome-initial-setup-first-login gnome-initial-setup-copy-worker ubuntu-welcome ubuntu-desktop-provision ubuntu-desktop-bootstrap ubuntu-report canonical-livepatch org.gnome.Tour yelp-getting-started ubuntu-release-upgrader-gtk update-notifier; do
  printf '[Desktop Entry]\nType=Application\nName=Disabled\nExec=true\nHidden=true\nNoDisplay=true\nX-GNOME-Autostart-enabled=false\n' > "/etc/xdg/autostart/${app}.desktop"
  printf '[Desktop Entry]\nType=Application\nName=Disabled\nExec=true\nHidden=true\nNoDisplay=true\nX-GNOME-Autostart-enabled=false\n' > "/home/robos/.config/autostart/${app}.desktop"
  printf '[Desktop Entry]\nType=Application\nName=Disabled\nExec=true\nHidden=true\nNoDisplay=true\nX-GNOME-Autostart-enabled=false\n' > "/etc/skel/.config/autostart/${app}.desktop"
done

# ── Step 5: Install Node.js 24 and Electron runtime deps ────────────────────
log "Step 5/7: Installing Node.js and Electron..."

mkdir -p /etc/apt/keyrings
curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg
echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_24.x nodistro main" > /etc/apt/sources.list.d/nodesource.list
apt-get update -qq
apt-get install -y -qq nodejs
apt-get install -y -qq libgtk-3-0 libnotify4 libnss3 libxss1 libxtst6 \
  xdg-utils libatspi2.0-0 libdrm2 libgbm1 libasound2
npm install -g electron@28 --unsafe-perm 2>&1 | tail -3

# Ensure node binary and AI CLI native binaries are executable by all users.
# The copilot CLI bundles a native binary that must be world-executable, and
# node itself must be executable for the copilot npm-loader to spawn it.
chmod a+rx /usr/bin/node 2>/dev/null || true
find /usr/lib/node_modules/@github/copilot -name 'copilot' -type f -exec chmod a+rx {} \; 2>/dev/null || true
find /usr/lib/node_modules/@anthropic-ai -type f -name '*.node' -exec chmod a+rx {} \; 2>/dev/null || true

# ── Step 6: Deploy RobOS Apps ────────────────────────────────────────────────
log "Step 6/7: Deploying RobOS apps..."

if [ ! -f "$PACKAGES_TAR" ]; then
  log "ERROR: $PACKAGES_TAR not found — skipping app deployment"
else
  EXTRACT_DIR="/tmp/robos-packages"
  mkdir -p "$EXTRACT_DIR" "$ROBOS_BASE"
  tar -xzf "$PACKAGES_TAR" -C "$EXTRACT_DIR"

  for pkg_dir in "$EXTRACT_DIR"/*/; do
    pkg=$(basename "$pkg_dir")
    log "  Deploying $pkg..."
    mkdir -p "$ROBOS_BASE/$pkg"
    cp -r "$pkg_dir"* "$ROBOS_BASE/$pkg/"
    chmod -R a+rX "$ROBOS_BASE/$pkg"

    if [ -f "$ROBOS_BASE/$pkg/package.json" ] && grep -q '"electron"' "$ROBOS_BASE/$pkg/package.json"; then
      cd "$ROBOS_BASE/$pkg" && npm install --quiet 2>&1 | tail -1
    fi

    for f in "$ROBOS_BASE/$pkg"/*.desktop; do
      [ -f "$f" ] && cp "$f" /usr/share/applications/
    done
  done

  rm -rf "$EXTRACT_DIR"
  log "  All apps deployed."
fi

# ── Step 7: Apply theme and finalize ─────────────────────────────────────────
log "Step 7/7: Applying theme and finalizing..."

# Write dconf config files
mkdir -p /etc/dconf/db/local.d /etc/dconf/db/local.d/locks /etc/dconf/profile

cat > /etc/dconf/profile/user << 'EOF'
user-db:user
system-db:local
EOF

cat > /etc/dconf/db/local.d/01-robos << 'EOF'
[org/gnome/desktop/interface]
gtk-theme='Yaru-dark'
icon-theme='Yaru'
cursor-theme='Yaru'
font-name='Ubuntu 11'
document-font-name='Ubuntu 11'
monospace-font-name='Ubuntu Mono 13'
color-scheme='prefer-dark'
clock-format='12h'
clock-show-weekday=true
enable-hot-corners=false

[org/gnome/desktop/wm/preferences]
button-layout='appmenu:minimize,maximize,close'
titlebar-font='Ubuntu Bold 11'

[org/gnome/desktop/background]
picture-uri='none'
picture-uri-dark='none'
picture-options='none'
primary-color='#0d1117'
color-shading-type='solid'

[org/gnome/desktop/screensaver]
picture-uri='none'
picture-options='none'
primary-color='#0d1117'
color-shading-type='solid'

[org/gnome/nautilus/preferences]
default-folder-viewer='list-view'
show-hidden-files=true

[org/gnome/mutter]
dynamic-workspaces=false
overlay-key=''

[org/gnome/initial-setup]
show-welcome-dialog=false

[org/gnome/desktop/privacy]
report-technical-problems=false

[org/gnome/desktop/notifications]
show-banners=false

[org/gnome/shell]
enabled-extensions=['dash-to-panel@jderose9.github.com', 'ubuntu-appindicators@ubuntu.com', 'ding@rastersoft.com', 'workspace-indicator@gnome-shell-extensions.gcampax.github.com']
disabled-extensions=['ubuntu-dock@ubuntu.com']
favorite-apps=['robos-app-launcher.desktop', 'org.gnome.Nautilus.desktop', 'org.gnome.Terminal.desktop']
welcome-dialog-last-shown-version='99999'

[org/gnome/shell/extensions/dash-to-panel]
panel-positions='{"0":"BOTTOM"}'
panel-sizes='{"0":32}'
hide-overview-on-startup=true
stockgs-keep-dash=false
trans-use-custom-bg=true
trans-bg-color='#0d1117'
trans-use-custom-opacity=true
trans-panel-opacity=0.9

[org/gnome/settings-daemon/plugins/media-keys]
custom-keybindings=['/org/gnome/settings-daemon/plugins/media-keys/custom-keybindings/custom0/']

[org/gnome/settings-daemon/plugins/media-keys/custom-keybindings/custom0]
name='RobOS App Launcher'
command='/usr/bin/electron /usr/local/share/robos/app-launcher/main.js --no-sandbox --disable-gpu --disable-dev-shm-usage'
binding='Super_L'
EOF

cat > /etc/dconf/db/local.d/locks/robos.txt << 'EOF'
/org/gnome/shell/extensions/dash-to-panel/panel-positions
/org/gnome/shell/extensions/dash-to-panel/panel-sizes
/org/gnome/shell/enabled-extensions
/org/gnome/shell/disabled-extensions
/org/gnome/desktop/interface/gtk-theme
/org/gnome/desktop/interface/color-scheme
/org/gnome/desktop/background/picture-uri
/org/gnome/desktop/background/picture-uri-dark
/org/gnome/desktop/background/primary-color
/org/gnome/mutter/dynamic-workspaces
/org/gnome/initial-setup/show-welcome-dialog
/org/gnome/desktop/privacy/report-technical-problems
/org/gnome/shell/welcome-dialog-last-shown-version
EOF

dconf update

# GTK dark theme for skel
for ver in 3.0 4.0; do
  mkdir -p /etc/skel/.config/gtk-${ver}
  cat > /etc/skel/.config/gtk-${ver}/settings.ini << 'EOF'
[Settings]
gtk-application-prefer-dark-theme=1
gtk-theme-name=Yaru-dark
gtk-icon-theme-name=Yaru
gtk-cursor-theme-name=Yaru
gtk-font-name=Ubuntu 11
EOF
done

# 1920x1080 X11 & GNOME display resolution configs
mkdir -p /etc/X11/xorg.conf.d /etc/skel/.config
cat > /etc/X11/xorg.conf.d/10-monitor.conf << 'EOF'
Section "Monitor"
    Identifier "Virtual-1"
    Modeline "1920x1080" 173.00 1920 2048 2248 2576 1080 1083 1088 1120 -hsync +vsync
    Option "PreferredMode" "1920x1080"
EndSection

Section "Screen"
    Identifier "Screen0"
    Monitor "Virtual-1"
    DefaultDepth 24
    SubSection "Display"
        Modes "1920x1080"
    EndSubSection
EndSection
EOF

cat > /etc/skel/.config/monitors.xml << 'EOF'
<monitors version="2">
  <configuration>
    <logicalmonitor>
      <x>0</x>
      <y>0</y>
      <scale>1</scale>
      <primary>yes</primary>
      <monitor>
        <monitorspec>
          <connector>Virtual-1</connector>
          <vendor>unknown</vendor>
          <product>unknown</product>
          <serial>unknown</serial>
        </monitorspec>
        <mode>
          <width>1920</width>
          <height>1080</height>
          <rate>60.000</rate>
        </mode>
      </monitor>
    </logicalmonitor>
  </configuration>
</monitors>
EOF

cat > /etc/xdg/autostart/robos-resolution.desktop << 'EOF'
[Desktop Entry]
Type=Application
Name=RobOS Resolution Config
Exec=bash -c "xrandr --output Virtual-1 --mode 1920x1080 2>/dev/null || xrandr -s 1920x1080 2>/dev/null"
X-GNOME-Autostart-enabled=true
Hidden=false
NoDisplay=true
EOF

# Autostart apps
cat > /etc/xdg/autostart/robos-desktop-dashboard.desktop << 'EOF'
[Desktop Entry]
Type=Application
Name=RobOS Desktop Dashboard
Exec=/usr/bin/electron /usr/local/share/robos/desktop-dashboard/main.js --no-sandbox --disable-gpu --disable-dev-shm-usage
X-GNOME-Autostart-enabled=true
X-GNOME-Autostart-Delay=3
Hidden=false
NoDisplay=true
EOF

cat > /etc/xdg/autostart/robos-desktop-manager.desktop << 'EOF'
[Desktop Entry]
Type=Application
Name=RobOS Desktop Manager
Exec=/usr/bin/electron /usr/local/share/robos/desktop-manager/main.js --no-sandbox --disable-gpu --disable-dev-shm-usage
X-GNOME-Autostart-enabled=true
X-GNOME-Autostart-Delay=5
Hidden=false
NoDisplay=true
EOF

# Install logo
if [ -f "$LOGO_FILE" ]; then
  cp "$LOGO_FILE" /usr/share/pixmaps/robos-logo.png
  cp "$LOGO_FILE" /usr/share/plymouth/ubuntu-logo.png 2>/dev/null || true
  cp "$LOGO_FILE" /usr/share/gnome-shell/theme/ubuntu-logo.png 2>/dev/null || true
fi

# Copy skel to robos home
cp -rn /etc/skel/.config /home/robos/ 2>/dev/null || true
cp -rn /etc/skel/.local /home/robos/ 2>/dev/null || true
mkdir -p /home/robos/.local/share/gnome-shell/extensions/
cp -r "$EXTENSION_DIR" /home/robos/.local/share/gnome-shell/extensions/ 2>/dev/null || true
chown -R robos:robos /home/robos/

# Fix SSH permissions
mkdir -p /home/robos/.ssh
chmod 700 /home/robos/.ssh
chown robos:robos /home/robos/.ssh

log "RobOS provisioning complete!"
