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
    li.innerHTML = '<strong>' + (m.title || 'Module ' + (idx + 1)) + '</strong><br><small style="color:var(--text-muted);">' + (m.durationMinutes || 15) + ' mins</small>';
    li.onclick = () => renderModule(idx);
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

  panel.innerHTML = `
    <div class="module-card">
      <div class="module-header">
        <h2>${m.title}</h2>
        <span class="badge badge-duration">⏱️ ${m.durationMinutes || 15} minutes</span>
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
