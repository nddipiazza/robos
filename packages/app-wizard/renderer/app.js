'use strict';

let currentMode = 'new';
let newStep = 1;
let importStep = 1;
let selectedArchetype = 'robos:Microservice';
let inspectionData = null;
let teamsList = [];

const NEW_STEPS = [
  { num: 1, label: 'Archetype' },
  { num: 2, label: 'Identity & Team' },
  { num: 3, label: 'API Contracts' },
  { num: 4, label: 'Scaffolding' },
];

const IMPORT_STEPS = [
  { num: 1, label: 'Source Select' },
  { num: 2, label: 'Deep Inspection' },
  { num: 3, label: 'Catalog & Ingest' },
];

async function init() {
  setupModeToggle();
  setupArchetypeCards();
  setupNavButtons();
  await loadTeams();
  renderSidebar();
}

function setupModeToggle() {
  const btnNew = document.getElementById('btn-mode-new');
  const btnImport = document.getElementById('btn-mode-import');

  btnNew.addEventListener('click', () => {
    currentMode = 'new';
    btnNew.classList.add('active');
    btnImport.classList.remove('active');
    renderSidebar();
    showStepPanel();
  });

  btnImport.addEventListener('click', () => {
    currentMode = 'import';
    btnImport.classList.add('active');
    btnNew.classList.remove('active');
    renderSidebar();
    showStepPanel();
  });
}

function setupArchetypeCards() {
  const cards = document.querySelectorAll('.archetype-card');
  cards.forEach(card => {
    card.addEventListener('click', () => {
      cards.forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      selectedArchetype = card.dataset.archetype;
    });
  });
}

async function loadTeams() {
  try {
    teamsList = await window.api.listTeams();
    const selects = [document.getElementById('new-app-team'), document.getElementById('import-app-team')];
    selects.forEach(sel => {
      if (!sel) return;
      sel.innerHTML = teamsList.map(t => '<option value="' + t.id + '">' + t.name + ' (' + t.topology + ')</option>').join('');
    });
  } catch (e) {
    console.error('Failed to load teams:', e);
  }
}

function renderSidebar() {
  const sidebar = document.getElementById('sidebar-nav');
  const steps = currentMode === 'new' ? NEW_STEPS : IMPORT_STEPS;
  const currentStep = currentMode === 'new' ? newStep : importStep;

  sidebar.innerHTML = steps.map(s => {
    const isActive = s.num === currentStep ? 'active' : '';
    const isCompleted = s.num < currentStep ? 'completed' : '';
    const circleText = s.num < currentStep ? '✓' : s.num;
    return '<div class="step-indicator ' + isActive + ' ' + isCompleted + '" data-step="' + s.num + '">' +
      '<div class="step-circle">' + circleText + '</div>' +
      '<div>' + s.label + '</div>' +
      '</div>';
  }).join('');
}

function showStepPanel() {
  document.querySelectorAll('.step-panel').forEach(p => p.classList.remove('active'));
  if (currentMode === 'new') {
    const panel = document.getElementById('panel-new-' + newStep);
    if (panel) panel.classList.add('active');
    if (newStep === 4) updateNewSummary();
  } else {
    const panel = document.getElementById('panel-import-' + importStep);
    if (panel) panel.classList.add('active');
    if (importStep === 3) updateImportSummary();
  }
}

function updateNewSummary() {
  const name = document.getElementById('new-app-name').value;
  const slug = document.getElementById('new-app-slug').value;
  const tech = document.getElementById('new-app-tech').value;
  const team = document.getElementById('new-app-team').value;
  const urn = 'urn:robos:' + selectedArchetype.replace('robos:', '').toLowerCase() + ':' + slug;

  const box = document.getElementById('new-summary-box');
  box.innerHTML = [
    '<div class="summary-item"><strong>Application Name:</strong> <span>' + name + '</span></div>',
    '<div class="summary-item"><strong>Archetype:</strong> <span>' + selectedArchetype + '</span></div>',
    '<div class="summary-item"><strong>Package URN:</strong> <span>' + urn + '</span></div>',
    '<div class="summary-item"><strong>Technology:</strong> <span>' + tech + '</span></div>',
    '<div class="summary-item"><strong>Owner:</strong> <span>' + team + '</span></div>'
  ].join('');
}

function updateImportSummary() {
  if (!inspectionData) return;
  const teamSelect = document.getElementById('import-app-team');
  const team = teamSelect ? teamSelect.value : (inspectionData.team || 'platform-team');
  const tech = inspectionData.technology || (inspectionData.language + ' / ' + inspectionData.framework);
  const urn = 'urn:robos:' + inspectionData.archetype.replace('robos:', '').toLowerCase() + ':' + inspectionData.name.toLowerCase();

  const box = document.getElementById('import-synth-box');
  box.innerHTML = [
    '<div class="summary-item"><strong>Imported Package:</strong> <span>' + inspectionData.name + '</span></div>',
    '<div class="summary-item"><strong>Configured Archetype:</strong> <span style="color:var(--accent); font-weight:600;">' + inspectionData.archetype + '</span></div>',
    '<div class="summary-item"><strong>URN:</strong> <span>' + urn + '</span></div>',
    '<div class="summary-item"><strong>Technology Stack:</strong> <span>' + tech + '</span></div>',
    '<div class="summary-item"><strong>Assigned Team:</strong> <span>' + team + '</span></div>'
  ].join('');
}

function populateInspectionView() {
  if (!inspectionData) return;
  const resBox = document.getElementById('import-inspection-results');
  const tech = inspectionData.technology || (inspectionData.language + ' (' + inspectionData.framework + ')');

  if (resBox) {
    resBox.innerHTML = [
      '<div class="summary-item"><strong>Target Directory:</strong> <span>' + inspectionData.sourcePath + '</span></div>',
      '<div class="summary-item"><strong>Detected Archetype:</strong> <span style="color:var(--accent); font-weight:600;">' + inspectionData.archetype + '</span></div>',
      '<div class="summary-item"><strong>Language & Framework:</strong> <span>' + tech + '</span></div>',
      '<div class="summary-item"><strong>Contracts Discovered:</strong> <span>' + ((inspectionData.detectedContracts && inspectionData.detectedContracts.join(', ')) || 'None (will generate OpenAPI)') + '</span></div>',
      '<div class="summary-item"><strong>Docker Support:</strong> <span>' + (inspectionData.hasDocker ? 'Found Dockerfile' : 'Missing (will synthesize)') + '</span></div>',
      '<div class="summary-item"><strong>Dev Setup:</strong> <span>' + (inspectionData.hasDevSetup ? 'Found dev-setup.sh' : 'Will synthesize') + '</span></div>'
    ].join('');
  }

  // Populate interactive fields
  const nameInput = document.getElementById('import-app-name');
  if (nameInput) nameInput.value = inspectionData.name || '';

  const archSelect = document.getElementById('import-app-archetype');
  if (archSelect && inspectionData.archetype) archSelect.value = inspectionData.archetype;

  const techInput = document.getElementById('import-app-tech');
  if (techInput) techInput.value = inspectionData.technology || (inspectionData.language + ' / ' + inspectionData.framework);

  const teamSelect = document.getElementById('import-app-team');
  if (teamSelect && inspectionData.team) teamSelect.value = inspectionData.team;
}

function setupInspectionControls() {
  const nameInput = document.getElementById('import-app-name');
  if (nameInput) {
    nameInput.addEventListener('input', () => {
      if (inspectionData) {
        inspectionData.name = nameInput.value.trim();
        populateInspectionView();
      }
    });
  }

  const archSelect = document.getElementById('import-app-archetype');
  if (archSelect) {
    archSelect.addEventListener('change', () => {
      if (inspectionData) {
        inspectionData.archetype = archSelect.value;
        populateInspectionView();
      }
    });
  }

  const techInput = document.getElementById('import-app-tech');
  if (techInput) {
    techInput.addEventListener('input', () => {
      if (inspectionData) {
        inspectionData.technology = techInput.value.trim();
        populateInspectionView();
      }
    });
  }

  const teamSelect = document.getElementById('import-app-team');
  if (teamSelect) {
    teamSelect.addEventListener('change', () => {
      if (inspectionData) {
        inspectionData.team = teamSelect.value;
      }
    });
  }

  // AI Prompt Refinement
  const refineTextarea = document.getElementById('ai-inspection-refine-prompt');
  const refineBtn = document.getElementById('btn-apply-ai-refinement');
  const refineStatus = document.getElementById('ai-refine-status');

  const checkRefineInput = () => {
    if (!refineTextarea || !refineBtn) return;
    const val = typeof refineTextarea.value !== 'undefined' ? refineTextarea.value : refineTextarea.innerText || '';
    refineBtn.disabled = !val.trim();
  };

  if (refineTextarea) {
    refineTextarea.addEventListener('input', checkRefineInput);
    refineTextarea.addEventListener('change', checkRefineInput);
    customElements.whenDefined('robos-ai-textarea').then(() => {
      refineTextarea.addEventListener('input', checkRefineInput);
      refineTextarea.addEventListener('change', checkRefineInput);
    }).catch(() => {});
  }

  const handleAIRefinement = async () => {
    if (!refineTextarea || !inspectionData) return;
    const rawVal = typeof refineTextarea.value !== 'undefined' ? refineTextarea.value : refineTextarea.innerText || '';
    const prompt = rawVal.trim();
    if (!prompt) return;

    refineBtn.disabled = true;
    refineBtn.textContent = '⏳ Refining…';
    if (refineStatus) refineStatus.textContent = 'AI analyzing refinement instructions…';

    try {
      const res = await window.api.refineInspection({
        inspectionData,
        prompt,
        availableTeams: teamsList
      });

      if (res.error) {
        if (refineStatus) refineStatus.textContent = '❌ ' + res.error;
      } else {
        inspectionData = res.refined;
        populateInspectionView();
        if (refineStatus) {
          refineStatus.textContent = '✓ AI applied changes: ' + res.changes.join(' · ');
        }
      }
    } catch (err) {
      if (refineStatus) refineStatus.textContent = '❌ ' + err.message;
    } finally {
      refineBtn.disabled = false;
      refineBtn.innerHTML = '<span>✦</span> Refine with AI Prompt';
    }
  };

  if (refineBtn) refineBtn.addEventListener('click', handleAIRefinement);
  if (refineTextarea) refineTextarea.addEventListener('submit', handleAIRefinement);
}

function setupNavButtons() {
  // New App Step Navigation
  document.getElementById('btn-next-new-1').addEventListener('click', () => { newStep = 2; renderSidebar(); showStepPanel(); });
  document.getElementById('btn-back-new-2').addEventListener('click', () => { newStep = 1; renderSidebar(); showStepPanel(); });
  document.getElementById('btn-next-new-2').addEventListener('click', () => { newStep = 3; renderSidebar(); showStepPanel(); });
  document.getElementById('btn-back-new-3').addEventListener('click', () => { newStep = 2; renderSidebar(); showStepPanel(); });
  document.getElementById('btn-next-new-3').addEventListener('click', () => { newStep = 4; renderSidebar(); showStepPanel(); });
  document.getElementById('btn-back-new-4').addEventListener('click', () => { newStep = 3; renderSidebar(); showStepPanel(); });

  // Generate New App
  document.getElementById('btn-generate-new').addEventListener('click', async () => {
    const consoleOut = document.getElementById('new-console-output');
    consoleOut.textContent = 'Generating scaffolding files...\n';
    const name = document.getElementById('new-app-name').value;
    const slug = document.getElementById('new-app-slug').value;
    const tech = document.getElementById('new-app-tech').value;
    const team = document.getElementById('new-app-team').value;
    const contractType = document.getElementById('new-contract-type').value;
    const urn = 'urn:robos:' + selectedArchetype.replace('robos:', '').toLowerCase() + ':' + slug;

    const res = await window.api.generateNewApp({
      name, slug, archetype: selectedArchetype, technology: tech, team, contractType, urn
    });

    if (res.error) {
      consoleOut.textContent += '❌ Error: ' + res.error;
    } else {
      consoleOut.textContent += '✓ Created component in: ' + res.targetDir + '\n';
      consoleOut.textContent += '✓ Generated: catalog-info.yaml\n';
      consoleOut.textContent += '✓ Generated: dev-setup.sh (chmod +x)\n';
      consoleOut.textContent += '✓ Generated: Dockerfile\n';
      consoleOut.textContent += '✓ Registered in .robos/packages.yaml (' + res.urn + ')\n';
      consoleOut.textContent += '🎉 Greenfield Application Scaffolding Complete!';
    }
  });

  // Import App Step Navigation
  document.getElementById('btn-scan-import').addEventListener('click', async () => {
    const src = document.getElementById('import-source-path').value.trim();
    const resBox = document.getElementById('import-inspection-results');
    if (!src) {
      if (resBox) resBox.innerHTML = '<div style="color:#f85149; padding:8px;">Please enter a source directory path</div>';
      return;
    }
    const res = await window.api.scanSource({ sourcePath: src });
    if (res.error) {
      if (resBox) resBox.innerHTML = '<div style="color:#f85149; padding:8px;">' + res.error + '</div>';
      return;
    }

    inspectionData = res;
    populateInspectionView();
    importStep = 2;
    renderSidebar();
    showStepPanel();
  });

  document.getElementById('btn-back-import-2').addEventListener('click', () => { importStep = 1; renderSidebar(); showStepPanel(); });
  document.getElementById('btn-next-import-2').addEventListener('click', () => { importStep = 3; renderSidebar(); showStepPanel(); });
  document.getElementById('btn-back-import-3').addEventListener('click', () => { importStep = 2; renderSidebar(); showStepPanel(); });

  // Execute Import
  document.getElementById('btn-execute-import').addEventListener('click', async () => {
    const consoleOut = document.getElementById('import-console-output');
    consoleOut.textContent = 'Ingesting application into RobOS...\n';
    const team = document.getElementById('import-app-team').value;
    const tech = inspectionData.technology || (inspectionData.language + ' / ' + inspectionData.framework);
    const urn = 'urn:robos:' + inspectionData.archetype.replace('robos:', '').toLowerCase() + ':' + inspectionData.name.toLowerCase();

    const res = await window.api.importApp({
      sourcePath: inspectionData.sourcePath,
      name: inspectionData.name,
      slug: inspectionData.name.toLowerCase(),
      archetype: inspectionData.archetype,
      technology: tech,
      team,
      urn,
    });

    if (res.error) {
      consoleOut.textContent += '❌ Error: ' + res.error;
    } else {
      consoleOut.textContent += '✓ Backstage Catalog: ' + res.catalogPath + '\n';
      consoleOut.textContent += '✓ Dev Setup: ' + res.devSetupPath + '\n';
      consoleOut.textContent += '✓ Registered in .robos/packages.yaml (' + res.urn + ')\n';
      consoleOut.textContent += '✓ Added to ~/.config/robos/git-projects.json\n';
      consoleOut.textContent += '🎉 Existing Application Successfully Ingested!';
    }
  });

  setupInspectionControls();
}

document.addEventListener('DOMContentLoaded', init);
