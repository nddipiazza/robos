'use strict';

// ── State ────────────────────────────────────────────────────────────────────

let selectedDrive = null;
let releaseInfo = null;
let isoPath = null;

// ── Elements ─────────────────────────────────────────────────────────────────

const steps = [1, 2, 3, 4].map(n => document.getElementById(`step-${n}`));
const driveListEl = document.getElementById('drive-list');
const versionBadge = document.getElementById('version-badge');

const btnRefresh = document.getElementById('btn-refresh-drives');
const btnStep1Next = document.getElementById('btn-step1-next');
const btnStep2Back = document.getElementById('btn-step2-back');
const btnStep2Next = document.getElementById('btn-step2-next');
const btnStep3Back = document.getElementById('btn-step3-back');
const btnFlash = document.getElementById('btn-flash');
const btnDocs = document.getElementById('btn-docs');
const btnDone = document.getElementById('btn-done');

const downloadProgress = document.getElementById('download-progress');
const downloadText = document.getElementById('download-text');
const flashProgress = document.getElementById('flash-progress');
const flashText = document.getElementById('flash-text');
const flashStatus = document.getElementById('flash-status');
const flashDriveName = document.getElementById('flash-drive-name');
const flashIsoName = document.getElementById('flash-iso-name');

// ── Navigation ───────────────────────────────────────────────────────────────

function showStep(n) {
  steps.forEach((s, i) => s.classList.toggle('active', i === n - 1));
}

// ── Step 1: Drive selection ──────────────────────────────────────────────────

async function loadDrives() {
  driveListEl.innerHTML = '<div class="loading">Scanning for USB drives...</div>';
  btnStep1Next.disabled = true;
  selectedDrive = null;

  const drives = await window.robos.listDrives();

  if (drives.length === 0) {
    driveListEl.innerHTML = '<div class="no-drives">No USB drives found. Plug in a USB drive and click Refresh.</div>';
    return;
  }

  driveListEl.innerHTML = drives.map(d => `
    <div class="drive-item" data-device="${esc(d.device)}">
      <span class="drive-icon">💾</span>
      <div class="drive-info">
        <div class="drive-name">${esc(d.name)}</div>
        <div class="drive-meta">${esc(d.device)} &middot; ${esc(d.transport)}</div>
      </div>
      <span class="drive-size">${esc(d.size)}</span>
    </div>
  `).join('');

  driveListEl.querySelectorAll('.drive-item').forEach(el => {
    el.addEventListener('click', () => {
      driveListEl.querySelectorAll('.drive-item').forEach(e => e.classList.remove('selected'));
      el.classList.add('selected');
      selectedDrive = drives.find(d => d.device === el.dataset.device);
      btnStep1Next.disabled = false;
    });
  });
}

function esc(str) {
  const el = document.createElement('span');
  el.textContent = str || '';
  return el.innerHTML;
}

// ── Step 2: Download ─────────────────────────────────────────────────────────

async function startDownload() {
  downloadText.textContent = 'Checking latest release...';
  downloadProgress.style.width = '0%';

  releaseInfo = await window.robos.getLatestRelease();

  if (!releaseInfo.ok) {
    downloadText.textContent = `Error: ${releaseInfo.error}`;
    return;
  }

  versionBadge.textContent = releaseInfo.version;

  if (!releaseInfo.isoUrl) {
    downloadText.textContent = 'No ISO found in the latest release. Build locally with: bash infra/desktop/build-iso.sh';
    return;
  }

  const sizeMB = Math.round(releaseInfo.isoSize / 1e6);
  downloadText.textContent = `Downloading ${releaseInfo.isoName} (${sizeMB} MB)...`;

  window.robos.onDownloadProgress((progress) => {
    downloadProgress.style.width = `${progress.percent}%`;
    const dlMB = Math.round(progress.downloaded / 1e6);
    const totalMB = Math.round(progress.total / 1e6);
    downloadText.textContent = `Downloading... ${dlMB} / ${totalMB} MB (${progress.percent}%)`;
  });

  const result = await window.robos.downloadISO(releaseInfo.isoUrl, releaseInfo.isoName);

  if (result.ok) {
    isoPath = result.path;
    downloadProgress.style.width = '100%';
    downloadText.textContent = result.cached
      ? `Using cached ${releaseInfo.isoName}`
      : `Download complete: ${releaseInfo.isoName}`;
    btnStep2Next.disabled = false;
  } else {
    downloadText.textContent = `Download failed: ${result.error}`;
  }
}

// ── Step 3: Flash ────────────────────────────────────────────────────────────

async function startFlash() {
  flashStatus.classList.remove('hidden');
  flashText.textContent = 'Flashing RobOS to drive...';
  flashProgress.style.width = '5%';
  btnFlash.disabled = true;
  btnStep3Back.disabled = true;

  window.robos.onFlashProgress((progress) => {
    flashProgress.style.width = `${progress.percent}%`;
    const writtenMB = Math.round(progress.written / 1e6);
    const totalMB = Math.round(progress.total / 1e6);
    flashText.textContent = `Writing... ${writtenMB} / ${totalMB} MB (${progress.percent}%)`;
  });

  const result = await window.robos.flash(isoPath, selectedDrive.device);

  if (result.ok) {
    flashProgress.style.width = '100%';
    flashText.textContent = 'Flash complete!';
    // Move to done step
    setTimeout(() => showStep(4), 1000);
  } else {
    flashText.textContent = `Flash failed: ${result.error}`;
    btnFlash.disabled = false;
    btnStep3Back.disabled = false;
  }
}

// ── Event listeners ──────────────────────────────────────────────────────────

btnRefresh.addEventListener('click', loadDrives);

btnStep1Next.addEventListener('click', () => {
  showStep(2);
  startDownload();
});

btnStep2Back.addEventListener('click', () => showStep(1));
btnStep2Next.addEventListener('click', () => {
  flashDriveName.textContent = `${selectedDrive.name} (${selectedDrive.device})`;
  flashIsoName.textContent = releaseInfo.isoName;
  showStep(3);
});

btnStep3Back.addEventListener('click', () => showStep(2));
btnFlash.addEventListener('click', startFlash);

btnDocs.addEventListener('click', () => {
  window.robos.openUrl('https://nddipiazza.github.io/robos/getting-started.html');
});
btnDone.addEventListener('click', () => window.close());

// ── Init ─────────────────────────────────────────────────────────────────────

(async () => {
  await loadDrives();
  // Pre-fetch release info for the version badge
  try {
    const r = await window.robos.getLatestRelease();
    if (r.ok) versionBadge.textContent = r.version;
  } catch {}
})();
