/**
 * RobOS cRPG Maker — Application Controller
 * Handles UI interactions, KGraph state management, IPC persistence,
 * and blockout build pipelines.
 */

document.addEventListener('DOMContentLoaded', async () => {
  // DOM Elements
  const canvas = document.getElementById('map-canvas');
  const viewportContainer = document.getElementById('viewport-container');
  const mapSelect = document.getElementById('map-select');
  const btnNewMap = document.getElementById('btn-new-map');
  const btnSaveMap = document.getElementById('btn-save-map');
  const btnBuildMap = document.getElementById('btn-build-map');
  const btnExportPng = document.getElementById('btn-export-png');
  const btnViewCanvas = document.getElementById('btn-view-canvas');
  const btnViewPng = document.getElementById('btn-view-png');
  const pngViewContainer = document.getElementById('png-view-container');
  const imgCompiledPng = document.getElementById('img-compiled-png');
  const pngEmptyState = document.getElementById('png-empty-state');

  // Tool buttons
  const toolSelect = document.getElementById('tool-select');
  const toolPlace = document.getElementById('tool-place');
  const toolPan = document.getElementById('tool-pan');
  const btnZoomIn = document.getElementById('btn-zoom-in');
  const btnZoomOut = document.getElementById('btn-zoom-out');
  const btnZoomReset = document.getElementById('btn-zoom-reset');
  const lblZoomLevel = document.getElementById('lbl-zoom-level');
  const chkSnapGrid = document.getElementById('chk-snap-grid');
  const chkShowGrid = document.getElementById('chk-show-grid');
  const chkShowLabels = document.getElementById('chk-show-labels');
  const chkDebugCollision = document.getElementById('chk-debug-collision');
  const chkShowBg = document.getElementById('chk-show-bg');

  // HUD Elements
  const hudFeet = document.getElementById('hud-feet');
  const hudCell = document.getElementById('hud-cell');
  const hudTerrain = document.getElementById('hud-terrain');
  const statusMessage = document.getElementById('status-message');

  // Map settings inputs
  const inputSlug = document.getElementById('map-slug');
  const inputTitle = document.getElementById('map-title');
  const selectTerrain = document.getElementById('map-terrain');
  const inputWidth = document.getElementById('map-width');
  const inputHeight = document.getElementById('map-height');
  const inputBgImage = document.getElementById('map-bg-image');
  const inputBgOpacity = document.getElementById('map-bg-opacity');
  const lblBgOpacity = document.getElementById('lbl-bg-opacity');
  const btnBrowseBg = document.getElementById('btn-browse-bg');
  const lblGridCells = document.getElementById('lbl-grid-cells');
  const lblPngRes = document.getElementById('lbl-png-res');

  // Object form inputs
  const objFormTitle = document.getElementById('obj-form-title');
  const objSelectedBadge = document.getElementById('obj-selected-badge');
  const inputObjId = document.getElementById('obj-id');
  const selectObjType = document.getElementById('obj-type');
  const inputObjSprite = document.getElementById('obj-sprite');
  const shapeFieldsRect = document.getElementById('shape-fields-rect');
  const shapeFieldsCircle = document.getElementById('shape-fields-circle');
  const shapeFieldsLine = document.getElementById('shape-fields-line');
  const inputObjX = document.getElementById('obj-x');
  const inputObjY = document.getElementById('obj-y');
  const inputObjW = document.getElementById('obj-w');
  const inputObjH = document.getElementById('obj-h');
  const inputObjCX = document.getElementById('obj-cx');
  const inputObjCY = document.getElementById('obj-cy');
  const inputObjRadius = document.getElementById('obj-radius');
  const inputObjLX1 = document.getElementById('obj-lx1');
  const inputObjLY1 = document.getElementById('obj-ly1');
  const inputObjLX2 = document.getElementById('obj-lx2');
  const inputObjLY2 = document.getElementById('obj-ly2');
  const inputObjThickness = document.getElementById('obj-thickness');
  const inputObjLabel = document.getElementById('obj-label');
  const doorOptionsGroup = document.getElementById('door-options');
  const chkDoorOpen = document.getElementById('obj-door-open');
  const selectOverrideMovement = document.getElementById('override-movement');
  const selectOverrideSight = document.getElementById('override-sight');
  const selectOverrideDifficult = document.getElementById('override-difficult');
  const selectOverrideCover = document.getElementById('override-cover');

  const btnApplyObj = document.getElementById('btn-apply-obj');
  const btnDuplicateObj = document.getElementById('btn-duplicate-obj');
  const btnDeleteObj = document.getElementById('btn-delete-obj');
  const btnClearSelection = document.getElementById('btn-clear-selection');

  // Right sidebar
  const objectListContainer = document.getElementById('object-list');
  const lblObjectCount = document.getElementById('lbl-object-count');
  const filterObjectsInput = document.getElementById('filter-objects');
  const statTotalCells = document.getElementById('stat-total-cells');
  const statBlockedCells = document.getElementById('stat-blocked-cells');
  const statOpaqueCells = document.getElementById('stat-opaque-cells');
  const statDifficultCells = document.getElementById('stat-difficult-cells');
  const lblJsonldPath = document.getElementById('lbl-jsonld-path');
  const lblPngPath = document.getElementById('lbl-png-path');

  // Tab switching
  const tabBtnMap = document.getElementById('tab-btn-map');
  const tabBtnObject = document.getElementById('tab-btn-object');
  const tabContentMap = document.getElementById('tab-content-map-settings');
  const tabContentObject = document.getElementById('tab-content-object-form');

  // Application State
  const renderer = new MapCanvasRenderer(canvas);
  let currentSlug = '';
  let activeTool = 'select'; // 'select' | 'place' | 'pan'
  let isDragging = false;
  let isMovingObject = false;
  let dragStart = { x: 0, y: 0 };
  let initialObjectPos = null;
  let isPngViewActive = false;

  // Initialize Canvas Sizing
  function resizeCanvas() {
    const rect = viewportContainer.getBoundingClientRect();
    renderer.resize(rect.width, rect.height);
  }
  window.addEventListener('resize', resizeCanvas);
  resizeCanvas();

  // Tab Switching Logic
  function switchTab(tab) {
    if (tab === 'map-settings') {
      tabBtnMap.classList.add('active');
      tabBtnObject.classList.remove('active');
      tabContentMap.classList.add('active');
      tabContentObject.classList.remove('active');
    } else {
      tabBtnMap.classList.remove('active');
      tabBtnObject.classList.add('active');
      tabContentMap.classList.remove('active');
      tabContentObject.classList.add('active');
    }
  }
  tabBtnMap.addEventListener('click', () => switchTab('map-settings'));
  tabBtnObject.addEventListener('click', () => switchTab('object-form'));

  // Status message helper
  function setStatus(msg, isSuccess = true) {
    statusMessage.textContent = msg;
    statusMessage.style.color = isSuccess ? '#7ee787' : '#f87171';
  }

  // Load Map List
  async function loadMapList(selectSlug = '') {
    const res = await window.robosCrpgMaker.listMaps();
    if (!res.success) {
      setStatus(`Failed to list maps: ${res.error}`, false);
      return;
    }

    mapSelect.innerHTML = '';
    const maps = res.maps || [];

    if (maps.length === 0) {
      mapSelect.innerHTML = '<option value="">(No maps found)</option>';
      return;
    }

    for (const m of maps) {
      const opt = document.createElement('option');
      opt.value = m.slug;
      opt.textContent = `${m.title} (${m.slug}) — ${m.width}×${m.height} ft`;
      if (selectSlug && m.slug === selectSlug) {
        opt.selected = true;
      }
      mapSelect.appendChild(opt);
    }

    const targetSlug = selectSlug || (maps[0] ? maps[0].slug : '');
    if (targetSlug) {
      loadMap(targetSlug);
    }
  }

  // Load Selected Map
  async function loadMap(slug) {
    setStatus(`Loading map: ${slug}...`);
    const res = await window.robosCrpgMaker.loadMap(slug);
    if (!res.success) {
      setStatus(`Error loading map: ${res.error}`, false);
      return;
    }

    currentSlug = slug;
    const data = res.data;
    renderer.setMap(data);
    renderer.setSelectedObject(null);

    // Sync Map Settings
    inputSlug.value = slug;
    inputTitle.value = data['dcterms:title'] || data.title || slug;
    selectTerrain.value = data['robos:terrain'] || data.terrain || 'stone';
    inputWidth.value = data['robos:width'] || data.width || 120;
    inputHeight.value = data['robos:height'] || data.height || 80;
    const bgImage = data['robos:backgroundImage'] || data.backgroundImage || '';
    inputBgImage.value = bgImage;
    const bgOpacity = data['robos:backgroundOpacity'] !== undefined ? Math.round(data['robos:backgroundOpacity'] * 100) : 100;
    inputBgOpacity.value = bgOpacity;
    lblBgOpacity.textContent = `${bgOpacity}%`;
    renderer.backgroundOpacity = bgOpacity / 100.0;

    updateDimensionBadges();
    updateStatsPanel(res);
    renderObjectTree();
    clearObjectForm();
    renderer.fitToView();

    // Check PNG view state
    if (res.pngExists) {
      imgCompiledPng.src = `file://${res.pngPath}?t=${Date.now()}`;
      imgCompiledPng.style.display = 'block';
      pngEmptyState.classList.add('hidden');
    } else {
      imgCompiledPng.style.display = 'none';
      pngEmptyState.classList.remove('hidden');
    }

    setStatus(`Map "${slug}" loaded successfully.`);
  }

  // Update Dimensions & Cells Calculation
  function updateDimensionBadges() {
    const w = Number(inputWidth.value) || 120;
    const h = Number(inputHeight.value) || 80;
    const cols = Math.floor(w / 5);
    const rows = Math.floor(h / 5);
    const totalCells = cols * rows;

    lblGridCells.textContent = `${cols} × ${rows} cells (${totalCells} total)`;
    lblPngRes.textContent = `${w * 16} × ${h * 16} px (16 px/ft)`;

    if (renderer.mapData) {
      renderer.mapData['robos:width'] = w;
      renderer.mapData['robos:height'] = h;
      renderer.mapData['robos:terrain'] = selectTerrain.value;
      renderer.mapData['dcterms:title'] = inputTitle.value;
      renderer.render();
    }
  }

  // Update Statistics Panel
  function updateStatsPanel(res) {
    const data = renderer.mapData;
    if (!data) return;

    const w = Number(data['robos:width'] || 120);
    const h = Number(data['robos:height'] || 80);
    const totalCells = Math.floor(w / 5) * Math.floor(h / 5);
    statTotalCells.textContent = totalCells;

    const blockout = data['robos:blockout'] || {};
    statBlockedCells.textContent = (blockout.blocked || []).length;
    statOpaqueCells.textContent = (blockout.opaque || []).length;
    statDifficultCells.textContent = (blockout.difficult || []).length;

    lblJsonldPath.textContent = `games/crpg-realm/maps/${currentSlug}.jsonld`;
    lblPngPath.textContent = `games/crpg-realm/assets/blockouts/${currentSlug}.png`;
  }

  // Render Object Tree in Right Sidebar
  function renderObjectTree() {
    const data = renderer.mapData;
    if (!data) return;

    const rawObjects = data['robos:mapObjects'] || [];
    lblObjectCount.textContent = rawObjects.length;
    objectListContainer.innerHTML = '';

    const filter = (filterObjectsInput.value || '').toLowerCase();
    const filtered = rawObjects.filter(obj => {
      const id = (obj['robos:objectId'] || obj.objectId || obj.id || '').toLowerCase();
      const type = (obj['robos:objectType'] || obj.objectType || '').toLowerCase();
      const label = (obj['dcterms:title'] || obj.label || '').toLowerCase();
      return id.includes(filter) || type.includes(filter) || label.includes(filter);
    });

    if (filtered.length === 0) {
      objectListContainer.innerHTML = `<div class="empty-list-notice">${filter ? 'No matching objects' : 'No objects added yet'}</div>`;
      return;
    }

    for (const obj of filtered) {
      const id = obj['robos:objectId'] || obj.objectId || obj.id;
      const type = obj['robos:objectType'] || obj.objectType || 'zone';
      const label = obj['dcterms:title'] || obj.label || '';
      const style = renderer.TYPE_STYLE[type] || renderer.TYPE_STYLE.zone;

      const item = document.createElement('div');
      item.className = 'tree-item';
      if (renderer.selectedObjectId === id) {
        item.classList.add('selected');
      }

      item.innerHTML = `
        <div class="tree-item-info">
          <span class="item-color-chip" style="background-color: ${style.fill}; border: 1px solid ${style.stroke};"></span>
          <span class="item-id" title="${id}">${id}</span>
          <span class="item-type-badge">${type}</span>
        </div>
        <div class="tree-item-actions">
          <button class="btn-item-action btn-item-del" title="Delete object">✕</button>
        </div>
      `;

      item.addEventListener('click', (e) => {
        if (e.target.classList.contains('btn-item-del')) return;
        selectObject(id);
      });

      item.querySelector('.btn-item-del').addEventListener('click', (e) => {
        e.stopPropagation();
        deleteObject(id);
      });

      objectListContainer.appendChild(item);
    }
  }

  // Populate Object Form for Editing
  function selectObject(id) {
    if (!renderer.mapData) return;
    const rawObjects = renderer.mapData['robos:mapObjects'] || [];
    const obj = rawObjects.find(o => (o['robos:objectId'] || o.objectId || o.id) === id);

    if (!obj) {
      clearObjectForm();
      return;
    }

    renderer.setSelectedObject(id);
    switchTab('object-form');

    objFormTitle.textContent = `Edit Map Object: ${id}`;
    objSelectedBadge.textContent = 'Editing';
    objSelectedBadge.className = 'selection-badge editing';

    inputObjId.value = id;
    selectObjType.value = obj['robos:objectType'] || obj.objectType || 'wall';

    const shape = obj['robos:shape'] || obj.shape || 'rect';
    const shapeRadios = document.getElementsByName('obj-shape');
    for (const r of shapeRadios) {
      r.checked = (r.value === shape);
    }
    updateShapeFieldsVisibility(shape);

    if (shape === 'rect') {
      const pos = obj['robos:position'] || obj.position || [0, 0];
      const size = obj['robos:size'] || obj.size || [5, 5];
      inputObjX.value = pos[0];
      inputObjY.value = pos[1];
      inputObjW.value = size[0];
      inputObjH.value = size[1];
    } else if (shape === 'circle') {
      const pos = obj['robos:position'] || obj.position || [0, 0];
      inputObjCX.value = pos[0];
      inputObjCY.value = pos[1];
      inputObjRadius.value = obj['robos:radius'] || obj.radius || 5;
    } else if (shape === 'line') {
      const from = obj['robos:position'] || obj.position || [0, 0];
      const to = obj['robos:to'] || obj.to || [0, 0];
      inputObjLX1.value = from[0];
      inputObjLY1.value = from[1];
      inputObjLX2.value = to[0];
      inputObjLY2.value = to[1];
      inputObjThickness.value = obj['robos:thickness'] || obj.thickness || 5;
    }

    inputObjLabel.value = obj['dcterms:title'] || obj.label || '';
    inputObjSprite.value = obj['robos:sprite'] || obj.sprite || '';
    chkDoorOpen.checked = Boolean(obj['robos:open'] || obj.open);
    doorOptionsGroup.classList.toggle('hidden', selectObjType.value !== 'door');

    // Rule overrides
    selectOverrideMovement.value = obj['robos:blocksMovement'] !== undefined ? String(obj['robos:blocksMovement']) : '';
    selectOverrideSight.value = obj['robos:blocksSight'] !== undefined ? String(obj['robos:blocksSight']) : '';
    selectOverrideDifficult.value = obj['robos:difficultTerrain'] !== undefined ? String(obj['robos:difficultTerrain']) : '';
    selectOverrideCover.value = obj['robos:cover'] || '';

    btnApplyObj.textContent = '✓ Update Object';
    btnDuplicateObj.disabled = false;
    btnDeleteObj.disabled = false;

    renderObjectTree();
  }

  // Clear Object Form
  function clearObjectForm() {
    renderer.setSelectedObject(null);
    objFormTitle.textContent = 'Add New Map Object';
    objSelectedBadge.textContent = 'New';
    objSelectedBadge.className = 'selection-badge';

    inputObjId.value = '';
    inputObjLabel.value = '';
    inputObjSprite.value = '';
    chkDoorOpen.checked = false;
    doorOptionsGroup.classList.toggle('hidden', selectObjType.value !== 'door');

    selectOverrideMovement.value = '';
    selectOverrideSight.value = '';
    selectOverrideDifficult.value = '';
    selectOverrideCover.value = '';

    btnApplyObj.textContent = '➕ Add Object';
    btnDuplicateObj.disabled = true;
    btnDeleteObj.disabled = true;

    renderObjectTree();
  }

  function updateShapeFieldsVisibility(shape) {
    shapeFieldsRect.classList.toggle('hidden', shape !== 'rect');
    shapeFieldsCircle.classList.toggle('hidden', shape !== 'circle');
    shapeFieldsLine.classList.toggle('hidden', shape !== 'line');
  }

  // Build Object from Form Input
  function getObjectFromForm() {
    const id = (inputObjId.value || '').trim();
    if (!id) {
      alert('Object ID is required');
      return null;
    }

    const type = selectObjType.value;
    const shape = document.querySelector('input[name="obj-shape"]:checked').value;
    const label = (inputObjLabel.value || '').trim();

    const obj = {
      '@type': 'robos:CRPGMapObject',
      'robos:objectId': id,
      'robos:objectType': type,
      'robos:shape': shape,
    };

    if (label) {
      obj['dcterms:title'] = label;
    }

    const sprite = (inputObjSprite.value || '').trim();
    if (sprite) {
      obj['robos:sprite'] = sprite;
    }

    if (shape === 'rect') {
      obj['robos:position'] = [Number(inputObjX.value), Number(inputObjY.value)];
      obj['robos:size'] = [Math.max(1, Number(inputObjW.value)), Math.max(1, Number(inputObjH.value))];
    } else if (shape === 'circle') {
      obj['robos:position'] = [Number(inputObjCX.value), Number(inputObjCY.value)];
      obj['robos:radius'] = Math.max(0.5, Number(inputObjRadius.value));
    } else if (shape === 'line') {
      obj['robos:position'] = [Number(inputObjLX1.value), Number(inputObjLY1.value)];
      obj['robos:to'] = [Number(inputObjLX2.value), Number(inputObjLY2.value)];
      obj['robos:thickness'] = Math.max(1, Number(inputObjThickness.value));
    }

    if (type === 'door') {
      obj['robos:open'] = chkDoorOpen.checked;
    }

    // Overrides
    if (selectOverrideMovement.value !== '') {
      obj['robos:blocksMovement'] = selectOverrideMovement.value === 'true';
    }
    if (selectOverrideSight.value !== '') {
      obj['robos:blocksSight'] = selectOverrideSight.value === 'true';
    }
    if (selectOverrideDifficult.value !== '') {
      obj['robos:difficultTerrain'] = selectOverrideDifficult.value === 'true';
    }
    if (selectOverrideCover.value !== '') {
      obj['robos:cover'] = selectOverrideCover.value;
    }

    return obj;
  }

  // Save / Apply Object
  btnApplyObj.addEventListener('click', () => {
    const obj = getObjectFromForm();
    if (!obj || !renderer.mapData) return;

    if (!renderer.mapData['robos:mapObjects']) {
      renderer.mapData['robos:mapObjects'] = [];
    }
    const objs = renderer.mapData['robos:mapObjects'];
    const id = obj['robos:objectId'];
    const existingIdx = objs.findIndex(o => (o['robos:objectId'] || o.objectId || o.id) === id);

    if (existingIdx >= 0) {
      objs[existingIdx] = obj;
      setStatus(`Updated object: ${id}`);
    } else {
      objs.push(obj);
      setStatus(`Added new object: ${id}`);
    }

    selectObject(id);
    renderer.render();
  });

  // Duplicate Object
  btnDuplicateObj.addEventListener('click', () => {
    if (!renderer.selectedObjectId || !renderer.mapData) return;
    const objs = renderer.mapData['robos:mapObjects'] || [];
    const obj = objs.find(o => (o['robos:objectId'] || o.objectId || o.id) === renderer.selectedObjectId);
    if (!obj) return;

    const clone = JSON.parse(JSON.stringify(obj));
    const newId = `${renderer.selectedObjectId}_copy`;
    clone['robos:objectId'] = newId;

    // Offset position by 5 ft
    const shape = clone['robos:shape'] || clone.shape || 'rect';
    if (shape === 'rect' || shape === 'circle') {
      clone['robos:position'][0] += 5;
      clone['robos:position'][1] += 5;
    } else if (shape === 'line') {
      clone['robos:position'][0] += 5;
      clone['robos:position'][1] += 5;
      clone['robos:to'][0] += 5;
      clone['robos:to'][1] += 5;
    }

    objs.push(clone);
    selectObject(newId);
    renderer.render();
    setStatus(`Duplicated object as: ${newId}`);
  });

  // Delete Object
  function deleteObject(id) {
    if (!renderer.mapData) return;
    const objs = renderer.mapData['robos:mapObjects'] || [];
    const idx = objs.findIndex(o => (o['robos:objectId'] || o.objectId || o.id) === id);
    if (idx >= 0) {
      objs.splice(idx, 1);
      clearObjectForm();
      renderer.render();
      setStatus(`Deleted object: ${id}`);
    }
  }
  btnDeleteObj.addEventListener('click', () => {
    if (renderer.selectedObjectId) {
      deleteObject(renderer.selectedObjectId);
    }
  });

  btnClearSelection.addEventListener('click', () => {
    clearObjectForm();
  });

  // Form Field Change Handlers
  const shapeRadios = document.getElementsByName('obj-shape');
  for (const r of shapeRadios) {
    r.addEventListener('change', () => {
      updateShapeFieldsVisibility(r.value);
    });
  }

  selectObjType.addEventListener('change', () => {
    doorOptionsGroup.classList.toggle('hidden', selectObjType.value !== 'door');
  });

  inputWidth.addEventListener('input', updateDimensionBadges);
  inputHeight.addEventListener('input', updateDimensionBadges);
  selectTerrain.addEventListener('change', updateDimensionBadges);
  inputTitle.addEventListener('input', updateDimensionBadges);

  // Dimension Presets
  document.querySelectorAll('.btn-preset').forEach(btn => {
    btn.addEventListener('click', () => {
      inputWidth.value = btn.dataset.w;
      inputHeight.value = btn.dataset.h;
      updateDimensionBadges();
      renderer.fitToView();
    });
  });

  // Toolbar & Mode Switching
  function setTool(tool) {
    activeTool = tool;
    toolSelect.classList.toggle('active', tool === 'select');
    toolPlace.classList.toggle('active', tool === 'place');
    toolPan.classList.toggle('active', tool === 'pan');

    viewportContainer.classList.toggle('pan-mode', tool === 'pan');
    setStatus(`Tool: ${tool.toUpperCase()}`);
  }

  toolSelect.addEventListener('click', () => setTool('select'));
  toolPlace.addEventListener('click', () => setTool('place'));
  toolPan.addEventListener('click', () => setTool('pan'));

  // Zoom buttons
  btnZoomIn.addEventListener('click', () => {
    renderer.zoom = Math.min(3.0, renderer.zoom * 1.25);
    lblZoomLevel.textContent = `${Math.round(renderer.zoom * 100)}%`;
    renderer.render();
  });
  btnZoomOut.addEventListener('click', () => {
    renderer.zoom = Math.max(0.2, renderer.zoom / 1.25);
    lblZoomLevel.textContent = `${Math.round(renderer.zoom * 100)}%`;
    renderer.render();
  });
  btnZoomReset.addEventListener('click', () => {
    renderer.fitToView();
    lblZoomLevel.textContent = `${Math.round(renderer.zoom * 100)}%`;
  });

  chkShowGrid.addEventListener('change', () => {
    renderer.showGrid = chkShowGrid.checked;
    renderer.render();
  });
  chkShowLabels.addEventListener('change', () => {
    renderer.showLabels = chkShowLabels.checked;
    renderer.render();
  });
  chkDebugCollision.addEventListener('change', () => {
    renderer.debugCollision = chkDebugCollision.checked;
    renderer.render();
  });

  chkShowBg.addEventListener('change', () => {
    renderer.showBackground = chkShowBg.checked;
    renderer.render();
  });

  inputBgImage.addEventListener('input', () => {
    if (renderer.mapData) {
      renderer.mapData['robos:backgroundImage'] = inputBgImage.value.trim();
      renderer.render();
    }
  });

  inputBgOpacity.addEventListener('input', (e) => {
    const val = Number(e.target.value);
    lblBgOpacity.textContent = `${val}%`;
    renderer.backgroundOpacity = val / 100.0;
    if (renderer.mapData) {
      renderer.mapData['robos:backgroundOpacity'] = val / 100.0;
    }
    renderer.render();
  });

  btnBrowseBg.addEventListener('click', () => {
    const defaultVal = inputBgImage.value || 'assets/maps/candlekeep_bg.jpg';
    const chosen = prompt('Enter background image path (relative to games/crpg-realm/):', defaultVal);
    if (chosen !== null) {
      inputBgImage.value = chosen.trim();
      inputBgImage.dispatchEvent(new Event('input'));
    }
  });

  // View Mode: Canvas vs Compiled PNG
  btnViewCanvas.addEventListener('click', () => {
    isPngViewActive = false;
    btnViewCanvas.classList.add('active');
    btnViewPng.classList.remove('active');
    pngViewContainer.classList.add('hidden');
    renderer.render();
  });

  btnViewPng.addEventListener('click', () => {
    isPngViewActive = true;
    btnViewCanvas.classList.remove('active');
    btnViewPng.classList.add('active');
    pngViewContainer.classList.remove('hidden');
  });

  // Interactive Mouse & Canvas Handling
  canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const world = renderer.screenToWorld(mouseX, mouseY);
    let feetX = chkSnapGrid.checked ? renderer.snapToGrid(world.fx) : Math.round(world.fx * 10) / 10;
    let feetY = chkSnapGrid.checked ? renderer.snapToGrid(world.fy) : Math.round(world.fy * 10) / 10;

    hudFeet.textContent = `Position: ${feetX} ft, ${feetY} ft`;
    hudCell.textContent = `Cell: (${Math.floor(world.fx / 5)}, ${Math.floor(world.fy / 5)})`;
    hudTerrain.textContent = `Terrain: ${selectTerrain.value}`;

    // Handle Viewport Pan
    if (isDragging) {
      renderer.panX += e.clientX - dragStart.x;
      renderer.panY += e.clientY - dragStart.y;
      dragStart = { x: e.clientX, y: e.clientY };
      renderer.render();
      return;
    }

    // Handle Object Move / Dragging
    if (isMovingObject && renderer.selectedObjectId && renderer.mapData) {
      const obj = (renderer.mapData['robos:mapObjects'] || []).find(
        o => (o['robos:objectId'] || o.objectId || o.id) === renderer.selectedObjectId
      );
      if (obj && initialObjectPos) {
        const dx = feetX - dragStart.fx;
        const dy = feetY - dragStart.fy;
        const shape = obj['robos:shape'] || obj.shape || 'rect';

        if (shape === 'rect' || shape === 'circle') {
          obj['robos:position'] = [initialObjectPos.x + dx, initialObjectPos.y + dy];
          inputObjX.value = obj['robos:position'][0];
          inputObjY.value = obj['robos:position'][1];
          inputObjCX.value = obj['robos:position'][0];
          inputObjCY.value = obj['robos:position'][1];
        } else if (shape === 'line') {
          obj['robos:position'] = [initialObjectPos.x + dx, initialObjectPos.y + dy];
          obj['robos:to'] = [initialObjectPos.toX + dx, initialObjectPos.toY + dy];
          inputObjLX1.value = obj['robos:position'][0];
          inputObjLY1.value = obj['robos:position'][1];
          inputObjLX2.value = obj['robos:to'][0];
          inputObjLY2.value = obj['robos:to'][1];
        }
        renderer.render();
      }
    }
  });

  canvas.addEventListener('mousedown', (e) => {
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const world = renderer.screenToWorld(mouseX, mouseY);
    const feetX = chkSnapGrid.checked ? renderer.snapToGrid(world.fx) : world.fx;
    const feetY = chkSnapGrid.checked ? renderer.snapToGrid(world.fy) : world.fy;

    // Pan mode or Space key held
    if (activeTool === 'pan' || e.button === 1 || e.spaceKey) {
      isDragging = true;
      dragStart = { x: e.clientX, y: e.clientY };
      return;
    }

    // Place Mode: Click to Place Object at coordinates
    if (activeTool === 'place') {
      const type = selectObjType.value;
      const shape = document.querySelector('input[name="obj-shape"]:checked').value;
      const count = (renderer.mapData['robos:mapObjects'] || []).length + 1;
      const newId = `${type}_${count}`;

      inputObjId.value = newId;
      if (shape === 'rect') {
        inputObjX.value = feetX;
        inputObjY.value = feetY;
      } else if (shape === 'circle') {
        inputObjCX.value = feetX;
        inputObjCY.value = feetY;
      } else if (shape === 'line') {
        inputObjLX1.value = feetX;
        inputObjLY1.value = feetY;
        inputObjLX2.value = feetX + 20;
        inputObjLY2.value = feetY;
      }

      btnApplyObj.click();
      return;
    }

    // Select Tool: Hit test
    if (activeTool === 'select') {
      const hit = renderer.hitTest(world.fx, world.fy);
      if (hit) {
        const id = hit['robos:objectId'] || hit.objectId || hit.id;
        selectObject(id);
        isMovingObject = true;
        dragStart = { x: e.clientX, y: e.clientY, fx: feetX, fy: feetY };

        const shape = hit['robos:shape'] || hit.shape || 'rect';
        if (shape === 'line') {
          const from = hit['robos:position'] || hit.position || [0, 0];
          const to = hit['robos:to'] || hit.to || [0, 0];
          initialObjectPos = { x: from[0], y: from[1], toX: to[0], toY: to[1] };
        } else {
          const pos = hit['robos:position'] || hit.position || [0, 0];
          initialObjectPos = { x: pos[0], y: pos[1] };
        }
      } else {
        clearObjectForm();
      }
    }
  });

  window.addEventListener('mouseup', () => {
    isDragging = false;
    isMovingObject = false;
  });

  // Wheel Zoom
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.1 : 0.9;
    renderer.zoom = Math.max(0.2, Math.min(3.0, renderer.zoom * factor));
    lblZoomLevel.textContent = `${Math.round(renderer.zoom * 100)}%`;
    renderer.render();
  }, { passive: false });

  // Map Select Change
  mapSelect.addEventListener('change', () => {
    const slug = mapSelect.value;
    if (slug) loadMap(slug);
  });

  // Filter Object Tree
  filterObjectsInput.addEventListener('input', () => {
    renderObjectTree();
  });

  // New Map Action
  btnNewMap.addEventListener('click', () => {
    const slug = prompt('Enter slug for new battle map (e.g. ancient-catacombs):');
    if (!slug) return;
    const safeSlug = slug.toLowerCase().replace(/[^a-z0-9_-]/g, '-');

    const blankMap = {
      '@context': {
        robos: 'https://robos.dev/ns/sdlc#',
        dcterms: 'http://purl.org/dc/terms/',
        schema: 'https://schema.org/',
      },
      '@id': `urn:robos:crpg:battle-map:${safeSlug}`,
      '@type': ['robos:CRPGBattleMap', 'schema:Place'],
      'dcterms:title': safeSlug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
      'robos:width': 120,
      'robos:height': 80,
      'robos:terrain': 'stone',
      'robos:mapObjects': [],
    };

    currentSlug = safeSlug;
    renderer.setMap(blankMap);
    renderer.setSelectedObject(null);

    inputSlug.value = safeSlug;
    inputTitle.value = blankMap['dcterms:title'];
    selectTerrain.value = 'stone';
    inputWidth.value = 120;
    inputHeight.value = 80;

    updateDimensionBadges();
    clearObjectForm();
    renderer.fitToView();

    imgCompiledPng.style.display = 'none';
    pngEmptyState.classList.remove('hidden');

    setStatus(`Created new map blueprint "${safeSlug}". Remember to Save!`);
  });

  // Save KGraph JSON-LD
  btnSaveMap.addEventListener('click', async () => {
    const slug = (inputSlug.value || currentSlug || '').trim();
    if (!slug) {
      alert('Map slug is required');
      return;
    }

    setStatus(`Saving map: ${slug}...`);

    if (renderer.mapData) {
      renderer.mapData['dcterms:title'] = (inputTitle.value || '').trim();
      renderer.mapData['robos:terrain'] = selectTerrain.value;
      renderer.mapData['robos:width'] = Number(inputWidth.value) || 120;
      renderer.mapData['robos:height'] = Number(inputHeight.value) || 80;
      const bg = (inputBgImage.value || '').trim();
      if (bg) {
        renderer.mapData['robos:backgroundImage'] = bg;
        renderer.mapData['robos:backgroundOpacity'] = Number(inputBgOpacity.value) / 100.0;
      } else {
        delete renderer.mapData['robos:backgroundImage'];
        delete renderer.mapData['robos:backgroundOpacity'];
      }
    }

    const payload = {
      slug,
      data: renderer.mapData,
    };

    const res = await window.robosCrpgMaker.saveMap(payload);
    if (res.success) {
      currentSlug = res.slug;
      setStatus(`Map saved successfully to games/crpg-realm/maps/${res.slug}.jsonld`);
      loadMapList(currentSlug);
    } else {
      setStatus(`Failed to save: ${res.error}`, false);
    }
  });

  // Build PNG Image & 5-ft Collision Grid
  btnBuildMap.addEventListener('click', async () => {
    if (!currentSlug) {
      alert('Save map first before building.');
      return;
    }

    // Auto-save first
    await window.robosCrpgMaker.saveMap({
      slug: currentSlug,
      data: renderer.mapData,
    });

    setStatus(`Building blockout PNG and collision grid for ${currentSlug}...`);
    const debug = chkDebugCollision.checked;
    const res = await window.robosCrpgMaker.buildMap({ slug: currentSlug, debugCollision: debug });

    if (res.success) {
      setStatus(`Build complete! Rendered ${currentSlug}.png with ${res.blockoutStats.blocked} blocked cells.`);
      
      // Update image preview
      imgCompiledPng.src = `file://${res.pngPath}?t=${Date.now()}`;
      imgCompiledPng.style.display = 'block';
      pngEmptyState.classList.add('hidden');

      // Reload updated map JSON-LD to get recalculated robos:blockout grid
      const loadRes = await window.robosCrpgMaker.loadMap(currentSlug);
      if (loadRes.success) {
        renderer.setMap(loadRes.data);
        updateStatsPanel(loadRes);
        renderer.render();
      }
    } else {
      setStatus(`Build failed: ${res.error}`, false);
    }
  });

  // Export PNG to Custom Location
  btnExportPng.addEventListener('click', async () => {
    if (!currentSlug) return;
    const defaultName = `${currentSlug}-background.png`;
    const targetPath = prompt('Enter export file destination path:', `/tmp/${defaultName}`);
    if (!targetPath) return;

    const res = await window.robosCrpgMaker.exportPng({ slug: currentSlug, targetPath });
    if (res.success) {
      setStatus(`Exported PNG to: ${res.targetPath}`);
    } else {
      setStatus(`Export failed: ${res.error}`, false);
    }
  });

  // Keyboard Shortcuts
  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;

    if (e.key === 'v' || e.key === 'V') setTool('select');
    if (e.key === 'p' || e.key === 'P') setTool('place');
    if (e.key === 'h' || e.key === 'H') setTool('pan');
    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (renderer.selectedObjectId) deleteObject(renderer.selectedObjectId);
    }
    if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
      e.preventDefault();
      btnSaveMap.click();
    }
    if ((e.ctrlKey || e.metaKey) && (e.key === 'b' || e.key === 'B')) {
      e.preventDefault();
      btnBuildMap.click();
    }
  });

  // Kick off Initial Load
  loadMapList();
});
