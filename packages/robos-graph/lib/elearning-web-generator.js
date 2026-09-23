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
  const isParsePortal = courseSlug.includes('parse-portal') || (course['dcterms:title'] || '').toLowerCase().includes('parse portal');

  const permalink = options.permalink || (isCrpg ? '/projects/crpg-realm/elearning/' : (isParsePortal ? '/projects/kgraph-parse-portal/elearning/' : `/elearning/${courseSlug}`));
  const outputFileName = (isCrpg || isParsePortal) ? 'index.html' : `${courseSlug}.html`;
  const defaultOutputPath = isCrpg
    ? path.join(process.cwd(), 'docs', 'projects', 'crpg-realm', 'elearning', 'index.html')
    : (isParsePortal
      ? path.join(process.cwd(), 'docs', 'projects', 'kgraph-parse-portal', 'elearning', 'index.html')
      : path.join(process.cwd(), 'docs', 'elearning', outputFileName));
  const outputPath = options.outputFilePath || defaultOutputPath;

  // Resolve living documentation markdown file
  let docMarkdown = '';
  const candidateDocPaths = [
    options.docFilePath,
    isCrpg ? path.join(process.cwd(), 'docs', 'projects', 'crpg-realm', 'elearning-masterclass.md') : null,
    isParsePortal ? path.join(process.cwd(), 'docs', 'kgraph-parse-portal.md') : null,
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
    isParsePortal,
  });

  // Ensure target directories exist
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, htmlContent, 'utf8');

  // If this is crpg, clean up any stray elearning.html that would create a duplicate Jekyll navbar entry
  if (isCrpg) {
    const straySibling = path.join(process.cwd(), 'docs', 'projects', 'crpg-realm', 'elearning.html');
    if (fs.existsSync(straySibling) && straySibling !== outputPath) {
      try { fs.unlinkSync(straySibling); } catch {}
    }
  }

  // Also write directory index if requested or auto-publishing to docs
  let indexFilePath = null;
  if (path.basename(outputPath) === 'index.html') {
    indexFilePath = outputPath;
  } else if (options.autoPublishPages !== false && !isCrpg) {
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
    isParsePortal,
  } = params;

  const appTitle = appNode ? (appNode['dcterms:title'] || 'Application') : 'Tactical cRPG Realm of Heroes';
  const appTech = (appNode && (appNode['robos:technology'] || appNode['robos:desktopFramework'] || appNode['robos:frontendFramework'])) || 'Godot 4.3 / D&D 5e SRD';

  // Serialize course and modules JSON for client-side state
  const serializedCourse = JSON.stringify(course);
  const serializedModules = JSON.stringify(modules);
  const serializedApp = JSON.stringify(appNode || {});

  // Parse markdown documentation into structured sections
  const docHtml = parseLivingDocMarkdown(docMarkdown);

  const cleanPermalink = permalink.endsWith('/') ? permalink : `${permalink}/`;
  const basePermalink = permalink.replace(/\/$/, '');
  const redirectList = [
    `${basePermalink}`,
    `${basePermalink}.html`,
    `${cleanPermalink}`,
  ];
  if (isCrpg) {
    redirectList.push(
      '/projects/crpg-realm/robos-crpg-engine',
      '/projects/crpg-realm/robos-crpg-engine/',
      '/elearning/robos-crpg-engine',
      '/elearning/robos-crpg-engine/',
      '/elearning/robos-crpg-engine.html'
    );
  }
  const uniqueRedirects = Array.from(new Set(redirectList.filter(r => r !== permalink)));

  return `---
layout: null
title: "${isCrpg ? 'Interactive eLearning Masterclass' : ('RobOS eLearning — ' + courseTitle.replace(/"/g, '\\"'))}"
${isCrpg ? `parent: Tactical cRPG & Infinity AI Engine
grand_parent: RobOS Projects
nav_order: 4
` : ''}permalink: ${permalink}
redirect_from:
${uniqueRedirects.map(r => `  - ${r}`).join('\n')}
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

    /* Accessibility: Skip Link & Screen Reader Helpers */
    .skip-link {
      position: absolute;
      top: -60px;
      left: 16px;
      background: var(--accent);
      color: #0d1117;
      padding: 10px 18px;
      font-weight: 700;
      border-radius: var(--radius-sm);
      z-index: 9999;
      text-decoration: none;
      box-shadow: 0 4px 14px rgba(0, 188, 212, 0.4);
      transition: top 0.2s ease;
    }
    .skip-link:focus {
      top: 16px;
    }
    .sr-only {
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      margin: -1px;
      overflow: hidden;
      clip: rect(0, 0, 0, 0);
      white-space: nowrap;
      border: 0;
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
      width: 100%;
      text-align: left;
      font-family: inherit;
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
    .module-item:focus-visible {
      outline: 2px solid var(--accent);
      outline-offset: 2px;
      border-color: var(--accent);
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

    /* Intra-Module Section Navigation Pills */
    .module-nav-pills {
      display: flex;
      gap: 10px;
      margin: 16px 0 24px;
      flex-wrap: wrap;
    }
    .nav-pill {
      background: var(--bg-primary);
      border: 1px solid var(--border);
      border-radius: 20px;
      padding: 6px 14px;
      font-size: 12px;
      font-weight: 600;
      color: var(--text-muted);
      text-decoration: none;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      transition: all 0.15s;
    }
    .nav-pill:hover, .nav-pill:focus-visible {
      color: var(--text-bright);
      border-color: var(--accent);
      background: rgba(0, 188, 212, 0.1);
      outline: none;
    }

    /* Lesson Content within Module */
    .module-lesson-body {
      background: var(--bg-primary);
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
      padding: 20px 24px;
      margin-bottom: 24px;
      line-height: 1.7;
    }
    .lesson-section {
      margin-bottom: 24px;
    }
    .lesson-section:last-child {
      margin-bottom: 0;
    }
    .lesson-subtitle {
      font-size: 15px;
      font-weight: 700;
      color: var(--accent-cyan);
      margin: 16px 0 10px;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .lesson-text {
      color: var(--text);
      font-size: 14px;
      margin-bottom: 12px;
    }
    .code-snippet {
      background: #090d13;
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      padding: 14px 16px;
      font-family: var(--font-mono);
      font-size: 12px;
      color: #79c0ff;
      overflow-x: auto;
      margin: 14px 0;
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
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
      padding: 16px 20px;
      margin-bottom: 16px;
      background: var(--bg-surface);
    }
    .quiz-card:last-child { margin-bottom: 0; }
    legend.quiz-q {
      font-size: 14px;
      font-weight: 600;
      color: var(--text-bright);
      padding: 0 8px;
      margin-bottom: 12px;
      width: auto;
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

  <!-- Accessible Skip to Content Link -->
  <a href="#module-display" class="skip-link">Skip to course content</a>

  <!-- Top Universal Brand Nav -->
  <nav class="top-nav" aria-label="Global Brand Navigation">
    <div class="top-nav-left">
      <a href="https://rowbose.com/" class="brand-link">
        <span>⬡</span>
        <strong>RobOS</strong>
        <span class="brand-badge">${isCrpg ? 'Projects' : 'eLearning Hub'}</span>
      </a>
      <span style="color: var(--border);">/</span>
      ${isCrpg ? `
      <a href="/projects/crpg-realm/" class="top-link">⚔️ Tactical cRPG Realm</a>
      <span style="color: var(--border);">/</span>
      <span style="color: #38bdf8; font-size: 13px; font-weight: 600;">Interactive Masterclass</span>
      ` : `
      <span style="color: var(--text-bright); font-size: 13px; font-weight: 600;">${courseTitle}</span>
      `}
    </div>
    <div class="top-nav-right">
      ${isCrpg ? `<a href="/projects/crpg-realm/elearning-masterclass.html" class="top-link">📖 Living Architecture Guide</a>` : ''}
      <a href="https://github.com/nddipiazza/robos" target="_blank" rel="noopener" class="top-link">⭐ GitHub</a>
      <a href="https://discord.gg/6PjxzkHujE" target="_blank" rel="noopener" class="top-link">💬 Discord</a>
    </div>
  </nav>

  <!-- App Header -->
  <header class="app-header">
    <div class="header-left">
      <div class="app-icon" aria-hidden="true">🎓</div>
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
      <div class="mode-tabs" role="tablist" aria-label="View Mode">
        <button class="tab-btn active" id="btn-tab-course" role="tab" aria-selected="true" aria-controls="view-course" onclick="switchView('course')">
          <span>🎓</span> Course & Labs
        </button>
        <button class="tab-btn" id="btn-tab-doc" role="tab" aria-selected="false" aria-controls="view-doc" onclick="switchView('doc')">
          <span>📖</span> Full Specification
        </button>
        <button class="tab-btn" id="btn-tab-cert" role="button" onclick="openCertificateModal()">
          <span>🏆</span> Credential
        </button>
      </div>

      <!-- Course Progress -->
      <div class="progress-container">
        <div class="progress-label">
          <span>Progress</span>
          <strong id="progress-percent">0%</strong>
        </div>
        <div class="progress-bar-bg" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" id="progress-bar-container">
          <div class="progress-bar-fill" id="progress-bar-fill" style="width: 0%;"></div>
        </div>
      </div>
    </div>
  </header>

  <!-- App Body Layout -->
  <div class="app-body">
    <!-- Sidebar Navigation -->
    <aside class="sidebar" aria-label="Curriculum Navigation">
      <h3 id="sidebar-curriculum-heading">Curriculum Modules</h3>
      <ul class="module-list" id="module-nav-list" role="tablist" aria-labelledby="sidebar-curriculum-heading">
        ${modules.map((m, idx) => {
          const rawTitle = m.title ? m.title.replace(/^Module \d+:\s*/i, '') : 'Module ' + (idx + 1);
          const safeTitle = rawTitle.replace(/"/g, '&quot;');
          return `
          <li role="presentation">
            <button class="module-item ${idx === 0 ? 'active' : ''}"
                    id="nav-mod-${idx}"
                    role="tab"
                    aria-selected="${idx === 0 ? 'true' : 'false'}"
                    aria-controls="module-display"
                    tabindex="${idx === 0 ? '0' : '-1'}"
                    onclick="selectModule(${idx})"
                    onkeydown="handleModuleKeyDown(event, ${idx})"
                    aria-label="${safeTitle}, ${m.durationMinutes || 15} minutes, ${(m.labSteps || []).length} labs, ${(m.quiz || []).length} quiz questions">
              <div class="module-item-title">
                <span>${idx + 1}. ${rawTitle}</span>
              </div>
              <div class="module-item-meta">
                <span>⏱️ ${m.durationMinutes || 15} mins</span>
                <span>🧪 ${(m.labSteps || []).length} labs</span>
                <span>📝 ${(m.quiz || []).length} quiz</span>
              </div>
            </button>
          </li>
          `;
        }).join('')}
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

      <!-- Live Screen Reader Announcer -->
      <div id="a11y-announcer" class="sr-only" aria-live="polite" aria-atomic="true"></div>

      <!-- VIEW 1: Interactive Course & Labs -->
      <section id="view-course" role="tabpanel" aria-labelledby="btn-tab-course">
        <div id="module-display">
          <!-- Dynamically populated by JS -->
        </div>
      </section>

      <!-- VIEW 2: Full Architecture Specification (Living Docs) -->
      <section id="view-doc" role="tabpanel" aria-labelledby="btn-tab-doc" style="display: none;">
        <article class="doc-article">
          ${docHtml}
        </article>
      </section>

    </main>
  </div>

  <!-- Certificate Modal -->
  <div class="modal-overlay" id="cert-modal" role="dialog" aria-modal="true" aria-labelledby="cert-title">
    <div class="modal-card">
      <button class="modal-close" aria-label="Close Certificate Modal" onclick="closeCertificateModal()">&times;</button>
      <div class="cert-frame">
        <div class="cert-badge">RobOS Verified Credential</div>
        <h2 id="cert-title">CERTIFICATE OF COMPLETION</h2>
        <div class="cert-sub">Formal W3C SHACL Verified Credential registered in the RobOS Knowledge Graph</div>

        <div style="margin: 16px 0;">
          <label for="cert-user-input" style="font-size: 11px; color: var(--text-muted); text-transform: uppercase;">Awarded To:</label><br>
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
  <div class="modal-overlay" id="jsonld-modal" role="dialog" aria-modal="true" aria-labelledby="jsonld-title">
    <div class="modal-card" style="max-width: 680px; padding: 24px;">
      <button class="modal-close" aria-label="Close JSON-LD Modal" onclick="closeJsonLdModal()">&times;</button>
      <h3 id="jsonld-title" style="color: var(--accent-cyan); margin-bottom: 12px;">W3C Linked Data JSON-LD Credential</h3>
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
  <div class="modal-overlay" id="lightbox-modal" role="dialog" aria-modal="true" aria-label="Image Lightbox Preview" onclick="closeLightbox()">
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
          if (i === idx) {
            el.classList.add('active');
            el.setAttribute('aria-selected', 'true');
            el.setAttribute('tabindex', '0');
          } else {
            el.classList.remove('active');
            el.setAttribute('aria-selected', 'false');
            el.setAttribute('tabindex', '-1');
          }
        }
      });
      renderActiveModule();
      const heading = document.getElementById('module-content-heading');
      if (heading) {
        heading.focus();
        heading.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
      announceA11y('Now viewing ' + (MODULES_DATA[idx].title || 'Module ' + (idx + 1)));
    }

    function handleModuleKeyDown(event, idx) {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        const nextIdx = (idx + 1) % MODULES_DATA.length;
        selectModule(nextIdx);
        const nextBtn = document.getElementById('nav-mod-' + nextIdx);
        if (nextBtn) nextBtn.focus();
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        const prevIdx = (idx - 1 + MODULES_DATA.length) % MODULES_DATA.length;
        selectModule(prevIdx);
        const prevBtn = document.getElementById('nav-mod-' + prevIdx);
        if (prevBtn) prevBtn.focus();
      } else if (event.key === 'Home') {
        event.preventDefault();
        selectModule(0);
        const firstBtn = document.getElementById('nav-mod-0');
        if (firstBtn) firstBtn.focus();
      } else if (event.key === 'End') {
        event.preventDefault();
        const lastIdx = MODULES_DATA.length - 1;
        selectModule(lastIdx);
        const lastBtn = document.getElementById('nav-mod-' + lastIdx);
        if (lastBtn) lastBtn.focus();
      }
    }

    function announceA11y(message) {
      const el = document.getElementById('a11y-announcer');
      if (el) {
        el.textContent = '';
        setTimeout(() => { el.textContent = message; }, 50);
      }
    }

    function toggleLab(mIdx, sIdx) {
      const key = mIdx + '-' + sIdx;
      progress.completedLabs[key] = !progress.completedLabs[key];
      const isDone = progress.completedLabs[key];
      announceA11y('Lab step ' + (sIdx + 1) + (isDone ? ' marked completed' : ' unmarked'));
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
          announceA11y('Question ' + (qIdx + 1) + ': Correct! ' + (explanation || ''));
        } else {
          fb.className = 'quiz-feedback fail';
          fb.innerHTML = '❌ <strong>Incorrect.</strong> Review the lesson materials above and try again.';
          announceA11y('Question ' + (qIdx + 1) + ': Incorrect. Review the lesson materials above and try again.');
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
      announceA11y('All labs and quizzes across the curriculum have been marked completed.');
    }

    function resetProgress() {
      if (confirm('Reset your course progress and stored quiz answers?')) {
        progress.completedLabs = {};
        progress.passedQuizzes = {};
        progress.isCertified = false;
        saveProgress();
        renderActiveModule();
        announceA11y('Course progress has been reset.');
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
        btnCourse.setAttribute('aria-selected', 'true');
        btnDoc.classList.remove('active');
        btnDoc.setAttribute('aria-selected', 'false');
        announceA11y('Switched to Course & Labs view.');
      } else if (viewName === 'doc') {
        courseView.style.display = 'none';
        docView.style.display = 'block';
        btnCourse.classList.remove('active');
        btnCourse.setAttribute('aria-selected', 'false');
        btnDoc.classList.add('active');
        btnDoc.setAttribute('aria-selected', 'true');
        announceA11y('Switched to Full Living Architecture Specification view.');
        if (window.mermaid) {
          try { window.mermaid.init(undefined, document.querySelectorAll('.mermaid')); } catch {}
        }
      }
    }

    function openCertificateModal() {
      computeCertHash();
      document.getElementById('cert-modal').classList.add('active');
      const closeBtn = document.querySelector('#cert-modal .modal-close');
      if (closeBtn) closeBtn.focus();
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
      const closeBtn = document.querySelector('#jsonld-modal .modal-close');
      if (closeBtn) closeBtn.focus();
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
      announceA11y('Image preview opened: ' + (caption || ''));
    }

    function closeLightbox() {
      document.getElementById('lightbox-modal').classList.remove('active');
    }

    // Rich Lesson Material for Each Module
    function getModuleLessonHtml(idx) {
      if (${isCrpg ? 'true' : 'false'}) {
        if (idx === 0) {
          return \`
            <div class="lesson-section">
              <h4 class="lesson-subtitle">⚔️ 1. Real-Time with Pause (RTwP) & 6.0-Second Combat Round</h4>
              <p class="lesson-text">
                RobOS cRPG executes an authentic Infinity Engine combat simulation adhering strictly to the <strong>D&D 5th Edition System Reference Document (SRD 5.1)</strong>. Combat is governed by a strict <strong>6.0-second round timer</strong>. Within each round, every character receives a structured mathematical action economy budget:
              </p>
              <ul style="margin-left: 20px; margin-bottom: 14px; font-size: 13px;">
                <li><strong>1 Standard Action</strong>: Attack with equipped weapon, Cast a Spell (1 action casting time), Dash (double movement), Disengage, Dodge, Help, or Hide.</li>
                <li><strong>1 Bonus Action</strong>: Off-hand attack when dual-wielding, casting bonus action spells (e.g., <em>Healing Word</em>), or Rogue's <em>Cunning Action</em> (Bonus Dash/Disengage/Hide).</li>
                <li><strong>1 Reaction</strong>: Triggered out-of-turn (e.g., Opportunity Attacks when an enemy flees melee range without disengaging, or casting <em>Shield</em>).</li>
                <li><strong>30ft Movement Allowance</strong>: Can be seamlessly split before and after taking actions.</li>
              </ul>
              <div class="mermaid">
flowchart TD
    StartRound["Round Start (6.0s Timer)"] --> ActionBudget["Budget: 1 Action, 1 Bonus Action, 1 Reaction, 30ft Move"]
    ActionBudget --> ActionChoice{"Action Type?"}
    ActionChoice -- "Melee/Ranged Attack" --> AdvCheck{"Advantage?"}
    AdvCheck -- "Advantage" --> RollAdv["Roll 2d20: Keep Highest"]
    AdvCheck -- "Disadvantage" --> RollDis["Roll 2d20: Keep Lowest"]
    AdvCheck -- "Normal" --> RollNorm["Roll 1d20"]
    RollAdv --> AttackFormula["To-Hit = Roll + Prof + Ability Mod"]
    RollDis --> AttackFormula
    RollNorm --> AttackFormula
    AttackFormula --> ACCompare{"To-Hit >= Target AC?"}
    ACCompare -- "Nat 20 Critical Hit" --> CritDmg["Double Damage Dice + Modifiers"]
    ACCompare -- "Hit" --> NormalDmg["Roll Damage Dice + Modifiers"]
    ACCompare -- "Miss or Nat 1" --> Miss["0 Damage Recorded"]
    CritDmg --> ApplyHP["Deduct HP & Update State"]
    NormalDmg --> ApplyHP
    Miss --> EndRound["Advance Round Timer"]
    ApplyHP --> EndRound
              </div>
            </div>

            <div class="lesson-section">
              <h4 class="lesson-subtitle">📐 2. Mathematical Combat Formulas</h4>
              <p class="lesson-text">
                All combat checks in <code>CombatEngine.gd</code> evaluate deterministic mathematical formulas:
              </p>
              <div class="formula-box">
                Ability Modifier = floor((Ability Score - 10) / 2)<br>
                Unarmored AC = 10 + DEX Modifier<br>
                Light Armor AC = Base Armor AC + DEX Modifier<br>
                Medium Armor AC = Base Armor AC + min(DEX Modifier, 2)<br>
                Heavy Armor AC = Base Armor AC (DEX bonus ignored)<br>
                Shield Bonus = +2 AC<br>
                Attack Roll = 1d20 + Proficiency Bonus + STR/DEX Modifier &ge; Target AC<br>
                Natural 20 (Critical Hit) = Double ALL damage dice rolled before adding ability modifiers<br>
                Natural 1 (Critical Miss) = Automatic miss regardless of attack bonus<br>
                Spell Save DC = 8 + Proficiency Bonus + Spellcasting Ability Modifier<br>
                Spell Attack Modifier = Proficiency Bonus + Spellcasting Ability Modifier
              </div>
            </div>

            <div class="lesson-section">
              <h4 class="lesson-subtitle">🎲 3. Advantage & Disadvantage Probability Shift</h4>
              <p class="lesson-text">
                When rolling with <strong>Advantage</strong> (such as attacking an unalerted target or flanking), the engine rolls two 20-sided dice and takes the maximum: <code>max(d20, d20)</code>. This non-linear probability curve dramatically skews rolls upward:
              </p>
              <ul style="margin-left: 20px; margin-bottom: 14px; font-size: 13px;">
                <li><strong>Expected Roll Value</strong>: Rises from <strong>10.50</strong> on standard 1d20 to <strong>13.825</strong> (+3.325 equivalent bonus).</li>
                <li><strong>Critical Hit Chance (Nat 20)</strong>: Nearly doubles from 5.0% to <strong>9.75%</strong> (<code>1 - (19/20)^2</code>).</li>
                <li><strong>Critical Miss Chance (Nat 1)</strong>: Drops from 5.0% to a negligible <strong>0.25%</strong> (<code>(1/20)^2</code>).</li>
                <li><strong>Disadvantage</strong> (<code>min(d20, d20)</code>) inverts this curve: expected value drops to <strong>7.175</strong> (-3.325 penalty), and Nat 20 chance drops to 0.25%.</li>
              </ul>
              <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 14px; margin-top: 14px;">
                <div class="doc-figure" style="margin: 0;">
                  <img src="/assets/images/crpg-realm/character_status_sheet.png" alt="Character Sheet" class="doc-img" onclick="openLightbox(this.src, this.alt)">
                  <div class="doc-caption">Figure 1.1: Complete D&D 5e Character Sheet tracking ability scores, modifiers, AC, saving throws, and status conditions.</div>
                </div>
                <div class="doc-figure" style="margin: 0;">
                  <img src="/assets/images/crpg-realm/combat_battlefield.png" alt="Real-Time with Pause Combat" class="doc-img" onclick="openLightbox(this.src, this.alt)">
                  <div class="doc-caption">Figure 1.2: RTwP battlefield with 6.0s round timer, threat indicators, and spell targeting.</div>
                </div>
              </div>
            </div>
          \`;
        } else if (idx === 1) {
          return \`
            <div class="lesson-section">
              <h4 class="lesson-subtitle">🏛️ 1. Why Godot 4.3 GL Compatibility Profile?</h4>
              <p class="lesson-text">
                Rather than using Vulkan Forward+, RobOS cRPG deliberately targets Godot 4's <strong>GL Compatibility profile (OpenGL 3.3 / ES 3.0 / WebGL 2.0)</strong> for critical architectural reasons:
              </p>
              <ul style="margin-left: 20px; margin-bottom: 14px; font-size: 13px;">
                <li><strong>Zero Shader Compilation Stutter</strong>: Modern Vulkan Forward+ pipelines compile shaders asynchronously at runtime, causing jarring frame drops and freezes on first encounter. OpenGL compiles shaders predictably upfront.</li>
                <li><strong>Headless Virtual Framebuffer Stability</strong>: Runs with 100% stability inside Docker containers and headless Xvfb displays (<code>:99</code>) without requiring proprietary host GPU drivers or hardware passthrough.</li>
                <li><strong>Cross-Platform Parity</strong>: Pixel-perfect, identical rasterization across Linux, macOS, and Windows.</li>
              </ul>
            </div>

            <div class="lesson-section">
              <h4 class="lesson-subtitle">📐 2. 2560&times;1440 Pre-Rendered Plates & Viewport Clamping</h4>
              <p class="lesson-text">
                Maps are built using ultra-detailed 2560&times;1440 pre-rendered background plates (<code>village_open_world_2560.png</code>). The player Camera2D viewport is 1920&times;1080 native resolution and smoothly tracks heroes while strictly clamping to background boundaries so the void is never exposed:
              </p>
              <pre class="code-snippet"><code># Camera2D Boundary Clamping in Godot 4
func _process(delta: float) -> void:
    if target_hero:
        var target_pos = target_hero.global_position
        global_position = global_position.lerp(target_pos, delta * 5.0)
        global_position.x = clamp(global_position.x, 960, 2560 - 960)
        global_position.y = clamp(global_position.y, 540, 1440 - 540)</code></pre>
            </div>

            <div class="lesson-section">
              <h4 class="lesson-subtitle">🧱 3. Layer 1 Physical Building Collision Geometry</h4>
              <p class="lesson-text">
                Every building in Oakhaven is a true physical obstacle with a <code>StaticBody2D</code> collider on <strong>Physics Layer 1</strong>, preventing characters and enemies from clipping through walls:
              </p>
              <table style="width:100%; border-collapse:collapse; font-size:12px; margin:12px 0;">
                <thead>
                  <tr style="background:#21262d; color:#f0f6fc;">
                    <th style="padding:6px 10px; border:1px solid #30363d;">Building</th>
                    <th style="padding:6px 10px; border:1px solid #30363d;">Node Name</th>
                    <th style="padding:6px 10px; border:1px solid #30363d;">Footprint</th>
                    <th style="padding:6px 10px; border:1px solid #30363d;">Coordinates</th>
                    <th style="padding:6px 10px; border:1px solid #30363d;">Door ID</th>
                  </tr>
                </thead>
                <tbody>
                  <tr><td style="padding:6px 10px; border:1px solid #30363d;"><strong>The Rusty Dragon Inn</strong></td><td style="padding:6px 10px; border:1px solid #30363d;"><code>HouseInn</code></td><td style="padding:6px 10px; border:1px solid #30363d;">360&times;180 px</td><td style="padding:6px 10px; border:1px solid #30363d;">(410, 640)</td><td style="padding:6px 10px; border:1px solid #30363d;"><code>door-id-inn</code></td></tr>
                  <tr><td style="padding:6px 10px; border:1px solid #30363d;"><strong>Town Hall & Guildhouse</strong></td><td style="padding:6px 10px; border:1px solid #30363d;"><code>HouseTownHall</code></td><td style="padding:6px 10px; border:1px solid #30363d;">320&times;260 px</td><td style="padding:6px 10px; border:1px solid #30363d;">(1090, 330)</td><td style="padding:6px 10px; border:1px solid #30363d;"><code>door-id-townhall</code></td></tr>
                  <tr><td style="padding:6px 10px; border:1px solid #30363d;"><strong>Brand's Forge & Armory</strong></td><td style="padding:6px 10px; border:1px solid #30363d;"><code>HouseBlacksmith</code></td><td style="padding:6px 10px; border:1px solid #30363d;">220&times;140 px</td><td style="padding:6px 10px; border:1px solid #30363d;">(1520, 460)</td><td style="padding:6px 10px; border:1px solid #30363d;"><code>door-id-blacksmith</code></td></tr>
                  <tr><td style="padding:6px 10px; border:1px solid #30363d;"><strong>Maybelle's Remedies</strong></td><td style="padding:6px 10px; border:1px solid #30363d;"><code>HouseApothecary</code></td><td style="padding:6px 10px; border:1px solid #30363d;">280&times;140 px</td><td style="padding:6px 10px; border:1px solid #30363d;">(1810, 600)</td><td style="padding:6px 10px; border:1px solid #30363d;"><code>door-id-apothecary</code></td></tr>
                  <tr><td style="padding:6px 10px; border:1px solid #30363d;"><strong>Royal Guard Barracks</strong></td><td style="padding:6px 10px; border:1px solid #30363d;"><code>HouseBarracks</code></td><td style="padding:6px 10px; border:1px solid #30363d;">340&times;220 px</td><td style="padding:6px 10px; border:1px solid #30363d;">(1620, 1250)</td><td style="padding:6px 10px; border:1px solid #30363d;"><code>door-id-barracks</code></td></tr>
                </tbody>
              </table>
            </div>

            <div class="lesson-section">
              <h4 class="lesson-subtitle">🧭 4. Two-Tier Pathfinder.gd & Dynamic Fog of War</h4>
              <p class="lesson-text">
                When a user or AI agent clicks a waypoint, <code>Pathfinder.gd</code> performs a direct <code>RayCast2D</code> line-of-sight test against Layer 1. If clear, the character moves in a direct line. If the raycast intersects a building, the pathfinder switches to an A* corridor visibility graph, routing around building corners seamlessly. Simultaneously, <code>FogOfWar.gdshader</code> reveals shrouded terrain dynamically using hero light occluders.
              </p>
              <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 14px; margin-top: 14px;">
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
            <div class="lesson-section">
              <h4 class="lesson-subtitle">🎨 1. Genuine Open-Source Asset Harvesting Pipeline</h4>
              <p class="lesson-text">
                RobOS enforces a strict 100% genuine open-source asset rule with zero proprietary copyright liabilities:
              </p>
              <ul style="margin-left: 20px; margin-bottom: 14px; font-size: 13px;">
                <li><strong>Flare RPG (<code>flareteam/flare-game</code>)</strong>: CC-BY-SA 3.0 animated 8-directional character spritesheets (walking, attacking, taking damage, dying) and modular paperdoll gear (chainmail, plate armor, robes, longswords, shields, bows).</li>
                <li><strong>Game-Icons.net</strong>: Over 4,000 CC-BY 3.0 vector SVG icons for abilities, spellbooks, inventory, and status buffs.</li>
                <li><strong>OpenGameArt.org</strong>: CC0/CC-BY sound effects for sword impacts, spell chanting, and UI clicks.</li>
              </ul>
            </div>

            <div class="lesson-section">
              <h4 class="lesson-subtitle">📜 2. Three-Mode Expandable Activity Log</h4>
              <p class="lesson-text">
                The game replicates the iconic Infinity Engine console at the bottom of the screen with three reactive expansion tiers:
              </p>
              <div class="mermaid">
graph LR
    ModeSmall["Small Mode (124px)<br/><i>Compact Combat & Telemetry Log</i>"] -->|Click Expand / Talk NPC| ModeMed["Medium Mode (240px)<br/><i>In-Log Numbered Dialogue Trees</i>"]
    ModeMed -->|Click History| ModeLarge["Large Mode (420px)<br/><i>Full d20 Roll Breakdown & Quest Journal</i>"]
    ModeLarge -->|Click Minimize| ModeSmall
              </div>
              <div class="formula-box">
                • Small (124px): Compact combat rolls, telemetry, and loot feeds.<br>
                • Medium (240px): In-log numbered NPC dialogue trees (keys 1-9 or click).<br>
                • Large (420px): Full mathematical roll breakdowns and quest chronicles.
              </div>
            </div>

            <div class="lesson-section">
              <h4 class="lesson-subtitle">💬 3. In-Log Numbered NPC Dialogue & HUD Controls</h4>
              <p class="lesson-text">
                Dialogue choices are displayed directly inside the 240px Activity Log console rather than intrusive full-screen popups. Players can select choices via numeric keys <code>1</code>–<code>9</code> or mouse click, maintaining visual connection to the surrounding world. HUD controls include Spacebar tactical RTwP pause, Shift-click waypoint queuing, and circle selection rings.
              </p>
              <div class="doc-figure" style="margin: 14px 0 0;">
                <img src="/assets/images/crpg-realm/dozens_npc_dialogue.png" alt="In-Log Dialogue" class="doc-img" onclick="openLightbox(this.src, this.alt)">
                <div class="doc-caption">Figure 3.1: Multi-branch dialogue with Blacksmith Brand inside the 240px Activity Log.</div>
              </div>
            </div>
          \`;
        } else if (idx === 3) {
          return \`
            <div class="lesson-section">
              <h4 class="lesson-subtitle">🤖 1. Autonomous Infinity AI Agent Architecture</h4>
              <p class="lesson-text">
                Instead of brittle recorded clicks, RobOS features an autonomous decision-making AI agent (<code>qa_player/infinity_ai_agent.py</code>) that plays through the entire game slice via REST telemetry (<code>GET /api/v1/state</code>) and input commands (<code>POST /api/v1/input</code>).
              </p>
              <div class="mermaid">
flowchart TD
    Scan["Perception Scan: Query /api/v1/state"] --> CheckThreat{"Enemy within 140px Proximity?"}
    CheckThreat -- Yes --> AlertPack["Trigger 200px Pack Alerting Radius"]
    AlertPack --> PauseGame["Spacebar: Enter Tactical RTwP Pause"]
    PauseGame --> RoleTactics{"Assign Role-Based Orders"}
    RoleTactics -- Fighter --> Intercept["Move to Intercept Nearest Hostile & Peel"]
    RoleTactics -- Rogue --> Standoff["Maintain 180px Standoff Bow Range"]
    RoleTactics -- Wizard --> CastSpell["Cast Magic Missile / Fireball at Priority Target"]
    RoleTactics -- Cleric --> CheckHP{"Any Companion HP < 40%?"}
    CheckHP -- Yes --> Heal["Cast Cure Wounds on Critical Ally"]
    CheckHP -- No --> Smite["Cast Sacred Flame on Frontline Enemy"]
    Intercept --> Unpause["Spacebar: Resume Combat Simulation"]
    Standoff --> Unpause
    CastSpell --> Unpause
    Heal --> Unpause
    Smite --> Unpause
              </div>
            </div>

            <div class="lesson-section">
              <h4 class="lesson-subtitle">🎯 2. Spatial Threat Radar & Combined-Arms Tactics</h4>
              <p class="lesson-text">
                The agent evaluates a spatial threat radar around the party:
              </p>
              <div class="formula-box">
                • 140px proximity trigger: Detects hostile targets in visual range.<br>
                • 200px pack alerting radius: Alerts adjacent monsters in the pack to prevent split pulling.<br>
                • Fighter: Rushes frontline to peel enemies from squishy casters.<br>
                • Rogue: Kites at 180px standoff range with shortbow sneak attack.<br>
                • Cleric: Casts Cure Wounds when companion drops below 40% HP (otherwise casts Sacred Flame).
              </div>
            </div>

            <div class="lesson-section">
              <h4 class="lesson-subtitle">📹 3. Headless Xvfb & 1080p Video Proof-of-Work</h4>
              <p class="lesson-text">
                The entire campaign verification runs headlessly inside Docker containers using virtual X11 displays (Xvfb <code>:99</code>) and FFmpeg, outputting complete 1080p MP4 video proof-of-work with synchronized Piper TTS narration.
              </p>
              <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 14px; margin-top: 14px;">
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
            <div class="lesson-section">
              <h4 class="lesson-subtitle">🧠 1. Knowledge Graph-First Game Architecture</h4>
              <p class="lesson-text">
                All game definitions are modeled formally as linked data inside the RobOS Knowledge Graph (<code>.robos/kgraphs/crpg/package.jsonld</code>) conforming to W3C SHACL shapes (<code>CRPGGameShape</code>, <code>CRPGMonsterShape</code>, <code>CRPGSpellShape</code>).
              </p>
              <div class="mermaid">
graph TD
    Phase1["Phase 1: Ontological Modeling<br/><i>.robos/kgraphs/crpg/package.jsonld & W3C SHACL Shapes</i>"] --> Phase2["Phase 2: Schema & Data Store Layer<br/><i>schemas/v1/*.json & games/crpg-realm/data/v1/*.json</i>"]
    Phase2 --> Phase3["Phase 3: Open-Source Asset Harvesting<br/><i>Flare RPG CC-BY-SA Sprites & Game-Icons.net SVGs</i>"]
    Phase3 --> Phase4["Phase 4: Scene & Systems Composition<br/><i>Godot 4.3 GL Compatibility & DataStoreV1.gd Singletons</i>"]
              </div>
            </div>

            <div class="lesson-section">
              <h4 class="lesson-subtitle">🔒 2. Strict Zero-Hardcoding Rule & DataStoreV1.gd</h4>
              <p class="lesson-text">
                No monster stats, ability modifiers, spell formulas, or dialogue trees may be hardcoded into Godot GDScript files. All data is compiled from JSON schemas into typed GDScript singletons (<code>DataStoreV1.gd</code>), providing static autocompletion and eliminating runtime KeyError crashes:
              </p>
              <pre class="code-snippet"><code># Auto-generated statically-typed DataStoreV1.gd
class_name DataStoreV1
extends Node

static func get_class_data(class_id: String) -> Dictionary:
    match class_id:
        "fighter":
            return {
                "hit_die": 10,
                "primary_ability": "STR",
                "saving_throws": ["STR", "CON"],
                "base_hp": 12
            }
        "wizard":
            return {
                "hit_die": 6,
                "primary_ability": "INT",
                "saving_throws": ["INT", "WIS"],
                "base_hp": 7
            }
    return {}</code></pre>
            </div>

            <div class="lesson-section">
              <h4 class="lesson-subtitle">🛡️ 3. W3C SHACL Validation Gate & Dual-State Diffing</h4>
              <p class="lesson-text">
                Before any pull request or deployment is approved, <code>kgraph validate</code> validates all shapes, and <code>kgraph diff main</code> checks for broken dialogue references, orphaned asset bindings, or stat imbalances across game revisions.
              </p>
              <div class="doc-figure" style="margin: 14px 0 0;">
                <img src="/assets/images/crpg-realm/game_generation_paradigm.png" alt="Game Generation Paradigm" class="doc-img" onclick="openLightbox(this.src, this.alt)">
                <div class="doc-caption">Figure 5.1: The 4-Phase RobOS Knowledge Graph-First Game Generation Paradigm.</div>
              </div>
            </div>
          \`;
        }
      }
      if (${isParsePortal ? 'true' : 'false'}) {
        if (idx === 0) {
          return \`
            <div class="lesson-section">
              <h4 class="lesson-subtitle">🐧 1. The Linux Operating System as a First-Class Knowledge Graph Entity</h4>
              <p class="lesson-text">
                In RobOS, an operating system is not merely an unmanaged execution substrate. Instead, <strong>every file, directory, and system primitive on a Linux system is extracted into the Knowledge Graph with verifiable linked data provenance</strong>.
              </p>
              <p class="lesson-text">
                The ingestion engine in <code>packages/kgraph-parse-portal/lib/fs-mime-classifier.js</code> traverses filesystems recursively using non-blocking directory streams. It enforces a strict exclusion policy (<code>DEFAULT_EXCLUDES</code>) over unmanaged caches (<code>.git</code>, <code>node_modules</code>, <code>target</code>, <code>dist</code>, <code>__pycache__</code>), while inspecting filesystem inodes via <code>fs.lstatSync</code> to safely classify files without following recursive symlink loops or blocking on FIFOs.
              </p>

              <div class="mermaid">
flowchart TD
    Scan["Filesystem Inode Scanner<br/><i>fs-mime-classifier.js</i>"] --> Filter{"In DEFAULT_EXCLUDES?<br/><i>.git, node_modules</i>"}
    Filter -- Yes --> Ignore["Skip Path"]
    Filter -- No --> InodeType{"Inode Type?"}
    InodeType -- "isSocket()" --> SocketNode["robos:LinuxSocket<br/><i>inode/socket</i>"]
    InodeType -- "isFIFO()" --> FifoNode["robos:LinuxNamedPipe<br/><i>inode/fifo</i>"]
    InodeType -- "isSymbolicLink()" --> SymlinkNode["robos:LinuxSymlink<br/><i>inode/symlink</i>"]
    InodeType -- "isFile()" --> ContentCheck{"Magic Header / Ext?"}
    ContentCheck -- "\\\\x7fELF" --> ElfNode["robos:BinaryExecutable<br/><i>application/x-executable</i>"]
    ContentCheck -- "systemd/*.service" --> SystemdNode["robos:SystemdService<br/><i>text/plain</i>"]
    ContentCheck -- "Standard Source" --> MimeClassify["Forward to Contextual Disambiguation"]
    SocketNode --> EvidenceGen["Compute SHA-256 & Attach robos:evidence"]
    FifoNode --> EvidenceGen
    SymlinkNode --> EvidenceGen
    ElfNode --> EvidenceGen
    SystemdNode --> EvidenceGen
    MimeClassify --> EvidenceGen
    EvidenceGen --> KGraphEmit["Emit Validated KGraph JSON-LD Node"]
              </div>
            </div>

            <div class="lesson-section">
              <h4 class="lesson-subtitle">🔒 2. Cryptographic Provenance: The robos:evidence Schema</h4>
              <p class="lesson-text">
                Blind trust in AI diffs or unverified code updates is eliminated in RobOS. Every extracted node is stamped with a canonical, tamper-evident <code>robos:evidence</code> block:
              </p>
              <div class="formula-box">
"robos:evidence": {<br>
&nbsp;&nbsp;"repository": "github.com/nddipiazza/robos",<br>
&nbsp;&nbsp;"path": "packages/kgraph-parse-portal/contracts/openapi.yaml",<br>
&nbsp;&nbsp;"line": 1,<br>
&nbsp;&nbsp;"workingTreeRevision": "clean",<br>
&nbsp;&nbsp;"sha256": "4a72d3f9b8c105e1975e2f694e2a1b94e09834bfac8950293847e62a1100e381"<br>
}
              </div>
              <p class="lesson-text">
                The <code>sha256</code> hash is computed synchronously from the raw file buffer using Node's <code>crypto.createHash('sha256')</code>. When an agent or developer opens a Pull Request, the <code>kgraph diff</code> command re-computes hashes against <code>origin/main</code> to determine exact semantic blast radius and prevent undetected drift.
              </p>
            </div>

            <div class="lesson-section">
              <h4 class="lesson-subtitle">⚙️ 3. Linux Virtual Filesystem Primitives & Special Inode Detection</h4>
              <p class="lesson-text">
                Unlike generic file tree indexers, the KGraph Parse Portal provides deep classification of Linux operating system primitives:
              </p>
              <table class="spec-table">
                <thead>
                  <tr>
                    <th>Filesystem Inode / Marker</th>
                    <th>Detection Mechanism</th>
                    <th>RobOS Semantic Type</th>
                    <th>MIME Classification</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td><strong>ELF Executables & Shared Libs</strong></td>
                    <td>Magic header: <code>0x7F 'E' 'L' 'F'</code></td>
                    <td><code>robos:BinaryExecutable</code> / <code>SharedLibrary</code></td>
                    <td><code>application/x-executable</code></td>
                  </tr>
                  <tr>
                    <td><strong>Unix Domain Sockets</strong></td>
                    <td><code>stats.isSocket() === true</code></td>
                    <td><code>robos:LinuxSocket</code></td>
                    <td><code>inode/socket</code></td>
                  </tr>
                  <tr>
                    <td><strong>Named Pipes (FIFO)</strong></td>
                    <td><code>stats.isFIFO() === true</code></td>
                    <td><code>robos:LinuxNamedPipe</code></td>
                    <td><code>inode/fifo</code></td>
                  </tr>
                  <tr>
                    <td><strong>Systemd Service Units</strong></td>
                    <td>Path: <code>/etc/systemd/system/*.service</code></td>
                    <td><code>robos:SystemdService</code></td>
                    <td><code>text/plain</code></td>
                  </tr>
                  <tr>
                    <td><strong>Linux Device Nodes</strong></td>
                    <td><code>stats.isBlockDevice()</code> / <code>isCharacterDevice()</code></td>
                    <td><code>robos:LinuxDeviceNode</code></td>
                    <td><code>inode/blockdevice</code></td>
                  </tr>
                </tbody>
              </table>

              <div class="doc-figure">
                <img src="/assets/images/kgraph-parse-portal-pipeline.jpg" alt="RobOS Ingestion Pipeline Stage 1" class="doc-img" onclick="openLightbox(this.src, this.alt)">
                <div class="doc-caption">Figure 1.1: Stage 1 of the Ingestion Pipeline extracting Linux filesystem entities into the RobOS Knowledge Graph.</div>
              </div>
            </div>
          \`;
        } else if (idx === 1) {
          return \`
            <div class="lesson-section">
              <h4 class="lesson-subtitle">🧠 1. Moving Beyond Raw HTTP/2 MIME Headers</h4>
              <p class="lesson-text">
                A standard MIME type such as <code>application/json</code> or <code>text/yaml</code> carries zero architectural intent on its own. For example, a <code>package.json</code> file, an OpenAPI 3.1 contract, a <code>tsconfig.json</code>, and a test fixture all evaluate to <code>application/json</code>, yet each represents a completely distinct software lifecycle concern.
              </p>
              <p class="lesson-text">
                The Kgraph Parse Portal introduces a multi-stage <strong>contextual disambiguation engine</strong> (<code>classifyFile()</code> in <code>fs-mime-classifier.js</code>) that parses beyond surface headers to assign definitive <strong>W3C SHACL targetClass shapes</strong>.
              </p>
            </div>

            <div class="lesson-section">
              <h4 class="lesson-subtitle">📋 2. The Semantic Disambiguation Matrix</h4>
              <table class="spec-table">
                <thead>
                  <tr>
                    <th>File Pattern / Path</th>
                    <th>Raw MIME</th>
                    <th>Disambiguated Semantic Meaning</th>
                    <th>Target RobOS SHACL Shape</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td><code>package.json</code></td>
                    <td><code>application/json</code></td>
                    <td>Node.js Manifest, Scripts & Dependencies</td>
                    <td><code>robos:SourceArtifact</code></td>
                  </tr>
                  <tr>
                    <td><code>tsconfig.json</code></td>
                    <td><code>application/json</code></td>
                    <td>TypeScript Compiler Configuration</td>
                    <td><code>robos:SourceArtifact</code></td>
                  </tr>
                  <tr>
                    <td><code>openapi.yaml</code> / <code>.json</code></td>
                    <td><code>text/yaml</code></td>
                    <td>REST API Contract (OpenAPI 3.1)</td>
                    <td><code>robos:Contract</code> (protocol: OpenAPI)</td>
                  </tr>
                  <tr>
                    <td><code>*.proto</code></td>
                    <td><code>text/x-protobuf</code></td>
                    <td>gRPC Microservice RPC Protocol</td>
                    <td><code>robos:ProtobufContract</code></td>
                  </tr>
                  <tr>
                    <td><code>*.graphql</code> / <code>*.gql</code></td>
                    <td><code>application/graphql</code></td>
                    <td>GraphQL Schema Contract</td>
                    <td><code>robos:GraphQLContract</code></td>
                  </tr>
                  <tr>
                    <td><code>Chart.yaml</code> / <code>values.yaml</code></td>
                    <td><code>application/x-yaml</code></td>
                    <td>Kubernetes Helm Chart Definition</td>
                    <td><code>robos:GitOpsDeployment</code></td>
                  </tr>
                  <tr>
                    <td><code>*.service</code></td>
                    <td><code>text/plain</code></td>
                    <td>Linux Systemd Daemon Unit</td>
                    <td><code>robos:SystemdService</code></td>
                  </tr>
                  <tr>
                    <td><code>*.feature</code></td>
                    <td><code>text/x-gherkin</code></td>
                    <td>Cucumber / BDD Feature Specification</td>
                    <td><code>robos:GherkinFeature</code></td>
                  </tr>
                  <tr>
                    <td><code>MODULE.bazel</code> / <code>WORKSPACE</code></td>
                    <td><code>text/plain</code></td>
                    <td>Bazel Monorepo Workspace</td>
                    <td><code>robos:BuildSystem</code></td>
                  </tr>
                  <tr>
                    <td><code>project.godot</code></td>
                    <td><code>text/plain</code></td>
                    <td>Godot 4 Game Engine Project</td>
                    <td><code>robos:PCGame</code></td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div class="lesson-section">
              <h4 class="lesson-subtitle">📁 3. Directory Archetype Detection Across 11+ Ecosystems</h4>
              <p class="lesson-text">
                When pointed at any directory, <code>detectDirectoryArchetype()</code> scans root marker files to establish ecosystem context:
              </p>

              <div class="mermaid">
graph TD
    DirScan["Directory Ingestion Scan"] --> MarkerCheck{"Inspect Marker Files"}
    MarkerCheck -- "MODULE.bazel / WORKSPACE" --> BazelMonorepo["robos:BuildSystem<br/><i>Bazel Monorepo (RBE Ready)</i>"]
    MarkerCheck -- ".buckconfig" --> Buck2Monorepo["robos:BuildSystem<br/><i>Buck2 Monorepo (RBE Ready)</i>"]
    MarkerCheck -- "pom.xml / build.gradle" --> JvmApp["robos:Microservice<br/><i>Java/Kotlin JVM Ecosystem</i>"]
    MarkerCheck -- "Cargo.toml" --> RustApp["robos:Microservice<br/><i>Cargo Rust Crate</i>"]
    MarkerCheck -- "go.mod" --> GoApp["robos:Microservice<br/><i>Go Modules Service</i>"]
    MarkerCheck -- "package.json" --> PkgCheck{"Dependencies Check"}
    PkgCheck -- "electron" --> ElectronApp["robos:DesktopApp<br/><i>Electron Desktop Framework</i>"]
    PkgCheck -- "next / react" --> ReactApp["robos:FrontEndApp<br/><i>React / Next.js Web App</i>"]
    PkgCheck -- "express / fastify" --> ExpressApp["robos:Microservice<br/><i>Node.js REST Service</i>"]
    MarkerCheck -- "project.godot" --> GodotApp["robos:PCGame<br/><i>Godot 4 2.5D Isometric Engine</i>"]
    MarkerCheck -- "Chart.yaml" --> HelmApp["robos:GitOpsDeployment<br/><i>Kubernetes Helm Chart</i>"]
              </div>
            </div>
          \`;
        } else if (idx === 2) {
          return \`
            <div class="lesson-section">
              <h4 class="lesson-subtitle">⚡ 1. High-Throughput HTTP/2 gRPC Streaming Architecture</h4>
              <p class="lesson-text">
                Parsing multi-megabyte API contracts, database schemas, and hundreds of source code files inside the Node.js event loop causes severe memory spikes, event loop starvation, and potential process crashes. The Kgraph Parse Portal connects to an <strong>Apache Tika 4.0 streaming daemon</strong> listening on <code>localhost:50051</code>.
              </p>
              <p class="lesson-text">
                Documents are streamed in non-blocking chunks over HTTP/2 gRPC frames with zero-copy buffer transfers. This isolates the heavy compilation and text extraction runtime in a separate process space, preventing V8 garbage collection latency.
              </p>

              <div class="mermaid">
sequenceDiagram
    participant App as Portal / REST API
    participant Conn as TikaGrpcConnector
    participant Daemon as Tika 4.0 gRPC (:50051)
    participant Fallback as Embedded AST Engine

    App->>Conn: parseDocument(filePath, content)
    Conn->>Conn: isAvailable() TCP probe
    alt Tika Daemon Online
        Conn->>Daemon: Stream document over gRPC HTTP/2
        Daemon-->>Conn: Stream parsed text & AST tokens
    else Tika Daemon Offline / Cold
        Conn->>Fallback: Dispatch to embedded polyglot AST extractor
        Fallback-->>Conn: Return AST symbols & tokens
    end
    Conn-->>App: Extracted AST Symbols (classes, methods, RPCs)
              </div>
            </div>

            <div class="lesson-section">
              <h4 class="lesson-subtitle">🌳 2. Polyglot AST Symbol Extraction Engine</h4>
              <p class="lesson-text">
                The portal's <code>TikaGrpcConnector</code> (<code>packages/kgraph-parse-portal/lib/tika-grpc-connector.js</code>) parses polyglot source trees into fine-grained AST symbols:
              </p>
              <ul style="margin-left: 20px; margin-bottom: 14px; font-size: 13px;">
                <li><strong>TypeScript & JavaScript</strong>: Extracts <code>class</code> hierarchies with superclasses, <code>interface</code> definitions, exported types, and named/async arrow functions.</li>
                <li><strong>Python</strong>: Extracts <code>class</code> definitions with multiple inheritance bases, method signatures, and functions.</li>
                <li><strong>Java & Kotlin</strong>: Extracts <code>class</code>, <code>interface</code>, <code>record</code>, and <code>enum</code> declarations, along with public/private methods.</li>
                <li><strong>Protocol Buffers (Protobuf v3)</strong>: Extracts <code>service</code> declarations, <code>rpc</code> endpoints with parameter/return types, and <code>message</code> schemas.</li>
              </ul>

              <pre class="code-snippet"><code>// Example AST Symbol Extraction from contracts/tika-service.proto
const symbols = tikaConnector.extractAstSymbols(protoContent, '.proto');
// Output:
// [
//   { type: 'service', name: 'TikaStreamingService' },
//   { type: 'rpc', name: 'ParseDocumentStream', request: 'DocumentChunk', response: 'ParsedTokenStream' },
//   { type: 'message', name: 'DocumentChunk' }
// ]</code></pre>
            </div>

            <div class="lesson-section">
              <h4 class="lesson-subtitle">🛡️ 3. Resilient Zero-Downtime Offline Fallback Handling</h4>
              <p class="lesson-text">
                In test environments, containerized Docker builds, or air-gapped developer laptops where the external Tika daemon is not running, the portal never throws an error or aborts crawling.
              </p>
              <p class="lesson-text">
                <code>TikaGrpcConnector.isAvailable()</code> conducts a rapid 500ms socket connection test against port 50051. If the daemon is unreachable, the connector seamlessly routes documents to its embedded regular expression and lexical AST engine, ensuring 100% operational resilience.
              </p>
            </div>
          \`;
        } else if (idx === 3) {
          return \`
            <div class="lesson-section">
              <h4 class="lesson-subtitle">🏗️ 1. Scaling Ingestion: Why Remote Execution API (REAPI v2)?</h4>
              <p class="lesson-text">
                For enterprise monorepos (tens of thousands of source files, Protobuf schemas, and Bazel/Buck2 compilation units), local developer workstations quickly run out of RAM and CPU threads.
              </p>
              <p class="lesson-text">
                RobOS incorporates the industry-standard <strong>Remote Execution API v2 (REAPI v2)</strong>, enabling Bazel/Buck2 builds and massive parallel parsing jobs to be offloaded to an elastic remote cluster.
              </p>

              <div class="mermaid">
flowchart TD
    subgraph Client["Developer Workstations & CI Runners"]
        Bazel["Bazel / Buck2 Build"]
        Portal["KGraph Parse Portal"]
    end

    subgraph RBEGrid["Hermetiq Buildbarn RBE Cluster (oci://ghcr.io/hermetiq/buildbarn)"]
        Frontend["bb-frontend (:8980)<br/><i>Unified REAPI v2 Endpoint</i>"]
        Scheduler["bb-scheduler (:8982)<br/><i>Priority Queue & Resource Matching</i>"]
        Storage["bb-storage (:8981)<br/><i>CAS / Action Cache (100Gi+ PVC)</i>"]

        subgraph WorkerPool["bb-worker Cluster"]
            W1["bb-worker #1<br/><i>Docker Runner</i>"]
            W2["bb-worker #2<br/><i>Docker Runner</i>"]
            W3["bb-worker #N<br/><i>Docker Runner</i>"]
        end
    end

    Bazel -->|gRPC REAPI v2| Frontend
    Portal -->|Distributed Parse| Frontend
    Frontend --> Scheduler
    Frontend --> Storage
    Scheduler -->|Dispatch Action| W1
    Scheduler -->|Dispatch Action| W2
    Scheduler -->|Dispatch Action| W3
    W1 <-->|Read / Write Blobs| Storage
    W2 <-->|Read / Write Blobs| Storage
    W3 <-->|Read / Write Blobs| Storage
              </div>
            </div>

            <div class="lesson-section">
              <h4 class="lesson-subtitle">📦 2. Hermetiq Buildbarn OCI Helm Chart Architecture</h4>
              <p class="lesson-text">
                RobOS standardizes on Hermetiq's official OCI Helm distribution (<code>oci://ghcr.io/hermetiq/buildbarn</code>). The grid consists of four decoupled microservices:
              </p>
              <ul style="margin-left: 20px; margin-bottom: 14px; font-size: 13px;">
                <li><strong><code>bb-storage</code></strong>: Content Addressable Storage (CAS) for immutable input/output files and Action Cache (AC) for storing previous compilation results. Configured with 100Gi+ storage.</li>
                <li><strong><code>bb-scheduler</code></strong>: High-throughput task scheduling queue that matches action digest requirements to available worker pools based on platform criteria (Linux, x86_64).</li>
                <li><strong><code>bb-worker</code></strong>: Sandboxed execution runners that pull action inputs from CAS and run builds inside isolated Docker containers via the host Docker daemon socket.</li>
                <li><strong><code>bb-frontend</code></strong>: Unified gRPC frontend gateway exposing the standard REAPI v2 endpoint on port 8980.</li>
              </ul>
            </div>

            <div class="lesson-section">
              <h4 class="lesson-subtitle">🛠️ 3. Automated Helm Values Generation & Cluster Lifecycle</h4>
              <p class="lesson-text">
                The module in <code>packages/kgraph-parse-portal/lib/buildbarn-rbe.js</code> provides automated Helm values generation and CLI deployment helpers:
              </p>
              <pre class="code-snippet"><code># Deploy Hermetiq Buildbarn RBE to Kubernetes cluster
helm upgrade --install buildbarn oci://ghcr.io/hermetiq/buildbarn \\
  --namespace buildbarn \\
  --create-namespace \\
  -f buildbarn-values.yaml</code></pre>
              <p class="lesson-text">
                The portal conducts periodic health checks on port 8980 (REAPI frontend) and port 8981 (CAS storage) to verify remote execution cluster health before queuing heavy monorepo parsing jobs.
              </p>
            </div>
          \`;
        } else if (idx === 4) {
          return \`
            <div class="lesson-section">
              <h4 class="lesson-subtitle">🔍 1. Sub-Millisecond Search via the Luxir C++ Engine</h4>
              <p class="lesson-text">
                Once files are crawled, disambiguated, and parsed into AST symbols, they are indexed into <strong>Luxir</strong>, RobOS's high-speed embedded C++ search engine running on port 8983.
              </p>
              <p class="lesson-text">
                <code>LuxirSearchBridge</code> (<code>packages/kgraph-parse-portal/lib/luxir-search-bridge.js</code>) transforms raw KGraph nodes into unified search documents with multi-field inverted indexing:
              </p>
              <div class="formula-box">
Index Document = {<br>
&nbsp;&nbsp;id: "urn:robos:contract:openapi-v1",<br>
&nbsp;&nbsp;title: "Petstore OpenAPI 3.1 Specification",<br>
&nbsp;&nbsp;textCorpus: "petstore openapi contract pet findbyid get delete post",<br>
&nbsp;&nbsp;types: ["robos:Contract", "schema:DigitalDocument"],<br>
&nbsp;&nbsp;package: "services",<br>
&nbsp;&nbsp;protocol: "OpenAPI 3.1"<br>
}
              </div>
              <p class="lesson-text">
                The bridge utilizes a dual-write pattern: writing to the live C++ engine and continuously maintaining an in-memory resilient fallback cache for instant sub-millisecond query evaluation.
              </p>
            </div>

            <div class="lesson-section">
              <h4 class="lesson-subtitle">🖥️ 2. Direct CLI Access via luxir-portal-cli.js</h4>
              <p class="lesson-text">
                The portal includes a standalone CLI tool and in-app Tilix console tab:
              </p>
              <pre class="code-snippet"><code># Check Luxir C++ engine state (:8983) and indexed document distribution
node packages/kgraph-parse-portal/bin/luxir-portal-cli.js status

# Query the Luxir index directly from the terminal
node packages/kgraph-parse-portal/bin/luxir-portal-cli.js search "Contract"

# Search with faceted SHACL type filter
node packages/kgraph-parse-portal/bin/luxir-portal-cli.js search "Contract" --type robos:Contract

# Inspect raw Luxir index JSON document by path or ID
node packages/kgraph-parse-portal/bin/luxir-portal-cli.js inspect openapi.yaml</code></pre>

              <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 14px; margin-top: 14px;">
                <div class="doc-figure" style="margin: 0;">
                  <img src="/assets/images/screenshots/09_luxir_cli_search_direct.png" alt="Direct Luxir CLI Search Query" class="doc-img" onclick="openLightbox(this.src, this.alt)">
                  <div class="doc-caption">Figure 5.1: Direct Luxir CLI search returning indexed OpenAPI and Protobuf contracts.</div>
                </div>
                <div class="doc-figure" style="margin: 0;">
                  <img src="/assets/images/screenshots/12_luxir_cli_status_engine.png" alt="Luxir Engine Status Report" class="doc-img" onclick="openLightbox(this.src, this.alt)">
                  <div class="doc-caption">Figure 5.2: Luxir engine status report showing READY state, :8983 endpoint, and type counts.</div>
                </div>
              </div>
            </div>

            <div class="lesson-section">
              <h4 class="lesson-subtitle">🛡️ 3. W3C SHACL Validation Gates: Guaranteeing Zero Graph Corruption</h4>
              <p class="lesson-text">
                Autonomous agents and high-throughput crawlers must never mutate the canonical Knowledge Graph without strict schema enforcement.
              </p>
              <p class="lesson-text">
                The portal's <code>POST /api/v1/ingest</code> endpoint subjects every node to RobOS's <strong>98 W3C SHACL constraint shapes</strong>. If an incoming node lacks a required property (e.g., <code>dcterms:title</code>, <code>robos:evidence</code>), violates cardinality, or specifies an invalid datatype, the transaction is rejected before any state changes occur.
              </p>

              <div class="mermaid">
flowchart LR
    NodeExtracted["Extracted Node<br/><i>from Filesystem / Tika</i>"] --> SHACLGate{"W3C SHACL<br/>Validation Gate"}
    SHACLGate -- "Violates Constraints" --> Reject["Ingestion Rejected<br/><i>Error Logged to ~/.config/robos/</i>"]
    SHACLGate -- "Valid Shape Conformance" --> DualCommit["Atomic Dual Commit"]
    DualCommit --> KGraphStore["Modular KGraph Packages<br/><i>.robos/kgraphs/ & knowledge-graph.jsonld</i>"]
    DualCommit --> LuxirIndex["Luxir C++ Index (:8983)<br/><i>Faceted Sub-Millisecond Search</i>"]
    LuxirIndex --> CLI["Luxir CLI & REST Gateway<br/><i>luxir-portal-cli.js</i>"]
              </div>
            </div>
          \`;
        }
      }
      const m = MODULES_DATA[idx];
      return \`
        <div class="lesson-section">
          <h4 class="lesson-subtitle">📖 Module Overview & Core Architecture</h4>
          <p class="lesson-text">\${m.overview || 'Review the attached living architecture documentation and complete the hands-on lab exercises below.'}</p>
        </div>
      \`;
    }

    function renderActiveModule() {
      const m = MODULES_DATA[currentModIdx];
      if (!m) return;

      const container = document.getElementById('module-display');
      let html = \`
        <div class="module-card">
          <div class="module-header">
            <div>
              <h2 id="module-content-heading" tabindex="-1">\${m.title || 'Module ' + (currentModIdx + 1)}</h2>
              <div style="font-size: 12px; color: var(--text-muted); margin-top: 4px;">
                Module \${currentModIdx + 1} of \${MODULES_DATA.length} &middot; Estimated Time: \${m.durationMinutes || 15} minutes
              </div>
            </div>
            <span class="badge badge-duration">⏱️ \${m.durationMinutes || 15} mins</span>
          </div>

          <div class="module-overview">
            \${m.overview || ''}
          </div>

          <nav class="module-nav-pills" aria-label="Module Content Sections">
            <a href="#section-lesson" class="nav-pill"><span>📖</span> Lesson Material</a>
            <a href="#section-labs" class="nav-pill"><span>🧪</span> Hands-On Labs (\${(m.labSteps || []).length})</a>
            \${(m.quiz || []).length ? \`<a href="#section-quiz" class="nav-pill"><span>📝</span> Knowledge Check (\${(m.quiz || []).length})</a>\` : ''}
          </nav>

          <!-- Lesson Material & Architecture Walkthrough -->
          <h3 id="section-lesson" class="section-title">📖 Lesson Material &amp; Architecture Walkthrough</h3>
          <div class="module-lesson-body">
            \${getModuleLessonHtml(currentModIdx)}
          </div>

          <!-- Lab Steps -->
          <h3 id="section-labs" class="section-title">🧪 Hands-On Lab Exercises</h3>
          <div class="lab-steps">
            \${(m.labSteps || []).map((step, sIdx) => {
              const isChecked = !!progress.completedLabs[currentModIdx + '-' + sIdx];
              return \`
                <div class="lab-step">
                  <input type="checkbox" class="lab-checkbox" id="lab-\${currentModIdx}-\${sIdx}" \${isChecked ? 'checked' : ''}
                         onchange="toggleLab(\${currentModIdx}, \${sIdx})"
                         aria-label="Mark lab step \${sIdx + 1} as completed">
                  <label for="lab-\${currentModIdx}-\${sIdx}" class="lab-step-text">
                    <strong>Step \${sIdx + 1}:</strong> \${formatStepText(step)}
                  </label>
                </div>
              \`;
            }).join('')}
          </div>

          <!-- Quizzes -->
          \${m.quiz && m.quiz.length ? \`
            <h3 id="section-quiz" class="section-title">📝 Module Knowledge Check</h3>
            <div class="quiz-section">
              \${m.quiz.map((q, qIdx) => {
                const passed = !!progress.passedQuizzes[currentModIdx + '-' + qIdx];
                return \`
                  <fieldset class="quiz-card" role="group" aria-labelledby="quiz-q-\${currentModIdx}-\${qIdx}">
                    <legend class="quiz-q" id="quiz-q-\${currentModIdx}-\${qIdx}">Question \${qIdx + 1}: \${q.question}</legend>
                    <div class="quiz-options" role="radiogroup" aria-labelledby="quiz-q-\${currentModIdx}-\${qIdx}">
                      \${(q.options || [q.answer, 'Alternative A', 'Alternative B']).map((opt, oIdx) => {
                        const escapedOpt = opt.replace(/"/g, '&quot;');
                        const escapedAns = (q.answer || '').replace(/"/g, '&quot;');
                        const escapedExp = (q.explanation || '').replace(/"/g, '&quot;');
                        return \`
                          <label class="quiz-opt">
                            <input type="radio" name="quiz-\${currentModIdx}-\${qIdx}" value="\${escapedOpt}"
                                   onchange="answerQuiz(\${currentModIdx}, \${qIdx}, '\${escapedOpt}', '\${escapedAns}', '\${escapedExp}')"
                                   aria-describedby="quiz-feedback-\${currentModIdx}-\${qIdx}">
                            <span>\${opt}</span>
                          </label>
                        \`;
                      }).join('')}
                    </div>
                    <div class="quiz-feedback \${passed ? 'pass' : ''}" id="quiz-feedback-\${currentModIdx}-\${qIdx}" role="status" aria-live="polite">
                      \${passed ? '✅ <strong>Correct!</strong> ' + (q.explanation || '') : ''}
                    </div>
                  </fieldset>
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

      // Re-initialize dynamic Mermaid diagrams in newly rendered module content
      if (window.mermaid) {
        try {
          window.mermaid.run({ nodes: container.querySelectorAll('.mermaid') });
        } catch (e) {
          try { window.mermaid.init(undefined, container.querySelectorAll('.mermaid')); } catch {}
        }
      }
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
      announceA11y('All labs in Module ' + (mIdx + 1) + ' marked completed.');
    }

    // Global Escape Key Listener for Accessible Modals
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closeCertificateModal();
        closeJsonLdModal();
        closeLightbox();
      }
    });

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
