# 🛠️ Developer Setup & Environment Guide

Welcome to the **Quest: Warrior Dragon (NES) Godot 4 Recreation** developer guide. This document provides step-by-step instructions for configuring your local environment, installing required tools, running code generation, using developer debug utilities, and executing the End-to-End (E2E) test suite across **Windows**, **WSL 2**, and **macOS/Linux**.

---

## 📋 Toolchain & Requirements Summary

| Tool | Required Version | Purpose |
| :--- | :--- | :--- |
| **Godot Engine** | `4.3`+ (GL Compatibility) | Primary game engine & editor |
| **Node.js & npx** | `20`+ | Type-safe schema generator (`json-schema-to-gdscript`) |
| **Python** | `3.12`+ | E2E Cucumber test runner (`behave`) & report server |
| **FFmpeg** | `6.0`+ / `9.0` | E2E test video recording (MP4 playback capture) |
| **WSL 2** *(Optional)* | Ubuntu 22.04+ | Headless Xvfb virtual display testing |

---

## 💻 Platform-Specific Setup Guides

### 1. Windows (PowerShell / Native)

#### Step 1: Install System Dependencies via Winget
Open PowerShell as Administrator or regular user and run:

```powershell
winget install OpenJS.NodeJS Python.Python.3.12 Gyan.FFmpeg --accept-source-agreements --accept-package-agreements
```

#### Step 2: Install Godot Engine 4.3+
1. Download Godot 4.3 (Standard 64-bit) from [godotengine.org](https://godotengine.org/download).
2. Extract `godot4.exe` to a folder on your `PATH` or standard location:
   - `%LOCALAPPDATA%\Programs\Godot\godot.exe`
   - `%ProgramFiles%\Godot\godot.exe`
3. *(Optional)* Set `DW_GODOT_BIN` if placed in a custom location:
   ```powershell
   [Environment]::SetEnvironmentVariable("DW_GODOT_BIN", "C:\Tools\Godot\godot.exe", "User")
   ```

#### Step 3: Install Python Test Packages
```powershell
python -m pip install behave behave-html-formatter
```

#### Step 4: Configure Session Encoding
Add UTF-8 encoding variables to ensure proper test logging output:
```powershell
$env:PYTHONUTF8="1"
$env:PYTHONIOENCODING="utf-8"
```

---

### 2. WSL 2 (Ubuntu 22.04+)

Developing inside WSL 2 allows running headless Xvfb tests and video recordings in a Linux environment.

#### Step 1: Install System Packages
```bash
sudo apt update && sudo apt install -y python3-pip python3-behave xvfb ffmpeg unzip curl git
pip install behave-html-formatter
```

#### Step 2: Install Node.js 20 & npx via NVM
```bash
# Install Node Version Manager (NVM)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash

# Reload bash profile
source ~/.bashrc

# Install Node.js 20
nvm install 20
nvm use 20
```

#### Step 3: Download Godot 4.3 Binary for Linux
```bash
mkdir -p ~/.local/bin
curl -sSL https://github.com/godotengine/godot/releases/download/4.3-stable/Godot_v4.3-stable_linux.x86_64.zip -o /tmp/godot.zip
unzip -o /tmp/godot.zip -d ~/.local/bin/
mv ~/.local/bin/Godot_v4.3-stable_linux.x86_64 ~/.local/bin/godot4
chmod +x ~/.local/bin/godot4

# Ensure ~/.local/bin is on PATH
export PATH="$HOME/.local/bin:$PATH"
```

#### Step 4: Handle Git Line Endings (CRLF vs LF)
Shell scripts (`.sh`) in WSL require Unix **LF** line endings. To ensure Git does not convert shell scripts to CRLF on Windows checkouts:

```bash
# Configure git line endings for WSL repo
git config core.autocrlf input

# Fix line endings on any existing shell scripts
sed -i 's/\r$//' *.sh
```

---

### 3. macOS / Linux (Native)

#### Step 1: Install Dependencies via Homebrew (macOS)
```bash
brew install node python@3.12 ffmpeg
pip3 install behave behave-html-formatter
```

#### Step 2: Download Godot Engine
Place `godot4` binary in `/usr/local/bin` or `~/.local/bin/godot4`.

---

## 🔄 Code Generation & Asset Import Workflow

### 1. Generating Typed GDScript Schema Models
Data models under `src/generated/v1/` are generated from JSON Schemas under `schemas/v1/`. Regenerate them after updating schema definitions:

```bash
# Linux / WSL / macOS
./generate-schema-classes.sh

# Windows (Git Bash or WSL)
./generate-schema-classes.sh
```

*Requires Node.js 20+ and `npx`.*

### 2. Re-importing Godot Assets
After modifying imported assets (e.g., sprite sheets, map terrain masks, audio clips):

```bash
godot4 --import --quit --path .
```

---

## 🎮 Running & Debugging the Game

### 1. Full Game Launch (Title Screen → Save Select → Game)
```bash
# Linux / macOS / WSL
./play.sh

# Windows PowerShell
.\play.ps1
```

### 2. CLI Debug Scene Launcher
Jump directly into any map, scene, or battle without playing through the entire game flow.

```bash
# Overworld / Map testing (Linux / macOS / WSL)
./debug.sh --scene Castle1F --tile 8,8 --facing up --gold 120 --items "Herb;Torch"

# Windows PowerShell
.\debug.ps1 -Scene Castle1F -Tile 8,8 -Facing up -Gold 120 -Items "Herb;Torch"

# Isolated Battle testing
./debug.sh --scene BattleTest --monster axe_knight --hero-level 15 --hero-hp 80 --hero-hp-max 80
```

### 3. GUI Debug Launcher
For a visual UI with preset heroes and milestone save states:

```bash
# Linux / macOS / WSL
./launcher.sh

# Windows PowerShell
.\launcher.ps1
```

---

## 🧪 Running End-to-End (E2E) Cucumber Tests

The automated test suite runs BDD feature specs against Godot's built-in HTTP Web Service API (`http://127.0.0.1:8080`).

### 1. Run Tests
```bash
# Run all E2E Cucumber tests with MP4 video capture
python3 run_cucumber_tests.py     # Linux / WSL
python run_cucumber_tests.py      # Windows
```

### 2. Serve & View Interactive Test Reports
Launch the built-in report server to view HTML test reports and MP4 recordings in your browser:

```bash
python3 report-server.py
```
Open [http://127.0.0.1:8000](http://127.0.0.1:8000) in your browser.

---

## ⚙️ Environment Variables Reference

| Variable | Description | Default / Fallback |
| :--- | :--- | :--- |
| `DW_GODOT_BIN` | Explicit path to Godot 4 executable | `godot4.exe` / `godot4` on PATH, standard install locations |
| `FFMPEG_BIN` | Explicit path to FFmpeg executable | `ffmpeg.exe` / `ffmpeg` on PATH |
| `PYTHONUTF8` | Force UTF-8 output encoding in Python (Windows) | `1` |
| `PYTHONIOENCODING` | Output stream encoding for Python scripts | `utf-8` |
| `DW_SCENE` | Default scene override for debug launcher | `Castle1F` |
| `DW_GOLD` | Default starting gold override for debug launcher | `120` |

---

## ❓ Troubleshooting & FAQ

### Issue: `env: $'bash\r': No such file or directory`
- **Cause**: The script was saved with Windows CRLF line endings.
- **Fix**: Run `sed -i 's/\r$//' generate-schema-classes.sh` in WSL, or run `fix_lf.ps1` in PowerShell. Ensure [.gitattributes](file:///.gitattributes) contains `*.sh text eol=lf`.

### Issue: `npx is required; install Node.js 20 or newer.`
- **Cause**: `npx` is not installed or not available on your PATH inside WSL/terminal.
- **Fix**: Install Node.js 20 using NVM (`nvm install 20`) or export Windows Node path (`export PATH=$PATH:"/mnt/c/Program Files/nodejs"`).

### Issue: Godot binary auto-detection failed
- **Cause**: `godot4` is not on your PATH and not in standard install directories.
- **Fix**: Set `DW_GODOT_BIN` environment variable pointing directly to your Godot binary:
  ```bash
  export DW_GODOT_BIN="/usr/local/bin/godot4"
  ```
