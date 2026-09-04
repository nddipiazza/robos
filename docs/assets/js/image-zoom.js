/**
 * RobOS Docs — Interactive Image Zoom & Fullscreen Lightbox
 * Provides smooth click-to-zoom, pan, wheel-zoom, and true browser fullscreen
 * for all screenshots and architectural diagrams across documentation pages.
 */
(function () {
  'use strict';

  let overlay, imgContainer, activeImg, captionEl, zoomLevelEl, btnZoomIn, btnZoomOut, btnReset, btnFullscreen, btnNewTab, btnClose;
  let currentScale = 1;
  let isDragging = false;
  let startX = 0, startY = 0;
  let translateX = 0, translateY = 0;
  let lastTranslateX = 0, lastTranslateY = 0;
  const MIN_SCALE = 0.5;
  const MAX_SCALE = 4.0;
  const STEP_SCALE = 0.35;

  function createLightboxDOM() {
    if (document.getElementById('robos-lightbox-overlay')) return;

    overlay = document.createElement('div');
    overlay.id = 'robos-lightbox-overlay';
    overlay.className = 'robos-lightbox-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Image preview and zoom');

    overlay.innerHTML = `
      <div class="robos-lightbox-header">
        <div class="robos-lightbox-title-wrap">
          <span class="robos-lightbox-badge">RobOS HD View</span>
          <span id="robos-lightbox-zoom-level" class="robos-lightbox-zoom-badge">100%</span>
        </div>
        <div class="robos-lightbox-controls">
          <button type="button" class="robos-lightbox-btn" id="robos-btn-zoom-out" title="Zoom Out ( - )" aria-label="Zoom Out">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line><line x1="8" y1="11" x2="14" y2="11"></line></svg>
          </button>
          <button type="button" class="robos-lightbox-btn" id="robos-btn-reset" title="Reset Zoom ( 0 )" aria-label="Reset Zoom">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path><path d="M3 3v5h5"></path></svg>
          </button>
          <button type="button" class="robos-lightbox-btn" id="robos-btn-zoom-in" title="Zoom In ( + )" aria-label="Zoom In">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line><line x1="11" y1="8" x2="11" y2="14"></line><line x1="8" y1="11" x2="14" y2="11"></line></svg>
          </button>
          <button type="button" class="robos-lightbox-btn" id="robos-btn-fullscreen" title="Toggle Fullscreen ( F )" aria-label="Toggle Fullscreen">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"></path></svg>
          </button>
          <a class="robos-lightbox-btn" id="robos-btn-newtab" target="_blank" rel="noopener noreferrer" title="Open Full Resolution in New Tab" aria-label="Open Full Resolution">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
          </a>
          <button type="button" class="robos-lightbox-btn robos-lightbox-btn-close" id="robos-btn-close" title="Close ( Esc )" aria-label="Close Preview">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>
      </div>
      <div class="robos-lightbox-viewport" id="robos-lightbox-viewport">
        <div class="robos-lightbox-img-wrapper" id="robos-lightbox-img-wrapper">
          <img id="robos-lightbox-active-img" src="" alt="" draggable="false" />
        </div>
      </div>
      <div class="robos-lightbox-footer">
        <p id="robos-lightbox-caption" class="robos-lightbox-caption"></p>
        <div class="robos-lightbox-hints">
          <span>Scroll to Zoom</span> • <span>Click & Drag to Pan</span> • <span>Press Esc to Exit</span>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    imgContainer = document.getElementById('robos-lightbox-img-wrapper');
    activeImg = document.getElementById('robos-lightbox-active-img');
    captionEl = document.getElementById('robos-lightbox-caption');
    zoomLevelEl = document.getElementById('robos-lightbox-zoom-level');
    btnZoomIn = document.getElementById('robos-btn-zoom-in');
    btnZoomOut = document.getElementById('robos-btn-zoom-out');
    btnReset = document.getElementById('robos-btn-reset');
    btnFullscreen = document.getElementById('robos-btn-fullscreen');
    btnNewTab = document.getElementById('robos-btn-newtab');
    btnClose = document.getElementById('robos-btn-close');

    attachEvents();
  }

  function updateTransform() {
    if (!imgContainer) return;
    imgContainer.style.transform = `translate(${translateX}px, ${translateY}px) scale(${currentScale})`;
    if (zoomLevelEl) {
      zoomLevelEl.textContent = `${Math.round(currentScale * 100)}%`;
    }
    if (imgContainer) {
      if (currentScale > 1.05) {
        imgContainer.style.cursor = isDragging ? 'grabbing' : 'grab';
      } else {
        imgContainer.style.cursor = 'zoom-in';
      }
    }
  }

  function resetZoom() {
    currentScale = 1;
    translateX = 0;
    translateY = 0;
    lastTranslateX = 0;
    lastTranslateY = 0;
    updateTransform();
  }

  function setZoom(newScale, focalX, focalY) {
    const clampedScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, newScale));
    if (clampedScale === currentScale) return;

    if (focalX !== undefined && focalY !== undefined) {
      const scaleRatio = clampedScale / currentScale;
      translateX = focalX - (focalX - translateX) * scaleRatio;
      translateY = focalY - (focalY - translateY) * scaleRatio;
      lastTranslateX = translateX;
      lastTranslateY = translateY;
    }

    currentScale = clampedScale;
    updateTransform();
  }

  function openLightbox(imgSrc, imgAlt) {
    if (!overlay) createLightboxDOM();

    activeImg.src = imgSrc;
    activeImg.alt = imgAlt || 'Screenshot Preview';
    btnNewTab.href = imgSrc;
    captionEl.textContent = imgAlt || '';
    if (!imgAlt || imgAlt.trim() === '') {
      captionEl.style.display = 'none';
    } else {
      captionEl.style.display = 'block';
    }

    resetZoom();
    overlay.classList.add('active');
    document.body.classList.add('robos-lightbox-open');
  }

  function closeLightbox() {
    if (!overlay) return;
    overlay.classList.remove('active');
    document.body.classList.remove('robos-lightbox-open');
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
    setTimeout(() => {
      if (activeImg) activeImg.src = '';
      resetZoom();
    }, 200);
  }

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      if (overlay.requestFullscreen) {
        overlay.requestFullscreen();
      } else if (overlay.webkitRequestFullscreen) {
        overlay.webkitRequestFullscreen();
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
    }
  }

  function attachEvents() {
    btnClose.addEventListener('click', closeLightbox);

    btnZoomIn.addEventListener('click', (e) => {
      e.stopPropagation();
      setZoom(currentScale + STEP_SCALE);
    });

    btnZoomOut.addEventListener('click', (e) => {
      e.stopPropagation();
      setZoom(currentScale - STEP_SCALE);
    });

    btnReset.addEventListener('click', (e) => {
      e.stopPropagation();
      resetZoom();
    });

    btnFullscreen.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleFullscreen();
    });

    // Close when clicking empty viewport backdrop
    const viewport = document.getElementById('robos-lightbox-viewport');
    viewport.addEventListener('click', (e) => {
      if (e.target === viewport) {
        closeLightbox();
      }
    });

    // Toggle 100% / 180% zoom on image double click or single click when at scale 1
    activeImg.addEventListener('click', (e) => {
      e.stopPropagation();
      if (isDragging) return;
      if (currentScale <= 1.05) {
        setZoom(1.8);
      } else {
        resetZoom();
      }
    });

    // Mouse wheel zoom
    viewport.addEventListener('wheel', (e) => {
      e.preventDefault();
      const rect = viewport.getBoundingClientRect();
      const focalX = e.clientX - rect.left - rect.width / 2;
      const focalY = e.clientY - rect.top - rect.height / 2;
      const delta = e.deltaY < 0 ? STEP_SCALE : -STEP_SCALE;
      setZoom(currentScale + delta, focalX, focalY);
    }, { passive: false });

    // Drag to pan
    const onMouseDown = (e) => {
      if (e.button !== 0) return;
      isDragging = true;
      startX = e.clientX - lastTranslateX;
      startY = e.clientY - lastTranslateY;
      imgContainer.style.transition = 'none';
    };

    const onMouseMove = (e) => {
      if (!isDragging) return;
      translateX = e.clientX - startX;
      translateY = e.clientY - startY;
      updateTransform();
    };

    const onMouseUp = () => {
      if (!isDragging) return;
      isDragging = false;
      lastTranslateX = translateX;
      lastTranslateY = translateY;
      imgContainer.style.transition = 'transform 0.15s ease-out';
      updateTransform();
    };

    imgContainer.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);

    // Keyboard shortcuts
    window.addEventListener('keydown', (e) => {
      if (!overlay || !overlay.classList.contains('active')) return;

      if (e.key === 'Escape') {
        closeLightbox();
      } else if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        setZoom(currentScale + STEP_SCALE);
      } else if (e.key === '-' || e.key === '_') {
        e.preventDefault();
        setZoom(currentScale - STEP_SCALE);
      } else if (e.key === '0') {
        e.preventDefault();
        resetZoom();
      } else if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        toggleFullscreen();
      } else if (e.key === 'ArrowLeft') {
        translateX += 60; lastTranslateX = translateX; updateTransform();
      } else if (e.key === 'ArrowRight') {
        translateX -= 60; lastTranslateX = translateX; updateTransform();
      } else if (e.key === 'ArrowUp') {
        translateY += 60; lastTranslateY = translateY; updateTransform();
      } else if (e.key === 'ArrowDown') {
        translateY -= 60; lastTranslateY = translateY; updateTransform();
      }
    });
  }

  function bindDocImages() {
    createLightboxDOM();

    // Select all content images and screenshot cards, excluding small nav icons or brand logos
    const images = document.querySelectorAll(
      '.main-content img, .content img, article img, .robos-app-card img, .screenshot-frame, .robos-zoomable-img'
    );

    images.forEach((img) => {
      if (img.classList.contains('no-zoom') || img.classList.contains('site-logo') || img.classList.contains('icon-img')) {
        return;
      }

      // Check if image is tiny icon
      if (img.width > 0 && img.width < 50 && img.height > 0 && img.height < 50) {
        return;
      }

      img.classList.add('robos-zoomable-img');
      img.setAttribute('title', img.getAttribute('title') || 'Click to zoom and view fullscreen');

      // Add click handler
      img.onclick = function (e) {
        const parentLink = img.closest('a');
        if (parentLink) {
          const href = parentLink.getAttribute('href') || '';
          if (/\.(png|jpe?g|gif|webp|svg)($|\?)/i.test(href)) {
            e.preventDefault();
            openLightbox(href, img.alt);
            return;
          }
        }
        e.preventDefault();
        openLightbox(img.currentSrc || img.src, img.alt);
      };
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindDocImages);
  } else {
    bindDocImages();
  }

  window.addEventListener('load', bindDocImages);
})();
