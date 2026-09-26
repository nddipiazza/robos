'use strict';
let activeCourse = null;
let activeApp = null;
let currentModIdx = 0;
let progress = {
  completedLabs: {},
  passedQuizzes: {},
  isCertified: false,
  certificate: null
};
let isEditorMode = false;
let sourceInfo = null;
let editingSlideIdx = null;

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

window.addEventListener('DOMContentLoaded', async () => {
  await initApp();
});

async function initApp() {
  try {
    const courseList = await window.robosELearning.listCourses();
    const selector = document.getElementById('course-selector');
    if (selector && Array.isArray(courseList)) {
      selector.innerHTML = '<option value="">Switch Course…</option>' +
        courseList.map(c => `<option value="${c.id}">${c.title}</option>`).join('');
    }
  } catch (err) {
    console.warn('Could not list courses:', err);
  }

  try {
    const target = await window.robosELearning.getInitialTarget();
    const targetId = (target && (target.courseId || target.appId)) || '';
    await loadCourse(targetId);
  } catch (err) {
    console.error('Error initializing course:', err);
  }

  try {
    if (window.robosELearning && window.robosELearning.getSourceInfo) {
      sourceInfo = await window.robosELearning.getSourceInfo();
    }
  } catch (err) {
    console.warn('Could not fetch source info:', err);
  }

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.slide-menu-container')) {
      document.querySelectorAll('.slide-dropdown-menu').forEach(el => el.classList.add('hidden'));
    }
  });

  setupVoiceAssistant();
}

async function loadCourse(courseOrAppId) {
  try {
    const res = await window.robosELearning.getCourse(courseOrAppId);
    if (!res || !res.course) {
      document.getElementById('module-content').innerHTML = '<div class="loading-state">No eLearning courses found in Knowledge Graph. Generate one from Knowledge Graph Explorer!</div>';
      return;
    }
    activeCourse = res.course;
    activeApp = res.application;
    currentModIdx = 0;
    progress = { completedLabs: {}, passedQuizzes: {}, isCertified: false, certificate: null };

    document.getElementById('course-title').textContent = activeCourse['dcterms:title'] || 'RobOS Masterclass';
    document.getElementById('course-difficulty').textContent = activeCourse['robos:difficulty'] || 'Intermediate';
    document.getElementById('course-duration').textContent = '⏱️ ' + (activeCourse['robos:estimatedDuration'] || '45 mins');
    document.getElementById('course-tech').textContent = (activeApp && (activeApp['robos:technology'] || activeApp['robos:desktopFramework'] || activeApp['robos:frontendFramework'])) || (activeCourse['robos:topic'] || 'KGraph-First');

    renderModuleNav();
    renderModule(0);
    updateProgress();
  } catch (err) {
    console.error('Error loading course:', err);
  }
}

window.onCourseSelected = function(courseId) {
  if (courseId) loadCourse(courseId);
};

function renderModuleNav() {
  const list = document.getElementById('module-nav-list');
  if (!list || !activeCourse) return;
  list.innerHTML = '';
  (activeCourse['robos:modules'] || []).forEach((m, idx) => {
    const li = document.createElement('li');
    li.className = 'module-item ' + (idx === currentModIdx ? 'active' : '') + (isModuleComplete(idx) ? ' completed' : '');
    li.innerHTML = `
      <div class="module-item-title-row">
        <strong>${escapeHtml(m.title || 'Module ' + (idx + 1))}</strong>
      </div>
      <div class="module-item-footer">
        <small class="module-item-duration" style="color:var(--text-muted);">${m.durationMinutes || 15} mins</small>
        <a href="#" class="copy-tab-path-link" onclick="window.copyTabPath(event, ${idx})" title="Copy file system path for AI agents (e.g. Claude Code, Antigravity, Copilot)">
          📋 Copy as Path
        </a>
      </div>
    `;
    li.onclick = (e) => {
      if (e.target.closest('.copy-tab-path-link')) return;
      renderModule(idx);
    };
    list.appendChild(li);
  });
}

function renderModule(idx) {
  currentModIdx = idx;
  renderModuleNav();
  if (!activeCourse) return;
  const m = (activeCourse['robos:modules'] || [])[idx];
  if (!m) return;

  const panel = document.getElementById('module-content');
  if (!panel) return;

  const totalMods = (activeCourse['robos:modules'] || []).length;

  panel.innerHTML = `
    <div class="module-card">
      <div class="module-header">
        <div>
          <h2>${escapeHtml(m.title || 'Slide ' + (idx + 1))}</h2>
          <div style="font-size: 12px; color: var(--text-muted); margin-top: 4px;">
            Slide ${idx + 1} of ${totalMods} &middot; ⏱️ ${m.durationMinutes || 15} minutes
          </div>
        </div>
        <div class="slide-header-actions">
          <button class="btn btn-outline btn-xs btn-copy-tab-path" onclick="window.copySlidePath(${idx})" title="Copy file system path for AI agents">
            📋 Copy as Path
          </button>
          <span class="badge badge-duration">⏱️ ${m.durationMinutes || 15} mins</span>
          <div class="slide-menu-container">
            <button class="btn-slide-menu" onclick="window.toggleSlideMenu(event, ${idx})" title="Slide Actions & Exports">
              ⋮ Slide Menu ▾
            </button>
            <div class="slide-dropdown-menu hidden" id="slide-dropdown-${idx}">
              <div class="slide-menu-label">Slide Actions</div>
              <button class="slide-menu-item" onclick="window.copySlidePath(${idx})">
                📋 <span>Copy Path on File System</span>
              </button>
              <button class="slide-menu-item" onclick="window.copySlideGitUrl(${idx})">
                🔗 <span>Copy Git URL Path</span>
              </button>
              <button class="slide-menu-item" onclick="window.exportSlideAsZip(${idx})">
                📦 <span>Export as HTML Zip</span>
              </button>
              <div class="slide-menu-divider"></div>
              <button class="slide-menu-item" onclick="window.openSlideEditor(${idx})">
                ✏️ <span>Edit Slide Content</span>
              </button>
              <button class="slide-menu-item" onclick="window.copySlideMarkdown(${idx})">
                📄 <span>Copy Slide Markdown</span>
              </button>
              <button class="slide-menu-item" onclick="window.copySlideUri(${idx})">
                🏷️ <span>Copy Slide KGraph URI</span>
              </button>
              <div class="slide-menu-divider"></div>
              <button class="slide-menu-item" onclick="window.addNewSlide(${idx + 1})">
                ➕ <span>Add New Slide Here</span>
              </button>
              ${totalMods > 1 ? `
              <button class="slide-menu-item danger" onclick="window.deleteSlide(${idx})">
                🗑️ <span>Delete Slide</span>
              </button>` : ''}
            </div>
          </div>
        </div>
      </div>
      <div class="module-overview">${m.overview || ''}</div>

      <div class="section-title">🧪 Hands-On Lab Exercises</div>
      <div class="lab-steps">
        ${(m.labSteps || []).map((step, sIdx) => `
          <div class="lab-step">
            <input type="checkbox" class="lab-checkbox" id="lab-${idx}-${sIdx}" ${progress.completedLabs[`${idx}-${sIdx}`] ? 'checked' : ''} onchange="toggleLab(${idx}, ${sIdx})">
            <label for="lab-${idx}-${sIdx}" class="lab-step-text"><strong>Step ${sIdx + 1}:</strong> ${step}</label>
          </div>
        `).join('')}
      </div>

      ${m.quiz && m.quiz.length ? `
        <div class="section-title">📝 Module Knowledge Check</div>
        <div class="quiz-section">
          ${m.quiz.map((q, qIdx) => `
            <div class="quiz-q">Question: ${q.question}</div>
            <div class="quiz-options">
              ${(q.options || [q.answer, 'Alternative incorrect choice A', 'Alternative incorrect choice B']).map((opt) => `
                <label class="quiz-opt">
                  <input type="radio" name="quiz-${idx}-${qIdx}" value="${opt.replace(/"/g, '&quot;')}" onchange="checkQuiz(${idx}, ${qIdx}, this.value, '${q.answer.replace(/"/g, '&quot;')}')">
                  <span>${opt}</span>
                </label>
              `).join('')}
            </div>
            <div class="quiz-feedback" id="feedback-${idx}-${qIdx}"></div>
          `).join('')}
        </div>
      ` : ''}
    </div>
  `;
}

window.toggleLab = function(mIdx, sIdx) {
  const key = `${mIdx}-${sIdx}`;
  progress.completedLabs[key] = !progress.completedLabs[key];
  updateProgress();
};

window.checkQuiz = function(mIdx, qIdx, selected, correct) {
  const fb = document.getElementById(`feedback-${mIdx}-${qIdx}`);
  const isCorrect = selected === correct;
  if (isCorrect) {
    progress.passedQuizzes[`${mIdx}-${qIdx}`] = true;
    if (fb) {
      fb.className = 'quiz-feedback pass';
      fb.textContent = '✅ Correct! ' + (activeCourse['robos:modules'][mIdx].quiz[qIdx].explanation || '');
    }
  } else {
    progress.passedQuizzes[`${mIdx}-${qIdx}`] = false;
    if (fb) {
      fb.className = 'quiz-feedback fail';
      fb.textContent = '❌ Incorrect. Review the lab instructions and try again.';
    }
  }
  updateProgress();
};

function isModuleComplete(idx) {
  if (!activeCourse) return false;
  const m = (activeCourse['robos:modules'] || [])[idx];
  if (!m) return false;
  const labsDone = (m.labSteps || []).every((_, sIdx) => progress.completedLabs[`${idx}-${sIdx}`]);
  const quizDone = (m.quiz || []).every((_, qIdx) => progress.passedQuizzes[`${idx}-${qIdx}`]);
  return labsDone && (m.quiz && m.quiz.length ? quizDone : true);
}

async function updateProgress() {
  if (!activeCourse) return;
  const totalMods = (activeCourse['robos:modules'] || []).length;
  let completed = 0;
  for (let i = 0; i < totalMods; i++) {
    if (isModuleComplete(i)) completed++;
  }
  const pct = Math.round((completed / (totalMods || 1)) * 100);
  const pctEl = document.getElementById('progress-percent');
  if (pctEl) pctEl.textContent = pct + '%';
  const barEl = document.getElementById('progress-bar-fill');
  if (barEl) barEl.style.width = pct + '%';
  renderModuleNav();

  if (pct === 100 && !progress.isCertified) {
    progress.isCertified = true;
    const btn = document.getElementById('btn-view-certificate');
    if (btn) btn.style.display = 'block';
    const txt = document.getElementById('cert-status-text');
    if (txt) txt.textContent = '🎉 Perfect score! You have completed all lab steps and quizzes. Click below to view your verified certificate.';

    try {
      const res = await window.robosELearning.issueCertificate({
        courseId: activeCourse['@id'],
        appId: activeApp ? activeApp['@id'] : null,
        userId: 'robos',
        scorePercentage: 100,
      });
      if (res && res.certificate) {
        progress.certificate = res.certificate;
      }
    } catch (err) {
      console.warn('Could not issue certificate via IPC:', err.message);
    }
  }
}

window.showCertificateModal = function() {
  if (progress.certificate) {
    document.getElementById('cert-course-name').textContent = progress.certificate['dcterms:title'].replace('Certificate of Completion: ', '');
    document.getElementById('cert-recipient-name').textContent = progress.certificate['robos:recipientUser'] || 'robos';
    document.getElementById('cert-score').textContent = (progress.certificate['robos:scorePercentage'] || 100) + '%';
    document.getElementById('cert-date').textContent = new Date(progress.certificate['robos:issueDate'] || Date.now()).toLocaleDateString();
    document.getElementById('cert-target-app').textContent = activeApp ? (activeApp['dcterms:title'] || activeApp['@id']) : 'RobOS Platform';
    document.getElementById('cert-hash').textContent = progress.certificate['robos:verificationHash'] || 'ROBOS-CERT-VERIFIED';
  } else if (activeCourse) {
    document.getElementById('cert-course-name').textContent = activeCourse['dcterms:title'];
  }
  const m = document.getElementById('cert-modal');
  if (m) m.style.display = 'flex';
};

window.closeCertificateModal = function() {
  const m = document.getElementById('cert-modal');
  if (m) m.style.display = 'none';
};

// ── Voice Assistant & Real-Time Co-Authoring ─────────────────────────────────

let isVoiceActive = false;

function setupVoiceAssistant() {
  const btnToggleVoice = document.getElementById('btn-toggle-voice');

  if (btnToggleVoice) {
    btnToggleVoice.addEventListener('click', toggleVoiceRecording);
  }

  if (window.robosELearning && window.robosELearning.onVoiceStreamEvent) {
    window.robosELearning.onVoiceStreamEvent((data) => {
      const ticker = document.getElementById('voice-activity-ticker');
      const tickerStatus = document.getElementById('ticker-status');
      const tickerSpeech = document.getElementById('ticker-speech');

      if (data.type === 'stream_closed') {
        if (isVoiceActive) {
          setVoiceUIState(false);
        }
      } else if (data.text) {
        if (tickerSpeech) {
          tickerSpeech.textContent = `"${data.text}"`;
        }
        if (tickerStatus) {
          tickerStatus.textContent = data.isFinal ? 'Captured clause:' : 'Listening:';
        }
      }
    });
  }

  if (window.robosELearning && window.robosELearning.onVoiceMutation) {
    window.robosELearning.onVoiceMutation((mutation) => {
      applyCourseMutation(mutation);
    });
  }
}

function setVoiceUIState(active) {
  isVoiceActive = active;
  const btn = document.getElementById('btn-toggle-voice');
  const label = document.getElementById('btn-voice-label');
  const select = document.getElementById('select-voice-agent');
  const ticker = document.getElementById('voice-activity-ticker');

  if (active) {
    if (btn) btn.className = 'btn-voice-toggle active';
    if (label) label.textContent = '🔴 Voice Suggestions: ON';
    if (select) select.disabled = false;
    if (ticker) ticker.classList.remove('hidden');
  } else {
    if (btn) btn.className = 'btn-voice-toggle idle';
    if (label) label.textContent = '🎤 Voice Suggestions: OFF';
    if (select) select.disabled = true;
    if (ticker) ticker.classList.add('hidden');
  }
}

async function toggleVoiceRecording() {
  if (!window.robosELearning) return;
  const select = document.getElementById('select-voice-agent');
  const agentId = select ? select.value : 'fast-reactive';

  if (!isVoiceActive) {
    setVoiceUIState(true);
    showVoiceFeedback(`🎤 Voice Assistant active (${agentId})! Speak suggestions to modify the curriculum live.`);
    try {
      await window.robosELearning.startVoiceAssistant({ agentId });
    } catch (err) {
      console.warn('Voice assistant start error:', err.message);
    }
  } else {
    setVoiceUIState(false);
    showVoiceFeedback('Voice suggestions deactivated.', 3000);
    try {
      await window.robosELearning.stopVoiceAssistant();
    } catch (err) {
      console.warn('Voice assistant stop error:', err.message);
    }
  }
}

function showVoiceFeedback(msg, durationMs = 5000) {
  const banner = document.getElementById('voice-feedback-banner');
  if (!banner) return;
  banner.textContent = msg;
  banner.classList.remove('hidden');
  clearTimeout(banner._timer);
  banner._timer = setTimeout(() => {
    banner.classList.add('hidden');
  }, durationMs);
}

function applyCourseMutation(mutation) {
  if (!activeCourse) return;
  if (!activeCourse['robos:modules'] || !activeCourse['robos:modules'].length) {
    activeCourse['robos:modules'] = [{
      title: 'Introduction Module',
      durationMinutes: 15,
      overview: 'Module overview',
      labSteps: [],
      quiz: [],
    }];
  }

  const m = activeCourse['robos:modules'][currentModIdx] || activeCourse['robos:modules'][0];

  switch (mutation.type) {
    case 'ADD_LAB_STEP': {
      if (!m.labSteps) m.labSteps = [];
      m.labSteps.push(mutation.stepText);
      showVoiceFeedback(`⚡ Added Step: "${mutation.stepText}"`);
      break;
    }
    case 'REMOVE_LAB_STEP': {
      if (m.labSteps && m.labSteps.length > mutation.stepIndex && mutation.stepIndex >= 0) {
        const removed = m.labSteps.splice(mutation.stepIndex, 1);
        showVoiceFeedback(`⚡ Removed Step ${mutation.stepIndex + 1}: "${removed[0]}"`);
      }
      break;
    }
    case 'UPDATE_MODULE_TITLE': {
      m.title = mutation.title;
      showVoiceFeedback(`⚡ Updated Module Title: "${mutation.title}"`);
      break;
    }
    case 'UPDATE_OVERVIEW': {
      m.overview = mutation.overview;
      showVoiceFeedback(`⚡ Updated Module Overview`);
      break;
    }
    case 'ADD_QUIZ_QUESTION': {
      if (!m.quiz) m.quiz = [];
      m.quiz.push(mutation.quiz);
      showVoiceFeedback(`⚡ Added Quiz Question: "${mutation.quiz.question}"`);
      break;
    }
    case 'UPDATE_DIFFICULTY': {
      activeCourse['robos:difficulty'] = mutation.difficulty;
      const diffEl = document.getElementById('course-difficulty');
      if (diffEl) diffEl.textContent = mutation.difficulty;
      showVoiceFeedback(`⚡ Updated Difficulty to: ${mutation.difficulty}`);
      break;
    }
    default:
      if (mutation.stepText) {
        if (!m.labSteps) m.labSteps = [];
        m.labSteps.push(mutation.stepText);
        showVoiceFeedback(`⚡ Applied Suggestion: "${mutation.stepText}"`);
      }
  }

  // Immediately re-render active module to show updates live
  renderModule(currentModIdx);
  renderModuleNav();
  updateProgress();
}

window.exportCourseWebsite = async function() {
  if (!activeCourse) {
    alert('No active course selected to export.');
    return;
  }
  const btn = document.getElementById('btn-export-web');
  const originalText = btn ? btn.textContent : '';
  if (btn) btn.textContent = '⏳ Exporting…';

  try {
    const res = await window.robosELearning.exportWebsite({
      courseId: activeCourse['@id'],
      appId: activeApp ? activeApp['@id'] : null,
    });
    if (res && res.ok) {
      alert(`✅ Successfully exported standalone interactive website!\n\nPath: ${res.filePath}\nPermalink: ${res.permalink}`);
    } else {
      alert(`❌ Export failed: ${(res && res.error) || 'Unknown error'}`);
    }
  } catch (err) {
    alert(`❌ Export error: ${err.message}`);
  } finally {
    if (btn) btn.textContent = originalText;
  }
};

// ── Slide Menu, Offline HTML Zip Export & Editor Actions ───────────────────

async function copyToClipboardText(text) {
  try {
    if (window.robosELearning && window.robosELearning.copyToClipboard) {
      await window.robosELearning.copyToClipboard(text);
      return true;
    }
  } catch {}
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {}
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  document.execCommand('copy');
  document.body.removeChild(ta);
  return true;
}

window.showToast = function(msg, type = 'info') {
  const el = document.getElementById('toast-notice');
  if (!el) return;
  el.textContent = msg;
  el.className = 'toast-notice ' + type;
  el.classList.remove('hidden');
  clearTimeout(el._timer);
  el._timer = setTimeout(() => {
    el.classList.add('hidden');
  }, 4500);
};

window.toggleSlideMenu = function(event, idx) {
  if (event) {
    event.stopPropagation();
    event.preventDefault();
  }
  const target = document.getElementById('slide-dropdown-' + idx);
  const wasHidden = target ? target.classList.contains('hidden') : true;

  document.querySelectorAll('.slide-dropdown-menu').forEach(el => el.classList.add('hidden'));

  if (target && wasHidden) {
    target.classList.remove('hidden');
  }
};

window.getSlidePath = function(idx) {
  if (!activeCourse) return '';
  const m = (activeCourse['robos:modules'] || [])[idx];
  const repoRoot = (sourceInfo && sourceInfo.repoRoot) || '/home/ndipiazza/source/robos';
  let gitopsPath = (sourceInfo && sourceInfo.gitopsPath) || `${repoRoot}/.robos/elearning.yaml`;
  if (activeCourse && (activeCourse['robos:gitopsFile'] || activeCourse.gitopsFile)) {
    const customFile = activeCourse['robos:gitopsFile'] || activeCourse.gitopsFile;
    if (customFile.startsWith('/')) {
      gitopsPath = customFile;
    } else {
      gitopsPath = `${repoRoot}/${customFile.replace(/^\.?\//, '')}`;
    }
  }
  const slideId = (m && (m.id || m['@id'] || m.slideId)) || ('slide-' + (idx + 1));
  return `${gitopsPath}#${slideId}`;
};

window.copyTabPath = async function(event, idx) {
  if (event) {
    event.stopPropagation();
    event.preventDefault();
  }
  return await window.copySlidePath(idx);
};

window.copySlidePath = async function(idx) {
  document.querySelectorAll('.slide-dropdown-menu').forEach(el => el.classList.add('hidden'));
  if (!activeCourse) return '';
  const fullPath = window.getSlidePath(idx);
  await copyToClipboardText(fullPath);
  window.showToast(`📋 Copied file system path: ${fullPath}`, 'success');
  return fullPath;
};

window.copyCoursePath = async function() {
  if (!activeCourse) return '';
  const repoRoot = (sourceInfo && sourceInfo.repoRoot) || '/home/ndipiazza/source/robos';
  let gitopsPath = (sourceInfo && sourceInfo.gitopsPath) || `${repoRoot}/.robos/elearning.yaml`;
  if (activeCourse && (activeCourse['robos:gitopsFile'] || activeCourse.gitopsFile)) {
    const customFile = activeCourse['robos:gitopsFile'] || activeCourse.gitopsFile;
    if (customFile.startsWith('/')) {
      gitopsPath = customFile;
    } else {
      gitopsPath = `${repoRoot}/${customFile.replace(/^\.?\//, '')}`;
    }
  }
  const courseId = activeCourse.id || (activeCourse['@id'] || '').replace('urn:robos:elearning:', '').replace('urn:robos:course:', '') || 'course';
  const fullPath = `${gitopsPath}#${courseId}`;
  await copyToClipboardText(fullPath);
  window.showToast(`📋 Copied course file system path: ${fullPath}`, 'success');
  return fullPath;
};

window.copySlideGitUrl = async function(idx) {
  document.querySelectorAll('.slide-dropdown-menu').forEach(el => el.classList.add('hidden'));
  if (!activeCourse) return;
  const m = (activeCourse['robos:modules'] || [])[idx];
  const baseUrl = (sourceInfo && sourceInfo.gitRemoteUrl) || 'https://github.com/nddipiazza/robos';
  const branch = (sourceInfo && sourceInfo.gitBranch) || 'main';
  const relPath = (sourceInfo && sourceInfo.gitopsRelative) || '.robos/elearning.yaml';
  const slideId = (m && m.id) || ('slide-' + (idx + 1));
  const gitUrl = `${baseUrl}/blob/${branch}/${relPath}#${slideId}`;
  await copyToClipboardText(gitUrl);
  window.showToast(`🔗 Copied Git URL path: ${gitUrl}`, 'success');
};

window.exportSlideAsZip = async function(idx) {
  document.querySelectorAll('.slide-dropdown-menu').forEach(el => el.classList.add('hidden'));
  if (!activeCourse) return;
  const m = (activeCourse['robos:modules'] || [])[idx];
  if (!m) return;

  window.showToast('⏳ Packaging slide as offline HTML zip…', 'info');

  try {
    const res = await window.robosELearning.exportSlideZip({
      slide: m,
      course: activeCourse,
      application: activeApp,
      slideIndex: idx,
      totalSlides: (activeCourse['robos:modules'] || []).length,
    });

    if (res && res.ok) {
      window.showToast(`📦 Exported slide as HTML Zip: ${res.filePath || res.filename}`, 'success');

      // Trigger standard browser download for user convenience
      if (res.base64Zip) {
        const a = document.createElement('a');
        a.href = 'data:application/zip;base64,' + res.base64Zip;
        a.download = res.filename || 'slide.zip';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
    } else {
      window.showToast(`❌ Export failed: ${(res && res.error) || 'Unknown error'}`, 'fail');
    }
  } catch (err) {
    window.showToast(`❌ Export error: ${err.message}`, 'fail');
  }
};

window.copySlideMarkdown = async function(idx) {
  document.querySelectorAll('.slide-dropdown-menu').forEach(el => el.classList.add('hidden'));
  if (!activeCourse) return;
  const m = (activeCourse['robos:modules'] || [])[idx];
  if (!m) return;

  const lines = [
    `# ${m.title || 'Slide ' + (idx + 1)}`,
    `**Course**: ${activeCourse['dcterms:title'] || 'RobOS Masterclass'}`,
    `**Duration**: ${m.durationMinutes || 15} mins`,
    '',
    '## Overview',
    m.overview || '',
    '',
  ];

  if (m.labSteps && m.labSteps.length) {
    lines.push('## Hands-On Lab Exercises');
    m.labSteps.forEach((s, sIdx) => {
      lines.push(`${sIdx + 1}. ${s}`);
    });
    lines.push('');
  }

  if (m.quiz && m.quiz.length) {
    lines.push('## Knowledge Check Quizzes');
    m.quiz.forEach((q, qIdx) => {
      lines.push(`### Question ${qIdx + 1}: ${q.question}`);
      if (q.options) {
        q.options.forEach(opt => lines.push(`- [ ] ${opt}`));
      }
      lines.push(`**Correct Answer**: ${q.answer}`);
      if (q.explanation) lines.push(`*Explanation*: ${q.explanation}`);
      lines.push('');
    });
  }

  const md = lines.join('\n');
  await copyToClipboardText(md);
  window.showToast(`📄 Copied Slide Markdown to clipboard!`, 'success');
};

window.copySlideUri = async function(idx) {
  document.querySelectorAll('.slide-dropdown-menu').forEach(el => el.classList.add('hidden'));
  if (!activeCourse) return;
  const m = (activeCourse['robos:modules'] || [])[idx];
  const uri = `${activeCourse['@id'] || 'urn:robos:elearning'}#${(m && m.id) || ('slide-' + (idx + 1))}`;
  await copyToClipboardText(uri);
  window.showToast(`🏷️ Copied Slide KGraph URI: ${uri}`, 'success');
};

window.toggleEditorMode = function() {
  isEditorMode = !isEditorMode;
  const btn = document.getElementById('btn-toggle-editor');
  if (btn) btn.classList.toggle('active', isEditorMode);

  const saveBtn = document.getElementById('btn-save-course');
  if (saveBtn) saveBtn.style.display = isEditorMode ? 'inline-block' : 'none';

  const banner = document.getElementById('editor-banner');
  if (banner) banner.classList.toggle('hidden', !isEditorMode);

  const badge = document.getElementById('editor-indicator-badge');
  if (badge) badge.classList.toggle('hidden', !isEditorMode);

  const addSlideBtn = document.getElementById('btn-add-slide-sidebar');
  if (addSlideBtn) addSlideBtn.style.display = isEditorMode ? 'block' : 'none';

  window.showToast(`✏️ Editor Mode ${isEditorMode ? 'ON' : 'OFF'}`, 'info');
  renderModuleNav();
};

window.openSlideEditor = function(idx) {
  document.querySelectorAll('.slide-dropdown-menu').forEach(el => el.classList.add('hidden'));
  if (!activeCourse) return;
  editingSlideIdx = idx;
  const m = (activeCourse['robos:modules'] || [])[idx];
  if (!m) return;

  document.getElementById('slide-editor-title').textContent = `✏️ Edit Slide ${idx + 1}: ${m.title || ''}`;
  document.getElementById('edit-slide-title').value = m.title || '';
  document.getElementById('edit-slide-id').value = m.id || ('mod-' + (idx + 1));
  document.getElementById('edit-slide-duration').value = m.durationMinutes || 15;
  document.getElementById('edit-slide-overview').value = m.overview || '';

  renderEditorLabSteps(m.labSteps || []);
  renderEditorQuizzes(m.quiz || []);

  const modal = document.getElementById('slide-editor-modal');
  if (modal) modal.style.display = 'flex';
};

window.closeSlideEditor = function() {
  const modal = document.getElementById('slide-editor-modal');
  if (modal) modal.style.display = 'none';
  editingSlideIdx = null;
};

function renderEditorLabSteps(steps) {
  const container = document.getElementById('editor-lab-steps-container');
  if (!container) return;
  container.innerHTML = '';
  steps.forEach((step) => {
    const row = document.createElement('div');
    row.className = 'step-row-edit';
    row.innerHTML = `
      <input type="text" class="form-input editor-lab-step-input" value="${escapeHtml(step)}" placeholder="Lab step instruction...">
      <button type="button" class="btn btn-outline btn-xs" onclick="this.parentElement.remove()" style="color:var(--danger);">&times;</button>
    `;
    container.appendChild(row);
  });
}

window.addEditorLabStep = function() {
  const container = document.getElementById('editor-lab-steps-container');
  if (!container) return;
  const row = document.createElement('div');
  row.className = 'step-row-edit';
  row.innerHTML = `
    <input type="text" class="form-input editor-lab-step-input" value="" placeholder="Lab step instruction...">
    <button type="button" class="btn btn-outline btn-xs" onclick="this.parentElement.remove()" style="color:var(--danger);">&times;</button>
  `;
  container.appendChild(row);
  const input = row.querySelector('input');
  if (input) input.focus();
};

function renderEditorQuizzes(quizzes) {
  const container = document.getElementById('editor-quizzes-container');
  if (!container) return;
  container.innerHTML = '';
  quizzes.forEach((q, qIdx) => {
    const block = document.createElement('div');
    block.className = 'quiz-edit-block';
    block.innerHTML = `
      <div style="display:flex; justify-content:space-between; margin-bottom:6px;">
        <strong style="font-size:12px; color:var(--text-bright);">Question ${qIdx + 1}</strong>
        <button type="button" class="btn btn-outline btn-xs" onclick="this.closest('.quiz-edit-block').remove()" style="color:var(--danger);">&times; Remove</button>
      </div>
      <input type="text" class="form-input edit-quiz-q" value="${escapeHtml(q.question)}" placeholder="Question text..." style="margin-bottom:6px;">
      <div class="form-row" style="margin-bottom:6px;">
        <div class="flex-1">
          <label style="font-size:11px; margin-bottom:2px;">Correct Answer</label>
          <input type="text" class="form-input edit-quiz-ans" value="${escapeHtml(q.answer)}" placeholder="Correct answer text">
        </div>
      </div>
      <div style="margin-bottom:6px;">
        <label style="font-size:11px; margin-bottom:2px;">Options (comma-separated or include correct answer)</label>
        <input type="text" class="form-input edit-quiz-opts" value="${escapeHtml((q.options || []).join(', '))}" placeholder="Option A, Option B, Option C">
      </div>
      <div>
        <label style="font-size:11px; margin-bottom:2px;">Pedagogical Explanation</label>
        <input type="text" class="form-input edit-quiz-exp" value="${escapeHtml(q.explanation || '')}" placeholder="Explanation provided on answer">
      </div>
    `;
    container.appendChild(block);
  });
}

window.addEditorQuizQuestion = function() {
  const container = document.getElementById('editor-quizzes-container');
  if (!container) return;
  const count = container.children.length;
  const block = document.createElement('div');
  block.className = 'quiz-edit-block';
  block.innerHTML = `
    <div style="display:flex; justify-content:space-between; margin-bottom:6px;">
      <strong style="font-size:12px; color:var(--text-bright);">Question ${count + 1}</strong>
      <button type="button" class="btn btn-outline btn-xs" onclick="this.closest('.quiz-edit-block').remove()" style="color:var(--danger);">&times; Remove</button>
    </div>
    <input type="text" class="form-input edit-quiz-q" value="" placeholder="Question text..." style="margin-bottom:6px;">
    <div class="form-row" style="margin-bottom:6px;">
      <div class="flex-1">
        <label style="font-size:11px; margin-bottom:2px;">Correct Answer</label>
        <input type="text" class="form-input edit-quiz-ans" value="True" placeholder="Correct answer text">
      </div>
    </div>
    <div style="margin-bottom:6px;">
      <label style="font-size:11px; margin-bottom:2px;">Options (comma-separated)</label>
      <input type="text" class="form-input edit-quiz-opts" value="True, False" placeholder="Option A, Option B">
    </div>
    <div>
      <label style="font-size:11px; margin-bottom:2px;">Pedagogical Explanation</label>
      <input type="text" class="form-input edit-quiz-exp" value="" placeholder="Explanation provided on answer">
    </div>
  `;
  container.appendChild(block);
};

window.saveSlideEditor = function() {
  if (editingSlideIdx === null || !activeCourse) return;
  const m = (activeCourse['robos:modules'] || [])[editingSlideIdx];
  if (!m) return;

  m.title = document.getElementById('edit-slide-title').value.trim() || m.title;
  m.id = document.getElementById('edit-slide-id').value.trim() || m.id;
  m.durationMinutes = parseInt(document.getElementById('edit-slide-duration').value, 10) || 15;
  m.overview = document.getElementById('edit-slide-overview').value;

  // Gather lab steps
  const stepInputs = document.querySelectorAll('.editor-lab-step-input');
  m.labSteps = Array.from(stepInputs).map(i => i.value.trim()).filter(Boolean);

  // Gather quizzes
  const quizBlocks = document.querySelectorAll('.quiz-edit-block');
  m.quiz = Array.from(quizBlocks).map(b => {
    const q = b.querySelector('.edit-quiz-q').value.trim();
    const ans = b.querySelector('.edit-quiz-ans').value.trim();
    const optsStr = b.querySelector('.edit-quiz-opts').value.trim();
    const exp = b.querySelector('.edit-quiz-exp').value.trim();
    const options = optsStr ? optsStr.split(',').map(s => s.trim()).filter(Boolean) : [ans, 'Alternative choice'];
    if (!options.includes(ans)) options.unshift(ans);
    return { question: q, answer: ans, options, explanation: exp };
  }).filter(q => q.question);

  window.closeSlideEditor();
  renderModule(editingSlideIdx);
  renderModuleNav();
  window.showToast(`✏️ Updated Slide: "${m.title}". Click "Save Course" to persist.`, 'success');
};

window.addNewSlide = function(targetIdx) {
  if (!activeCourse) return;
  if (!Array.isArray(activeCourse['robos:modules'])) activeCourse['robos:modules'] = [];
  const count = activeCourse['robos:modules'].length;
  const insertIdx = (typeof targetIdx === 'number' && targetIdx >= 0) ? targetIdx : count;

  const newSlide = {
    id: `mod-${Date.now().toString(36).slice(-4)}-slide`,
    title: `Module ${count + 1}: New Topic`,
    durationMinutes: 15,
    overview: 'Overview of topics, architecture, and exercises.',
    labSteps: ['Verify implementation in sandbox or terminal'],
    quiz: [{
      question: 'What is the primary invariant for this module?',
      answer: 'Correct architectural pattern',
      options: ['Correct architectural pattern', 'Alternative option A', 'Alternative option B'],
      explanation: 'Verified by RobOS Knowledge Graph.',
    }],
  };

  activeCourse['robos:modules'].splice(insertIdx, 0, newSlide);
  renderModuleNav();
  renderModule(insertIdx);
  window.openSlideEditor(insertIdx);
  window.showToast(`➕ Added new slide. Configure and save course.`, 'info');
};

window.deleteSlide = function(idx) {
  document.querySelectorAll('.slide-dropdown-menu').forEach(el => el.classList.add('hidden'));
  if (!activeCourse) return;
  const mods = activeCourse['robos:modules'] || [];
  if (mods.length <= 1) {
    alert('A course must retain at least one slide/module.');
    return;
  }
  const title = (mods[idx] && mods[idx].title) || `Slide ${idx + 1}`;
  if (!confirm(`Are you sure you want to delete "${title}"?`)) return;

  mods.splice(idx, 1);
  const nextIdx = Math.max(0, Math.min(idx, mods.length - 1));
  renderModuleNav();
  renderModule(nextIdx);
  window.showToast(`🗑️ Deleted slide "${title}". Click "Save Course" to persist.`, 'info');
};

window.saveCurrentCourse = async function() {
  if (!activeCourse) return;
  window.showToast('💾 Saving course to Knowledge Graph & GitOps…', 'info');

  try {
    const res = await window.robosELearning.saveCourse(activeCourse);
    if (res && res.ok) {
      window.showToast(`✅ Successfully saved course to .robos/elearning.yaml and Knowledge Graph!`, 'success');
    } else {
      window.showToast(`❌ Save failed: ${(res && res.error) || 'Unknown error'}`, 'fail');
    }
  } catch (err) {
    window.showToast(`❌ Save error: ${err.message}`, 'fail');
  }
};

