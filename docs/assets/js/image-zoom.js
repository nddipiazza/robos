/**
 * RobOS Docs — Interactive Image & Flowchart Zoom Lightbox
 * Provides smooth click-to-zoom, pan, wheel-zoom, and true browser fullscreen
 * for both screenshots and vector Mermaid flowcharts across documentation pages.
 */
(function () {
  'use strict';

  let overlay, contentContainer, activeImg, activeSvgTarget, captionEl, zoomLevelEl, badgeEl, btnZoomIn, btnZoomOut, btnReset, btnFullscreen, btnNewTab, btnClose;
  let currentScale = 1;
  let isDragging = false;
  let startX = 0, startY = 0;
  let translateX = 0, translateY = 0;
  let lastTranslateX = 0, lastTranslateY = 0;
  let activeBlobUrl = null;
  const MIN_SCALE = 0.4;
  const MAX_SCALE = 5.0;
  const STEP_SCALE = 0.35;

  // Initialize Mermaid with Bespoke Dark Obsidian & Electric Cyan Theme if loaded
  function configureMermaid() {
    if (typeof window !== 'undefined' && window.mermaid) {
      try {
        window.mermaid.initialize({
          startOnLoad: true,
          theme: 'base',
          securityLevel: 'loose',
          themeVariables: {
            darkMode: true,
            background: 'transparent',
            primaryColor: '#162032',
            primaryTextColor: '#ffffff',
            primaryBorderColor: '#00e5ff',
            lineColor: '#38bdf8',
            secondaryColor: '#1e293b',
            tertiaryColor: '#0d131f',
            mainBkg: '#162032',
            nodeBorder: '#00e5ff',
            nodeTextColor: '#ffffff',
            clusterBkg: '#0d1527',
            clusterBorder: '#6366f1',
            defaultLinkColor: '#38bdf8',
            titleColor: '#00e5ff',
            edgeLabelBackground: '#1a2333',
            actorBorder: '#00e5ff',
            actorBkg: '#162032',
            actorTextColor: '#ffffff',
            actorLineColor: '#475569',
            signalColor: '#38bdf8',
            signalTextColor: '#f8fafc',
            labelBoxBkgColor: '#1a2333',
            labelBoxBorderColor: '#00e5ff',
            labelTextColor: '#ffffff',
            loopTextColor: '#00e5ff',
            noteBorderColor: '#f59e0b',
            noteBkgColor: '#1e293b',
            noteTextColor: '#fef08a',
            fontFamily: 'Space Grotesk, Plus Jakarta Sans, sans-serif'
          }
        });
      } catch (e) {
        // Silently continue if already initialized
      }
    }
  }

  function createLightboxDOM() {
    if (document.getElementById('robos-lightbox-overlay')) return;

    overlay = document.createElement('div');
    overlay.id = 'robos-lightbox-overlay';
    overlay.className = 'robos-lightbox-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Interactive image and flowchart preview and zoom');

    overlay.innerHTML = `
      <div class="robos-lightbox-header">
        <div class="robos-lightbox-title-wrap">
          <span id="robos-lightbox-badge" class="robos-lightbox-badge">RobOS HD View</span>
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
          <img id="robos-lightbox-active-img" src="" alt="" draggable="false" style="display: none;" />
          <div id="robos-lightbox-svg-target" class="robos-lightbox-svg-container" style="display: none;"></div>
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

    contentContainer = document.getElementById('robos-lightbox-img-wrapper');
    activeImg = document.getElementById('robos-lightbox-active-img');
    activeSvgTarget = document.getElementById('robos-lightbox-svg-target');
    captionEl = document.getElementById('robos-lightbox-caption');
    zoomLevelEl = document.getElementById('robos-lightbox-zoom-level');
    badgeEl = document.getElementById('robos-lightbox-badge');
    btnZoomIn = document.getElementById('robos-btn-zoom-in');
    btnZoomOut = document.getElementById('robos-btn-zoom-out');
    btnReset = document.getElementById('robos-btn-reset');
    btnFullscreen = document.getElementById('robos-btn-fullscreen');
    btnNewTab = document.getElementById('robos-btn-newtab');
    btnClose = document.getElementById('robos-btn-close');

    attachEvents();
  }

  function updateTransform() {
    if (!contentContainer) return;
    contentContainer.style.transform = `translate(${translateX}px, ${translateY}px) scale(${currentScale})`;
    if (zoomLevelEl) {
      zoomLevelEl.textContent = `${Math.round(currentScale * 100)}%`;
    }
    if (contentContainer) {
      if (currentScale > 1.05) {
        contentContainer.style.cursor = isDragging ? 'grabbing' : 'grab';
      } else {
        contentContainer.style.cursor = 'zoom-in';
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

    if (activeBlobUrl) {
      URL.revokeObjectURL(activeBlobUrl);
      activeBlobUrl = null;
    }

    badgeEl.textContent = 'RobOS HD Screenshot';
    activeImg.style.display = 'block';
    activeSvgTarget.style.display = 'none';
    activeSvgTarget.innerHTML = '';

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

  function openLightboxDiagram(svgElement, title) {
    if (!overlay) createLightboxDOM();

    if (activeBlobUrl) {
      URL.revokeObjectURL(activeBlobUrl);
      activeBlobUrl = null;
    }

    badgeEl.textContent = 'RobOS Flowchart HD';
    activeImg.style.display = 'none';
    activeSvgTarget.style.display = 'block';
    activeSvgTarget.innerHTML = '';

    // Cleanly clone SVG
    const clonedSvg = svgElement.cloneNode(true);
    clonedSvg.removeAttribute('id');
    clonedSvg.classList.add('robos-lightbox-rendered-svg');
    
    // Ensure responsive vector viewBox
    const origWidth = svgElement.getAttribute('width') || svgElement.getBoundingClientRect().width || 800;
    const origHeight = svgElement.getAttribute('height') || svgElement.getBoundingClientRect().height || 600;
    if (!clonedSvg.getAttribute('viewBox')) {
      clonedSvg.setAttribute('viewBox', `0 0 ${origWidth} ${origHeight}`);
    }
    clonedSvg.setAttribute('preserveAspectRatio', 'xMidYMid meet');

    activeSvgTarget.appendChild(clonedSvg);

    // Create SVG Blob for New Tab button
    try {
      const serializer = new XMLSerializer();
      const svgString = serializer.serializeToString(clonedSvg);
      const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
      activeBlobUrl = URL.createObjectURL(svgBlob);
      btnNewTab.href = activeBlobUrl;
    } catch (e) {
      btnNewTab.href = '#';
    }

    const displayTitle = title || 'Interactive Architecture Flowchart & Dependency Graph';
    captionEl.textContent = displayTitle;
    captionEl.style.display = 'block';

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
      if (activeSvgTarget) activeSvgTarget.innerHTML = '';
      if (activeBlobUrl) {
        URL.revokeObjectURL(activeBlobUrl);
        activeBlobUrl = null;
      }
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

    // Toggle 100% / 180% zoom on double click or single click when at scale 1
    contentContainer.addEventListener('click', (e) => {
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
      contentContainer.style.transition = 'none';
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
      contentContainer.style.transition = 'transform 0.15s ease-out';
      updateTransform();
    };

    contentContainer.addEventListener('mousedown', onMouseDown);
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

  function findNearestHeading(element) {
    let curr = element;
    while (curr && curr !== document.body) {
      let sibling = curr.previousElementSibling;
      while (sibling) {
        if (/^H[1-6]$/i.test(sibling.tagName)) {
          return sibling.textContent.replace(/^#+\s*/, '').trim();
        }
        sibling = sibling.previousElementSibling;
      }
      curr = curr.parentElement;
    }
    return 'Architecture Flowchart';
  }

  function applyHighContrastToSvg(svg) {
    if (!svg) return;

    // Clean up outer background rects
    svg.querySelectorAll('rect.background, rect[fill="#ffffff"], rect[fill="white"], rect[fill="#fff"], rect[fill="#ffffde"], rect[fill="rgb(255, 255, 222)"]').forEach((r) => {
      r.setAttribute('fill', 'transparent');
      r.style.fill = 'transparent';
    });

    // Subgraph / Cluster rects
    svg.querySelectorAll('.cluster rect, .subgraph rect, [class*="cluster"] rect, g.cluster rect').forEach((r) => {
      r.setAttribute('fill', '#0c1322');
      r.setAttribute('stroke', '#6366f1');
      r.style.fill = '#0c1322';
      r.style.stroke = '#6366f1';
      r.style.strokeWidth = '1.6px';
      r.style.strokeDasharray = '4 4';
    });

    // Subgraph titles
    svg.querySelectorAll('.cluster text, .cluster-label text, .cluster span, g.cluster text').forEach((t) => {
      t.setAttribute('fill', '#00e5ff');
      t.style.fill = '#00e5ff';
      t.style.fontWeight = '700';
    });

    // Flowchart Nodes
    svg.querySelectorAll('.node rect, .node circle, .node ellipse, .node polygon, .node path, [class*="node"] rect, g.node rect').forEach((r) => {
      r.setAttribute('fill', '#162032');
      r.setAttribute('stroke', '#00e5ff');
      r.style.fill = '#162032';
      r.style.stroke = '#00e5ff';
      r.style.strokeWidth = '1.8px';
    });

    // Node & Actor Text Labels
    svg.querySelectorAll('.node text, .node tspan, .nodeLabel, .node .label, text.node-text, .actor text, text.actor').forEach((t) => {
      t.setAttribute('fill', '#ffffff');
      t.style.fill = '#ffffff';
    });

    // Flowchart Paths, Lines & Undirected Links
    svg.querySelectorAll('.edgePath path, .flowchart-link, path.flowchart-link, path.link, path.edge-thickness-normal, path[id^="L-"]').forEach((p) => {
      p.setAttribute('stroke', '#38bdf8');
      p.style.stroke = '#38bdf8';
      p.style.strokeWidth = '2.2px';
      p.style.opacity = '1';
    });

    // Markers / Arrowheads
    svg.querySelectorAll('marker path, .marker, #arrowheadHD path, #flowchart-pointEnd path, #flowchart-circleEnd path, #flowchart-crossEnd path, defs marker path, marker#arrowhead path, marker#crosshead path').forEach((m) => {
      m.setAttribute('fill', '#38bdf8');
      m.setAttribute('stroke', '#38bdf8');
      m.style.fill = '#38bdf8';
      m.style.stroke = '#38bdf8';
    });

    // Sequence Actors
    svg.querySelectorAll('rect.actor, [class*="actor"] rect, .actor-top rect, .actor-bottom rect').forEach((r) => {
      r.setAttribute('fill', '#162032');
      r.setAttribute('stroke', '#00e5ff');
      r.style.fill = '#162032';
      r.style.stroke = '#00e5ff';
      r.style.strokeWidth = '1.8px';
    });

    // Sequence Lifelines
    svg.querySelectorAll('.actor-line, line.actor-line, [class*="actor-line"]').forEach((l) => {
      l.setAttribute('stroke', '#475569');
      l.style.stroke = '#475569';
      l.style.strokeWidth = '1.5px';
      l.style.strokeDasharray = '4 4';
    });

    // Sequence Messages / Signals
    svg.querySelectorAll('.messageLine0, .messageLine1, line.messageLine0, line.messageLine1, path.messageLine0, path.messageLine1').forEach((l) => {
      l.setAttribute('stroke', '#38bdf8');
      l.style.stroke = '#38bdf8';
      l.style.strokeWidth = '2.2px';
    });

    // Sequence Message Text
    svg.querySelectorAll('.messageText, text.messageText').forEach((t) => {
      t.setAttribute('fill', '#f8fafc');
      t.style.fill = '#f8fafc';
    });

    // Sequence Notes
    svg.querySelectorAll('rect.note, .note rect').forEach((r) => {
      r.setAttribute('fill', '#1e293b');
      r.setAttribute('stroke', '#f59e0b');
      r.style.fill = '#1e293b';
      r.style.stroke = '#f59e0b';
    });

    svg.querySelectorAll('.noteText, text.noteText').forEach((t) => {
      t.setAttribute('fill', '#fef08a');
      t.style.fill = '#fef08a';
    });
  }

  function bindDocDiagrams() {
    createLightboxDOM();

    // Select all mermaid containers and generated SVGs
    const mermaidContainers = document.querySelectorAll(
      '.mermaid, pre.mermaid, div.mermaid, .language-mermaid, svg[id^="mermaid-"]'
    );

    mermaidContainers.forEach((container) => {
      if (container.dataset.robosDiagramReady === 'true') return;

      // Check if container has rendered SVG or is an SVG itself
      let svgEl = container.tagName.toLowerCase() === 'svg' ? container : container.querySelector('svg');
      
      // If SVG not rendered yet by mermaid, wait for observer
      if (!svgEl) return;

      container.dataset.robosDiagramReady = 'true';
      applyHighContrastToSvg(svgEl);

      // If not already inside a robos-diagram-card, wrap it
      let cardWrapper = container.closest('.robos-diagram-card');
      if (!cardWrapper) {
        cardWrapper = document.createElement('div');
        cardWrapper.className = 'robos-diagram-card';
        container.parentNode.insertBefore(cardWrapper, container);

        const header = document.createElement('div');
        header.className = 'robos-diagram-header';
        header.innerHTML = `
          <div class="robos-diagram-badge">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M7 12h10M12 7v10"/></svg>
            <span>Interactive Architecture Flowchart</span>
          </div>
          <div class="robos-diagram-hint">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"></line><line x1="11" y1="8" x2="11" y2="14"></line><line x1="8" y1="11" x2="14" y2="11"></line></svg>
            <span>Click to Zoom & Pan (Fullscreen)</span>
          </div>
        `;
        cardWrapper.appendChild(header);
        cardWrapper.appendChild(container);
      }

      cardWrapper.classList.add('robos-zoomable-diagram');
      cardWrapper.setAttribute('title', 'Click to open interactive flowchart zoom & fullscreen view');

      const diagramTitle = findNearestHeading(cardWrapper);

      cardWrapper.onclick = function (e) {
        // Prevent click if clicking inside links within SVG
        if (e.target.tagName.toLowerCase() === 'a' || e.target.closest('a')) return;
        e.preventDefault();
        const currentSvg = cardWrapper.querySelector('svg') || svgEl;
        if (currentSvg) {
          applyHighContrastToSvg(currentSvg);
          openLightboxDiagram(currentSvg, diagramTitle);
        }
      };
    });
  }

  function init() {
    configureMermaid();
    bindDocImages();
    bindDocDiagrams();

    // Observe dynamic changes (e.g. async Mermaid SVG injection)
    const observer = new MutationObserver(() => {
      bindDocImages();
      bindDocDiagrams();
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.addEventListener('load', () => {
    configureMermaid();
    bindDocImages();
    bindDocDiagrams();
  });
})();
