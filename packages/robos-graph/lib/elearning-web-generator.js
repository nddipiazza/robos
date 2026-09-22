'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/**
 * Generate a standalone, interactive website version of an eLearning course
 * and its living documentation for publication to GitHub Pages or standalone browsing.
 *
 * @param {import('./graph-store').SDLCKnowledgeGraphStore} store
 * @param {Object} options
 * @returns {Object} { ok: boolean, filePath: string, permalink: string, course: Object, application: Object }
 */
function generateELearningWebsite(store, options = {}) {
  const courseId = options.courseId || options.appId || 'robos-crpg';
  let course = null;

  if (courseId) {
    course = store.findELearning ? store.findELearning(courseId) : null;
    if (!course) course = store.getNode(courseId);
  }

  let appNode = null;
  if (course && course['robos:targetApplication']) {
    appNode = store.getNode(course['robos:targetApplication']);
  }
  if (!appNode && (options.appId || courseId)) {
    appNode = store.findApplicationNode(options.appId || courseId);
  }
  if (!course && appNode && appNode['robos:hasELearning']) {
    const cId = Array.isArray(appNode['robos:hasELearning']) ? appNode['robos:hasELearning'][0] : appNode['robos:hasELearning'];
    course = store.getNode(cId) || (store.findELearning ? store.findELearning(cId) : null);
  }

  // Fallback to local repo graph if present and course not yet found
  if (!course) {
    const repoGraph = path.join(process.cwd(), '.robos', 'knowledge-graph.jsonld');
    if (fs.existsSync(repoGraph) && store.filePath !== repoGraph) {
      try {
        const repoStore = new store.constructor({ filePath: repoGraph, rootDir: path.dirname(repoGraph) });
        course = repoStore.findELearning ? repoStore.findELearning(courseId) : null;
        if (!course) course = repoStore.getNode(courseId);
        if (course && !appNode && course['robos:targetApplication']) {
          appNode = repoStore.getNode(course['robos:targetApplication']);
        }
      } catch {}
    }
  }

  if (!course) {
    return { ok: false, error: `Course not found in Knowledge Graph: ${courseId}` };
  }

  const courseSlug = (course['@id'] || courseId).replace(/.*:/, '').toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const isCrpg = courseSlug.includes('crpg') || (course['dcterms:title'] || '').toLowerCase().includes('crpg');

  const permalink = options.permalink || (isCrpg ? '/elearning/robos-crpg-engine' : `/elearning/${courseSlug}`);
  const outputFileName = isCrpg ? 'robos-crpg-engine.html' : `${courseSlug}.html`;
  const defaultOutputPath = path.join(process.cwd(), 'docs', 'elearning', outputFileName);
  const outputPath = options.outputFilePath || defaultOutputPath;

  // Resolve living documentation markdown file
  let docMarkdown = '';
  const candidateDocPaths = [
    options.docFilePath,
    isCrpg ? path.join(process.cwd(), 'docs', 'projects', 'crpg-realm', 'elearning-masterclass.md') : null,
    appNode && appNode['robos:hasDocumentationPage'] ? (store.getNode(appNode['robos:hasDocumentationPage']) || {})['robos:docPath'] : null,
    path.join(process.cwd(), 'docs', 'applications', `${courseSlug}.md`),
  ].filter(Boolean);

  for (const dp of candidateDocPaths) {
    const absPath = path.isAbsolute(dp) ? dp : path.join(process.cwd(), dp);
    if (fs.existsSync(absPath)) {
      try {
        docMarkdown = fs.readFileSync(absPath, 'utf8');
        break;
      } catch {}
    }
  }

  const appTitle = appNode ? (appNode['dcterms:title'] || 'Application') : 'Tactical cRPG Realm of Heroes';
  const courseTitle = options.title || course['dcterms:title'] || `${appTitle} Masterclass`;
  const courseTopic = course['robos:topic'] || `${appTitle} Systems Architecture`;
  const courseDifficulty = course['robos:difficulty'] || 'Advanced';
  const courseDuration = course['robos:estimatedDuration'] || '60 minutes';
  const courseDesc = course['dcterms:description'] || '';
  const modules = course['robos:modules'] || [];

  // Build the complete standalone HTML page
  const htmlContent = buildStandaloneHtml({
    course,
    appNode,
    courseSlug,
    courseTitle,
    courseTopic,
    courseDifficulty,
    courseDuration,
    courseDesc,
    modules,
    permalink,
    docMarkdown,
    isCrpg,
  });

  // Ensure target directories exist
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, htmlContent, 'utf8');

  // Also write directory index if requested or auto-publishing to docs
  let indexFilePath = null;
  if (options.autoPublishPages !== false) {
    const dirPath = path.join(path.dirname(outputPath), path.basename(outputPath, '.html'));
    indexFilePath = path.join(dirPath, 'index.html');
    fs.mkdirSync(dirPath, { recursive: true });
    fs.writeFileSync(indexFilePath, htmlContent, 'utf8');
  }

  return {
    ok: true,
    filePath: outputPath,
    indexFilePath,
    permalink,
    course,
    application: appNode,
    message: `Standalone interactive eLearning website generated at ${outputPath} (permalink: ${permalink}).`,
  };
}

/**
 * Build the complete self-contained HTML document with Jekyll frontmatter,
 * responsive dark navy/cyan styling, interactive player, living docs, and certificate modal.
 */
function buildStandaloneHtml(params) {
  const {
    course,
    appNode,
    courseSlug,
    courseTitle,
    courseTopic,
    courseDifficulty,
    courseDuration,
    courseDesc,
    modules,
    permalink,
    docMarkdown,
    isCrpg,
  } = params;

  const appTitle = appNode ? (appNode['dcterms:title'] || 'Application') : 'Tactical cRPG Realm of Heroes';
  const appTech = (appNode && (appNode['robos:technology'] || appNode['robos:desktopFramework'] || appNode['robos:frontendFramework'])) || 'Godot 4.3 / D&D 5e SRD';

  // Serialize course and modules JSON for client-side state
  const serializedCourse = JSON.stringify(course);
  const serializedModules = JSON.stringify(modules);
  const serializedApp = JSON.stringify(appNode || {});

  // Parse markdown documentation into structured sections
  const docHtml = parseLivingDocMarkdown(docMarkdown);

  return `---
layout: null
title: "RobOS eLearning — ${courseTitle.replace(/"/g, '\\"')}"
permalink: ${permalink}
redirect_from:
  - ${permalink}.html
  - ${permalink}/
---
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${courseTitle} — RobOS Interactive eLearning</title>
  <link rel="icon" type="image/x-icon" href="/assets/images/favicon.ico">

  <!-- Open Graph / Meta -->
  <meta name="description" content="${(courseDesc || '').replace(/"/g, '&quot;')}">
  <meta property="og:title" content="${courseTitle.replace(/"/g, '&quot;')}">
  <meta property="og:description" content="${(courseDesc || '').replace(/"/g, '&quot;')}">
  <meta property="og:type" content="article">
  <meta property="og:image" content="/assets/images/crpg-realm/village_square_overview.png">

  <!-- Mermaid.js for Interactive Diagrams -->
  <script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></script>

  <style>
    :root {
      --bg-primary: #0d1117;
      --bg-surface: #161b22;
      --bg-surface-hover: #21262d;
      --bg-card: #1c2128;
      --accent: #00bcd4;
      --accent-glow: rgba(0, 188, 212, 0.25);
      --accent-cyan: #38bdf8;
      --border: #30363d;
      --border-accent: rgba(0, 188, 212, 0.4);
      --text: #c9d1d9;
      --text-muted: #8b949e;
      --text-bright: #f0f6fc;
      --success: #2ea043;
      --success-glow: rgba(46, 160, 67, 0.2);
      --purple: #a371f7;
      --purple-glow: rgba(163, 113, 247, 0.2);
      --gold: #f1e05a;
      --gold-border: #d29922;
      --danger: #f85149;
      --danger-bg: rgba(248, 81, 73, 0.15);
      --radius-sm: 6px;
      --radius-md: 8px;
      --radius-lg: 12px;
      --font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
      --font-mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace;
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body {
      background: var(--bg-primary);
      color: var(--text);
      font-family: var(--font-sans);
      font-size: 14px;
      line-height: 1.6;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      overflow-x: hidden;
    }

    /* Top Brand Bar */
    .top-nav {
      background: #090d13;
      border-bottom: 1px solid var(--border);
      padding: 8px 24px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 12px;
    }
    .top-nav-left, .top-nav-right {
      display: flex;
      align-items: center;
      gap: 18px;
    }
    .brand-link {
      color: var(--accent-cyan);
      text-decoration: none;
      font-weight: 700;
      display: flex;
      align-items: center;
      gap: 8px;
      letter-spacing: 0.5px;
    }
    .brand-link:hover { text-decoration: underline; }
    .brand-badge {
      background: rgba(56, 189, 248, 0.15);
      border: 1px solid rgba(56, 189, 248, 0.3);
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 10px;
      text-transform: uppercase;
    }
    .top-link {
      color: var(--text-muted);
      text-decoration: none;
      transition: color 0.15s;
    }
    .top-link:hover { color: var(--text-bright); }

    /* App Header */
    .app-header {
      background: var(--bg-surface);
      border-bottom: 1px solid var(--border);
      padding: 16px 24px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 16px;
    }
    .header-left {
      display: flex;
      align-items: center;
      gap: 16px;
    }
    .app-icon {
      font-size: 32px;
      background: var(--accent-glow);
      padding: 8px 12px;
      border-radius: var(--radius-md);
      border: 1px solid var(--accent);
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .header-left h1 {
      font-size: 20px;
      font-weight: 700;
      color: var(--text-bright);
      margin-bottom: 4px;
    }
    .course-meta {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }
    .badge {
      padding: 3px 8px;
      border-radius: 12px;
      font-size: 11px;
      font-weight: 600;
      display: inline-flex;
      align-items: center;
      gap: 4px;
    }
    .badge-tech { background: rgba(56, 189, 248, 0.15); color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.3); }
    .badge-difficulty { background: rgba(163, 113, 247, 0.15); color: var(--purple); border: 1px solid rgba(163, 113, 247, 0.3); }
    .badge-duration { background: rgba(240, 246, 252, 0.08); color: var(--text); border: 1px solid var(--border); }
    .badge-scorm { background: rgba(46, 160, 67, 0.15); color: #3fb950; border: 1px solid rgba(46, 160, 67, 0.3); }
    .badge-shacl { background: rgba(241, 224, 90, 0.15); color: var(--gold); border: 1px solid var(--gold-border); }

    /* Header Right: Mode Tabs & Progress */
    .header-right {
      display: flex;
      align-items: center;
      gap: 20px;
      flex-wrap: wrap;
    }
    .mode-tabs {
      display: flex;
      background: var(--bg-primary);
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
      padding: 3px;
      gap: 3px;
    }
    .tab-btn {
      background: transparent;
      border: none;
      color: var(--text-muted);
      padding: 6px 14px;
      border-radius: var(--radius-sm);
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 6px;
      transition: all 0.2s;
    }
    .tab-btn:hover { color: var(--text-bright); background: var(--bg-surface-hover); }
    .tab-btn.active {
      background: var(--accent);
      color: #0d1117;
      box-shadow: 0 0 10px var(--accent-glow);
    }
    .progress-container {
      min-width: 180px;
    }
    .progress-label {
      font-size: 11px;
      color: var(--text-muted);
      margin-bottom: 4px;
      display: flex;
      justify-content: space-between;
    }
    .progress-bar-bg {
      width: 100%;
      height: 8px;
      background: #21262d;
      border-radius: 4px;
      overflow: hidden;
      border: 1px solid rgba(255,255,255,0.05);
    }
    .progress-bar-fill {
      height: 100%;
      background: linear-gradient(90deg, #00bcd4, #2ea043);
      transition: width 0.3s ease;
    }

    /* App Body */
    .app-body {
      display: grid;
      grid-template-columns: 340px 1fr;
      flex: 1;
      min-height: calc(100vh - 120px);
    }
    @media (max-width: 960px) {
      .app-body { grid-template-columns: 1fr; }
    }

    /* Sidebar */
    .sidebar {
      background: #11151c;
      border-right: 1px solid var(--border);
      padding: 20px 16px;
      display: flex;
      flex-direction: column;
      gap: 20px;
    }
    .sidebar h3 {
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.8px;
      color: var(--text-muted);
      padding-left: 8px;
    }
    .module-list {
      list-style: none;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .module-item {
      padding: 12px 14px;
      border-radius: var(--radius-md);
      cursor: pointer;
      border: 1px solid transparent;
      background: var(--bg-surface);
      transition: all 0.2s;
      position: relative;
    }
    .module-item:hover {
      background: var(--bg-surface-hover);
      border-color: var(--border);
    }
    .module-item.active {
      background: rgba(0, 188, 212, 0.12);
      border-color: var(--accent);
      box-shadow: 0 0 12px rgba(0, 188, 212, 0.15);
    }
    .module-item.completed::after {
      content: '✓';
      position: absolute;
      top: 12px;
      right: 12px;
      color: var(--success);
      font-weight: 700;
      font-size: 14px;
    }
    .module-item-title {
      font-size: 13px;
      font-weight: 600;
      color: var(--text-bright);
      margin-bottom: 4px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .module-item-meta {
      font-size: 11px;
      color: var(--text-muted);
      display: flex;
      gap: 12px;
    }

    /* Certificate Status Box */
    .cert-status-box {
      background: linear-gradient(145deg, rgba(22, 27, 34, 0.9), rgba(13, 17, 23, 0.95));
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .cert-status-box.unlocked {
      border-color: var(--gold-border);
      box-shadow: 0 0 15px rgba(241, 224, 90, 0.15);
    }
    .cert-status-box h4 {
      color: var(--gold);
      font-size: 13px;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .cert-status-box p {
      font-size: 12px;
      color: var(--text-muted);
    }
    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 8px 16px;
      border-radius: var(--radius-sm);
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      border: 1px solid transparent;
      transition: all 0.2s ease;
      text-decoration: none;
    }
    .btn-primary {
      background: var(--accent);
      color: #0d1117;
      border-color: var(--accent);
    }
    .btn-primary:hover {
      filter: brightness(1.1);
      box-shadow: 0 0 10px var(--accent-glow);
    }
    .btn-gold {
      background: var(--gold);
      color: #0d1117;
      border-color: var(--gold-border);
      font-weight: 700;
    }
    .btn-gold:hover {
      filter: brightness(1.15);
      box-shadow: 0 0 12px rgba(241, 224, 90, 0.4);
    }
    .btn-outline {
      background: transparent;
      color: var(--text);
      border-color: var(--border);
    }
    .btn-outline:hover {
      background: var(--bg-surface-hover);
      border-color: var(--text-muted);
    }
    .btn-sm {
      padding: 4px 10px;
      font-size: 11px;
    }

    /* Content Panel */
    .content-panel {
      padding: 28px 36px;
      overflow-y: auto;
      max-width: 1200px;
    }

    /* Module Card */
    .module-card {
      background: var(--bg-surface);
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
      padding: 24px;
      margin-bottom: 24px;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
    }
    .module-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 12px;
      border-bottom: 1px solid var(--border);
      padding-bottom: 14px;
    }
    .module-header h2 {
      font-size: 20px;
      color: var(--text-bright);
    }
    .module-overview {
      color: var(--text);
      font-size: 14px;
      margin-bottom: 20px;
      line-height: 1.6;
    }

    /* Technical Deep Dive within Module */
    .tech-deepdive {
      background: var(--bg-primary);
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
      padding: 16px 20px;
      margin-bottom: 24px;
    }
    .tech-deepdive h4 {
      color: var(--accent-cyan);
      font-size: 13px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 10px;
    }

    /* Section Title */
    .section-title {
      font-size: 15px;
      font-weight: 700;
      color: var(--text-bright);
      margin: 24px 0 12px;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    /* Lab Steps */
    .lab-steps {
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin-bottom: 24px;
    }
    .lab-step {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      background: var(--bg-primary);
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      padding: 12px 16px;
      transition: border-color 0.2s;
    }
    .lab-step:hover { border-color: var(--border-accent); }
    .lab-checkbox {
      width: 18px;
      height: 18px;
      accent-color: var(--accent);
      cursor: pointer;
      margin-top: 2px;
    }
    .lab-step-text {
      flex: 1;
      font-size: 13px;
      cursor: pointer;
    }
    .lab-step-text code {
      background: #21262d;
      padding: 2px 6px;
      border-radius: 4px;
      font-family: var(--font-mono);
      font-size: 12px;
      color: var(--accent-cyan);
    }

    /* Quizzes */
    .quiz-section {
      background: var(--bg-primary);
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
      padding: 20px;
      margin-bottom: 24px;
      display: flex;
      flex-direction: column;
      gap: 20px;
    }
    .quiz-card {
      border-bottom: 1px solid rgba(255,255,255,0.05);
      padding-bottom: 16px;
    }
    .quiz-card:last-child { border-bottom: none; padding-bottom: 0; }
    .quiz-q {
      font-size: 14px;
      font-weight: 600;
      color: var(--text-bright);
      margin-bottom: 12px;
    }
    .quiz-options {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .quiz-opt {
      display: flex;
      align-items: center;
      gap: 10px;
      background: var(--bg-surface);
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      padding: 10px 14px;
      cursor: pointer;
      font-size: 13px;
      transition: all 0.15s;
    }
    .quiz-opt:hover {
      background: var(--bg-surface-hover);
      border-color: var(--accent);
    }
    .quiz-opt input[type="radio"] {
      accent-color: var(--accent);
      cursor: pointer;
    }
    .quiz-feedback {
      margin-top: 10px;
      padding: 10px 14px;
      border-radius: var(--radius-sm);
      font-size: 12px;
      display: none;
    }
    .quiz-feedback.pass {
      display: block;
      background: rgba(46, 160, 67, 0.15);
      border: 1px solid var(--success);
      color: #3fb950;
    }
    .quiz-feedback.fail {
      display: block;
      background: var(--danger-bg);
      border: 1px solid var(--danger);
      color: #ff7b72;
    }

    /* Module Action Footer */
    .module-actions {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-top: 24px;
      border-top: 1px solid var(--border);
      padding-top: 16px;
      flex-wrap: wrap;
      gap: 12px;
    }

    /* Markdown Documentation Panel */
    .doc-article {
      background: var(--bg-surface);
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
      padding: 32px 40px;
      max-width: 1080px;
      margin: 0 auto;
    }
    .doc-article h1 { font-size: 26px; color: var(--text-bright); margin-bottom: 12px; }
    .doc-article h2 { font-size: 20px; color: var(--text-bright); margin: 32px 0 16px; border-bottom: 1px solid var(--border); padding-bottom: 8px; }
    .doc-article h3 { font-size: 16px; color: var(--accent-cyan); margin: 24px 0 10px; }
    .doc-article p { margin-bottom: 16px; line-height: 1.7; }
    .doc-article ul, .doc-article ol { margin-left: 24px; margin-bottom: 16px; }
    .doc-article li { margin-bottom: 6px; }
    .doc-article blockquote {
      border-left: 4px solid var(--accent);
      background: rgba(0, 188, 212, 0.08);
      padding: 12px 18px;
      border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
      margin-bottom: 20px;
      color: var(--text-bright);
    }
    .doc-article table {
      width: 100%;
      border-collapse: collapse;
      margin: 20px 0;
      font-size: 13px;
    }
    .doc-article th, .doc-article td {
      border: 1px solid var(--border);
      padding: 10px 14px;
      text-align: left;
    }
    .doc-article th {
      background: #21262d;
      color: var(--text-bright);
    }
    .doc-article tr:nth-child(even) {
      background: rgba(255, 255, 255, 0.02);
    }
    .doc-article pre {
      background: #090d13;
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
      padding: 16px;
      overflow-x: auto;
      font-family: var(--font-mono);
      font-size: 12px;
      margin: 16px 0;
    }
    .doc-article code {
      font-family: var(--font-mono);
      background: #21262d;
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 12px;
      color: var(--accent-cyan);
    }
    .doc-figure {
      margin: 24px 0;
      text-align: center;
    }
    .doc-img {
      max-width: 100%;
      height: auto;
      border-radius: var(--radius-md);
      border: 1px solid var(--border);
      box-shadow: 0 4px 24px rgba(0,0,0,0.5);
      cursor: pointer;
      transition: transform 0.2s ease;
    }
    .doc-img:hover { transform: scale(1.01); border-color: var(--accent); }
    .doc-caption {
      font-size: 12px;
      color: var(--text-muted);
      margin-top: 8px;
      font-style: italic;
    }
    .formula-box {
      background: #090d13;
      border: 1px solid rgba(0, 188, 212, 0.3);
      border-radius: var(--radius-md);
      padding: 14px 20px;
      margin: 16px 0;
      font-family: var(--font-mono);
      color: var(--accent-cyan);
      font-size: 13px;
    }

    /* Mermaid Container */
    .mermaid {
      background: #090d13 !important;
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
      padding: 20px;
      margin: 20px 0;
      display: flex;
      justify-content: center;
    }

    /* Modal Styles */
    .modal-overlay {
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0, 0, 0, 0.85);
      backdrop-filter: blur(4px);
      display: none;
      align-items: center;
      justify-content: center;
      z-index: 1000;
      padding: 20px;
    }
    .modal-overlay.active { display: flex; }
    .modal-card {
      background: var(--bg-surface);
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
      max-width: 800px;
      width: 100%;
      max-height: 90vh;
      overflow-y: auto;
      box-shadow: 0 10px 40px rgba(0, 0, 0, 0.8);
      position: relative;
    }
    .modal-close {
      position: absolute;
      top: 16px;
      right: 16px;
      background: transparent;
      border: none;
      color: var(--text-muted);
      font-size: 22px;
      cursor: pointer;
    }
    .modal-close:hover { color: var(--text-bright); }

    /* Certificate Modal Layout */
    .cert-frame {
      border: 3px double var(--gold-border);
      margin: 24px;
      padding: 40px 32px;
      background: radial-gradient(circle at center, #161f2e 0%, #0d1117 100%);
      border-radius: var(--radius-md);
      text-align: center;
      position: relative;
    }
    .cert-frame::before {
      content: '';
      position: absolute;
      top: 6px; left: 6px; right: 6px; bottom: 6px;
      border: 1px solid rgba(241, 224, 90, 0.25);
      pointer-events: none;
    }
    .cert-badge {
      display: inline-block;
      background: rgba(241, 224, 90, 0.15);
      color: var(--gold);
      border: 1px solid var(--gold-border);
      padding: 4px 14px;
      border-radius: 20px;
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 1px;
      margin-bottom: 16px;
    }
    .cert-frame h2 {
      font-size: 26px;
      font-weight: 800;
      color: var(--gold);
      letter-spacing: 2px;
      margin-bottom: 6px;
    }
    .cert-sub {
      font-size: 12px;
      color: var(--text-muted);
      margin-bottom: 24px;
    }
    .cert-recipient {
      font-size: 28px;
      font-weight: 700;
      color: var(--text-bright);
      border-bottom: 2px solid var(--accent);
      display: inline-block;
      padding: 0 20px 4px;
      margin: 8px 0 16px;
    }
    .cert-course-name {
      font-size: 18px;
      font-weight: 600;
      color: var(--accent-cyan);
      margin-bottom: 24px;
    }
    .cert-meta-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 12px;
      text-align: left;
      background: rgba(0, 0, 0, 0.4);
      padding: 16px 20px;
      border-radius: var(--radius-sm);
      border: 1px solid var(--border);
      margin: 0 auto 24px;
      max-width: 580px;
      font-size: 12px;
    }
    .cert-meta-grid code {
      color: var(--gold);
      font-family: var(--font-mono);
      font-size: 11px;
    }
    .cert-footer {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-top: 20px;
      padding-top: 16px;
      border-top: 1px solid rgba(255,255,255,0.08);
      flex-wrap: wrap;
      gap: 12px;
    }
    .cert-seal {
      font-size: 11px;
      color: var(--text-muted);
      display: flex;
      align-items: center;
      gap: 6px;
    }

    /* Lightbox Modal */
    .lightbox-content {
      max-width: 95vw;
      max-height: 90vh;
      text-align: center;
      padding: 16px;
    }
    .lightbox-img {
      max-width: 100%;
      max-height: 80vh;
      border-radius: var(--radius-md);
      border: 1px solid var(--border);
      box-shadow: 0 0 30px rgba(0, 188, 212, 0.3);
    }
    .lightbox-caption {
      margin-top: 12px;
      color: var(--text-bright);
      font-size: 14px;
    }

    /* Print Styles */
    @media print {
      body * { visibility: hidden; }
      #cert-modal, #cert-modal * { visibility: visible; }
      #cert-modal {
        position: absolute;
        left: 0; top: 0;
        width: 100%; height: 100%;
        background: #fff;
        color: #000;
      }
      .modal-card { box-shadow: none; border: none; }
      .cert-frame { border: 4px double #333; background: #fff; color: #000; }
      .cert-frame h2, .cert-recipient, .cert-course-name { color: #000 !important; }
      .cert-footer, .modal-close { display: none !important; }
    }
  </style>
</head>
<body>

  <!-- Top Universal Brand Nav -->
  <nav class="top-nav">
    <div class="top-nav-left">
      <a href="https://rowbose.com/" class="brand-link">
        <span>⬡</span>
        <strong>RobOS</strong>
        <span class="brand-badge">eLearning Hub</span>
      </a>
      <span style="color: var(--border);">|</span>
      <a href="/projects/crpg-realm/" class="top-link">⚔️ cRPG Realm Project</a>
      <a href="/projects/crpg-realm/elearning-masterclass.html" class="top-link">📖 Living Architecture Guide</a>
    </div>
    <div class="top-nav-right">
      <a href="https://github.com/nddipiazza/robos" target="_blank" rel="noopener" class="top-link">⭐ GitHub</a>
      <a href="https://discord.gg/6PjxzkHujE" target="_blank" rel="noopener" class="top-link">💬 Discord</a>
    </div>
  </nav>

  <!-- App Header -->
  <header class="app-header">
    <div class="header-left">
      <div class="app-icon">🎓</div>
      <div>
        <h1 id="course-title">${courseTitle}</h1>
        <div class="course-meta">
          <span class="badge badge-tech">${appTech}</span>
          <span class="badge badge-difficulty">${courseDifficulty}</span>
          <span class="badge badge-duration">⏱️ ${courseDuration}</span>
          <span class="badge badge-scorm">SCORM 2004 Verified</span>
          <span class="badge badge-shacl">W3C SHACL Conforming</span>
        </div>
      </div>
    </div>
    <div class="header-right">
      <!-- Mode View Tabs -->
      <div class="mode-tabs">
        <button class="tab-btn active" id="btn-tab-course" onclick="switchView('course')">
          <span>🎓</span> Course & Labs
        </button>
        <button class="tab-btn" id="btn-tab-doc" onclick="switchView('doc')">
          <span>📖</span> Full Specification
        </button>
        <button class="tab-btn" id="btn-tab-cert" onclick="openCertificateModal()">
          <span>🏆</span> Credential
        </button>
      </div>

      <!-- Course Progress -->
      <div class="progress-container">
        <div class="progress-label">
          <span>Progress</span>
          <strong id="progress-percent">0%</strong>
        </div>
        <div class="progress-bar-bg">
          <div class="progress-bar-fill" id="progress-bar-fill" style="width: 0%;"></div>
        </div>
      </div>
    </div>
  </header>

  <!-- App Body Layout -->
  <div class="app-body">
    <!-- Sidebar Navigation -->
    <aside class="sidebar">
      <h3>Curriculum Modules</h3>
      <ul class="module-list" id="module-nav-list">
        ${modules.map((m, idx) => `
          <li class="module-item \${idx === 0 ? 'active' : ''}" id="nav-mod-\${idx}" onclick="selectModule(\${idx})">
            <div class="module-item-title">
              <span>\${idx + 1}. \${m.title ? m.title.replace(/^Module \\d+:\\s*/i, '') : 'Module ' + (idx + 1)}</span>
            </div>
            <div class="module-item-meta">
              <span>⏱️ \${m.durationMinutes || 15} mins</span>
              <span>🧪 \${(m.labSteps || []).length} labs</span>
              <span>📝 \${(m.quiz || []).length} quiz</span>
            </div>
          </li>
        `).join('')}
      </ul>

      <!-- Completion Certificate Summary Box -->
      <div class="cert-status-box" id="cert-status-box">
        <h4>🏆 Completion Credential</h4>
        <p id="cert-status-text">Complete all 5 modules and score &ge; 80% on knowledge checks to claim your verified Knowledge Graph Credential.</p>
        <button class="btn btn-gold" id="btn-claim-cert" onclick="openCertificateModal()" style="display: none;">Claim Certificate</button>
      </div>

      <!-- Fast Utilities -->
      <div style="display: flex; gap: 8px;">
        <button class="btn btn-outline btn-sm" onclick="completeAllLabs()" style="flex: 1;">Check All Labs</button>
        <button class="btn btn-outline btn-sm" onclick="resetProgress()" title="Reset stored progress">Reset</button>
      </div>
    </aside>

    <!-- Main Content Area -->
    <main class="content-panel">

      <!-- VIEW 1: Interactive Course & Labs -->
      <section id="view-course">
        <div id="module-display">
          <!-- Dynamically populated by JS -->
        </div>
      </section>

      <!-- VIEW 2: Full Architecture Specification (Living Docs) -->
      <section id="view-doc" style="display: none;">
        <article class="doc-article">
          ${docHtml}
        </article>
      </section>

    </main>
  </div>

  <!-- Certificate Modal -->
  <div class="modal-overlay" id="cert-modal">
    <div class="modal-card">
      <button class="modal-close" onclick="closeCertificateModal()">&times;</button>
      <div class="cert-frame">
        <div class="cert-badge">RobOS Verified Credential</div>
        <h2>CERTIFICATE OF COMPLETION</h2>
        <div class="cert-sub">Formal W3C SHACL Verified Credential registered in the RobOS Knowledge Graph</div>

        <div style="margin: 16px 0;">
          <label style="font-size: 11px; color: var(--text-muted); text-transform: uppercase;">Awarded To:</label><br>
          <input type="text" id="cert-user-input" value="Lead System Architect" oninput="updateRecipient(this.value)"
                 style="background: #0d1117; border: 1px solid var(--accent); color: #fff; font-size: 20px; font-weight: 700; text-align: center; padding: 6px 16px; border-radius: 6px; margin-top: 4px; max-width: 380px;">
        </div>

        <p style="font-size: 13px; color: var(--text);">has successfully mastered the comprehensive curriculum for</p>
        <h4 class="cert-course-name">${courseTitle}</h4>

        <div class="cert-meta-grid">
          <div><strong>Recipient:</strong> <span id="cert-display-recipient">Lead System Architect</span></div>
          <div><strong>Score Percentage:</strong> <span id="cert-score-display">100%</span></div>
          <div><strong>Target Application:</strong> ${appTitle}</div>
          <div><strong>Standard:</strong> schema:EducationalOccupationalCredential</div>
          <div style="grid-column: span 2;">
            <strong>Verification Hash:</strong> <code id="cert-hash-display">ROBOS-CERT-CALCULATING...</code>
          </div>
        </div>

        <div class="cert-footer">
          <div class="cert-seal">
            <span>🛡️</span>
            <span>RobOS SDLC Knowledge Graph &middot; Cryptographically Verified</span>
          </div>
          <div style="display: flex; gap: 10px;">
            <button class="btn btn-outline btn-sm" onclick="showJsonLdModal()">📜 JSON-LD</button>
            <button class="btn btn-primary btn-sm" onclick="window.print()">🖨️ Print / PDF</button>
            <button class="btn btn-outline btn-sm" onclick="closeCertificateModal()">Close</button>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- JSON-LD Inspector Modal -->
  <div class="modal-overlay" id="jsonld-modal">
    <div class="modal-card" style="max-width: 680px; padding: 24px;">
      <button class="modal-close" onclick="closeJsonLdModal()">&times;</button>
      <h3 style="color: var(--accent-cyan); margin-bottom: 12px;">W3C Linked Data JSON-LD Credential</h3>
      <p style="font-size: 12px; color: var(--text-muted); margin-bottom: 16px;">
        Conforming strictly to <code>schema:EducationalOccupationalCredential</code> and RobOS <code>CertificateOfCompletionShape</code>.
      </p>
      <pre style="background: #090d13; border: 1px solid var(--border); padding: 16px; border-radius: 6px; font-family: var(--font-mono); font-size: 12px; max-height: 400px; overflow-y: auto;"><code id="jsonld-code"></code></pre>
      <div style="margin-top: 16px; text-align: right;">
        <button class="btn btn-primary btn-sm" onclick="closeJsonLdModal()">Close</button>
      </div>
    </div>
  </div>

  <!-- Screenshot Lightbox Modal -->
  <div class="modal-overlay" id="lightbox-modal" onclick="closeLightbox()">
    <div class="lightbox-content">
      <img id="lightbox-img" class="lightbox-img" src="" alt="Screenshot Zoom">
      <div id="lightbox-caption" class="lightbox-caption"></div>
    </div>
  </div>

  <!-- Embedded Client-Side Application Script -->
  <script>
    const COURSE_DATA = ${serializedCourse};
    const MODULES_DATA = ${serializedModules};
    const APP_DATA = ${serializedApp};
    const STORAGE_KEY = 'robos_elearning_' + (${JSON.stringify(courseSlug)});

    let currentModIdx = 0;
    let progress = {
      completedLabs: {},
      passedQuizzes: {},
      recipientName: 'Lead System Architect',
      isCertified: false,
      certHash: ''
    };

    // Load progress from localStorage
    function loadProgress() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          progress = { ...progress, ...parsed };
        }
      } catch (err) {
        console.warn('Could not parse saved progress:', err);
      }
      if (document.getElementById('cert-user-input')) {
        document.getElementById('cert-user-input').value = progress.recipientName || 'Lead System Architect';
      }
      updateRecipient(progress.recipientName || 'Lead System Architect');
    }

    function saveProgress() {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
      } catch {}
      updateProgressDisplay();
    }

    function updateRecipient(val) {
      const name = (val || 'Lead System Architect').trim();
      progress.recipientName = name;
      const el = document.getElementById('cert-display-recipient');
      if (el) el.textContent = name;
      computeCertHash();
    }

    async function computeCertHash() {
      const recipient = progress.recipientName || 'Lead System Architect';
      const text = (${JSON.stringify(courseSlug)}) + ':' + recipient + ':100:' + (${JSON.stringify(course['@id'] || 'course')});
      try {
        const msgBuffer = new TextEncoder().encode(text);
        const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase().slice(0, 16);
        progress.certHash = 'ROBOS-CERT-' + hashHex;
      } catch (e) {
        let h = 0;
        for (let i = 0; i < text.length; i++) { h = Math.imul(31, h) + text.charCodeAt(i) | 0; }
        progress.certHash = 'ROBOS-CERT-' + Math.abs(h).toString(16).toUpperCase().padStart(16, '0');
      }
      const el = document.getElementById('cert-hash-display');
      if (el) el.textContent = progress.certHash;
    }

    function updateProgressDisplay() {
      let totalLabs = 0;
      let completedLabs = 0;
      let totalQuizzes = 0;
      let passedQuizzes = 0;

      MODULES_DATA.forEach((m, mIdx) => {
        (m.labSteps || []).forEach((_, sIdx) => {
          totalLabs++;
          if (progress.completedLabs[mIdx + '-' + sIdx]) completedLabs++;
        });
        (m.quiz || []).forEach((_, qIdx) => {
          totalQuizzes++;
          if (progress.passedQuizzes[mIdx + '-' + qIdx]) passedQuizzes++;
        });

        // Module completion in sidebar
        const modCompleted = isModuleDone(mIdx);
        const navEl = document.getElementById('nav-mod-' + mIdx);
        if (navEl) {
          if (modCompleted) navEl.classList.add('completed');
          else navEl.classList.remove('completed');
        }
      });

      const totalItems = totalLabs + totalQuizzes;
      const doneItems = completedLabs + passedQuizzes;
      const pct = totalItems > 0 ? Math.round((doneItems / totalItems) * 100) : 0;

      document.getElementById('progress-percent').textContent = pct + '%';
      document.getElementById('progress-bar-fill').style.width = pct + '%';

      // Unlock certificate if >= 80% and all quizzes passed
      const certBox = document.getElementById('cert-status-box');
      const claimBtn = document.getElementById('btn-claim-cert');
      const certText = document.getElementById('cert-status-text');

      if (pct >= 80 && (totalQuizzes === 0 || passedQuizzes >= totalQuizzes * 0.8)) {
        progress.isCertified = true;
        if (certBox) certBox.classList.add('unlocked');
        if (claimBtn) claimBtn.style.display = 'inline-flex';
        if (certText) certText.innerHTML = '🎉 <strong>Congratulations!</strong> You have satisfied all masterclass requirements. Your credential is ready to claim.';
      } else {
        if (certBox) certBox.classList.remove('unlocked');
        if (claimBtn) claimBtn.style.display = 'none';
        if (certText) certText.textContent = doneItems + ' of ' + totalItems + ' curriculum milestones achieved. Score >= 80% to claim your verified certificate.';
      }
    }

    function isModuleDone(mIdx) {
      const m = MODULES_DATA[mIdx];
      if (!m) return false;
      const labsOk = (m.labSteps || []).every((_, sIdx) => !!progress.completedLabs[mIdx + '-' + sIdx]);
      const quizOk = (m.quiz || []).every((_, qIdx) => !!progress.passedQuizzes[mIdx + '-' + qIdx]);
      return labsOk && quizOk;
    }

    function selectModule(idx) {
      currentModIdx = idx;
      MODULES_DATA.forEach((_, i) => {
        const el = document.getElementById('nav-mod-' + i);
        if (el) {
          if (i === idx) el.classList.add('active');
          else el.classList.remove('active');
        }
      });
      renderActiveModule();
    }

    function toggleLab(mIdx, sIdx) {
      const key = mIdx + '-' + sIdx;
      progress.completedLabs[key] = !progress.completedLabs[key];
      saveProgress();
    }

    function answerQuiz(mIdx, qIdx, selectedOpt, correctOpt, explanation) {
      const fb = document.getElementById('quiz-feedback-' + mIdx + '-' + qIdx);
      const isCorrect = selectedOpt === correctOpt;
      progress.passedQuizzes[mIdx + '-' + qIdx] = isCorrect;

      if (fb) {
        if (isCorrect) {
          fb.className = 'quiz-feedback pass';
          fb.innerHTML = '✅ <strong>Correct!</strong> ' + (explanation || 'Great job.');
        } else {
          fb.className = 'quiz-feedback fail';
          fb.innerHTML = '❌ <strong>Incorrect.</strong> Review the architecture specification and try again.';
        }
      }
      saveProgress();
    }

    function completeAllLabs() {
      MODULES_DATA.forEach((m, mIdx) => {
        (m.labSteps || []).forEach((_, sIdx) => {
          progress.completedLabs[mIdx + '-' + sIdx] = true;
        });
        (m.quiz || []).forEach((q, qIdx) => {
          progress.passedQuizzes[mIdx + '-' + qIdx] = true;
        });
      });
      saveProgress();
      renderActiveModule();
    }

    function resetProgress() {
      if (confirm('Reset your course progress and stored quiz answers?')) {
        progress.completedLabs = {};
        progress.passedQuizzes = {};
        progress.isCertified = false;
        saveProgress();
        renderActiveModule();
      }
    }

    function switchView(viewName) {
      const courseView = document.getElementById('view-course');
      const docView = document.getElementById('view-doc');
      const btnCourse = document.getElementById('btn-tab-course');
      const btnDoc = document.getElementById('btn-tab-doc');

      if (viewName === 'course') {
        courseView.style.display = 'block';
        docView.style.display = 'none';
        btnCourse.classList.add('active');
        btnDoc.classList.remove('active');
      } else if (viewName === 'doc') {
        courseView.style.display = 'none';
        docView.style.display = 'block';
        btnCourse.classList.remove('active');
        btnDoc.classList.add('active');
        // Render mermaid diagrams in doc
        if (window.mermaid) {
          try { window.mermaid.init(undefined, document.querySelectorAll('.mermaid')); } catch {}
        }
      }
    }

    function openCertificateModal() {
      computeCertHash();
      document.getElementById('cert-modal').classList.add('active');
    }

    function closeCertificateModal() {
      document.getElementById('cert-modal').classList.remove('active');
    }

    function showJsonLdModal() {
      const jsonld = {
        '@context': {
          'schema': 'https://schema.org/',
          'robos': 'https://robos.dev/ns#',
          'dcterms': 'http://purl.org/dc/terms/'
        },
        '@id': 'urn:robos:credential:certificate:' + (${JSON.stringify(courseSlug)}) + '-' + Date.now().toString(36),
        '@type': ['robos:CertificateOfCompletion', 'schema:EducationalOccupationalCredential'],
        'dcterms:title': 'Certificate of Completion: ' + (${JSON.stringify(courseTitle)}),
        'robos:recipientUser': progress.recipientName || 'Lead System Architect',
        'robos:forCourse': ${JSON.stringify(course['@id'] || '')},
        'robos:targetApplication': ${JSON.stringify(appNode ? (appNode['@id'] || '') : '')},
        'robos:issueDate': new Date().toISOString().split('T')[0],
        'robos:scorePercentage': 100,
        'robos:verificationHash': progress.certHash || 'ROBOS-CERT-VERIFIED',
        'robos:status': 'issued',
        'robos:domainStandard': 'https://schema.org/EducationalOccupationalCredential'
      };
      document.getElementById('jsonld-code').textContent = JSON.stringify(jsonld, null, 2);
      document.getElementById('jsonld-modal').classList.add('active');
    }

    function closeJsonLdModal() {
      document.getElementById('jsonld-modal').classList.remove('active');
    }

    function openLightbox(src, caption) {
      const modal = document.getElementById('lightbox-modal');
      const img = document.getElementById('lightbox-img');
      const cap = document.getElementById('lightbox-caption');
      img.src = src;
      cap.textContent = caption || '';
      modal.classList.add('active');
    }

    function closeLightbox() {
      document.getElementById('lightbox-modal').classList.remove('active');
    }

    // Specific Theory Highlights for each module
    function getModuleTheoryHtml(idx) {
      if (${isCrpg ? 'true' : 'false'}) {
        if (idx === 0) {
          return \`
            <div class="tech-deepdive">
              <h4>📐 Module 1 Technical Foundations: D&D 5e Combat Formulas</h4>
              <p>Combat adheres strictly to the <strong>D&D 5th Edition System Reference Document (SRD 5.1)</strong> with mathematical action economy:</p>
              <div class="formula-box">
                Modifier = floor((Ability Score - 10) / 2)<br>
                Attack Roll = 1d20 + Proficiency Bonus + STR/DEX Modifier &ge; Target AC<br>
                Spell Save DC = 8 + Proficiency Bonus + Spellcasting Ability Modifier<br>
                Advantage Shift = max(d20, d20) &rarr; Expected Value increases from 10.50 to 13.825 (+3.325 bonus)
              </div>
              <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 12px; margin-top: 12px;">
                <div class="doc-figure" style="margin: 0;">
                  <img src="/assets/images/crpg-realm/character_status_sheet.png" alt="Character Sheet" class="doc-img" onclick="openLightbox(this.src, this.alt)">
                  <div class="doc-caption">Figure 1.1: Complete D&D 5e Character Sheet tracking modifiers, AC, and saving throws.</div>
                </div>
                <div class="doc-figure" style="margin: 0;">
                  <img src="/assets/images/crpg-realm/combat_battlefield.png" alt="Real-Time with Pause Combat" class="doc-img" onclick="openLightbox(this.src, this.alt)">
                  <div class="doc-caption">Figure 1.2: RTwP battlefield with 6.0s round timer and threat indicators.</div>
                </div>
              </div>
            </div>
          \`;
        } else if (idx === 1) {
          return \`
            <div class="tech-deepdive">
              <h4>🏛️ Module 2 Technical Foundations: Godot 4 GL Compatibility & Collision</h4>
              <p>The engine renders 2560&times;1440 pre-rendered background plates with a clamped 1920&times;1080 Camera2D viewport and Layer 1 StaticBody2D physical obstacle footprints:</p>
              <div class="formula-box">
                Camera Viewport Clamping:<br>
                position.x = clamp(target_hero.x, 960, 2560 - 960)<br>
                position.y = clamp(target_hero.y, 540, 1440 - 540)
              </div>
              <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 12px; margin-top: 12px;">
                <div class="doc-figure" style="margin: 0;">
                  <img src="/assets/images/crpg-realm/house_wall_navigation.png" alt="Building Collision Geometry" class="doc-img" onclick="openLightbox(this.src, this.alt)">
                  <div class="doc-caption">Figure 2.1: Physical house footprints blocking movement; party routes through safe street corridors.</div>
                </div>
                <div class="doc-figure" style="margin: 0;">
                  <img src="/assets/images/crpg-realm/fog_of_war_reveal.png" alt="Fog of War Reveal" class="doc-img" onclick="openLightbox(this.src, this.alt)">
                  <div class="doc-caption">Figure 2.2: Dynamic Fog of War shader revealing shrouded terrain as heroes advance.</div>
                </div>
              </div>
            </div>
          \`;
        } else if (idx === 2) {
          return \`
            <div class="tech-deepdive">
              <h4>🎨 Module 3 Technical Foundations: Flare RPG & 3-Mode Activity Log</h4>
              <p>Replicates the iconic Infinity Engine console with three reactive expansion tiers and in-log numbered dialogue:</p>
              <div class="formula-box">
                Activity Log Expansion Tiers:<br>
                • Small (124px): Compact combat rolls, telemetry, and loot feeds.<br>
                • Medium (240px): In-log numbered NPC dialogue trees (keys 1-9 or click).<br>
                • Large (420px): Full mathematical roll breakdowns and quest chronicles.
              </div>
              <div class="doc-figure" style="margin: 12px 0 0;">
                <img src="/assets/images/crpg-realm/dozens_npc_dialogue.png" alt="In-Log Dialogue" class="doc-img" onclick="openLightbox(this.src, this.alt)">
                <div class="doc-caption">Figure 3.1: Multi-branch dialogue with Blacksmith Brand inside the 240px Activity Log.</div>
              </div>
            </div>
          \`;
        } else if (idx === 3) {
          return \`
            <div class="tech-deepdive">
              <h4>🤖 Module 4 Technical Foundations: Autonomous Infinity AI Agent</h4>
              <p>Autonomous decision-making agent playing through the entire campaign slice via REST telemetry (<code>GET /api/v1/state</code>):</p>
              <div class="formula-box">
                Combined-Arms Tactics:<br>
                • 140px proximity trigger &rarr; 200px pack alerting radius.<br>
                • Fighter rushes to peel hostiles; Rogue maintains 180px bow standoff; Cleric heals when ally HP &lt; 40%.
              </div>
              <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 12px; margin-top: 12px;">
                <div class="doc-figure" style="margin: 0;">
                  <img src="/assets/images/crpg-realm/threat_aggro_splash.png" alt="Threat Aggro" class="doc-img" onclick="openLightbox(this.src, this.alt)">
                  <div class="doc-caption">Figure 4.1: BDD scenario verifying enemy pack aggro alerting and fighter peeling.</div>
                </div>
                <div class="doc-figure" style="margin: 0;">
                  <img src="/assets/images/crpg-realm/victory_screen.png" alt="Victory Screen" class="doc-img" onclick="openLightbox(this.src, this.alt)">
                  <div class="doc-caption">Figure 4.2: Campaign victory achieved with 100% test pass rate across 482 steps.</div>
                </div>
              </div>
            </div>
          \`;
        } else if (idx === 4) {
          return \`
            <div class="tech-deepdive">
              <h4>🧠 Module 5 Technical Foundations: Knowledge Graph-First Game Generation</h4>
              <p>Strict Zero-Hardcoding rule: stats, classes, monsters, and dialogue are defined in <code>.robos/kgraphs/crpg/package.jsonld</code> and compiled to typed GDScript singletons (<code>DataStoreV1.gd</code>):</p>
              <div class="formula-box">
                4-Phase Generation Pipeline:<br>
                Phase 1: Ontological Modeling & W3C SHACL Shapes (.robos/kgraphs/crpg)<br>
                Phase 2: Schema & Data Store Layer (schemas/v1/*.json & data/v1/*.json)<br>
                Phase 3: Open-Source Asset Harvesting (Flare RPG & Game-Icons.net)<br>
                Phase 4: Scene & Systems Composition (Godot 4.3 GL Compatibility)
              </div>
              <div class="doc-figure" style="margin: 12px 0 0;">
                <img src="/assets/images/crpg-realm/game_generation_paradigm.png" alt="Game Generation Paradigm" class="doc-img" onclick="openLightbox(this.src, this.alt)">
                <div class="doc-caption">Figure 5.1: The 4-Phase RobOS Knowledge Graph-First Game Generation Paradigm.</div>
              </div>
            </div>
          \`;
        }
      }
      return '';
    }

    function renderActiveModule() {
      const m = MODULES_DATA[currentModIdx];
      if (!m) return;

      const container = document.getElementById('module-display');
      let html = \`
        <div class="module-card">
          <div class="module-header">
            <div>
              <h2>\${m.title || 'Module ' + (currentModIdx + 1)}</h2>
              <div style="font-size: 12px; color: var(--text-muted); margin-top: 4px;">
                Module \${currentModIdx + 1} of \${MODULES_DATA.length} &middot; Estimated Time: \${m.durationMinutes || 15} minutes
              </div>
            </div>
            <span class="badge badge-duration">⏱️ \${m.durationMinutes || 15} mins</span>
          </div>

          <div class="module-overview">
            \${m.overview || ''}
          </div>

          \${getModuleTheoryHtml(currentModIdx)}

          <!-- Lab Steps -->
          <div class="section-title">🧪 Hands-On Lab Exercises</div>
          <div class="lab-steps">
            \${(m.labSteps || []).map((step, sIdx) => {
              const isChecked = !!progress.completedLabs[currentModIdx + '-' + sIdx];
              return \`
                <div class="lab-step">
                  <input type="checkbox" class="lab-checkbox" id="lab-\${currentModIdx}-\${sIdx}" \${isChecked ? 'checked' : ''} onchange="toggleLab(\${currentModIdx}, \${sIdx})">
                  <label for="lab-\${currentModIdx}-\${sIdx}" class="lab-step-text">
                    <strong>Step \${sIdx + 1}:</strong> \${formatStepText(step)}
                  </label>
                </div>
              \`;
            }).join('')}
          </div>

          <!-- Quizzes -->
          \${m.quiz && m.quiz.length ? \`
            <div class="section-title">📝 Module Knowledge Check</div>
            <div class="quiz-section">
              \${m.quiz.map((q, qIdx) => {
                const passed = !!progress.passedQuizzes[currentModIdx + '-' + qIdx];
                return \`
                  <div class="quiz-card">
                    <div class="quiz-q">Question \${qIdx + 1}: \${q.question}</div>
                    <div class="quiz-options">
                      \${(q.options || [q.answer, 'Alternative A', 'Alternative B']).map((opt, oIdx) => {
                        const escapedOpt = opt.replace(/"/g, '&quot;');
                        const escapedAns = (q.answer || '').replace(/"/g, '&quot;');
                        const escapedExp = (q.explanation || '').replace(/"/g, '&quot;');
                        return \`
                          <label class="quiz-opt">
                            <input type="radio" name="quiz-\${currentModIdx}-\${qIdx}" value="\${escapedOpt}"
                                   onchange="answerQuiz(\${currentModIdx}, \${qIdx}, '\${escapedOpt}', '\${escapedAns}', '\${escapedExp}')">
                            <span>\${opt}</span>
                          </label>
                        \`;
                      }).join('')}
                    </div>
                    <div class="quiz-feedback \${passed ? 'pass' : ''}" id="quiz-feedback-\${currentModIdx}-\${qIdx}">
                      \${passed ? '✅ <strong>Correct!</strong> ' + (q.explanation || '') : ''}
                    </div>
                  </div>
                \`;
              }).join('')}
            </div>
          \` : ''}

          <!-- Module Navigation Footer -->
          <div class="module-actions">
            <div>
              \${currentModIdx > 0 ? \`
                <button class="btn btn-outline" onclick="selectModule(\${currentModIdx - 1})">&larr; Previous Module</button>
              \` : ''}
            </div>
            <div style="display: flex; gap: 10px;">
              <button class="btn btn-outline" onclick="completeModuleLabs(\${currentModIdx})">Mark All Labs Checked</button>
              \${currentModIdx < MODULES_DATA.length - 1 ? \`
                <button class="btn btn-primary" onclick="selectModule(\${currentModIdx + 1})">Next Module &rarr;</button>
              \` : \`
                <button class="btn btn-gold" onclick="openCertificateModal()">Review Verified Credential 🏆</button>
              \`}
            </div>
          </div>
        </div>
      \`;

      container.innerHTML = html;
    }

    function formatStepText(text) {
      return (text || '').replace(/\`([^\`]+)\`/g, '<code>$1</code>');
    }

    function completeModuleLabs(mIdx) {
      const m = MODULES_DATA[mIdx];
      if (!m) return;
      (m.labSteps || []).forEach((_, sIdx) => {
        progress.completedLabs[mIdx + '-' + sIdx] = true;
      });
      saveProgress();
      renderActiveModule();
    }

    // Initialize application on load
    window.addEventListener('DOMContentLoaded', () => {
      loadProgress();
      renderActiveModule();
      updateProgressDisplay();
      if (window.mermaid) {
        try {
          window.mermaid.initialize({ startOnLoad: true, theme: 'dark' });
        } catch {}
      }
    });
  </script>
</body>
</html>
`;
}

/**
 * Lightweight helper to parse the Living Architecture markdown file into styled HTML.
 */
function parseLivingDocMarkdown(markdown) {
  if (!markdown) {
    return '<p>No living documentation markdown source attached.</p>';
  }

  // Strip Jekyll frontmatter
  let clean = markdown.replace(/^---[\s\S]*?---\s*/, '');

  // Strip Kramdown inline macros like {: .no_toc }
  clean = clean.replace(/\{:\s*[^}]+\s*\}/g, '');

  const tokens = [];
  function saveToken(html) {
    const placeholder = `<!--ROBOS_TOKEN_${tokens.length}-->`;
    tokens.push({ placeholder, html });
    return placeholder;
  }

  // 1. Mermaid code blocks
  clean = clean.replace(/```mermaid([\s\S]*?)```/g, (_match, code) => {
    return saveToken(`<div class="mermaid">${code.trim()}</div>`);
  });

  // 2. Generic code blocks
  clean = clean.replace(/```([a-zA-Z0-9_\-]*)([\s\S]*?)```/g, (_match, lang, code) => {
    const esc = code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').trim();
    return saveToken(`<pre><code class="language-${lang}">${esc}</code></pre>`);
  });

  // 3. Math display blocks: $$...$$
  clean = clean.replace(/\$\$([\s\S]*?)\$\$/g, (_match, math) => {
    return saveToken(`<div class="formula-box">${math.trim().replace(/\n/g, '<br>')}</div>`);
  });

  // 4. HTML div blocks (like figures with images)
  clean = clean.replace(/<div[\s\S]*?<\/div>/gi, (match) => {
    return saveToken(match);
  });

  // 5. Tables
  clean = clean.replace(/((?:\|[^\n]+\|\r?\n)+)/g, (match) => {
    const lines = match.trim().split('\n').filter(l => l.trim().startsWith('|'));
    if (lines.length < 2) return match;
    let html = '<table>';
    lines.forEach((line, idx) => {
      if (line.includes('---')) return; // separator
      const cells = line.split('|').slice(1, -1).map(c => c.trim());
      if (idx === 0) {
        html += '<thead><tr>' + cells.map(c => `<th>${c}</th>`).join('') + '</tr></thead><tbody>';
      } else {
        html += '<tr>' + cells.map(c => `<td>${c}</td>`).join('') + '</tr>';
      }
    });
    html += '</tbody></table>';
    return saveToken(html);
  });

  // 6. Convert inline math: $...$
  clean = clean.replace(/\$([^\$\n]+)\$/g, '<code class="math-inline">$1</code>');

  // 7. Headers
  clean = clean.replace(/^#### (.*$)/gim, '<h4>$1</h4>');
  clean = clean.replace(/^### (.*$)/gim, '<h3>$1</h3>');
  clean = clean.replace(/^## (.*$)/gim, '<h2>$1</h2>');
  clean = clean.replace(/^# (.*$)/gim, '<h1>$1</h1>');

  // 8. Horizontal rules
  clean = clean.replace(/^---$/gm, '<hr style="border:none; border-top:1px solid var(--border); margin:24px 0;">');

  // 9. Blockquotes
  clean = clean.replace(/^> (.*$)/gim, '<blockquote>$1</blockquote>');

  // 10. Inline bold / italic / code / links
  clean = clean.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  clean = clean.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  clean = clean.replace(/`([^`]+)`/g, '<code>$1</code>');
  clean = clean.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener" style="color:var(--accent-cyan);">$1</a>');

  // 11. Wrap loose paragraphs
  const chunks = clean.split(/\n\s*\n/).map(p => {
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
        trimmed.startsWith('<ol')) {
      return trimmed;
    }
    return `<p>${trimmed.replace(/\n/g, '<br>')}</p>`;
  });

  let result = chunks.join('\n\n');

  // 12. Restore saved tokens
  for (const { placeholder, html } of tokens) {
    result = result.replace(placeholder, html);
  }

  return result;
}

module.exports = {
  generateELearningWebsite,
  buildStandaloneHtml,
  parseLivingDocMarkdown,
};
