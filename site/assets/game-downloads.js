(function () {
  'use strict';
  var buttons = document.querySelectorAll('[data-game-download]');
  if (!buttons.length) return;
  var ua = navigator.userAgent || '';
  var platform = /Android|iPhone|iPad|iPod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) ? 'mobile' : /Windows/i.test(ua) ? 'windows' : /Mac/i.test(ua) ? 'macos' : /Linux|X11/i.test(ua) ? 'linux' : 'unknown';
  var suffix = { windows: 'Windows-Setup.exe', linux: 'Linux-x64.zip', macos: 'macOS.zip' };
  var labels = { windows: 'Windows', linux: 'Linux', macos: 'macOS' };
  var messages = { windows: 'Open the installer, then leave “Play” checked to start. Launch again from your desktop or Start menu.', linux: 'Extract the ZIP, mark the game executable if needed, then open it.', macos: 'Extract the ZIP and open the game app. This download is unsigned.', mobile: 'These games run on a Windows, Linux or macOS computer. Choose a desktop download below.', unknown: 'Choose the download for your computer below.' };
  var tag = 'games-v' + buttons[0].dataset.gameVersion;
  buttons.forEach(function (button) {
    if (!suffix[platform]) { button.href = '#download'; button.textContent = 'Choose a desktop download'; return; }
    var asset = button.dataset.gameDownload + '-v' + button.dataset.gameVersion + '-' + suffix[platform];
    button.dataset.gameAsset = asset;
    button.href = 'https://github.com/nddipiazza/robos/releases/download/' + tag + '/' + asset;
    button.textContent = 'Download & play for ' + labels[platform];
  });
  document.querySelectorAll('[data-game-download-status]').forEach(function (status) { status.textContent = messages[platform]; });
  // Missing builds must lead to a readable release status, never a dead asset URL.
  fetch('https://api.github.com/repos/nddipiazza/robos/releases/tags/' + tag, { headers: { Accept: 'application/vnd.github+json' }, signal: AbortSignal.timeout(8000) })
    .then(function (response) { if (response.status === 404) return { assets: [] }; if (!response.ok) throw new Error('Release lookup unavailable'); return response.json(); })
    .then(function (release) {
      var assets = new Map((release.assets || []).filter(function (asset) { return asset.state === 'uploaded'; }).map(function (asset) { return [asset.name, asset.browser_download_url]; }));
      var missing = false;
      document.querySelectorAll('[data-game-asset]').forEach(function (link) {
        if (assets.has(link.dataset.gameAsset)) { link.href = assets.get(link.dataset.gameAsset); return; }
        missing = true;
        link.href = 'https://github.com/nddipiazza/robos/releases';
        link.textContent = link.hasAttribute('data-game-download') ? 'View download availability' : link.textContent + ' — build pending';
      });
      if (missing) document.querySelectorAll('[data-game-download-status]').forEach(function (status) { status.textContent = 'Some builds are still being prepared. Available downloads work directly; pending builds link to the release status.'; });
    }).catch(function () { /* Static download links remain usable if GitHub API is unavailable. */ });
})();
