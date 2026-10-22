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
      <div class="card os" data-os="mac"><h3>macOS</h3><p class="muted">Appliance installer (.dmg)</p><a class="btn" href="{{ site.data.release.url }}">View macOS USB flasher</a></div>
      <div class="card os" data-os="win"><h3>Windows</h3><p class="muted">Native Windows app suite</p><a class="btn" href="{{ site.data.release.url }}" data-release-tag="{{ site.data.release.tag }}" data-release-asset="RobOS-v{{ site.data.release.version }}-Windows-Setup.exe">Download Windows installer</a><a class="alt-l" href="{{ site.data.release.url }}" data-release-tag="{{ site.data.release.tag }}" data-release-asset="RobOS-v{{ site.data.release.version }}-Windows-Portable.exe">Portable EXE</a><p class="small">Both bundle the apps and runtime. See the release assets while builds are pending.</p></div>
      <div class="card os" data-os="linux"><h3>Linux</h3><p class="muted">Appliance installer (AppImage or .deb)</p><a class="btn" href="{{ site.data.release.url }}">View Linux USB flasher</a><a class="alt-l" href="{{ site.data.release.url }}">AppImage and .deb release files</a></div>
    </div>
    <p class="muted small" style="text-align:center;margin-top:18px">Appliance release files and checksums are on <a style="text-decoration:underline" href="https://github.com/nddipiazza/robos/releases/tag/v{{ site.data.release.version }}" target="_blank" rel="noopener">GitHub Releases</a>. The Windows setup above installs the apps directly. The .dmg, AppImage and .deb downloads create appliance USB drives.</p>
  </div>
</section>

<section id="windows">
  <div class="wrap">
    <h2 class="h2">Run RobOS on Windows</h2>
    <p>Use the Windows installer to choose a folder and add shortcuts, or the portable EXE to run without an installation wizard. Both bundle the app suite and runtime.</p>
    <p>As a script alternative, download <a href="{{ site.data.release.download }}/Install-RobOS.cmd">Install-RobOS.cmd</a> and open it. Script setup downloads a private Node.js and Electron runtime, the apps and dependencies, then adds <strong>RobOS</strong> to your Start menu. No WSL, USB drive or administrator account is needed.</p>
    <p>The installer adds Start menu and desktop shortcuts and lets you choose its folder. Open the portable EXE directly to launch its bundled apps. Script setup defaults to <code>%USERPROFILE%\RobOS</code>, where <code>RobOS.cmd</code> opens the launcher. Script setup needs internet access; keep its setup window open until completion.</p>
    <p class="muted">The Windows app suite has passed its startup audit. Linux-specific integrations such as GNOME shell controls, UNIX pass, KVM and X11 automation require their Linux environment. Agent features are optional; install your preferred agent in RobOS Software Center, then sign in to it.</p>
    <p>Software Center installs Windows tools through WinGet and coding-agent CLIs through the private Node.js runtime. It also offers Godot 4 and FFmpeg. Tools installed through WinGet use their Windows installation locations; CLI packages live under <code>%USERPROFILE%\RobOS\tools\npm</code>. Some third-party installers may request administrator approval or a restart.</p>
    <details><summary>Choose another install folder</summary><p>Download <a href="{{ site.data.release.download }}/Install-RobOS.ps1" download>the PowerShell setup script</a>, then run it from PowerShell:</p><pre class="code"><code>powershell -NoProfile -ExecutionPolicy Bypass -File .\Install-RobOS.ps1 -InstallDir "$env:USERPROFILE\RobOS"</code></pre><p>Use an empty folder. Setup leaves an existing installation untouched. App data lives separately under <code>%USERPROFILE%\.config\robos</code>.</p></details>
    <details><summary>Update an existing RobOS folder</summary><p>Close RobOS apps, download the PowerShell setup above, and run:</p><pre class="code"><code>powershell -NoProfile -ExecutionPolicy Bypass -File .\Install-RobOS.ps1 -InstallDir "$env:USERPROFILE\RobOS" -Repair</code></pre><p>Use the folder containing your existing RobOS installation. Your app settings remain in <code>%USERPROFILE%\.config\robos</code>.</p></details>
  </div>
</section>
<section id="linux-distro" class="alt">
  <div class="wrap">
    <h2 class="h2">Install the RobOS Linux GNOME distro</h2>
    <p>This is a separate installation option: create a bootable USB drive and install the RobOS Linux appliance on a dedicated PC. Flashing erases the selected USB drive, and the unattended OS installation can erase the target PC.</p>
    <p><a class="btn" href="{{ site.data.release.url }}">View Windows USB flasher</a> <a href="{{ '/v1/getting-started.html#install-the-appliance-from-a-usb-drive' | relative_url }}">Linux distro installation guide</a></p>
    <p class="muted">The Windows USB flasher cannot write the drive itself. Use <a href="https://rufus.ie/">Rufus</a> with <a href="{{ site.data.release.url }}">the bootable ISO</a> to finish on Windows.</p>
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
  -drive file=robos-v{{ site.data.release.version }}.qcow2,format=qcow2 \
  -cdrom robos-v{{ site.data.release.version }}-seed.iso \
  -net nic -net user,hostfwd=tcp::2224-:22</code></pre>
      </div>
    </div>
    <p class="muted" style="margin-top:20px">Every method, with prerequisites, is covered in the <a style="color:var(--accent)" href="{{ '/v1/getting-started.html' | relative_url }}">Get started guide</a>.</p>
  </div>
</section>

<section>
  <div class="wrap">
    <p class="eyebrow">Release assets</p>
    <h2 class="h2">{{ site.data.release.tag }} downloads</h2>
    <p>Windows EXEs, Linux distro, USB flasher and VM artifacts appear on <a href="{{ site.data.release.url }}">the release page</a> after their builds and checks finish. The Windows scripts are available as alternatives. Check the available assets before downloading.</p>
    <table class="t">
      <tr><th>Artifact</th><th>File</th><th>Purpose</th></tr>
      <tr><td>Windows installer</td><td><a href="{{ site.data.release.url }}" data-release-tag="{{ site.data.release.tag }}" data-release-asset="RobOS-v{{ site.data.release.version }}-Windows-Setup.exe">RobOS-v{{ site.data.release.version }}-Windows-Setup.exe</a></td><td>Install the native app suite with a folder chooser and shortcuts</td></tr>
      <tr><td>Windows portable EXE</td><td><a href="{{ site.data.release.url }}" data-release-tag="{{ site.data.release.tag }}" data-release-asset="RobOS-v{{ site.data.release.version }}-Windows-Portable.exe">RobOS-v{{ site.data.release.version }}-Windows-Portable.exe</a></td><td>Run the bundled app suite without an installation wizard</td></tr>
      <tr><td>Windows app setup</td><td><a href="{{ site.data.release.download }}/Install-RobOS.cmd">Install-RobOS.cmd</a></td><td>Install the native Windows app suite</td></tr>
      <tr><td>Windows PowerShell setup</td><td><a href="{{ site.data.release.download }}/Install-RobOS.ps1">Install-RobOS.ps1</a></td><td>Custom install folder or repair</td></tr>
      <tr><td>Windows EXE checksums</td><td><a href="{{ site.data.release.url }}">WINDOWS-EXE-SHA256SUMS</a></td><td>Verify the installer and portable EXE</td></tr>
      <tr><td>Windows script checksums</td><td><a href="{{ site.data.release.download }}/WINDOWS-SHA256SUMS">WINDOWS-SHA256SUMS</a></td><td>Verify the Windows setup downloads</td></tr>
      <tr><td>Linux installer</td><td><code>RobOS-Installer-v{{ site.data.release.version }}-linux.AppImage</code></td><td>USB flash GUI</td></tr>
      <tr><td>macOS installer</td><td><code>RobOS-Installer-v{{ site.data.release.version }}-mac.dmg</code></td><td>USB flash GUI</td></tr>
      <tr><td>Windows USB flasher (Linux distro)</td><td><code>RobOS-Installer-v{{ site.data.release.version }}-win.exe</code></td><td>USB flash GUI</td></tr>
      <tr><td>Bootable ISO</td><td><code>robos-v{{ site.data.release.version }}.iso</code></td><td>Unattended bare-metal install</td></tr>
      <tr><td>VM disk</td><td><code>robos-v{{ site.data.release.version }}.qcow2</code></td><td>Ready-to-boot QEMU/KVM image</td></tr>
      <tr><td>Packages bundle</td><td><code>robos-v{{ site.data.release.version }}-packages.tar.gz</code></td><td>All Electron app packages</td></tr>
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
