---
layout: default
title: Download
permalink: /download/
description: Download RobOS for macOS, Linux and Windows, or run it from source or in a VM.
---
<div class="page-h wrap">
  <h1>Download RobOS</h1>
  <p>Version 0.0.7 · free and open source. Pick your platform, or run it from source.</p>
</div>
<section style="padding-top:20px">
  <div class="wrap">
    <div class="os-grid">
      <div class="card os" data-os="mac"><div class="ic">💻</div><h3>macOS</h3><p class="muted">Installer (.dmg)</p><a class="btn" href="https://github.com/nddipiazza/robos/releases/download/v0.0.7/RobOS-Installer-v0.0.7-mac.dmg">Download for macOS</a></div>
      <div class="card os" data-os="win"><div class="ic">🪟</div><h3>Windows</h3><p class="muted">Installer (.exe)</p><a class="btn" href="https://github.com/nddipiazza/robos/releases/download/v0.0.7/RobOS-Installer-v0.0.7-win.exe">Download for Windows</a></div>
      <div class="card os" data-os="linux"><div class="ic">🐧</div><h3>Linux</h3><p class="muted">AppImage or .deb</p><a class="btn" href="https://github.com/nddipiazza/robos/releases/download/v0.0.7/RobOS-Installer-v0.0.7-linux.AppImage">Download AppImage</a><a class="alt-l" href="https://github.com/nddipiazza/robos/releases/download/v0.0.7/RobOS-Installer-v0.0.7-linux.deb">or the .deb package</a></div>
    </div>
    <p class="muted small" style="text-align:center;margin-top:18px">All files and checksums are on <a style="text-decoration:underline" href="https://github.com/nddipiazza/robos/releases/tag/v0.0.7" target="_blank" rel="noopener">GitHub Releases</a>. The installer is the 3-click USB flasher for the RobOS appliance OS; to run the app suite on your current machine use one of the methods below.</p>
  </div>
</section>

<section class="alt">
  <div class="wrap">
    <p class="eyebrow">Other ways to install</p>
    <h2 class="h2">Run it your way</h2>
    <div data-tabs>
      <div class="tabs" role="tablist">
        <button role="tab" id="t1" aria-controls="p1" aria-selected="true">Quickstart (any OS)</button>
        <button role="tab" id="t2" aria-controls="p2" aria-selected="false">Ubuntu desktop</button>
        <button role="tab" id="t3" aria-controls="p3" aria-selected="false">Virtual machine</button>
      </div>
      <div class="panel" id="p1" role="tabpanel" aria-labelledby="t1">
        <p>Needs Node.js 20+, Git, and optionally Docker for headless proof-of-work.</p>
        <pre class="code"><button data-copy>Copy</button><code>git clone https://github.com/nddipiazza/robos.git
cd robos
npm install
electron packages/pr-review</code></pre>
        <p>Or add the knowledge graph to an existing repo by dropping a <code>.robos/</code> folder into its root.</p>
      </div>
      <div class="panel" id="p2" role="tabpanel" aria-labelledby="t2" hidden>
        <p>Full native suite for Ubuntu 22.04, 24.04 or 26.04 with GNOME.</p>
        <pre class="code"><button data-copy>Copy</button><code>git clone https://github.com/nddipiazza/robos.git
cd robos
node scripts/install-dev-deps.js
sudo bash packages/desktop-shell/install.sh</code></pre>
      </div>
      <div class="panel" id="p3" role="tabpanel" aria-labelledby="t3" hidden>
        <p>Boot the prebuilt appliance image in QEMU/KVM (16 GB RAM recommended). Default login <code>robos</code> / <code>robos</code>.</p>
        <pre class="code"><button data-copy>Copy</button><code>qemu-system-x86_64 -m 16G -smp $(nproc) -enable-kvm -cpu host \
  -drive file=robos-v0.0.7.qcow2,format=qcow2 \
  -cdrom robos-v0.0.7-seed.iso \
  -net nic -net user,hostfwd=tcp::2224-:22,hostfwd=tcp::5910-:5900</code></pre>
      </div>
    </div>
    <p class="muted" style="margin-top:20px">Full walkthrough in the <a style="color:var(--accent)" href="{{ '/v1/getting-started.html' | relative_url }}">installation guide</a>.</p>
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
      <tr><td>Windows installer</td><td><code>RobOS-Installer-v0.0.7-win.exe</code></td><td>USB flash GUI</td></tr>
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
      <details><summary>Which agents does it work with?</summary><p>Claude Code, Google Antigravity / Gemini CLI, OpenAI Codex, GitHub Copilot and more, through the Unified Harness Protocol router.</p></details>
      <details><summary>Do I need to replace my IDE?</summary><p>No. RobOS integrates with IntelliJ IDEA and VS Code, and can open pull request reviews directly in them.</p></details>
    </div>
  </div>
</section>
