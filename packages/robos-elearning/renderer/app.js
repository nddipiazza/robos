'use strict';
// RobOS eLearning: course library, lesson player, labs, quizzes, saved progress and certificates.

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function courseAssetUrl(src) {
  return String(src).startsWith('/assets/') ? `https://rowbose.com${src}` : String(src);
}

function renderOverviewContent(raw) {
  if (!raw) return '';
  let content = String(raw).trim();
  if (!content) return '';

  const tokens = [];
  // Inline Markdown for text that is tokenized early (list items, table cells).
  function inlineFmt(text) {
    return String(text)
      .replace(/`([^`]+)`/g, (_m, c) => '<code>' + c.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[^*])\*([^*\s][^*]*)\*(?!\*)/g, '$1<em>$2</em>')
      .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  }
  function saveToken(html) {
    const placeholder = `<!--ROBOS_TOKEN_${tokens.length}-->`;
    tokens.push({ placeholder, html });
    return placeholder;
  }

  // 1. Preserve pre-existing <pre><code>...</code></pre> blocks
  content = content.replace(/<pre[\s\S]*?<\/pre>/gi, (match) => saveToken(match));

  // 2. Fenced code blocks ```lang ... ```
  content = content.replace(/```([a-zA-Z0-9_\-]*)([\s\S]*?)```/g, (_match, lang, code) => {
    const esc = code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').trim();
    const cls = lang ? ` class="language-${lang}"` : '';
    return saveToken(`<pre><code${cls}>${esc}</code></pre>`);
  });

  // 3. Preserve HTML figures, images, tables, details, dl, div, video, iframe blocks
  content = content.replace(/<figure[\s\S]*?<\/figure>/gi, (match) => saveToken(match));
  content = content.replace(/<table[\s\S]*?<\/table>/gi, (match) => saveToken(match));
  content = content.replace(/<dl[\s\S]*?<\/dl>/gi, (match) => saveToken(match));
  content = content.replace(/<details[\s\S]*?<\/details>/gi, (match) => saveToken(match));
  content = content.replace(/<div[\s\S]*?<\/div>/gi, (match) => saveToken(match));
  content = content.replace(/<(?:video|iframe|audio)[\s\S]*?<\/(?:video|iframe|audio)>/gi, (match) => saveToken(match));

  // 3b. Markdown images. Course pictures live on the website, so a site path needs its full address here.
  content = content.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_match, alt, src) => {
    const safeAlt = alt.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
    return saveToken(`<figure><img src="${courseAssetUrl(src)}" alt="${safeAlt}" loading="lazy"><figcaption>${safeAlt}</figcaption></figure>`);
  });

  // 4. Markdown tables (| col | col |)
  content = content.replace(/((?:\|[^\n]+\|\r?\n)+)/g, (match) => {
    const lines = match.trim().split('\n').filter(l => l.trim().startsWith('|'));
    if (lines.length < 2) return match;
    let html = '<table>';
    lines.forEach((line, idx) => {
      if (line.includes('---')) return;
      const cells = line.split('|').slice(1, -1).map(c => c.trim());
      if (idx === 0) {
        html += '<thead><tr>' + cells.map(c => `<th>${inlineFmt(c)}</th>`).join('') + '</tr></thead><tbody>';
      } else {
        html += '<tr>' + cells.map(c => `<td>${inlineFmt(c)}</td>`).join('') + '</tr>';
      }
    });
    html += '</tbody></table>';
    return saveToken(html);
  });

  // 5. Markdown headers (# h1, ## h2, ### h3, #### h4)
  content = content.replace(/^#### (.*$)/gim, '<h4>$1</h4>');
  content = content.replace(/^### (.*$)/gim, '<h3>$1</h3>');
  content = content.replace(/^## (.*$)/gim, '<h2>$1</h2>');
  content = content.replace(/^# (.*$)/gim, '<h1>$1</h1>');

  // 6. Horizontal rules
  content = content.replace(/^---$/gm, '<hr>');

  // 7. Blockquotes
  content = content.replace(/^> (.*$)/gim, '<blockquote>$1</blockquote>');

  // 8. Markdown unordered lists (- item or * item)
  content = content.replace(/(?:^|\n)((?:[ \t]*[-*] .+(?:\n|$))+)/g, (match) => {
    const items = match.trim().split('\n').map(l => {
      const clean = l.trim().replace(/^[-*]\s+/, '');
      return `<li>${inlineFmt(clean)}</li>`;
    }).join('');
    return saveToken(`<ul>${items}</ul>`);
  });

  // 9. Markdown ordered lists (1. item)
  content = content.replace(/(?:^|\n)((?:[ \t]*\d+\. .+(?:\n|$))+)/g, (match) => {
    const items = match.trim().split('\n').map(l => {
      const clean = l.trim().replace(/^\d+\.\s+/, '');
      return `<li>${inlineFmt(clean)}</li>`;
    }).join('');
    return saveToken(`<ol>${items}</ol>`);
  });

  // 10. Inline bold / italic / code / links
  content = content.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  content = content.replace(/(^|[^\*])\*([^*]+)\*([^\*]|$)/g, '$1<em>$2</em>$3');
  content = content.replace(/`([^`]+)`/g, '<code>$1</code>');
  content = content.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');

  // 11. Wrap loose paragraphs
  const chunks = content.split(/\n\s*\n/).map(p => {
    const trimmed = p.trim();
    if (!trimmed) return '';
    if (trimmed.startsWith('<!--ROBOS_TOKEN_') ||
        trimmed.startsWith('<h') ||
        trimmed.startsWith('<table') ||
        trimmed.startsWith('<pre') ||
        trimmed.startsWith('<div') ||
        trimmed.startsWith('<hr') ||
        trimmed.startsWith('<blockquote') ||
        trimmed.startsWith('<ul') ||
        trimmed.startsWith('<ol') ||
        trimmed.startsWith('<p') ||
        trimmed.startsWith('<dl') ||
        trimmed.startsWith('<figure') ||
        trimmed.startsWith('<details')) {
      return trimmed;
    }
    return `<p>${trimmed.replace(/\n/g, '<br>')}</p>`;
  });

  let result = chunks.join('\n\n');

  // 12. Restore tokens
  for (const { placeholder, html } of tokens) {
    result = result.replace(placeholder, html);
  }

  return result;
}

window.renderOverviewContent = renderOverviewContent;

// ── Icons (Lucide paths, stroke-only) ──────────────────────────────────────
const ICONS = {
  cap: '<path d="M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z"/><path d="M22 10v6"/><path d="M6 12.5V16a6 3 0 0 0 12 0v-3.5"/>',
  rocket: '<path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/>',
  game: '<line x1="6" x2="10" y1="11" y2="11"/><line x1="8" x2="8" y1="9" y2="13"/><line x1="15" x2="15.01" y1="12" y2="12"/><line x1="18" x2="18.01" y1="10" y2="10"/><path d="M17.32 5H6.68a4 4 0 0 0-3.978 3.59c-.006.052-.01.101-.017.152C2.604 9.416 2 14.456 2 16a3 3 0 0 0 3 3c1 0 1.5-.5 2-1l1.414-1.414A2 2 0 0 1 9.828 16h4.344a2 2 0 0 1 1.414.586L17 18c.5.5 1 1 2 1a3 3 0 0 0 3-3c0-1.545-.604-6.584-.685-7.258-.007-.05-.011-.1-.017-.151A4 4 0 0 0 17.32 5z"/>',
  network: '<rect x="16" y="16" width="6" height="6" rx="1"/><rect x="2" y="16" width="6" height="6" rx="1"/><rect x="9" y="2" width="6" height="6" rx="1"/><path d="M5 16v-3a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v3"/><path d="M12 12V8"/>',
  layers: '<path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"/><path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65"/><path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65"/>',
  book: '<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  flask: '<path d="M10 2v7.527a2 2 0 0 1-.211.896L4.72 20.55a1 1 0 0 0 .9 1.45h12.76a1 1 0 0 0 .9-1.45l-5.069-10.127A2 2 0 0 1 14 9.527V2"/><path d="M8.5 2h7"/><path d="M7 16h10"/>',
  quiz: '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>',
  bulb: '<path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/>',
  award: '<path d="m15.477 12.89 1.515 8.526a.5.5 0 0 1-.81.47l-3.58-2.687a1 1 0 0 0-1.197 0l-3.586 2.686a.5.5 0 0 1-.81-.469l1.514-8.526"/><circle cx="12" cy="8" r="6"/>',
  left: '<path d="m15 18-6-6 6-6"/>',
  right: '<path d="m9 18 6-6-6-6"/>',
  back: '<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>',
  file: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/>',
  play: '<polygon points="6 3 20 12 6 21 6 3"/>',
  more: '<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>',
  shield: '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>',
};

function icon(name, cls = '') {
  return `<svg class="ic ${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ''}</svg>`;
}

// ── State ──────────────────────────────────────────────────────────────────
let courseList = [];
let activeCourse = null;
let activeApp = null;
let currentModIdx = 0;
let isEditorMode = false;
let sourceInfo = null;
let editingSlideIdx = null;
let currentView = 'library';
let libraryFilter = 'all';
let libraryQuery = '';
// Answers picked but not yet checked, keyed by "<lesson key>:<question index>"
const pendingAnswers = {};

// Saved learner progress (main process writes ~/.config/robos/elearning/progress.json)
let learnerStore = { version: 1, learnerName: '', lastCourseId: null, courses: {} };
let defaultLearnerName = 'RobOS learner';
let saveTimer = null;
const LOCAL_KEY = 'robos-elearning-progress';

function bridge() {
  return window.robosELearning || {};
}

async function loadLearnerStore() {
  const api = bridge();
  try {
    if (typeof api.getProgress === 'function') {
      const data = await api.getProgress();
      if (data && typeof data === 'object') {
        defaultLearnerName = data.defaultLearnerName || defaultLearnerName;
        learnerStore = {
          version: 1,
          learnerName: data.learnerName || '',
          lastCourseId: data.lastCourseId || null,
          courses: (data.courses && typeof data.courses === 'object') ? data.courses : {},
        };
        return;
      }
    }
  } catch (err) {
    console.warn('Could not load saved progress:', err);
  }
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      if (data && data.courses) learnerStore = data;
    }
  } catch {}
}

function persistLearnerStore() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    const api = bridge();
    try {
      if (typeof api.saveProgress === 'function') {
        await api.saveProgress(learnerStore);
        return;
      }
    } catch (err) {
      console.warn('Could not save progress:', err);
    }
    try { localStorage.setItem(LOCAL_KEY, JSON.stringify(learnerStore)); } catch {}
  }, 200);
}

function courseId(course) {
  return (course && (course['@id'] || course.id)) || 'course';
}

function courseRecord(course, create = true) {
  const id = courseId(course);
  let rec = learnerStore.courses[id];
  if (!rec && create) {
    rec = { labs: {}, quizzes: {}, done: {}, lesson: 0, startedAt: null, updatedAt: null, completedAt: null, certificate: null, percent: 0 };
    learnerStore.courses[id] = rec;
  }
  if (rec) {
    rec.labs = rec.labs || {};
    rec.quizzes = rec.quizzes || {};
    rec.done = rec.done || {};
  }
  return rec;
}

function modulesOf(course) {
  return (course && Array.isArray(course['robos:modules'])) ? course['robos:modules'] : [];
}

function lessonKey(m, idx) {
  return (m && (m.id || m['@id'] || m.slideId)) || `lesson-${idx + 1}`;
}

// ── Text helpers ───────────────────────────────────────────────────────────
function inlineMd(text) {
  let s = escapeHtml(text);
  s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  return s;
}

function hashString(str) {
  let h = 2166136261;
  for (let i = 0; i < String(str).length; i++) {
    h ^= String(str).charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// Stable option order per question, so the right answer is not always first.
function orderedOptions(q) {
  const opts = Array.isArray(q.options) && q.options.length ? q.options.slice() : [q.answer];
  if (q.answer && !opts.includes(q.answer)) opts.unshift(q.answer);
  let seed = hashString(q.question || '') || 1;
  for (let i = opts.length - 1; i > 0; i--) {
    seed = (Math.imul(seed, 1103515245) + 12345) >>> 0;
    const j = seed % (i + 1);
    [opts[i], opts[j]] = [opts[j], opts[i]];
  }
  return opts;
}

function minutesLabel(mins) {
  const n = Number(mins) || 0;
  if (!n) return '';
  if (n < 60) return `${n} min`;
  const h = Math.floor(n / 60);
  const r = n % 60;
  return r ? `${h} h ${r} min` : `${h} h`;
}

function courseMinutes(course) {
  const total = modulesOf(course).reduce((sum, m) => sum + (Number(m && m.durationMinutes) || 0), 0);
  return total ? minutesLabel(total) : (course && course['robos:estimatedDuration']) || '';
}

const COVER_ICONS = [
  [/getting started|robos basics|welcome|first steps/i, 'rocket'],
  [/game|crpg|godot|tabletop|rpg/i, 'game'],
  [/microservice|event|kafka|contract|api/i, 'network'],
  [/graph|kgraph|ingest|parse|search/i, 'layers'],
  [/security|vault|password|key/i, 'shield'],
];

function coverFor(course) {
  const text = `${course.title || course['dcterms:title'] || ''} ${course.topic || course['robos:topic'] || ''}`;
  const match = COVER_ICONS.find(([re]) => re.test(text));
  const hue = hashString(courseId(course)) % 360;
  return { icon: match ? match[1] : 'book', hue };
}

function difficultyOf(course) {
  return course.difficulty || course['robos:difficulty'] || course['robos:level'] || 'All levels';
}

function noCertificate(course) {
  const d = (course && course['dcterms:description']) || '';
  return /no completion, certification|does not issue a credential/i.test(d);
}

// ── Lesson and course completion ───────────────────────────────────────────
function lessonUnits(m) {
  const labs = Array.isArray(m && m.labSteps) ? m.labSteps.length : 0;
  const quiz = Array.isArray(m && m.quiz) ? m.quiz.length : 0;
  return { labs, quiz, total: labs + quiz };
}

function lessonState(course, idx) {
  const m = modulesOf(course)[idx];
  const rec = courseRecord(course, false) || { labs: {}, quizzes: {}, done: {} };
  const key = lessonKey(m, idx);
  const u = lessonUnits(m);
  let labsDone = 0;
  let quizDone = 0;
  for (let s = 0; s < u.labs; s++) if (rec.labs[`${key}:${s}`]) labsDone++;
  for (let q = 0; q < u.quiz; q++) if (rec.quizzes[`${key}:${q}`] && rec.quizzes[`${key}:${q}`].correct) quizDone++;
  const complete = u.total > 0 ? (labsDone === u.labs && quizDone === u.quiz) : !!rec.done[key];
  const started = complete || labsDone > 0 || quizDone > 0 || !!rec.done[key];
  return { key, labsDone, quizDone, units: u, complete, started };
}

function isModuleComplete(idx) {
  return activeCourse ? lessonState(activeCourse, idx).complete : false;
}

function courseStats(course) {
  const mods = modulesOf(course);
  let units = 0;
  let unitsDone = 0;
  let lessonsDone = 0;
  let questions = 0;
  let firstTry = 0;
  const rec = courseRecord(course, false) || { quizzes: {} };
  mods.forEach((m, idx) => {
    const st = lessonState(course, idx);
    if (st.units.total > 0) {
      units += st.units.total;
      unitsDone += st.labsDone + st.quizDone;
    } else {
      units += 1;
      unitsDone += st.complete ? 1 : 0;
    }
    if (st.complete) lessonsDone++;
    for (let q = 0; q < st.units.quiz; q++) {
      questions++;
      const a = rec.quizzes[`${st.key}:${q}`];
      if (a && a.correct && (a.tries || 1) === 1) firstTry++;
    }
  });
  const percent = units ? Math.round((unitsDone / units) * 100) : 0;
  return {
    lessons: mods.length,
    lessonsDone,
    percent,
    complete: mods.length > 0 && lessonsDone === mods.length,
    questions,
    score: questions ? Math.round((firstTry / questions) * 100) : null,
  };
}

function touchCourse(course) {
  const rec = courseRecord(course);
  const now = new Date().toISOString();
  if (!rec.startedAt) rec.startedAt = now;
  rec.updatedAt = now;
  const stats = courseStats(course);
  rec.percent = stats.percent;
  rec.lessonsDone = stats.lessonsDone;
  rec.lessons = stats.lessons;
  rec.lesson = currentModIdx;
  const m = modulesOf(course)[currentModIdx];
  rec.lessonTitle = (m && m.title) || '';
  rec.minutesDone = modulesOf(course).reduce((sum, mod, idx) => sum + (lessonState(course, idx).complete ? (Number(mod.durationMinutes) || 0) : 0), 0);
  learnerStore.lastCourseId = courseId(course);
  persistLearnerStore();
  return stats;
}

// ── Boot ───────────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', async () => {
  await initApp();
});

async function initApp() {
  const api = bridge();
  await loadLearnerStore();

  try {
    const list = typeof api.listCourses === 'function' ? await api.listCourses() : [];
    courseList = Array.isArray(list) ? list : [];
  } catch (err) {
    console.warn('Could not list courses:', err);
    courseList = [];
  }

  try {
    if (typeof api.getSourceInfo === 'function') sourceInfo = await api.getSourceInfo();
  } catch (err) {
    console.warn('Could not fetch source info:', err);
  }

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.slide-menu-container')) {
      document.querySelectorAll('.slide-dropdown-menu').forEach(el => el.classList.add('hidden'));
    }
  });
  document.addEventListener('keydown', onKeyDown);
  initZoomControls();

  let target = null;
  try {
    if (typeof api.getInitialTarget === 'function') target = await api.getInitialTarget();
  } catch {}
  const targetId = target && (target.courseId || target.appId);
  if (targetId) {
    await loadCourse(targetId);
  } else {
    window.showLibrary();
  }
}

function onKeyDown(e) {
  if (e.key === 'Escape') {
    if (document.getElementById('cert-modal').style.display === 'flex') window.closeCertificateModal();
    else if (document.getElementById('slide-editor-modal').style.display === 'flex') window.closeSlideEditor();
    return;
  }
  if (currentView !== 'course' || e.ctrlKey || e.metaKey || e.altKey) return;
  const tag = (e.target && e.target.tagName) || '';
  if (/INPUT|TEXTAREA|SELECT/.test(tag) || (e.target && e.target.isContentEditable)) return;
  if (document.querySelector('.modal-overlay[style*="flex"]')) return;
  if (e.key === 'ArrowRight') { e.preventDefault(); window.goToLesson(currentModIdx + 1); }
  if (e.key === 'ArrowLeft') { e.preventDefault(); window.goToLesson(currentModIdx - 1); }
}

function setView(view) {
  currentView = view;
  document.getElementById('app').dataset.view = view;
  document.getElementById('library-view').hidden = view !== 'library';
  document.getElementById('course-view').hidden = view !== 'course';
  renderCrumbs();
}

function renderCrumbs() {
  const el = document.getElementById('crumbs');
  if (!el) return;
  if (currentView === 'course' && activeCourse) {
    el.innerHTML = `<span class="crumb-sep">/</span><button type="button" class="crumb" onclick="window.showLibrary()">Library</button><span class="crumb-sep">/</span><span class="crumb current" title="${escapeHtml(activeCourse['dcterms:title'] || '')}">${escapeHtml(activeCourse['dcterms:title'] || 'Course')}</span>`;
  } else {
    el.innerHTML = '<span class="crumb-sep">/</span><span class="crumb current">Library</span>';
  }
}

// ── Library ────────────────────────────────────────────────────────────────
window.showLibrary = function() {
  setView('library');
  renderLibrary();
};

function libraryCards() {
  const q = libraryQuery.trim().toLowerCase();
  return courseList.filter(c => {
    const rec = learnerStore.courses[c.id];
    const pct = rec ? rec.percent || 0 : 0;
    const done = !!(rec && rec.completedAt);
    if (libraryFilter === 'progress' && !(pct > 0 && !done)) return false;
    if (libraryFilter === 'done' && !done) return false;
    if (['Beginner', 'Intermediate', 'Advanced'].includes(libraryFilter) && String(difficultyOf(c)).toLowerCase() !== libraryFilter.toLowerCase()) return false;
    if (q) {
      const hay = `${c.title} ${c.topic || ''} ${c.description || ''} ${c.targetAudience || ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  }).sort((a, b) => (b.featured ? 1 : 0) - (a.featured ? 1 : 0));
}

function coverHtml(c, size = '') {
  const cov = coverFor(c);
  return `<div class="cover ${size}" style="--h:${cov.hue}">${icon(cov.icon, 'cover-ic')}</div>`;
}

function progressText(rec, c) {
  if (rec && rec.completedAt) return 'Completed';
  const pct = rec ? rec.percent || 0 : 0;
  if (pct > 0) return `${pct}% complete`;
  return 'Not started';
}

function renderLibrary() {
  const root = document.getElementById('library-view');
  if (!root) return;
  const recs = courseList.map(c => learnerStore.courses[c.id]).filter(Boolean);
  const inProgress = recs.filter(r => (r.percent || 0) > 0 && !r.completedAt).length;
  const completed = recs.filter(r => r.completedAt).length;
  const certs = recs.filter(r => r.certificate).length;
  const minutes = recs.reduce((s, r) => s + (Number(r.minutesDone) || 0), 0);
  const name = learnerStore.learnerName || defaultLearnerName;

  const last = learnerStore.lastCourseId && courseList.find(c => c.id === learnerStore.lastCourseId);
  const lastRec = last && learnerStore.courses[last.id];
  const showContinue = last && lastRec && !lastRec.completedAt;

  const featured = courseList.find(c => c.featured && !(learnerStore.courses[c.id] || {}).startedAt);

  const filters = [
    ['all', 'All'], ['progress', 'In progress'], ['done', 'Completed'],
    ['Beginner', 'Beginner'], ['Intermediate', 'Intermediate'], ['Advanced', 'Advanced'],
  ];
  const cards = libraryCards();

  root.innerHTML = `
    <div class="lib-wrap">
      <div class="lib-hero">
        <div class="lib-hello">
          <p class="eyebrow">Welcome back, ${escapeHtml(name)}</p>
          <h1>Learn by doing, one lesson at a time.</h1>
          <p class="lib-sub">Every course here lives in your knowledge graph: short lessons, hands-on lab steps and quizzes that tell you why an answer is right. Progress is saved on this computer.</p>
        </div>
        <dl class="lib-stats">
          <div><dt>In progress</dt><dd>${inProgress}</dd></div>
          <div><dt>Completed</dt><dd>${completed}</dd></div>
          <div><dt>Certificates</dt><dd>${certs}</dd></div>
          <div><dt>Time learned</dt><dd>${minutes ? minutesLabel(minutes) : '0 min'}</dd></div>
        </dl>
      </div>

      ${showContinue ? `
      <button type="button" class="continue-card" onclick="window.openCourse('${escapeHtml(last.id)}')">
        ${coverHtml(last, 'cover-sm')}
        <div class="continue-text">
          <span class="eyebrow">Continue where you left off</span>
          <strong>${escapeHtml(last.title)}</strong>
          <span class="muted">Lesson ${(lastRec.lesson || 0) + 1}${lastRec.lessonTitle ? ': ' + escapeHtml(cleanLessonTitle(lastRec.lessonTitle)) : ''}</span>
          <span class="bar"><span style="width:${lastRec.percent || 0}%"></span></span>
        </div>
        <span class="btn btn-primary">${icon('play')} Resume</span>
      </button>` : (featured ? `
      <button type="button" class="continue-card is-featured" onclick="window.openCourse('${escapeHtml(featured.id)}')">
        ${coverHtml(featured, 'cover-sm')}
        <div class="continue-text">
          <span class="eyebrow">New here? Start with this</span>
          <strong>${escapeHtml(featured.title)}</strong>
          <span class="muted">${escapeHtml((featured.description || '').slice(0, 140))}${(featured.description || '').length > 140 ? '…' : ''}</span>
        </div>
        <span class="btn btn-primary">${icon('play')} Start course</span>
      </button>` : '')}

      <div class="lib-toolbar">
        <h2>All courses <span class="count">${courseList.length}</span></h2>
        <div class="chips" role="tablist" aria-label="Filter courses">
          ${filters.map(([k, label]) => `<button type="button" role="tab" aria-selected="${libraryFilter === k}" class="chip ${libraryFilter === k ? 'on' : ''}" onclick="window.setLibraryFilter('${k}')">${label}</button>`).join('')}
        </div>
        <label class="search">${icon('search')}<input id="library-search" type="search" placeholder="Search courses" value="${escapeHtml(libraryQuery)}" oninput="window.setLibraryQuery(this.value)"></label>
      </div>

      ${courseList.length === 0 ? `
        <div class="empty">${icon('book')}<h3>No courses yet</h3><p>Courses are <code>robos:ELearning</code> nodes in the <code>learning</code> package of your knowledge graph. Generate one from Knowledge Graph Explorer, or with the <code>generate-app-elearning</code> agent skill.</p></div>` : ''}
      ${courseList.length > 0 && cards.length === 0 ? `<div class="empty">${icon('search')}<h3>No courses match</h3><p>Try another filter or search.</p></div>` : ''}

      <div class="course-grid" id="course-grid">
        ${cards.map(c => {
          const rec = learnerStore.courses[c.id];
          const pct = rec ? (rec.completedAt ? 100 : rec.percent || 0) : 0;
          const action = rec && rec.completedAt ? 'Review' : (pct > 0 ? 'Continue' : 'Start');
          return `
          <article class="course-card ${rec && rec.completedAt ? 'is-done' : ''}" data-course-id="${escapeHtml(c.id)}">
            <button type="button" class="card-hit" onclick="window.openCourse('${escapeHtml(c.id)}')" aria-label="${action} ${escapeHtml(c.title)}"></button>
            ${coverHtml(c)}
            <div class="card-body">
              <div class="card-tags">
                <span class="tag">${escapeHtml(difficultyOf(c))}</span>
                ${c.featured ? '<span class="tag tag-accent">Start here</span>' : ''}
                ${rec && rec.certificate ? `<span class="tag tag-gold">${icon('award')} Certified</span>` : ''}
              </div>
              <h3>${escapeHtml(c.title)}</h3>
              <p>${escapeHtml(c.description || c.topic || '')}</p>
              <div class="card-meta">
                <span>${icon('book')} ${c.modulesCount} lesson${c.modulesCount === 1 ? '' : 's'}</span>
                <span>${icon('clock')} ${escapeHtml(c.lessonMinutes ? minutesLabel(c.lessonMinutes) : (c.estimatedDuration || ''))}</span>
              </div>
              <div class="card-progress">
                <span class="bar"><span style="width:${pct}%"></span></span>
                <span class="card-progress-row"><small>${progressText(rec, c)}</small><span class="card-action">${action} ${icon('right')}</span></span>
              </div>
            </div>
          </article>`;
        }).join('')}
      </div>
    </div>`;
}

window.setLibraryFilter = function(k) {
  libraryFilter = k;
  renderLibrary();
};

window.setLibraryQuery = function(v) {
  libraryQuery = v || '';
  const grid = document.getElementById('course-grid');
  const caret = document.getElementById('library-search');
  const pos = caret ? caret.selectionStart : null;
  renderLibrary();
  const again = document.getElementById('library-search');
  if (again) { again.focus(); if (pos !== null) again.setSelectionRange(pos, pos); }
  return grid;
};

window.openCourse = function(id) {
  return loadCourse(id);
};

// ── Course player ──────────────────────────────────────────────────────────
async function loadCourse(courseOrAppId) {
  try {
    const res = await bridge().getCourse(courseOrAppId);
    if (!res || !res.course) {
      window.showToast('That course could not be found in the knowledge graph.', 'fail');
      window.showLibrary();
      return;
    }
    activeCourse = res.course;
    activeApp = res.application || null;
    if (!courseList.find(c => c.id === courseId(activeCourse))) {
      courseList.push(summarizeCourse(activeCourse));
    }
    const rec = courseRecord(activeCourse);
    const mods = modulesOf(activeCourse);
    const resumeAt = Math.min(Math.max(0, rec.lesson || 0), Math.max(0, mods.length - 1));
    setView('course');
    renderSideCourse();
    renderModule(resumeAt);
  } catch (err) {
    console.error('Error loading course:', err);
    window.showToast(`Could not open the course: ${err.message}`, 'fail');
  }
}

function summarizeCourse(c) {
  return {
    id: courseId(c),
    title: c['dcterms:title'] || 'Course',
    topic: c['robos:topic'] || '',
    difficulty: c['robos:difficulty'] || c['robos:level'] || 'Intermediate',
    estimatedDuration: c['robos:estimatedDuration'] || '',
    modulesCount: modulesOf(c).length,
    description: c['dcterms:description'] || '',
    lessonMinutes: modulesOf(c).reduce((s, m) => s + (Number(m.durationMinutes) || 0), 0),
    featured: !!c['robos:featured'],
  };
}

window.onCourseSelected = function(id) {
  if (id) loadCourse(id);
};

function ringSvg(pct) {
  const r = 22;
  const c = 2 * Math.PI * r;
  const off = c - (Math.max(0, Math.min(100, pct)) / 100) * c;
  return `<svg class="ring" viewBox="0 0 52 52" aria-hidden="true"><circle cx="26" cy="26" r="${r}" class="ring-bg"/><circle cx="26" cy="26" r="${r}" class="ring-fg" stroke-dasharray="${c.toFixed(2)}" stroke-dashoffset="${off.toFixed(2)}"/></svg>`;
}

function renderSideCourse() {
  const el = document.getElementById('side-course');
  if (!el || !activeCourse) return;
  const stats = courseStats(activeCourse);
  const summary = summarizeCourse(activeCourse);
  el.innerHTML = `
    <button type="button" class="side-back" onclick="window.showLibrary()">${icon('back')} All courses</button>
    <div class="side-title-row">
      ${coverHtml(summary, 'cover-xs')}
      <h2>${escapeHtml(summary.title)}</h2>
    </div>
    <div class="side-meta">
      <span class="tag">${escapeHtml(difficultyOf(summary))}</span>
      <span>${icon('clock')} ${escapeHtml(courseMinutes(activeCourse))}</span>
    </div>
    <div class="side-progress">
      ${ringSvg(stats.percent)}
      <div><strong>${stats.percent}%</strong><span>${stats.lessonsDone} of ${stats.lessons} lessons done</span></div>
    </div>`;
}

function renderModuleNav() {
  const list = document.getElementById('module-nav-list');
  if (!list || !activeCourse) return;
  list.innerHTML = '';
  modulesOf(activeCourse).forEach((m, idx) => {
    const st = lessonState(activeCourse, idx);
    const li = document.createElement('li');
    li.className = 'module-item' + (idx === currentModIdx ? ' active' : '') + (st.complete ? ' completed' : '') + (st.started && !st.complete ? ' started' : '');
    const status = st.complete ? icon('check') : `<span>${idx + 1}</span>`;
    const parts = [];
    if (m.durationMinutes) parts.push(`${m.durationMinutes} min`);
    if (st.units.labs) parts.push(`${st.units.labs} lab step${st.units.labs === 1 ? '' : 's'}`);
    if (st.units.quiz) parts.push(`${st.units.quiz} question${st.units.quiz === 1 ? '' : 's'}`);
    li.innerHTML = `
      <span class="module-status" aria-hidden="true">${status}</span>
      <div class="module-item-main">
        <div class="module-item-title-row">${escapeHtml(cleanLessonTitle(m.title) || 'Lesson ' + (idx + 1))}</div>
        <div class="module-item-footer">
          <small class="module-item-duration">${escapeHtml(parts.join(' · '))}</small>
          ${isEditorMode ? `<a href="#" class="copy-tab-path-link" onclick="window.copyTabPath(event, ${idx})" title="Copy as Path" aria-label="Copy as Path">Copy path</a>` : ''}
        </div>
      </div>`;
    li.tabIndex = 0;
    li.setAttribute('role', 'button');
    li.setAttribute('aria-current', idx === currentModIdx ? 'step' : 'false');
    li.onclick = (e) => {
      if (e.target.closest('.copy-tab-path-link')) return;
      renderModule(idx);
    };
    li.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); renderModule(idx); } };
    list.appendChild(li);
  });
}

// "Module 2: Location Scenes" -> "Location Scenes"; the number is shown separately.
function cleanLessonTitle(title) {
  return String(title || '').replace(/^\s*(module|lesson|slide|chapter)\s*\d+\s*[:.\-–—]\s*/i, '');
}

window.goToLesson = function(idx) {
  if (!activeCourse) return;
  const n = modulesOf(activeCourse).length;
  if (idx < 0 || idx >= n) return;
  renderModule(idx);
};

function renderModule(idx) {
  if (!activeCourse) return;
  const mods = modulesOf(activeCourse);
  if (!mods.length) {
    currentModIdx = 0;
    renderModuleNav();
    document.getElementById('module-content').innerHTML = `<div class="empty">${icon('book')}<h3>This course has no lessons yet</h3><p>Turn on <strong>Edit course</strong> and add the first lesson.</p></div>`;
    updateProgress();
    return;
  }
  currentModIdx = Math.max(0, Math.min(idx, mods.length - 1));
  const m = mods[currentModIdx];
  renderModuleNav();
  renderLesson(m, currentModIdx, mods.length);
  touchCourse(activeCourse);
  updateProgress();
  const panel = document.getElementById('content-panel');
  if (panel) panel.scrollTop = 0;
}

function lessonMenu(idx, total) {
  return `
    <div class="slide-header-actions">
      <div class="slide-menu-container">
        <button type="button" class="btn-slide-menu" onclick="window.toggleSlideMenu(event, ${idx})" title="Lesson actions" aria-label="Lesson actions">${icon('more')}</button>
        <div class="slide-dropdown-menu hidden" id="slide-dropdown-${idx}">
          <div class="slide-menu-label">This lesson</div>
          <button type="button" class="slide-menu-item" onclick="window.openSlideEditor(${idx})"><span>Edit lesson</span></button>
          <button type="button" class="slide-menu-item" onclick="window.copySlideMarkdown(${idx})"><span>Copy as Markdown</span></button>
          <button type="button" class="slide-menu-item" onclick="window.exportSlideAsZip(${idx})"><span>Export as HTML Zip</span></button>
          <div class="slide-menu-divider"></div>
          <div class="slide-menu-label">For AI agents</div>
          <button type="button" class="slide-menu-item" onclick="window.copySlidePath(${idx})"><span>Copy Path on File System</span></button>
          <button type="button" class="slide-menu-item" onclick="window.copySlideGitUrl(${idx})"><span>Copy Git URL Path</span></button>
          <button type="button" class="slide-menu-item" onclick="window.copySlideUri(${idx})"><span>Copy KGraph URI</span></button>
          <div class="slide-menu-divider"></div>
          <button type="button" class="slide-menu-item" onclick="window.addNewSlide(${idx + 1})"><span>Add a lesson after this one</span></button>
          ${total > 1 ? `<button type="button" class="slide-menu-item danger" onclick="window.deleteSlide(${idx})"><span>Delete lesson</span></button>` : ''}
        </div>
      </div>
    </div>`;
}

function isLongText(text) {
  const t = String(text || '');
  return t.length > 320 || /\n|```|<(table|pre|figure|div)/i.test(t);
}

function renderLesson(m, idx, total) {
  const panel = document.getElementById('module-content');
  if (!panel) return;
  const st = lessonState(activeCourse, idx);
  const rec = courseRecord(activeCourse);
  const overview = m.overview || '';
  const body = m.body || '';
  const leadIsShort = overview && !isLongText(overview);
  const keyPoints = Array.isArray(m.keyPoints) ? m.keyPoints.filter(Boolean) : [];
  const labs = Array.isArray(m.labSteps) ? m.labSteps : [];
  const quiz = Array.isArray(m.quiz) ? m.quiz : [];
  const prev = idx > 0 ? modulesOf(activeCourse)[idx - 1] : null;
  const next = idx < total - 1 ? modulesOf(activeCourse)[idx + 1] : null;
  const stats = courseStats(activeCourse);

  let primary;
  if (st.units.total === 0 && !st.complete) {
    primary = `<button type="button" class="btn btn-primary" onclick="window.markLessonComplete(${idx})">${icon('check')} ${next ? 'Mark complete and continue' : 'Mark complete'}</button>`;
  } else if (next) {
    primary = `<button type="button" class="btn ${st.complete ? 'btn-primary' : 'btn-ghost'}" onclick="window.goToLesson(${idx + 1})">Next lesson ${icon('right')}</button>`;
  } else if (stats.complete) {
    primary = `<button type="button" class="btn btn-primary" onclick="window.showCourseComplete()">${icon('award')} Finish course</button>`;
  } else {
    primary = `<button type="button" class="btn btn-ghost" onclick="window.goToFirstUnfinished()">Go to an unfinished lesson ${icon('right')}</button>`;
  }

  panel.innerHTML = `
    <article class="lesson module-card" data-lesson="${escapeHtml(st.key)}">
      <header class="lesson-head module-header">
        <div>
          <div class="lesson-kicker">Lesson ${idx + 1} of ${total}${m.durationMinutes ? ` · ${icon('clock')} ${m.durationMinutes} min` : ''}${st.complete ? ` · <span class="done-pill">${icon('check')} Done</span>` : ''}</div>
          <h1>${escapeHtml(cleanLessonTitle(m.title) || 'Lesson ' + (idx + 1))}</h1>
        </div>
        ${lessonMenu(idx, total)}
      </header>

      ${leadIsShort ? `<p class="lesson-lead">${inlineMd(overview)}</p>` : ''}
      <div class="lesson-body prose module-overview">
        ${!leadIsShort && overview ? renderOverviewContent(overview) : ''}
        ${body ? renderOverviewContent(body) : ''}
        ${!overview && !body && m.labFile ? `<p>This lesson's material is in <code>${escapeHtml(m.labFile)}</code> in the course repository.</p>` : ''}
      </div>

      ${keyPoints.length ? `
      <section class="callout key-points">
        <h3>${icon('bulb')} Key ideas</h3>
        <ul>${keyPoints.map(k => `<li>${inlineMd(k)}</li>`).join('')}</ul>
      </section>` : ''}

      ${labs.length ? `
      <section class="panel lab-panel">
        <div class="panel-head">
          <h3>${icon('flask')} Hands-on lab</h3>
          <span class="panel-count ${st.labsDone === labs.length ? 'ok' : ''}">${st.labsDone} of ${labs.length} done</span>
        </div>
        <p class="panel-sub">Do each step on your machine, then tick it off.</p>
        <ol class="lab-steps">
          ${labs.map((step, sIdx) => {
            const checked = !!rec.labs[`${st.key}:${sIdx}`];
            const detail = (Array.isArray(m.labDetails) && m.labDetails[sIdx]) ? m.labDetails[sIdx] : null;
            return `
            <li class="lab-step ${checked ? 'checked' : ''} ${detail ? 'lab-step-rich' : ''}">
              <input type="checkbox" class="lab-checkbox" id="lab-${idx}-${sIdx}" ${checked ? 'checked' : ''} onchange="window.toggleLab(${idx}, ${sIdx})">
              <div class="lab-step-text">
                <div><span class="lab-num">${sIdx + 1}</span><span>${inlineMd(step)}</span></div>
                ${detail && detail.description ? `<p style="margin:6px 0 4px;font-size:13px;opacity:0.9;">${inlineMd(detail.description)}</p>` : ''}
                ${detail && detail.code ? `<pre style="margin:6px 0;padding:8px 10px;background:#0d1117;border-radius:4px;font-size:12px;overflow-x:auto;"><code>${escapeHtml(detail.code)}</code></pre>` : ''}
                ${detail && detail.expected ? `<div style="margin:6px 0;padding:6px 10px;border-left:3px solid #38bdf8;background:rgba(56,189,248,0.08);font-size:12.5px;"><strong>What to expect:</strong> ${inlineMd(detail.expected)}</div>` : ''}
                ${detail && detail.image ? `<figure style="margin:8px 0 2px;"><img src="${escapeHtml(courseAssetUrl(detail.image))}" alt="${escapeHtml(detail.imageAlt || step)}" style="max-width:100%;max-height:360px;border-radius:4px;border:1px solid #30363d;">${detail.caption ? `<figcaption style="font-size:11.5px;opacity:0.75;margin-top:4px;">${inlineMd(detail.caption)}</figcaption>` : ''}</figure>` : ''}
              </div>
            </li>`;
          }).join('')}
        </ol>
      </section>` : ''}

      ${quiz.length ? `
      <section class="panel quiz-panel quiz-section">
        <div class="panel-head">
          <h3>${icon('quiz')} Check your understanding</h3>
          <span class="panel-count ${st.quizDone === quiz.length ? 'ok' : ''}">${st.quizDone} of ${quiz.length} correct</span>
        </div>
        ${quiz.map((q, qIdx) => renderQuestion(q, idx, qIdx, st.key, rec)).join('')}
      </section>` : ''}

      ${st.complete ? `<div class="lesson-done-banner">${icon('check')} <span><strong>Lesson complete.</strong> ${next ? 'On to the next one when you are ready.' : (stats.complete ? 'That was the last lesson.' : 'Some earlier lessons are still unfinished.')}</span></div>` : ''}

      <nav class="lesson-nav" aria-label="Lesson navigation">
        ${prev ? `<button type="button" class="btn btn-ghost" onclick="window.goToLesson(${idx - 1})">${icon('left')} <span class="nav-label"><small>Previous</small>${escapeHtml(cleanLessonTitle(prev.title))}</span></button>` : '<span></span>'}
        <div class="lesson-nav-right">
          ${next ? `<span class="nav-next-title"><small>Up next</small>${escapeHtml(cleanLessonTitle(next.title))}</span>` : ''}
          ${primary}
        </div>
      </nav>
      <p class="kbd-hint">Tip: use <kbd>←</kbd> and <kbd>→</kbd> to move between lessons.</p>
    </article>`;
}

function renderQuestion(q, mIdx, qIdx, key, rec) {
  const saved = rec.quizzes[`${key}:${qIdx}`];
  const pendingKey = `${key}:${qIdx}`;
  const picked = pendingAnswers[pendingKey];
  const answered = saved && saved.correct;
  const opts = orderedOptions(q);
  const tries = (saved && saved.tries) || 0;
  const wrongLast = saved && !saved.correct && saved.picked;
  let feedback = '';
  if (answered) {
    feedback = `<div class="quiz-feedback pass">${icon('check')}<div><strong>Correct${tries > 1 ? '' : ', first try'}.</strong> ${q.explanation ? inlineMd(q.explanation) : ''}</div></div>`;
  } else if (wrongLast && !picked) {
    const reveal = tries >= 2;
    feedback = `<div class="quiz-feedback fail"><span class="x">✕</span><div><strong>Not quite.</strong> ${reveal ? `The answer is <em>${inlineMd(q.answer)}</em>. ${q.explanation ? inlineMd(q.explanation) : ''}` : 'Have another look at the lesson and try again.'}</div></div>`;
  }
  return `
    <div class="quiz-item ${answered ? 'is-correct' : ''}" id="quiz-${mIdx}-${qIdx}">
      <div class="quiz-q"><span class="q-num">${qIdx + 1}</span><span>${inlineMd(q.question)}</span></div>
      <div class="quiz-options" role="radiogroup" aria-label="Answers">
        ${opts.map((opt, oIdx) => {
          const isPicked = picked === opt || (!picked && answered && opt === q.answer) || (!picked && !answered && wrongLast === opt);
          let cls = '';
          if (answered && opt === q.answer) cls = 'right';
          else if (!picked && !answered && wrongLast === opt) cls = 'wrong';
          else if (isPicked) cls = 'picked';
          return `<button type="button" role="radio" aria-checked="${isPicked}" class="quiz-opt ${cls}" ${answered ? 'disabled' : ''} onclick="window.pickAnswer(${mIdx}, ${qIdx}, ${oIdx})"><span class="opt-key">${String.fromCharCode(65 + oIdx)}</span><span>${inlineMd(opt)}</span></button>`;
        }).join('')}
      </div>
      ${answered ? '' : `<div class="quiz-actions"><button type="button" class="btn btn-primary btn-sm" ${picked ? '' : 'disabled'} onclick="window.checkAnswer(${mIdx}, ${qIdx})">Check answer</button></div>`}
      <div class="quiz-feedback-slot" id="feedback-${mIdx}-${qIdx}">${feedback}</div>
    </div>`;
}

function rerenderKeepingScroll() {
  const panel = document.getElementById('content-panel');
  const top = panel ? panel.scrollTop : 0;
  const mods = modulesOf(activeCourse);
  renderModuleNav();
  renderLesson(mods[currentModIdx], currentModIdx, mods.length);
  touchCourse(activeCourse);
  updateProgress();
  if (panel) panel.scrollTop = top;
}

window.pickAnswer = function(mIdx, qIdx, oIdx) {
  const m = modulesOf(activeCourse)[mIdx];
  if (!m || !m.quiz || !m.quiz[qIdx]) return;
  const key = lessonKey(m, mIdx);
  pendingAnswers[`${key}:${qIdx}`] = orderedOptions(m.quiz[qIdx])[oIdx];
  rerenderKeepingScroll();
};

window.checkAnswer = function(mIdx, qIdx) {
  const m = modulesOf(activeCourse)[mIdx];
  if (!m || !m.quiz || !m.quiz[qIdx]) return;
  const key = lessonKey(m, mIdx);
  const pk = `${key}:${qIdx}`;
  const picked = pendingAnswers[pk];
  if (!picked) return;
  window.checkQuiz(mIdx, qIdx, picked, m.quiz[qIdx].answer);
};

// Kept for compatibility with older course pages and tests.
window.checkQuiz = function(mIdx, qIdx, selected, correct) {
  const m = modulesOf(activeCourse)[mIdx];
  if (!m) return;
  const key = lessonKey(m, mIdx);
  const rec = courseRecord(activeCourse);
  const prev = rec.quizzes[`${key}:${qIdx}`] || { tries: 0 };
  if (prev.correct) return;
  const isCorrect = selected === correct;
  rec.quizzes[`${key}:${qIdx}`] = { correct: isCorrect, picked: selected, tries: (prev.tries || 0) + 1 };
  delete pendingAnswers[`${key}:${qIdx}`];
  rerenderKeepingScroll();
  afterProgressChange();
};

window.toggleLab = function(mIdx, sIdx) {
  const m = modulesOf(activeCourse)[mIdx];
  if (!m) return;
  const key = lessonKey(m, mIdx);
  const rec = courseRecord(activeCourse);
  const k = `${key}:${sIdx}`;
  rec.labs[k] = !rec.labs[k];
  if (!rec.labs[k]) delete rec.labs[k];
  rerenderKeepingScroll();
  afterProgressChange();
};

window.markLessonComplete = function(idx) {
  const m = modulesOf(activeCourse)[idx];
  if (!m) return;
  const rec = courseRecord(activeCourse);
  rec.done[lessonKey(m, idx)] = true;
  touchCourse(activeCourse);
  afterProgressChange();
  if (idx < modulesOf(activeCourse).length - 1) renderModule(idx + 1);
  else if (courseStats(activeCourse).complete) window.showCourseComplete();
  else rerenderKeepingScroll();
};

window.goToFirstUnfinished = function() {
  const n = modulesOf(activeCourse).length;
  for (let i = 0; i < n; i++) {
    if (!lessonState(activeCourse, i).complete) { renderModule(i); return; }
  }
};

// Hook for progress side effects (the lesson view already shows completion).
function afterProgressChange() {
  persistLearnerStore();
}

async function updateProgress() {
  if (!activeCourse) return;
  const stats = courseStats(activeCourse);
  const pctEl = document.getElementById('progress-percent');
  if (pctEl) pctEl.textContent = stats.percent + '%';
  const barEl = document.getElementById('progress-bar-fill');
  if (barEl) barEl.style.width = stats.percent + '%';
  renderSideCourse();

  const btn = document.getElementById('btn-view-certificate');
  const txt = document.getElementById('cert-status-text');
  const rec = courseRecord(activeCourse);
  if (noCertificate(activeCourse)) {
    if (btn) btn.style.display = 'none';
    if (txt) txt.textContent = stats.complete ? 'All lessons done. This reference course does not issue a certificate.' : 'This reference course does not issue a certificate.';
    return;
  }
  if (stats.complete) {
    if (!rec.completedAt) {
      rec.completedAt = new Date().toISOString();
      persistLearnerStore();
    }
    await ensureCertificate(stats);
    if (btn) btn.style.display = 'block';
    if (txt) txt.textContent = 'You finished every lesson, lab and quiz.';
  } else {
    if (btn) btn.style.display = 'none';
    if (txt) {
      const left = stats.lessons - stats.lessonsDone;
      txt.textContent = `${left} lesson${left === 1 ? '' : 's'} to go. Finish every lab and quiz to earn your certificate.`;
    }
  }
}

async function ensureCertificate(stats) {
  const rec = courseRecord(activeCourse);
  if (rec.certificate) return rec.certificate;
  let cert = null;
  try {
    const api = bridge();
    if (typeof api.issueCertificate === 'function') {
      const res = await api.issueCertificate({
        courseId: courseId(activeCourse),
        appId: activeApp ? activeApp['@id'] : null,
        userId: learnerStore.learnerName || defaultLearnerName,
        scorePercentage: stats.score === null ? 100 : stats.score,
      });
      if (res && res.certificate) cert = res.certificate;
    }
  } catch (err) {
    console.warn('Could not record the certificate in the knowledge graph:', err.message);
  }
  const issued = (cert && cert['robos:issueDate']) || rec.completedAt || new Date().toISOString();
  const id = (cert && cert['robos:verificationHash']) ||
    `ROBOS-${hashString(courseId(activeCourse) + issued).toString(16).toUpperCase().padStart(8, '0')}`;
  rec.certificate = { id, issuedAt: issued, score: stats.score, recorded: !!cert };
  persistLearnerStore();
  return rec.certificate;
}

window.showCourseComplete = async function() {
  if (!activeCourse) return;
  const stats = courseStats(activeCourse);
  if (!stats.complete) { window.goToFirstUnfinished(); return; }
  await updateProgress();
  const panel = document.getElementById('module-content');
  const certAllowed = !noCertificate(activeCourse);
  const labs = modulesOf(activeCourse).reduce((s, m) => s + ((m.labSteps || []).length), 0);
  panel.innerHTML = `
    <section class="complete-card">
      <div class="complete-medal">${icon('award')}</div>
      <p class="eyebrow">Course complete</p>
      <h1>${escapeHtml(activeCourse['dcterms:title'] || 'Course')}</h1>
      <p class="lesson-lead">Nice work. You finished every lesson${labs ? ', worked through the labs' : ''}${stats.questions ? ' and answered every question' : ''}.</p>
      <dl class="complete-stats">
        <div><dt>Lessons</dt><dd>${stats.lessons}</dd></div>
        <div><dt>Lab steps</dt><dd>${labs}</dd></div>
        <div><dt>Quiz score, first try</dt><dd>${stats.score === null ? '—' : stats.score + '%'}</dd></div>
        <div><dt>Time</dt><dd>${escapeHtml(courseMinutes(activeCourse) || '—')}</dd></div>
      </dl>
      <div class="complete-actions">
        ${certAllowed ? `<button type="button" class="btn btn-primary" onclick="window.showCertificateModal()">${icon('award')} View your certificate</button>` : '<p class="muted">This reference course does not issue a certificate.</p>'}
        <button type="button" class="btn btn-ghost" onclick="window.showLibrary()">Back to the library</button>
      </div>
    </section>`;
};

// ── Certificate ────────────────────────────────────────────────────────────
function fillCertificate() {
  const rec = courseRecord(activeCourse);
  const stats = courseStats(activeCourse);
  const cert = rec.certificate || {};
  const name = learnerStore.learnerName || defaultLearnerName;
  document.getElementById('cert-recipient-name').textContent = name;
  document.getElementById('cert-course-name').textContent = activeCourse['dcterms:title'] || 'RobOS course';
  document.getElementById('cert-score').textContent = stats.score === null ? 'No quiz' : `${stats.score}%`;
  document.getElementById('cert-date').textContent = new Date(cert.issuedAt || rec.completedAt || Date.now()).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
  document.getElementById('cert-lessons').textContent = String(stats.lessons);
  document.getElementById('cert-hash').textContent = cert.id || '—';
  document.getElementById('cert-target-app').textContent = activeApp
    ? `Course for ${activeApp['dcterms:title'] || activeApp['@id']} · ${cert.recorded ? 'recorded in your RobOS knowledge graph' : 'saved on this computer'}`
    : (cert.recorded ? 'Recorded in your RobOS knowledge graph' : 'Saved on this computer');
}

window.showCertificateModal = async function() {
  if (!activeCourse) return;
  await ensureCertificate(courseStats(activeCourse));
  const input = document.getElementById('cert-name-input');
  if (input) input.value = learnerStore.learnerName || defaultLearnerName;
  fillCertificate();
  const m = document.getElementById('cert-modal');
  if (m) m.style.display = 'flex';
};

window.onCertificateNameInput = function(v) {
  learnerStore.learnerName = String(v || '').trim();
  persistLearnerStore();
  document.getElementById('cert-recipient-name').textContent = learnerStore.learnerName || defaultLearnerName;
};

window.closeCertificateModal = function() {
  const m = document.getElementById('cert-modal');
  if (m) m.style.display = 'none';
};

window.saveCertificatePdf = async function() {
  const api = bridge();
  const title = (activeCourse && activeCourse['dcterms:title']) || 'course';
  const fileName = `robos-certificate-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 60)}`;
  document.body.classList.add('printing-certificate');
  try {
    if (typeof api.saveCertificatePdf === 'function') {
      const res = await api.saveCertificatePdf({ fileName });
      if (res && res.ok) window.showToast(`Saved ${res.filePath}`, 'success');
      else window.showToast(`Could not save the PDF: ${(res && res.error) || 'unknown error'}`, 'fail');
    } else {
      window.print();
    }
  } finally {
    document.body.classList.remove('printing-certificate');
  }
};

window.exportCourseWebsite = async function() {
  if (!activeCourse) return;
  const btn = document.getElementById('btn-export-web');
  const original = btn ? btn.textContent : '';
  if (btn) btn.textContent = 'Exporting…';
  try {
    const res = await bridge().exportWebsite({
      courseId: courseId(activeCourse),
      appId: activeApp ? activeApp['@id'] : null,
    });
    if (res && res.ok) window.showToast(`Exported the course website to ${res.filePath}`, 'success');
    else window.showToast(`Export failed: ${(res && res.error) || 'unknown error'}`, 'fail');
  } catch (err) {
    window.showToast(`Export failed: ${err.message}`, 'fail');
  } finally {
    if (btn) btn.textContent = original;
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

function resolveGitopsPathForCourse(course, srcInfo) {
  if (!course) return '';
  if (course.resolvedGitopsPath) return course.resolvedGitopsPath;
  const customFile = course['robos:gitopsFile'] || course.gitopsFile;
  if (customFile && customFile.startsWith('/')) return customFile;

  const repoRoot = (srcInfo && srcInfo.repoRoot) || '';
  const inRepo = (rel) => (repoRoot ? `${repoRoot}/${rel}` : rel);
  if (!customFile) return (srcInfo && srcInfo.gitopsPath) || inRepo('.robos/elearning.yaml');

  const rel = customFile.replace(/^\.?\//, '');

  const evidence = [].concat(course['robos:evidence'] || []);
  const ev = evidence.find(e => e && e.repository);
  if (ev && ev.repository) {
    const repoParts = ev.repository.split('/');
    const repoName = repoParts.pop();
    const orgPrefix = repoParts[0]?.toLowerCase();
    // Other repositories are expected next to this checkout.
    const sourceRoot = repoRoot ? repoRoot.replace(/[\\/][^\\/]+$/, '') : '..';
    const candidateRoot = orgPrefix && orgPrefix !== repoName.toLowerCase()
      ? `${sourceRoot}/${orgPrefix}/${repoName}`
      : `${sourceRoot}/${repoName}`;
    return `${candidateRoot}/${rel}`;
  }

  if (course.graphRoot && course.graphRoot.includes('/source/')) {
    const parts = course.graphRoot.split('/knowledge-graphs/');
    if (parts.length > 1) {
      return `${parts[0]}/${rel}`;
    }
  }

  return inRepo(rel);
}

function getCourseAnchorSlug(course) {
  if (!course) return 'course';
  if (course.id && !course.id.startsWith('urn:')) return course.id;
  const rawId = course['@id'] || course.id || '';
  const stripped = rawId.replace(/^urn:[^:]+:(?:elearning|course):/i, '').replace(/^urn:[^:]+:/i, '');
  return stripped || 'course';
}

window.getSlidePath = function(idx) {
  if (!activeCourse) return '';
  const m = (activeCourse['robos:modules'] || [])[idx];
  const gitopsPath = resolveGitopsPathForCourse(activeCourse, sourceInfo);
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
  window.showToast(`Copied file system path: ${fullPath}`, 'success');
  return fullPath;
};

window.copyCoursePath = async function() {
  if (!activeCourse) return '';
  const gitopsPath = resolveGitopsPathForCourse(activeCourse, sourceInfo);
  const courseId = getCourseAnchorSlug(activeCourse);
  const fullPath = `${gitopsPath}#${courseId}`;
  await copyToClipboardText(fullPath);
  window.showToast(`Copied course file system path: ${fullPath}`, 'success');
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
  window.showToast(`Copied Git URL path: ${gitUrl}`, 'success');
};

window.exportSlideAsZip = async function(idx) {
  document.querySelectorAll('.slide-dropdown-menu').forEach(el => el.classList.add('hidden'));
  if (!activeCourse) return;
  const m = (activeCourse['robos:modules'] || [])[idx];
  if (!m) return;

  window.showToast('Packaging slide as offline HTML zip…', 'info');

  try {
    const res = await window.robosELearning.exportSlideZip({
      slide: m,
      course: activeCourse,
      application: activeApp,
      slideIndex: idx,
      totalSlides: (activeCourse['robos:modules'] || []).length,
    });

    if (res && res.ok) {
      window.showToast(`Exported slide as HTML Zip: ${res.filePath || res.filename}`, 'success');

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
      window.showToast(`Export failed: ${(res && res.error) || 'Unknown error'}`, 'fail');
    }
  } catch (err) {
    window.showToast(`Export error: ${err.message}`, 'fail');
  }
};

window.copySlideUri = async function(idx) {
  document.querySelectorAll('.slide-dropdown-menu').forEach(el => el.classList.add('hidden'));
  if (!activeCourse) return;
  const m = (activeCourse['robos:modules'] || [])[idx];
  const uri = `${activeCourse['@id'] || 'urn:robos:elearning'}#${(m && m.id) || ('slide-' + (idx + 1))}`;
  await copyToClipboardText(uri);
  window.showToast(`Copied Slide KGraph URI: ${uri}`, 'success');
};


window.copySlideMarkdown = async function(idx) {
  document.querySelectorAll('.slide-dropdown-menu').forEach(el => el.classList.add('hidden'));
  if (!activeCourse) return;
  const m = modulesOf(activeCourse)[idx];
  if (!m) return;

  const lines = [
    `# ${m.title || 'Lesson ' + (idx + 1)}`,
    `**Course**: ${activeCourse['dcterms:title'] || 'RobOS course'}`,
    `**Duration**: ${m.durationMinutes || 15} min`,
    '',
  ];
  if (m.overview) lines.push(m.overview, '');
  if (m.body) lines.push(m.body, '');
  if (Array.isArray(m.keyPoints) && m.keyPoints.length) {
    lines.push('## Key ideas');
    m.keyPoints.forEach(k => lines.push(`- ${k}`));
    lines.push('');
  }
  if (m.labSteps && m.labSteps.length) {
    lines.push('## Hands-on lab');
    m.labSteps.forEach((s, sIdx) => lines.push(`${sIdx + 1}. ${s}`));
    lines.push('');
  }
  if (m.quiz && m.quiz.length) {
    lines.push('## Check your understanding');
    m.quiz.forEach((q, qIdx) => {
      lines.push(`### Question ${qIdx + 1}: ${q.question}`);
      (q.options || []).forEach(opt => lines.push(`- [${opt === q.answer ? 'x' : ' '}] ${opt}`));
      if (q.explanation) lines.push(`*Why*: ${q.explanation}`);
      lines.push('');
    });
  }
  await copyToClipboardText(lines.join('\n'));
  window.showToast('Copied the lesson as Markdown.', 'success');
};

// ── Course editor ──────────────────────────────────────────────────────────
window.toggleEditorMode = function() {
  isEditorMode = !isEditorMode;
  document.getElementById('app').classList.toggle('editing', isEditorMode);
  const btn = document.getElementById('btn-toggle-editor');
  if (btn) {
    btn.classList.toggle('active', isEditorMode);
    btn.textContent = isEditorMode ? 'Done editing' : 'Edit course';
  }
  const saveBtn = document.getElementById('btn-save-course');
  if (saveBtn) saveBtn.style.display = isEditorMode ? 'inline-flex' : 'none';
  const banner = document.getElementById('editor-banner');
  if (banner) banner.classList.toggle('hidden', !isEditorMode);
  const badge = document.getElementById('editor-indicator-badge');
  if (badge) badge.classList.toggle('hidden', !isEditorMode);
  const addSlideBtn = document.getElementById('btn-add-slide-sidebar');
  if (addSlideBtn) addSlideBtn.style.display = isEditorMode ? 'block' : 'none';
  renderModuleNav();
};

window.openSlideEditor = function(idx) {
  document.querySelectorAll('.slide-dropdown-menu').forEach(el => el.classList.add('hidden'));
  if (!activeCourse) return;
  editingSlideIdx = idx;
  const m = modulesOf(activeCourse)[idx];
  if (!m) return;

  document.getElementById('slide-editor-title').textContent = `Edit lesson ${idx + 1}`;
  document.getElementById('edit-slide-title').value = m.title || '';
  document.getElementById('edit-slide-id').value = m.id || ('mod-' + (idx + 1));
  document.getElementById('edit-slide-duration').value = m.durationMinutes || 15;
  document.getElementById('edit-slide-overview').value = m.overview || '';
  document.getElementById('edit-slide-body').value = m.body || '';
  document.getElementById('edit-slide-keypoints').value = (m.keyPoints || []).join('\n');

  renderEditorLabSteps(m.labSteps || []);
  renderEditorQuizzes(m.quiz || []);

  const modal = document.getElementById('slide-editor-modal');
  if (modal) modal.style.display = 'flex';
  const first = document.getElementById('edit-slide-title');
  if (first) first.focus();
};

window.closeSlideEditor = function() {
  const modal = document.getElementById('slide-editor-modal');
  if (modal) modal.style.display = 'none';
  editingSlideIdx = null;
};

function labStepRow(value) {
  const row = document.createElement('div');
  row.className = 'step-row-edit';
  row.innerHTML = `
    <input type="text" class="form-input editor-lab-step-input" value="${escapeHtml(value)}" placeholder="One thing to do, e.g. Open the App Launcher">
    <button type="button" class="btn btn-ghost btn-xs btn-danger-text" onclick="this.parentElement.remove()" aria-label="Remove step">&times;</button>`;
  return row;
}

function renderEditorLabSteps(steps) {
  const container = document.getElementById('editor-lab-steps-container');
  if (!container) return;
  container.innerHTML = '';
  steps.forEach(step => container.appendChild(labStepRow(step)));
}

window.addEditorLabStep = function() {
  const container = document.getElementById('editor-lab-steps-container');
  if (!container) return;
  const row = labStepRow('');
  container.appendChild(row);
  const input = row.querySelector('input');
  if (input) input.focus();
};

function quizBlock(q, n) {
  const block = document.createElement('div');
  block.className = 'quiz-edit-block';
  const wrong = (q.options || []).filter(o => o !== q.answer);
  block.innerHTML = `
    <div class="quiz-edit-head">
      <strong>Question ${n}</strong>
      <button type="button" class="btn btn-ghost btn-xs btn-danger-text" onclick="this.closest('.quiz-edit-block').remove()">Remove</button>
    </div>
    <input type="text" class="form-input edit-quiz-q" value="${escapeHtml(q.question || '')}" placeholder="The question">
    <label>Right answer</label>
    <input type="text" class="form-input edit-quiz-ans" value="${escapeHtml(q.answer || '')}" placeholder="The right answer">
    <label>Wrong answers <small>(one per line)</small></label>
    <textarea class="form-textarea edit-quiz-opts" rows="3" placeholder="A believable wrong answer">${escapeHtml(wrong.join('\n'))}</textarea>
    <label>Why the right answer is right</label>
    <input type="text" class="form-input edit-quiz-exp" value="${escapeHtml(q.explanation || '')}" placeholder="Shown after the learner answers">`;
  return block;
}

function renderEditorQuizzes(quizzes) {
  const container = document.getElementById('editor-quizzes-container');
  if (!container) return;
  container.innerHTML = '';
  quizzes.forEach((q, qIdx) => container.appendChild(quizBlock(q, qIdx + 1)));
}

window.addEditorQuizQuestion = function() {
  const container = document.getElementById('editor-quizzes-container');
  if (!container) return;
  container.appendChild(quizBlock({ question: '', answer: '', options: [], explanation: '' }, container.children.length + 1));
};

window.saveSlideEditor = function() {
  if (editingSlideIdx === null || !activeCourse) return;
  const m = modulesOf(activeCourse)[editingSlideIdx];
  if (!m) return;

  m.title = document.getElementById('edit-slide-title').value.trim() || m.title;
  m.id = document.getElementById('edit-slide-id').value.trim() || m.id;
  m.durationMinutes = parseInt(document.getElementById('edit-slide-duration').value, 10) || 15;
  m.overview = document.getElementById('edit-slide-overview').value;
  const body = document.getElementById('edit-slide-body').value;
  if (body.trim()) m.body = body; else delete m.body;
  const keyPoints = document.getElementById('edit-slide-keypoints').value.split('\n').map(s => s.trim()).filter(Boolean);
  if (keyPoints.length) m.keyPoints = keyPoints; else delete m.keyPoints;

  m.labSteps = Array.from(document.querySelectorAll('.editor-lab-step-input')).map(i => i.value.trim()).filter(Boolean);
  m.quiz = Array.from(document.querySelectorAll('.quiz-edit-block')).map(b => {
    const question = b.querySelector('.edit-quiz-q').value.trim();
    const answer = b.querySelector('.edit-quiz-ans').value.trim();
    const wrong = b.querySelector('.edit-quiz-opts').value.split('\n').map(s => s.trim()).filter(s => s && s !== answer);
    const explanation = b.querySelector('.edit-quiz-exp').value.trim();
    const q = { question, answer, options: [answer, ...wrong] };
    if (explanation) q.explanation = explanation;
    return q;
  }).filter(q => q.question && q.answer);

  const idx = editingSlideIdx;
  window.closeSlideEditor();
  renderModule(idx);
  window.showToast(`Updated "${cleanLessonTitle(m.title)}". Save the course to keep it.`, 'success');
};

window.addNewSlide = function(targetIdx) {
  if (!activeCourse) return;
  document.querySelectorAll('.slide-dropdown-menu').forEach(el => el.classList.add('hidden'));
  if (!Array.isArray(activeCourse['robos:modules'])) activeCourse['robos:modules'] = [];
  const mods = activeCourse['robos:modules'];
  const insertIdx = (typeof targetIdx === 'number' && targetIdx >= 0) ? targetIdx : mods.length;
  mods.splice(insertIdx, 0, {
    id: `mod-${Date.now().toString(36).slice(-5)}`,
    title: 'New lesson',
    durationMinutes: 10,
    overview: 'What this lesson teaches and why it matters.',
    labSteps: [],
    quiz: [],
  });
  if (!isEditorMode) window.toggleEditorMode();
  renderModule(insertIdx);
  window.openSlideEditor(insertIdx);
};

window.deleteSlide = function(idx) {
  document.querySelectorAll('.slide-dropdown-menu').forEach(el => el.classList.add('hidden'));
  if (!activeCourse) return;
  const mods = modulesOf(activeCourse);
  if (mods.length <= 1) {
    window.showToast('A course needs at least one lesson.', 'fail');
    return;
  }
  const title = cleanLessonTitle(mods[idx] && mods[idx].title) || `Lesson ${idx + 1}`;
  if (!confirm(`Delete the lesson "${title}"?`)) return;
  mods.splice(idx, 1);
  renderModule(Math.max(0, Math.min(idx, mods.length - 1)));
  window.showToast(`Deleted "${title}". Save the course to keep the change.`, 'info');
};

window.saveCurrentCourse = async function() {
  if (!activeCourse) return;
  window.showToast('Saving the course…', 'info');
  try {
    const res = await bridge().saveCourse(activeCourse);
    if (res && res.ok) {
      courseList = courseList.map(c => (c.id === courseId(activeCourse) ? summarizeCourse(activeCourse) : c));
      window.showToast('Saved to the knowledge graph and .robos/elearning.yaml.', 'success');
    } else {
      window.showToast(`Save failed: ${(res && res.error) || 'unknown error'}`, 'fail');
    }
  } catch (err) {
    window.showToast(`Save failed: ${err.message}`, 'fail');
  }
};

// ── Zoom Management & Visual Indicator (Ctrl +, Ctrl -, Ctrl 0) ───────────
let currentZoomFactor = 1.0;
let zoomIndicatorTimeout = null;

function showZoomIndicator(factor) {
  currentZoomFactor = Math.min(3.0, Math.max(0.5, Math.round(Number(factor) * 10) / 10));
  let indicator = document.getElementById('zoom-indicator');
  if (!indicator) {
    indicator = document.createElement('div');
    indicator.id = 'zoom-indicator';
    indicator.className = 'zoom-indicator';
    document.body.appendChild(indicator);
  }
  const pct = Math.round(currentZoomFactor * 100);
  indicator.textContent = `Zoom ${pct}%`;
  indicator.classList.add('visible');

  if (zoomIndicatorTimeout) clearTimeout(zoomIndicatorTimeout);
  zoomIndicatorTimeout = setTimeout(() => {
    indicator.classList.remove('visible');
  }, 1200);
}

async function zoomIn() {
  if (window.robosELearning && typeof window.robosELearning.zoomIn === 'function') {
    const next = await window.robosELearning.zoomIn();
    showZoomIndicator(next);
    return next;
  }
  const next = Math.min(3.0, Math.round((currentZoomFactor + 0.1) * 10) / 10);
  document.body.style.zoom = next;
  showZoomIndicator(next);
  return next;
}

async function zoomOut() {
  if (window.robosELearning && typeof window.robosELearning.zoomOut === 'function') {
    const next = await window.robosELearning.zoomOut();
    showZoomIndicator(next);
    return next;
  }
  const next = Math.max(0.5, Math.round((currentZoomFactor - 0.1) * 10) / 10);
  document.body.style.zoom = next;
  showZoomIndicator(next);
  return next;
}

async function zoomReset() {
  if (window.robosELearning && typeof window.robosELearning.zoomReset === 'function') {
    const next = await window.robosELearning.zoomReset();
    showZoomIndicator(next);
    return next;
  }
  currentZoomFactor = 1.0;
  document.body.style.zoom = '1.0';
  showZoomIndicator(1.0);
  return 1.0;
}

function initZoomControls() {
  if (window.robosELearning && typeof window.robosELearning.onZoomChanged === 'function') {
    window.robosELearning.onZoomChanged((factor) => {
      showZoomIndicator(factor);
    });
  }

  // Keyboard shortcut listener for web/fallback mode and direct browser usage
  window.addEventListener('keydown', async (e) => {
    if (!(e.ctrlKey || e.metaKey)) return;

    const isPlus = e.key === '=' || e.key === '+' || e.code === 'NumpadAdd' || e.code === 'Equal';
    const isMinus = e.key === '-' || e.key === '_' || e.code === 'NumpadSubtract' || e.code === 'Minus';
    const isZero = e.key === '0' || e.code === 'Digit0' || e.code === 'Numpad0';

    if (isPlus) {
      e.preventDefault();
      await zoomIn();
    } else if (isMinus) {
      e.preventDefault();
      await zoomOut();
    } else if (isZero) {
      e.preventDefault();
      await zoomReset();
    }
  });

  // Ctrl + Mouse Wheel Zoom
  window.addEventListener('wheel', async (e) => {
    if (!e.ctrlKey) return;
    e.preventDefault();
    if (e.deltaY < 0) {
      await zoomIn();
    } else if (e.deltaY > 0) {
      await zoomOut();
    }
  }, { passive: false });
}

window.zoomIn = zoomIn;
window.zoomOut = zoomOut;
window.zoomReset = zoomReset;
window.showZoomIndicator = showZoomIndicator;

