'use strict';

let currentProof = null;
let selectedChapterIdx = 0;

async function openReviewModal(taskId = 'TASK-201') {
  currentProof = await window.robos.getTaskProof(taskId);
  selectedChapterIdx = 0;

  const modalEl = document.getElementById('review-modal');
  if (!modalEl) return;

  renderReviewModal();
  modalEl.classList.remove('hidden');
}

function closeReviewModal() {
  const modalEl = document.getElementById('review-modal');
  if (modalEl) modalEl.classList.add('hidden');
}

function renderReviewModal() {
  const modalBody = document.getElementById('review-modal-body');
  if (!modalBody || !currentProof) return;

  modalBody.innerHTML = `
    <!-- Top Action Bar -->
    <div class="review-header-bar">
      <div class="review-header-info">
        <div class="review-title">
          <span>🎬 Task Verification & Proof-of-Work: <strong>${currentProof.title}</strong></span>
          <span class="status-tag-pass" id="review-status-pill">🟢 VERIFIED & READY TO MERGE</span>
        </div>
        <div class="review-meta-row">
          <span>🌿 Branch: <code>${currentProof.branch}</code></span>
          <span>🎯 Service: <code>${currentProof.targetService}</code></span>
          <span>⏱️ Duration: <strong>${currentProof.durationFormatted}</strong></span>
        </div>
      </div>
      <div class="review-header-actions">
        <button class="btn btn-secondary" id="btn-close-review" onclick="window.closeReviewModal()">✖ Close</button>
        <button class="btn btn-merge" id="btn-signoff-merge" onclick="window.executeSignOffMerge('${currentProof.taskId}')">🚀 1-Click Sign-Off & Merge</button>
      </div>
    </div>

    <!-- Verification Quality Gates -->
    <div class="quality-gates-grid" id="quality-gates-grid">
      ${currentProof.verificationBadges.map(b => `
        <div class="gate-card">
          <div class="gate-header">
            <span class="gate-name">${b.name}</span>
            <span class="gate-status">${b.status}</span>
          </div>
          <div class="gate-details">${b.details}</div>
        </div>
      `).join('')}
    </div>

    <!-- Main Split: Video Player & Interactive Chapter Timeline -->
    <div class="review-split-grid">
      <!-- Left Column: Video Walkthrough Player -->
      <div class="review-card" id="review-video-player-card">
        <div class="card-title">
          <span>📺 1080p Screen Recording & WebVTT Captions</span>
          <span class="type-badge">${currentProof.resolution}</span>
        </div>
        <div class="video-mock-container" id="video-mock-container">
          <div class="video-overlay-header">
            <span>🔴 REC [Display :99 Xvfb]</span>
            <span id="active-video-timecode">${currentProof.chapters[selectedChapterIdx].timecode}</span>
          </div>
          <div class="video-center-graphic">
            <div class="play-icon-large">▶</div>
            <div class="video-caption-hud" id="video-caption-hud">
              ${currentProof.chapters[selectedChapterIdx].title}
            </div>
          </div>
          <div class="video-controls-bar">
            <button class="btn-video-control" id="btn-video-play">▶ Play</button>
            <div class="video-progress-bar">
              <div class="video-progress-fill" style="width: ${(selectedChapterIdx + 1) * 16.6}%;"></div>
            </div>
            <span class="video-time-label">${currentProof.chapters[selectedChapterIdx].timecode} / ${currentProof.durationFormatted}</span>
            <span class="badge-cc">CC</span>
          </div>
        </div>
      </div>

      <!-- Right Column: Interactive Chapter Timeline -->
      <div class="review-card" id="review-chapters-card">
        <div class="card-title">
          <span>📑 Interactive Chapter Bookmarks & Step Evidence</span>
          <span class="type-badge">Click to Seek</span>
        </div>
        <div class="chapters-list" id="chapters-list">
          ${currentProof.chapters.map((ch, idx) => `
            <div class="chapter-row ${idx === selectedChapterIdx ? 'active' : ''}" id="chapter-seek-${ch.id}" onclick="window.seekReviewChapter(${idx})">
              <div class="chapter-left">
                <span class="chapter-num">#${ch.id}</span>
                <span class="chapter-time">${ch.timecode}</span>
              </div>
              <div class="chapter-title">${ch.title}</div>
              <div class="chapter-status">${ch.status}</div>
            </div>
          `).join('')}
        </div>
      </div>
    </div>

    <!-- Contract & Code Diff Inspector -->
    <div class="review-card" id="review-diffs-card">
      <div class="card-title">
        <span>📝 Contract & Microservice Code Changes (${currentProof.diffs.length} files)</span>
        <span class="type-badge">Side-by-Side Review</span>
      </div>
      <div class="diffs-list" id="diffs-list">
        ${currentProof.diffs.map(d => `
          <div class="diff-row">
            <div class="diff-tag ${d.type === 'added' ? 'diff-added' : 'diff-mod'}">${d.type === 'added' ? '+ ADD' : '~ MOD'}</div>
            <div class="diff-file"><code>${d.file}</code></div>
            <div class="diff-summary">${d.summary}</div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

window.seekReviewChapter = function(index) {
  selectedChapterIdx = index;
  renderReviewModal();
};

window.executeSignOffMerge = async function(taskId) {
  const result = await window.robos.signOffAndMerge(taskId);
  const pill = document.getElementById('review-status-pill');
  if (pill) {
    pill.textContent = '✨ MERGED TO MAIN (PROD REALITY)';
    pill.style.color = '#3fb950';
  }

  const btn = document.getElementById('btn-signoff-merge');
  if (btn) {
    btn.disabled = true;
    btn.textContent = '✅ Merged & Cleaned Up';
    btn.style.background = '#238636';
  }

  return result;
};

window.openReviewModal = openReviewModal;
window.closeReviewModal = closeReviewModal;
