(function () {
  'use strict';
  document.querySelectorAll('[data-browser-game-src]').forEach(function (player) {
    var launch = player.querySelector('[data-browser-game-launch]');
    var status = player.querySelector('[data-browser-game-status]');
    launch.addEventListener('click', function () {
      var frame = document.createElement('iframe');
      frame.src = player.dataset.browserGameSrc;
      frame.title = 'Play Midterms 2026: Battle for the Hill';
      frame.className = 'browser-game-frame';
      frame.setAttribute('allow', 'autoplay; fullscreen; gamepad');
      frame.setAttribute('allowfullscreen', '');
      status.textContent = 'Loading the game. The first launch may take a moment.';
      frame.addEventListener('load', function () {
        status.textContent = 'Use Fullscreen for the clearest view of the board.';
      });
      player.querySelector('[data-browser-game-frame]').appendChild(frame);
      launch.remove();
      var fullscreen = document.createElement('button');
      fullscreen.type = 'button';
      fullscreen.className = 'btn btn-ghost';
      fullscreen.textContent = 'Fullscreen';
      fullscreen.addEventListener('click', function () {
        if (!frame.requestFullscreen) { status.textContent = 'Open the itch.io player below for fullscreen.'; return; }
        frame.requestFullscreen().catch(function () { status.textContent = 'Open the itch.io player below for fullscreen.'; });
      });
      player.querySelector('[data-browser-game-controls]').appendChild(fullscreen);
    }, { once: true });
  });
})();
