---
title: Get started
layout: default
nav_order: 2
---

# Get started
{: .no_toc }

How to install the Windows app suite, run RobOS apps from a clone of the repository, install them into the GNOME launcher, or boot the RobOS appliance from a USB drive or a QEMU virtual machine. Read this before your first run.
{: .fs-6 }

<details open markdown="block">
  <summary>On this page</summary>
  {: .text-delta }
1. TOC
{:toc}
</details>

## Windows app suite

The native Windows release also provides **RobOS-v{{ site.data.release.version }}-Windows-Setup.exe** (a per-user installer with a folder chooser and shortcuts) and **RobOS-v{{ site.data.release.version }}-Windows-Portable.exe** (the bundled suite without an installation wizard). Both include the runtime and app dependencies. Check [the release assets]({{ site.data.release.url }}) for availability after the Windows build completes. The PowerShell and command scripts below remain alternatives.

Settings stay in `%USERPROFILE%\.config\robos` for either EXE. Tools installed through Software Center stay under `%USERPROFILE%\RobOS\tools` or their WinGet-managed locations; they are separate from the portable extraction folder.

[Download Windows setup](https://rowbose.com/download/#windows) and open `Install-RobOS.cmd`. It downloads a private Node.js/Electron runtime and the app suite into `%USERPROFILE%\RobOS`, installs runtime dependencies, and creates a RobOS Start menu shortcut. No WSL, USB flash drive or administrator access is required. Open RobOS to search and launch apps; `RobOS.cmd --app=point-of-sale` also opens one directly.

The native Windows app suite has passed its startup audit. GNOME, KVM, UNIX pass and X11 integrations still require Linux. Use RobOS Software Center to install or update Windows tools, Godot 4, FFmpeg and coding-agent CLIs. AI features remain optional; sign in to an installed agent when you choose to use it. Third-party tool installers may request administrator approval or a restart. Keep the setup console open until completion. Dependency failures are recorded in `install-report.json` and cause setup to fail, so a partial install is never reported as complete. Use an empty install directory; existing app data under `%USERPROFILE%\.config\robos` is preserved.

For a custom folder, download `Install-RobOS.ps1` from the download page and run `powershell -NoProfile -ExecutionPolicy Bypass -File .\Install-RobOS.ps1 -InstallDir "D:\RobOS"`. The execution policy applies only to that setup process. This setup installs apps on Windows. The USB flasher below is a separate option for installing the Linux GNOME operating system on a target PC.

## Pick a method

| Method | Where it runs | You need | What you get |
|---|---|---|---|
| [Windows app suite](#windows-app-suite) | Windows | Internet access during setup | Native apps in `%USERPROFILE%\RobOS` and a Start menu launcher |
| [Run from source](#run-from-source) | Linux desktop; the shell scripts can also be used in a suitable macOS or WSL environment. Use native setup above for Windows. | Node.js 20 or newer, Git, a desktop session | One app window per command |
| [GNOME launcher](#add-the-apps-to-the-gnome-launcher) | Ubuntu with GNOME | The same as above | A launcher entry for each app in your clone |
| [USB installer](#install-the-appliance-from-a-usb-drive) | The installer app runs on Linux, macOS or Windows (it cannot flash on Windows, see below); the target is an x86_64 PC | A USB drive of 4 GB or more | The RobOS appliance on the target PC |
| [Virtual machine](#boot-the-appliance-in-qemu) | A Linux host with QEMU | QEMU, 16 GB of RAM for the guest | The appliance in a QEMU window |

{: .note }
The `.dmg`, `.exe`, `.AppImage` and `.deb` files on the [download page](https://rowbose.com/download/) are the USB installer. These versioned appliance files do not install the app suite on macOS or Windows. The Windows app-suite setup is the separate download described above. On Windows, use the native app-suite setup above. For a Linux source checkout, use "Run from source".

## Run from source

Each app is an Electron app in its own folder under `packages/`, next to the shared libraries. There is no `package.json` at the repository root, so you install dependencies inside a package, not at the top level.

Prerequisites:

- Node.js 20 or newer and npm. The README and `AGENTS.md` state Node 20+, and the release workflow and the Docker image both use Node 20.
- Git.
- A desktop session. The launch script sets `DISPLAY=:0` when `DISPLAY` is not set.

1. Clone the repository.

   ```bash
   git clone https://github.com/nddipiazza/robos.git
   cd robos
   ```

2. Launch an app by its folder name.

   ```bash
   scripts/dev-launch.sh pr-review
   ```

   If the package has no `node_modules/.bin/electron` yet, the script runs `npm install` in that package first. It then starts Electron with `--no-sandbox --disable-gpu --disable-dev-shm-usage`. Run `scripts/dev-launch.sh` with no argument to list every package that has a `main.js` and a `package.json`.

You can also work in the package directly. Most packages that have a `main.js` define an `npm start` script.

```bash
cd packages/dev-central
npm install
npm start
```

Some app folder names that you can pass to `scripts/dev-launch.sh`:

| Folder | App name in the desktop entry |
|---|---|
| `pr-review` | Agent Code Review Platform (see [PR Review Theater]({{ site.baseurl }}{% link pr-review-theater.md %})) |
| `dev-central` | Dev Central |
| `task-planner` | RobOS Task Explorer |
| `voice-prompt` | RobOS Voice (see [RobOS Voice]({{ site.baseurl }}{% link voice-prompt.md %})) |

The [Apps]({{ site.baseurl }}{% link apps.md %}) page lists the rest.

Several apps, for example `pr-review` and `voice-prompt`, look for shared libraries such as `robos-lib` in the neighboring `packages/` folder first and then in `/usr/local/share/robos/`, which is where the appliance installs them.

## Add the apps to the GNOME launcher

`scripts/install-local.sh` runs `npm install` in each package that has a `main.js` and a `.desktop` file. It then writes `~/.local/share/applications/robos-<app-id>.desktop` entries that point at your clone.

```bash
scripts/install-local.sh              # every app
scripts/install-local.sh dev-central  # one app
scripts/install-local.sh --uninstall  # remove the entries again
```

## Install development dependencies

`scripts/install-dev-deps.sh` is for Debian and Ubuntu machines. It installs the apt packages the apps and tests use, adds your user to the `kvm` group, installs Node.js 20 from NodeSource when no `node` is on the path, and runs `npm install` in `installer/` and in every package that declares dependencies. It uses `sudo` and takes a while, so check first.

```bash
bash scripts/install-dev-deps.sh --check   # report what is missing, change nothing
bash scripts/install-dev-deps.sh           # install everything
bash scripts/install-dev-deps.sh --sys     # apt packages only
bash scripts/install-dev-deps.sh --npm     # npm packages only
```

On a machine without `apt-get` the script prints a warning and skips the system packages.

## Install the appliance from a USB drive

The appliance is a RobOS desktop image that installs unattended on an x86_64 PC. The release notes list 16 GB of RAM, 100 GB of disk and a USB drive of 4 GB or more as requirements. The installer app and the ISO are release assets on [GitHub Releases](https://github.com/nddipiazza/robos/releases/latest). File names include the version, for example `RobOS-Installer-v{{ site.data.release.version }}-mac.dmg`.

| Platform | Installer file |
|---|---|
| Linux | `RobOS-Installer-v<version>-linux.AppImage` or `.deb` |
| macOS | `RobOS-Installer-v<version>-mac.dmg` |
| Windows | `RobOS-Installer-v<version>-win.exe` |

The installer is an Electron app (source in [`installer/`](https://github.com/nddipiazza/robos/tree/main/installer)). Linux distro artifacts may still be building for the current release; check the available release assets first. Its screens are:

1. **Select USB Drive**. It lists removable and USB drives. Choose one and click **Next: Download RobOS**.
2. **Download RobOS**. It downloads the `.iso` asset of the latest GitHub release into your temporary directory and reuses the file if it is already there.
3. **Flash to Drive**. Click **Flash RobOS to Drive**.
4. A final screen with the next steps.

{: .warning }
Flashing erases the selected drive. On Linux and macOS the installer unmounts the drive and runs `sudo dd` with a 4M block size. On Windows the installer cannot flash: it reports that flashing requires administrator rights and tells you to use Rufus or balenaEtcher with the downloaded ISO.

To skip the installer app, download `robos-v<version>.iso` from the release and write it yourself. Replace `/dev/sdX` with your USB device and check it twice.

```bash
sudo dd if=robos-v{{ site.data.release.version }}.iso of=/dev/sdX bs=4M status=progress
```

Then:

1. Plug the drive into the target PC and boot from it. The installer app suggests F12 or F2 at the BIOS splash screen; the key depends on the machine.
2. Wait for the unattended install. The installer app estimates 15 to 20 minutes.
3. Log in with the default account `robos`, password `robos`.

## Boot the appliance in QEMU

The release includes a prebuilt disk image and a cloud-init seed ISO. You need QEMU and, for acceptable speed, KVM. `infra/desktop/run.sh` falls back to software emulation when `/dev/kvm` is missing and warns that the VM will be slow.

```bash
qemu-system-x86_64 -m 16G -smp $(nproc) -enable-kvm -cpu host \
  -drive file=robos-v{{ site.data.release.version }}.qcow2,format=qcow2 \
  -cdrom robos-v{{ site.data.release.version }}-seed.iso \
  -net nic -net user,hostfwd=tcp::2224-:22
```

Connect over SSH with the same default account:

```bash
ssh -p 2224 robos@localhost
```

To build the image yourself from a clone:

```bash
infra/desktop/build.sh   # downloads an Ubuntu cloud image, creates robos.qcow2 and seed.iso
infra/desktop/run.sh     # boots it; attaches the seed ISO on the first boot only
```

`build.sh` needs `qemu-img`, `wget`, `python3` and either `xorriso` or `genisoimage`. `run.sh` accepts `--vnc` (VNC on port 5912), `--spice` (SPICE on port 5932) and `--headless`. Output goes to `infra/desktop/output/`.

## Set up an AI agent

AI features in the apps run through a coding-agent CLI that you install and sign in to: GitHub Copilot, Claude Code, Codex or Gemini CLI / Antigravity. Install one, sign in, then open **RobOS Agents** and click **Set as Active** on it. No API keys are needed. If you also want direct model APIs, local Ollama models or semantic Knowledge Graph search, turn on the optional API mode in RobOS Preferences. [AI agents and API mode]({{ site.baseurl }}{% link ai-providers.md %}) covers both.

## Run the tests

The unit tests need only Node.js. This is the command the release workflow runs.

```bash
cd packages/robos-test
npm install
npm run test:unit
```

`scripts/e2e-container.sh` runs the end-to-end tests inside Docker. Docker is needed only for this script, which exits with an error if the `docker` command is missing. It builds the `robos-e2e-test:latest` image from `infra/docker/Dockerfile` (Ubuntu 24.04, Xvfb, Node 20) on the first run, mounts the repository at `/workspace`, and runs `npm test` in `packages/robos-test`.

```bash
./scripts/e2e-container.sh                 # default suite
./scripts/e2e-container.sh --build         # rebuild the image first
./scripts/e2e-container.sh -i              # shell inside the container
./scripts/e2e-container.sh node packages/robos-test/tests/agents-manager/e2e.test.js
```

## Next steps

- [A day with RobOS]({{ site.baseurl }}{% link day-in-the-life.md %}): one task from plan to merged pull request, as recorded on the home page.
- [Apps]({{ site.baseurl }}{% link apps.md %}): the app catalog.
- [AI agents and API mode]({{ site.baseurl }}{% link ai-providers.md %}): which agent CLI answers, and the optional API mode.
- [RobOS Voice]({{ site.baseurl }}{% link voice-prompt.md %}): dictation and voice commands.
- [Company setup]({{ site.baseurl }}{% link existing-company-setup.md %}): connect RobOS to an existing organization.
- [New app wizard]({{ site.baseurl }}{% link new-app-wizard.md %}): scaffold a new application.
- [Architecture]({{ site.baseurl }}{% link architecture.md %}): how the pieces fit together.
