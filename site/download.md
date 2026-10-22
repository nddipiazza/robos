---
layout: default
title: Download
permalink: /download/
description: Download RobOS for macOS, Linux and Windows, or run it from source or in a VM.
---
<div class="page-h wrap">
  <h1>Download RobOS</h1>
  <p>Install the app suite on your current computer, or choose the separate Linux GNOME distro installation below.</p>
</div>
<section style="padding-top:20px">
  <div class="wrap">
    <div class="os-grid">
      <div class="card os" data-os="mac"><h3>macOS</h3><p class="muted">Appliance installer (.dmg)</p><a class="btn" href="https://github.com/nddipiazza/robos/releases/download/v0.0.7/RobOS-Installer-v0.0.7-mac.dmg">Download for macOS</a></div>
      <div class="card os" data-os="win"><h3>Windows</h3><p class="muted">Native Windows app suite</p><a class="btn" href="{{ '/downloads/Install-RobOS.cmd' | relative_url }}" download>Download for Windows</a><p class="small">Open the downloaded setup file. Installs into your user folder with a Start menu launcher.</p></div>
      <div class="card os" data-os="linux"><h3>Linux</h3><p class="muted">Appliance installer (AppImage or .deb)</p><a class="btn" href="https://github.com/nddipiazza/robos/releases/download/v0.0.7/RobOS-Installer-v0.0.7-linux.AppImage">Download AppImage</a><a class="alt-l" href="https://github.com/nddipiazza/robos/releases/download/v0.0.7/RobOS-Installer-v0.0.7-linux.deb">or the .deb package</a></div>
    </div>
    <p class="muted small" style="text-align:center;margin-top:18px">Appliance release files and checksums are on <a style="text-decoration:underline" href="https://github.com/nddipiazza/robos/releases/tag/v0.0.7" target="_blank" rel="noopener">GitHub Releases</a>. The Windows setup above installs the apps directly. The .dmg, AppImage and .deb downloads create appliance USB drives.</p>
  </div>
</section>

<section id="windows">
  <div class="wrap">
    <h2 class="h2">Run RobOS on Windows</h2>
    <p>Download and open <strong>Install-RobOS.cmd</strong>. Setup downloads a private Node.js and Electron runtime, the RobOS apps and their dependencies, then adds <strong>RobOS</strong> to your Start menu. Windows stays your operating system. No WSL, USB drive or administrator account is needed.</p>
    <p>The default folder is <code>%USERPROFILE%\RobOS</code>. You can also open <code>RobOS.cmd</code> inside that folder to search and launch apps. Internet access is needed during setup. Keep the setup window open until it finishes; failures are reported rather than hidden.</p>
    <p class="muted">Native Windows support is being tested. Linux-specific integrations such as GNOME shell controls, UNIX pass, KVM and X11 automation require their Linux environment. Agent features are optional; install and sign in to your preferred agent separately.</p>
    <details><summary>Choose another install folder</summary><p>Download <a href="{{ '/downloads/Install-RobOS.ps1' | relative_url }}" download>the PowerShell setup script</a>, then run it from PowerShell:</p><pre class="code"><code>powershell -NoProfile -ExecutionPolicy Bypass -File .\Install-RobOS.ps1 -InstallDir "$env:USERPROFILE\RobOS"</code></pre><p>Use an empty folder. Setup leaves an existing installation untouched. App data lives separately under <code>%USERPROFILE%\.config\robos</code>.</p></details>
  </div>
</section>
<section id="linux-distro" class="alt">
  <div class="wrap">
    <h2 class="h2">Install the RobOS Linux GNOME distro</h2>
    <p>This is a separate installation option: create a bootable USB drive and install the RobOS Linux appliance on a dedicated PC. Flashing erases the selected USB drive, and the unattended OS installation can erase the target PC.</p>
    <p><a class="btn" href="https://github.com/nddipiazza/robos/releases/download/v0.0.7/RobOS-Installer-v0.0.7-win.exe">Download Windows USB flasher</a> <a href="{{ '/v1/getting-started.html#install-the-appliance-from-a-usb-drive' | relative_url }}">Linux distro installation guide</a></p>
    <p class="muted">The v0.0.7 Windows flasher cannot write the drive itself. Use <a href="https://rufus.ie/">Rufus</a> with <a href="https://github.com/nddipiazza/robos/releases/download/v0.0.7/robos-v0.0.7.iso">the bootable ISO</a> to finish on Windows.</p>
  </div>
</section>

<section class="alt">
  <div class="wrap">
    <p class="eyebrow">Other ways to install</p>
    <h2 class="h2">Run it your way</h2>
    <div data-tabs>
      <div class="tabs" role="tablist">
        <button role="tab" id="t1" aria-controls="p1" aria-selected="true">Run from source</button>
        <button role="tab" id="t2" aria-controls="p2" aria-selected="false">GNOME launcher</button>
        <button role="tab" id="t3" aria-controls="p3" aria-selected="false">Virtual machine</button>
      </div>
      <div class="panel" id="p1" role="tabpanel" aria-labelledby="t1">
        <p>Needs Node.js 20+, Git and a desktop session. Each app is its own Electron package; the script installs that app's dependencies the first time and then launches it. Run it with no argument to list the apps.</p>
        <pre class="code"><button data-copy>Copy</button><code>git clone https://github.com/nddipiazza/robos.git
cd robos
scripts/dev-launch.sh pr-review</code></pre>
      </div>
      <div class="panel" id="p2" role="tabpanel" aria-labelledby="t2" hidden>
        <p>On Debian or Ubuntu with GNOME. The first script installs the system packages the apps use (it uses <code>sudo</code>; run it with <code>--check</code> first to see what is missing). The second adds a launcher entry for each app in your clone.</p>
        <pre class="code"><button data-copy>Copy</button><code>git clone https://github.com/nddipiazza/robos.git
cd robos
bash scripts/install-dev-deps.sh
scripts/install-local.sh</code></pre>
      </div>
      <div class="panel" id="p3" role="tabpanel" aria-labelledby="t3" hidden>
        <p>Boot the prebuilt appliance image in QEMU. KVM is recommended, and the guest is given 16 GB of RAM. Default login <code>robos</code> / <code>robos</code>; SSH is forwarded to port 2224.</p>
        <pre class="code"><button data-copy>Copy</button><code>qemu-system-x86_64 -m 16G -smp $(nproc) -enable-kvm -cpu host \
  -drive file=robos-v0.0.7.qcow2,format=qcow2 \
  -cdrom robos-v0.0.7-seed.iso \
  -net nic -net user,hostfwd=tcp::2224-:22</code></pre>
      </div>
    </div>
    <p class="muted" style="margin-top:20px">Every method, with prerequisites, is covered in the <a style="color:var(--accent)" href="{{ '/v1/getting-started.html' | relative_url }}">Get started guide</a>.</p>
  </div>
</section>

<section>
  <div class="wrap">
    <p class="eyebrow">Release assets</p>
    <h2 class="h2">v0.0.7 downloads</h2>
    <table class="t">
      <tr><th>Artifact</th><th>File</th><th>Purpose</th></tr>
      <tr><td>Linux installer</td><td><code>RobOS-Installer-v0.0.7-linux.AppImage</code></td><td>USB flash GUI</td></tr>
      <tr><td>macOS installer</td><td><code>RobOS-Installer-v0.0.7-mac.dmg</code></td><td>USB flash GUI</td></tr>
      <tr><td>Windows USB flasher (Linux distro)</td><td><code>RobOS-Installer-v0.0.7-win.exe</code></td><td>USB flash GUI</td></tr>
      <tr><td>Bootable ISO</td><td><code>robos-v0.0.7.iso</code></td><td>Unattended bare-metal install</td></tr>
      <tr><td>VM disk</td><td><code>robos-v0.0.7.qcow2</code></td><td>Ready-to-boot QEMU/KVM image</td></tr>
      <tr><td>Packages bundle</td><td><code>robos-v0.0.7-packages.tar.gz</code></td><td>All Electron app packages</td></tr>
    </table>
  </div>
</section>

<section class="alt">
  <div class="wrap">
    <h2 class="h2">FAQ</h2>
    <div style="margin-top:28px;max-width:760px">
      <details><summary>Is RobOS really free?</summary><p>Yes. It is open source under Apache-2.0 with no SaaS subscription or proprietary cloud dependency.</p></details>
      <details><summary>Which agents does it work with?</summary><p>Claude Code, Google Antigravity / Gemini CLI, OpenAI Codex and GitHub Copilot. Install the CLI you use and sign in; RobOS runs it. An optional API mode can also call Anthropic, OpenAI, Gemini or a local Ollama server directly.</p></details>
      <details><summary>Do I need to replace my IDE?</summary><p>No. RobOS integrates with IntelliJ IDEA and VS Code, and can open pull request reviews directly in them.</p></details>
    </div>
  </div>
</section>
