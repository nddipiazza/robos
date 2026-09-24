/**
 * RobOS cRPG Scene Studio — Application Controller
 */

let stageRenderer = null;
let currentScene = {
  title: "Candlekeep Exterior (AR2600)",
  slug: "candlekeep-exterior",
  description: "The exterior courtyards, library grounds, and fortified gates of Candlekeep monastery.",
  map: "candlekeep",
  campaign: "candlekeep-prologue",
  dimensions: { width: 5120, height: 3840, feetWidth: 320, feetHeight: 240 },
  atmosphere: {
    lighting: "Day Sunlight",
    ambientAudio: "candlekeep_day_theme.ogg",
    fogOfWar: false
  },
  entities: []
};

let currentMapData = null;
let currentCampaignData = null;
let selectedEntity = null;

document.addEventListener('DOMContentLoaded', async () => {
  const canvas = document.getElementById('stage-canvas');
  stageRenderer = new SceneStageRenderer(canvas);

  setupEventListeners();
  await loadScenesList();
  await loadMapsList();
  await loadCampaignsList();
});

function setupEventListeners() {
  // Scene Selector
  document.getElementById('scene-select').addEventListener('change', (e) => {
    if (e.target.value) {
      loadSelectedScene(e.target.value);
    }
  });

  // Map Selector
  document.getElementById('map-select').addEventListener('change', async (e) => {
    if (e.target.value) {
      currentScene.map = e.target.value;
      await loadSelectedMap(e.target.value);
    }
  });

  // Campaign Selector
  document.getElementById('campaign-select').addEventListener('change', async (e) => {
    if (e.target.value) {
      currentScene.campaign = e.target.value;
      await loadSelectedCampaign(e.target.value);
    }
  });

  // Action Buttons
  document.getElementById('btn-new-scene').addEventListener('click', createNewScene);
  document.getElementById('btn-save-scene').addEventListener('click', saveActiveScene);

  // Stage Toolbar
  document.getElementById('btn-fit').addEventListener('click', () => {
    stageRenderer.fitToScreen();
    stageRenderer.draw();
  });

  document.getElementById('btn-zoom-in').addEventListener('click', () => {
    stageRenderer.zoom = Math.min(3.5, stageRenderer.zoom * 1.25);
    stageRenderer.draw();
  });

  document.getElementById('btn-zoom-out').addEventListener('click', () => {
    stageRenderer.zoom = Math.max(0.04, stageRenderer.zoom * 0.8);
    stageRenderer.draw();
  });

  document.getElementById('chk-grid').addEventListener('change', (e) => {
    stageRenderer.showGrid = e.target.checked;
    stageRenderer.draw();
  });

  document.getElementById('chk-collisions').addEventListener('change', (e) => {
    stageRenderer.showCollisions = e.target.checked;
    stageRenderer.draw();
  });

  document.getElementById('chk-labels').addEventListener('change', (e) => {
    stageRenderer.showLabels = e.target.checked;
    stageRenderer.draw();
  });

  // Mouse coordinate readout on canvas
  stageRenderer.canvas.addEventListener('mousemove', (e) => {
    const rect = stageRenderer.canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const worldPos = stageRenderer.screenToWorld(mx, my);
    const pxX = Math.round(worldPos.x);
    const pxY = Math.round(worldPos.y);
    const ftX = (pxX / 16).toFixed(1);
    const ftY = (pxY / 16).toFixed(1);
    document.getElementById('canvas-coords').textContent = `X: ${pxX} px, Y: ${pxY} px (${ftX} ft, ${ftY} ft)`;
  });

  // Cancel placement mode
  document.getElementById('btn-cancel-placement').addEventListener('click', () => {
    stageRenderer.placementMode = null;
    document.getElementById('placement-indicator').style.display = 'none';
  });

  // Palette Buttons
  setupPaletteButtons();

  // Stage Callbacks
  stageRenderer.onSelectEntity = (ent) => {
    selectedEntity = ent;
    populateInspector(ent);
  };

  stageRenderer.onEntityMoved = (ent) => {
    if (selectedEntity?.id === ent.id) {
      document.getElementById('ent-x').value = ent.x;
      document.getElementById('ent-y').value = ent.y;
      document.getElementById('ent-x-ft').value = (ent.x / 16).toFixed(1);
      document.getElementById('ent-y-ft').value = (ent.y / 16).toFixed(1);
    }
  };

  stageRenderer.onEntityPlaced = (newEnt) => {
    document.getElementById('placement-indicator').style.display = 'none';
    if (!Array.isArray(currentScene.entities)) {
      currentScene.entities = [];
    }
    currentScene.entities.push(newEnt);
    stageRenderer.selectedEntityId = newEnt.id;
    selectedEntity = newEnt;
    populateInspector(newEnt);
    stageRenderer.draw();
    showStatus(`Placed ${newEnt.name} at (${newEnt.x}, ${newEnt.y})`);
  };

  // Inspector Form Inputs
  setupInspectorInputs();

  // Atmosphere Inputs
  document.getElementById('atmo-lighting').addEventListener('change', (e) => {
    if (!currentScene.atmosphere) currentScene.atmosphere = {};
    currentScene.atmosphere.lighting = e.target.value;
  });
  document.getElementById('atmo-audio').addEventListener('input', (e) => {
    if (!currentScene.atmosphere) currentScene.atmosphere = {};
    currentScene.atmosphere.ambientAudio = e.target.value.trim();
  });
  document.getElementById('atmo-fog').addEventListener('change', (e) => {
    if (!currentScene.atmosphere) currentScene.atmosphere = {};
    currentScene.atmosphere.fogOfWar = e.target.checked;
  });
}

function setupPaletteButtons() {
  document.querySelectorAll('.palette-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const type = btn.getAttribute('data-type');
      const name = btn.getAttribute('data-name');
      const role = btn.getAttribute('data-role');
      const portrait = btn.getAttribute('data-portrait');
      const heroClass = btn.getAttribute('data-class');
      const ai = btn.getAttribute('data-ai');
      const hp = parseInt(btn.getAttribute('data-hp'), 10) || 10;
      const ac = parseInt(btn.getAttribute('data-ac'), 10) || 10;
      const target = btn.getAttribute('data-target');

      const template = {
        id: `${type}-${Date.now()}`,
        type,
        name,
        role: role || "",
        portrait: portrait || "👤",
        heroClass: heroClass || "",
        aiDirective: ai || "aggressive_flank",
        hpMax: hp,
        hpCurrent: hp,
        ac: ac,
        targetScene: target || "",
        targetX: 200,
        targetY: 300,
        facing: 135
      };

      stageRenderer.placementMode = template;
      document.getElementById('placement-entity-name').textContent = name;
      document.getElementById('placement-indicator').style.display = 'flex';
    });
  });
}

function setupInspectorInputs() {
  document.getElementById('ent-name').addEventListener('input', (e) => {
    if (!selectedEntity) return;
    selectedEntity.name = e.target.value;
    stageRenderer.draw();
  });

  document.getElementById('ent-x').addEventListener('input', (e) => {
    if (!selectedEntity) return;
    const px = parseInt(e.target.value, 10) || 0;
    selectedEntity.x = px;
    document.getElementById('ent-x-ft').value = (px / 16).toFixed(1);
    stageRenderer.draw();
  });

  document.getElementById('ent-y').addEventListener('input', (e) => {
    if (!selectedEntity) return;
    const py = parseInt(e.target.value, 10) || 0;
    selectedEntity.y = py;
    document.getElementById('ent-y-ft').value = (py / 16).toFixed(1);
    stageRenderer.draw();
  });

  document.getElementById('ent-x-ft').addEventListener('input', (e) => {
    if (!selectedEntity) return;
    const ft = parseFloat(e.target.value) || 0;
    const px = Math.round(ft * 16);
    selectedEntity.x = px;
    document.getElementById('ent-x').value = px;
    stageRenderer.draw();
  });

  document.getElementById('ent-y-ft').addEventListener('input', (e) => {
    if (!selectedEntity) return;
    const ft = parseFloat(e.target.value) || 0;
    const px = Math.round(ft * 16);
    selectedEntity.y = px;
    document.getElementById('ent-y').value = px;
    stageRenderer.draw();
  });

  document.getElementById('ent-facing').addEventListener('input', (e) => {
    if (!selectedEntity) return;
    const val = parseInt(e.target.value, 10) || 0;
    selectedEntity.facing = val;
    document.getElementById('facing-degree-label').textContent = `${val}°`;
    stageRenderer.draw();
  });

  document.getElementById('ent-role').addEventListener('input', (e) => {
    if (!selectedEntity) return;
    selectedEntity.role = e.target.value;
    stageRenderer.draw();
  });

  document.getElementById('ent-dialogue').addEventListener('input', (e) => {
    if (!selectedEntity) return;
    selectedEntity.dialogueTree = e.target.value;
  });

  document.getElementById('ent-ai-directive').addEventListener('change', (e) => {
    if (!selectedEntity) return;
    selectedEntity.aiDirective = e.target.value;
    stageRenderer.draw();
  });

  document.getElementById('ent-hp').addEventListener('input', (e) => {
    if (!selectedEntity) return;
    selectedEntity.hpMax = parseInt(e.target.value, 10) || 10;
    selectedEntity.hpCurrent = selectedEntity.hpMax;
  });

  document.getElementById('ent-ac').addEventListener('input', (e) => {
    if (!selectedEntity) return;
    selectedEntity.ac = parseInt(e.target.value, 10) || 10;
  });

  document.getElementById('ent-portal-target').addEventListener('input', (e) => {
    if (!selectedEntity) return;
    selectedEntity.targetScene = e.target.value;
    stageRenderer.draw();
  });

  document.getElementById('ent-target-x').addEventListener('input', (e) => {
    if (!selectedEntity) return;
    selectedEntity.targetX = parseInt(e.target.value, 10) || 0;
  });

  document.getElementById('ent-target-y').addEventListener('input', (e) => {
    if (!selectedEntity) return;
    selectedEntity.targetY = parseInt(e.target.value, 10) || 0;
  });

  document.getElementById('ent-lock-dc').addEventListener('input', (e) => {
    if (!selectedEntity) return;
    selectedEntity.lockDc = parseInt(e.target.value, 10) || 0;
  });

  document.getElementById('ent-loot-items').addEventListener('input', (e) => {
    if (!selectedEntity) return;
    selectedEntity.loot = e.target.value.split(',').map(s => s.trim()).filter(Boolean);
  });

  document.getElementById('btn-delete-entity').addEventListener('click', () => {
    if (!selectedEntity) return;
    currentScene.entities = currentScene.entities.filter(ent => ent.id !== selectedEntity.id);
    selectedEntity = null;
    stageRenderer.selectedEntityId = null;
    populateInspector(null);
    stageRenderer.draw();
    showStatus("Deleted entity from scene");
  });
}

function populateInspector(ent) {
  const form = document.getElementById('inspector-form');
  const emptyMsg = document.getElementById('empty-inspector-msg');
  const delBtn = document.getElementById('btn-delete-entity');
  const title = document.getElementById('inspector-entity-title');

  if (!ent) {
    form.style.display = 'none';
    delBtn.style.display = 'none';
    emptyMsg.style.display = 'block';
    title.textContent = 'Entity Inspector';
    return;
  }

  form.style.display = 'block';
  delBtn.style.display = 'inline-flex';
  emptyMsg.style.display = 'none';
  title.textContent = `${ent.name} (${ent.type.toUpperCase()})`;

  document.getElementById('ent-name').value = ent.name || '';
  document.getElementById('ent-type').value = ent.type || '';
  document.getElementById('ent-x').value = ent.x || 0;
  document.getElementById('ent-y').value = ent.y || 0;
  document.getElementById('ent-x-ft').value = ((ent.x || 0) / 16).toFixed(1);
  document.getElementById('ent-y-ft').value = ((ent.y || 0) / 16).toFixed(1);

  const facing = (ent.facing !== undefined) ? ent.facing : 135;
  document.getElementById('ent-facing').value = facing;
  document.getElementById('facing-degree-label').textContent = `${facing}°`;

  // Dynamic panels based on entity type
  const npcFields = document.getElementById('inspector-npc-fields');
  const enemyFields = document.getElementById('inspector-enemy-fields');
  const portalFields = document.getElementById('inspector-portal-fields');
  const containerFields = document.getElementById('inspector-container-fields');

  npcFields.style.display = (ent.type === 'npc' || ent.type === 'hero') ? 'block' : 'none';
  enemyFields.style.display = (ent.type === 'enemy' || ent.type === 'monster') ? 'block' : 'none';
  portalFields.style.display = (ent.type === 'portal') ? 'block' : 'none';
  containerFields.style.display = (ent.type === 'container' || ent.type === 'loot') ? 'block' : 'none';

  if (ent.type === 'npc' || ent.type === 'hero') {
    document.getElementById('ent-role').value = ent.role || ent.heroClass || '';
    document.getElementById('ent-dialogue').value = ent.dialogueTree || '';
  }

  if (ent.type === 'enemy' || ent.type === 'monster') {
    document.getElementById('ent-ai-directive').value = ent.aiDirective || 'aggressive_flank';
    document.getElementById('ent-hp').value = ent.hpMax || 10;
    document.getElementById('ent-ac').value = ent.ac || 10;
  }

  if (ent.type === 'portal') {
    document.getElementById('ent-portal-target').value = ent.targetScene || '';
    document.getElementById('ent-target-x').value = ent.targetX || 200;
    document.getElementById('ent-target-y').value = ent.targetY || 300;
  }

  if (ent.type === 'container' || ent.type === 'loot') {
    document.getElementById('ent-lock-dc').value = ent.lockDc || 0;
    document.getElementById('ent-loot-items').value = Array.isArray(ent.loot) ? ent.loot.join(', ') : (ent.loot || '');
  }
}

async function loadScenesList() {
  try {
    if (!window.robosCrpgSceneStudio) return;
    const res = await window.robosCrpgSceneStudio.listScenes();
    const select = document.getElementById('scene-select');
    select.innerHTML = '';

    if (res.success && res.scenes.length > 0) {
      res.scenes.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s.slug;
        opt.textContent = `${s.title} (${s.entityCount} entities)`;
        select.appendChild(opt);
      });
      // Load candlekeep-exterior if exists or first
      const defaultScene = res.scenes.find(s => s.slug === 'candlekeep-exterior') || res.scenes[0];
      await loadSelectedScene(defaultScene.slug);
    } else {
      // Default initial scene
      const opt = document.createElement('option');
      opt.value = currentScene.slug;
      opt.textContent = currentScene.title;
      select.appendChild(opt);
      await loadSelectedMap(currentScene.map);
      await loadSelectedCampaign(currentScene.campaign);
    }
  } catch (err) {
    console.error('Error loading scenes list:', err);
  }
}

async function loadMapsList() {
  try {
    if (!window.robosCrpgSceneStudio) return;
    const res = await window.robosCrpgSceneStudio.listMaps();
    const select = document.getElementById('map-select');
    select.innerHTML = '';

    if (res.success && res.maps.length > 0) {
      res.maps.forEach(m => {
        const opt = document.createElement('option');
        opt.value = m.slug;
        opt.textContent = `${m.title} (${m.width}x${m.height} ft)`;
        select.appendChild(opt);
      });
      if (currentScene.map) select.value = currentScene.map;
    }
  } catch (err) {
    console.error('Error loading maps list:', err);
  }
}

async function loadCampaignsList() {
  try {
    if (!window.robosCrpgSceneStudio) return;
    const res = await window.robosCrpgSceneStudio.listCampaigns();
    const select = document.getElementById('campaign-select');
    select.innerHTML = '';

    if (res.success && res.campaigns.length > 0) {
      res.campaigns.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.slug;
        opt.textContent = c.title;
        select.appendChild(opt);
      });
      if (currentScene.campaign) select.value = currentScene.campaign;
    }
  } catch (err) {
    console.error('Error loading campaigns list:', err);
  }
}

async function loadSelectedScene(slug) {
  try {
    if (!window.robosCrpgSceneStudio) return;
    const res = await window.robosCrpgSceneStudio.loadScene(slug);
    if (res.success && res.data) {
      const d = res.data;
      currentScene = {
        title: d['dcterms:title'] || d.title || slug,
        slug: slug,
        description: d['dcterms:description'] || d.description || '',
        map: (d['robos:map'] || '').replace('urn:robos:crpg:battle-map:', '') || 'candlekeep',
        campaign: (d['robos:campaign'] || '').replace('urn:robos:crpg:campaign:', '') || 'candlekeep-prologue',
        dimensions: d['robos:dimensions'] || { width: 5120, height: 3840, feetWidth: 320, feetHeight: 240 },
        atmosphere: d['robos:atmosphere'] || { lighting: 'Day Sunlight', ambientAudio: 'candlekeep_day_theme.ogg', fogOfWar: false },
        entities: d['robos:entities'] || []
      };

      document.getElementById('scene-select').value = slug;
      document.getElementById('map-select').value = currentScene.map;
      document.getElementById('campaign-select').value = currentScene.campaign;

      // Update atmosphere UI
      if (currentScene.atmosphere) {
        document.getElementById('atmo-lighting').value = currentScene.atmosphere['robos:lighting'] || currentScene.atmosphere.lighting || 'Day Sunlight';
        document.getElementById('atmo-audio').value = currentScene.atmosphere['robos:ambientAudio'] || currentScene.atmosphere.ambientAudio || '';
        document.getElementById('atmo-fog').checked = Boolean(currentScene.atmosphere['robos:fogOfWar'] ?? currentScene.atmosphere.fogOfWar);
      }

      await loadSelectedMap(currentScene.map);
      await loadSelectedCampaign(currentScene.campaign);
      showStatus(`Loaded scene: ${currentScene.title}`, 'success', res.filePath);
    }
  } catch (err) {
    console.error('Error loading scene:', err);
    showStatus(`Failed to load scene: ${err.message}`, 'error');
  }
}

async function loadSelectedMap(mapSlug) {
  try {
    if (!window.robosCrpgSceneStudio || !mapSlug) return;
    const res = await window.robosCrpgSceneStudio.loadMap(mapSlug);
    if (res.success && res.data) {
      currentMapData = res.data;
      const bgPath = res.pngExists ? res.pngPath : (res.data['robos:backgroundImage'] ? `../../${res.data['robos:backgroundImage']}` : null);

      stageRenderer.setScene(
        {
          ...currentScene,
          'robos:dimensions': currentScene.dimensions,
          'robos:entities': currentScene.entities,
        },
        currentMapData,
        bgPath
      );
    }
  } catch (err) {
    console.error('Error loading map for scene:', err);
  }
}

async function loadSelectedCampaign(campaignSlug) {
  try {
    if (!window.robosCrpgSceneStudio || !campaignSlug) return;
    const res = await window.robosCrpgSceneStudio.loadCampaign(campaignSlug);
    if (res.success && res.data) {
      currentCampaignData = res.data;
      updateHeroPaletteFromCampaign(currentCampaignData);
    }
  } catch (err) {
    console.error('Error loading campaign for scene:', err);
  }
}

function updateHeroPaletteFromCampaign(campaignData) {
  const container = document.getElementById('hero-palette-items');
  if (!container) return;
  const heroes = campaignData['robos:heroes'] || [];
  if (heroes.length === 0) return;

  container.innerHTML = '';
  heroes.forEach(h => {
    const btn = document.createElement('button');
    btn.className = 'palette-btn hero-btn';
    btn.setAttribute('data-type', 'hero');
    btn.setAttribute('data-name', h.name);
    btn.setAttribute('data-class', `${h.race} ${h.class}`);
    btn.setAttribute('data-portrait', h.portrait || '👤');
    btn.setAttribute('data-hp', h.hpMax || 12);
    btn.setAttribute('data-ac', h.ac || 15);
    btn.innerHTML = `
      <span class="btn-icon">${h.portrait || '👤'}</span>
      <span class="btn-label">${h.name} (${h.class})</span>
    `;
    container.appendChild(btn);
  });

  setupPaletteButtons();
}

async function saveActiveScene() {
  try {
    if (!window.robosCrpgSceneStudio) return;

    showStatus("Saving scene...", "info");
    const payload = {
      '@context': {
        'robos': 'urn:robos:',
        'dcterms': 'http://purl.org/dc/terms/',
        'xsd': 'http://www.w3.org/2001/XMLSchema#'
      },
      '@id': `urn:robos:crpg:scene:${currentScene.slug}`,
      '@type': 'robos:CRPGScene',
      'dcterms:title': currentScene.title,
      'dcterms:description': currentScene.description,
      'robos:map': `urn:robos:crpg:battle-map:${currentScene.map}`,
      'robos:campaign': `urn:robos:crpg:campaign:${currentScene.campaign}`,
      'robos:dimensions': currentScene.dimensions,
      'robos:atmosphere': {
        'robos:lighting': document.getElementById('atmo-lighting').value,
        'robos:ambientAudio': document.getElementById('atmo-audio').value,
        'robos:fogOfWar': document.getElementById('atmo-fog').checked
      },
      'robos:entities': currentScene.entities,
    };

    const res = await window.robosCrpgSceneStudio.saveScene({
      slug: currentScene.slug,
      data: payload
    });

    if (res.success) {
      showStatus("Saved scene successfully!", "success", res.filePath);
    } else {
      showStatus(`Save failed: ${res.error}`, "error");
    }
  } catch (err) {
    console.error("Save scene error:", err);
    showStatus(`Save error: ${err.message}`, "error");
  }
}

async function createNewScene() {
  const title = prompt("Enter new scene title:", "New Scene");
  if (!title) return;
  const slug = title.toLowerCase().replace(/[^a-z0-9_-]/g, '-');

  currentScene = {
    title: title.trim(),
    slug: slug,
    description: "",
    map: document.getElementById('map-select').value || "candlekeep",
    campaign: document.getElementById('campaign-select').value || "candlekeep-prologue",
    dimensions: { width: 5120, height: 3840, feetWidth: 320, feetHeight: 240 },
    atmosphere: {
      lighting: "Day Sunlight",
      ambientAudio: "candlekeep_day_theme.ogg",
      fogOfWar: false
    },
    entities: []
  };

  await loadSelectedMap(currentScene.map);
  await loadSelectedCampaign(currentScene.campaign);
  showStatus(`Created new scene: ${title}`);
}

function showStatus(msg, type = "info", filePath = "") {
  const msgEl = document.getElementById('status-message');
  if (msgEl) msgEl.textContent = msg;

  const pathEl = document.getElementById('status-filepath');
  if (pathEl) pathEl.textContent = filePath;
}
