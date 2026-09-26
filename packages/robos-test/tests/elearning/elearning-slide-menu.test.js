'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const {
  getGitInfo,
  createZipBuffer,
  buildStandaloneSlideHtml,
  SLIDE_OFFLINE_CSS,
} = require('../../../robos-elearning/main');

const {
  SDLCKnowledgeGraphStore,
} = require('../../../robos-graph/index');

const rootRepo = path.resolve(__dirname, '../../../../');

describe('RobOS eLearning Slide Action Menu, Git URLs & Offline Zip Export', () => {
  it('1. getGitInfo() resolves Git repository metadata and elearning.yaml path', () => {
    const info = getGitInfo();
    assert.ok(info, 'getGitInfo() must return an object');
    assert.ok(typeof info.gitRemoteUrl === 'string' && info.gitRemoteUrl.length > 0, 'Must have gitRemoteUrl');
    assert.ok(info.gitRemoteUrl.includes('github.com'), 'gitRemoteUrl should include github.com');
    assert.ok(typeof info.gitBranch === 'string' && info.gitBranch.length > 0, 'Must have gitBranch');
    assert.ok(typeof info.gitopsPath === 'string' && info.gitopsPath.endsWith('.robos/elearning.yaml'), 'gitopsPath must end with .robos/elearning.yaml');
    assert.strictEqual(info.gitopsRelative, '.robos/elearning.yaml', 'gitopsRelative must be .robos/elearning.yaml');
  });

  it('2. createZipBuffer() creates a valid PKZip archive verified by /usr/bin/unzip', () => {
    const testFiles = [
      { name: 'index.html', data: '<!DOCTYPE html><html><body><h1>Slide Test</h1></body></html>' },
      { name: 'style.css', data: SLIDE_OFFLINE_CSS },
      { name: 'metadata.json', data: JSON.stringify({ slideId: 'slide-1', title: 'Intro' }, null, 2) },
      { name: 'README.md', data: '# RobOS Slide\nOffline exported slide package.\n' },
    ];

    const zipBuffer = createZipBuffer(testFiles);
    assert.ok(Buffer.isBuffer(zipBuffer), 'Output must be a Buffer');
    assert.ok(zipBuffer.length > 100, 'Zip buffer must have realistic size');

    // Verify PKZip local file header signature: 0x04034b50 -> 'PK\x03\x04'
    assert.strictEqual(zipBuffer[0], 0x50, 'Byte 0 must be P');
    assert.strictEqual(zipBuffer[1], 0x4b, 'Byte 1 must be K');
    assert.strictEqual(zipBuffer[2], 0x03, 'Byte 2 must be 0x03');
    assert.strictEqual(zipBuffer[3], 0x04, 'Byte 3 must be 0x04');

    // Test with Linux /usr/bin/unzip if available
    const tmpZipPath = path.join(os.tmpdir(), `robos-elearning-test-${Date.now()}.zip`);
    fs.writeFileSync(tmpZipPath, zipBuffer);

    try {
      if (fs.existsSync('/usr/bin/unzip')) {
        const unzipOutput = execFileSync('/usr/bin/unzip', ['-t', tmpZipPath], { encoding: 'utf8' });
        assert.ok(unzipOutput.includes('No errors detected in compressed data'), 'unzip -t must report no errors');
        assert.ok(unzipOutput.includes('index.html'), 'unzip output must list index.html');
        assert.ok(unzipOutput.includes('metadata.json'), 'unzip output must list metadata.json');
      }
    } finally {
      if (fs.existsSync(tmpZipPath)) fs.unlinkSync(tmpZipPath);
    }
  });

  it('3. buildStandaloneSlideHtml() generates a self-contained offline slide with labs and quizzes', () => {
    const mockSlide = {
      id: 'slide-tactical-ai',
      title: 'Tactical Infinity AI Engine Architecture',
      durationMinutes: 20,
      overview: 'In-depth analysis of turn-based state trees and heuristic utility scoring.',
      labSteps: [
        'Inspect `ai_controller.gd` utility evaluator.',
        'Trigger tactical flanking maneuver in headless simulation.',
      ],
      quiz: [
        {
          question: 'What is the primary evaluation model in tactical combat?',
          options: ['Minimax Tree', 'Utility Scoring Curve', 'Random Choice'],
          answer: 'Utility Scoring Curve',
          explanation: 'Utility curves weigh threat vectors and spell slots simultaneously.',
        },
      ],
    };

    const mockCourse = {
      '@id': 'urn:robos:course:crpg-tactics',
      'dcterms:title': 'Mastering Tactical cRPG Combat Systems',
    };

    const mockApp = {
      '@id': 'robos-crpg',
      'dcterms:title': 'Realm of Heroes cRPG',
    };

    const html = buildStandaloneSlideHtml({
      slide: mockSlide,
      course: mockCourse,
      application: mockApp,
      slideIndex: 2,
      totalSlides: 5,
    });

    assert.ok(html.includes('Tactical Infinity AI Engine Architecture'), 'Must contain slide title');
    assert.ok(html.includes('Mastering Tactical cRPG Combat Systems'), 'Must contain course title');
    assert.ok(html.includes('Slide 3 of 5'), 'Must contain slide index progression');
    assert.ok(html.includes('Utility Scoring Curve'), 'Must contain quiz answer');
    assert.ok(html.includes('Inspect <code>ai_controller.gd</code>'), 'Must format inline code in lab steps');
    assert.ok(html.includes('link rel="stylesheet" href="style.css"'), 'Must link to style.css');
  });

  it('4. Electron app files (index.html, style.css, app.js) contain slide menu and editor controls', () => {
    const htmlPath = path.join(rootRepo, 'packages', 'robos-elearning', 'renderer', 'index.html');
    const cssPath = path.join(rootRepo, 'packages', 'robos-elearning', 'renderer', 'style.css');
    const jsPath = path.join(rootRepo, 'packages', 'robos-elearning', 'renderer', 'app.js');

    const html = fs.readFileSync(htmlPath, 'utf8');
    const css = fs.readFileSync(cssPath, 'utf8');
    const js = fs.readFileSync(jsPath, 'utf8');

    // index.html checks
    assert.ok(html.includes('btn-toggle-editor'), 'HTML must have editor mode toggle');
    assert.ok(html.includes('btn-save-course'), 'HTML must have save course button');
    assert.ok(html.includes('btn-copy-course-path'), 'HTML must have copy course path button');
    assert.ok(html.includes('slide-editor-modal'), 'HTML must contain slide editor modal');
    assert.ok(html.includes('toast-notice'), 'HTML must contain toast notice element');

    // style.css checks
    assert.ok(css.includes('.slide-header-actions'), 'CSS must define slide-header-actions');
    assert.ok(css.includes('.slide-menu-container'), 'CSS must define slide-menu-container');
    assert.ok(css.includes('.slide-dropdown-menu'), 'CSS must define slide-dropdown-menu');
    assert.ok(css.includes('.toast-notice'), 'CSS must define toast-notice');
    assert.ok(css.includes('.copy-tab-path-link'), 'CSS must define copy-tab-path-link');
    assert.ok(css.includes('.module-item-footer'), 'CSS must define module-item-footer');

    // app.js checks
    assert.ok(js.includes('toggleSlideMenu'), 'app.js must define toggleSlideMenu');
    assert.ok(js.includes('copySlidePath'), 'app.js must define copySlidePath');
    assert.ok(js.includes('copyTabPath'), 'app.js must define copyTabPath');
    assert.ok(js.includes('copyCoursePath'), 'app.js must define copyCoursePath');
    assert.ok(js.includes('getSlidePath'), 'app.js must define getSlidePath');
    assert.ok(js.includes('copy-tab-path-link'), 'app.js must render copy-tab-path-link on module tabs');
    assert.ok(js.includes('Copy as Path'), 'app.js must display Copy as Path text');
    assert.ok(js.includes('copySlideGitUrl'), 'app.js must define copySlideGitUrl');
    assert.ok(js.includes('exportSlideAsZip'), 'app.js must define exportSlideAsZip');
    assert.ok(js.includes('copySlideMarkdown'), 'app.js must define copySlideMarkdown');
    assert.ok(js.includes('copySlideUri'), 'app.js must define copySlideUri');
    assert.ok(js.includes('openSlideEditor'), 'app.js must define openSlideEditor');
  });

  it('5. Web generator includes slide menu, git copying, copy as path tabs, and pure-JS zip exporter', () => {
    const webGenPath = path.join(rootRepo, 'docs', 'projects', 'crpg-realm', 'elearning', 'index.html');
    assert.ok(fs.existsSync(webGenPath), 'Generated web index.html must exist');

    const content = fs.readFileSync(webGenPath, 'utf8');
    assert.ok(content.includes('slide-header-actions'), 'Generated HTML must include slide-header-actions');
    assert.ok(content.includes('Copy Path on File System'), 'Generated HTML must include Copy Path on File System');
    assert.ok(content.includes('copy-tab-path-link'), 'Generated HTML must include copy-tab-path-link on tabs');
    assert.ok(content.includes('Copy as Path'), 'Generated HTML must include Copy as Path on tabs');
    assert.ok(content.includes('function copyTabPath'), 'Generated script must include copyTabPath');
    assert.ok(content.includes('Copy Git URL Path'), 'Generated HTML must include Copy Git URL Path');
    assert.ok(content.includes('Export as HTML Zip'), 'Generated HTML must include Export as HTML Zip');
    assert.ok(content.includes('function createZipBlob'), 'Generated script must include pure-JS createZipBlob');
    assert.ok(content.includes('function exportSlideAsZip'), 'Generated script must include exportSlideAsZip');
  });

  it('6. Copy as Path format resolves valid file system paths for AI agent consumption', () => {
    const gitInfo = getGitInfo();
    const mockSlide = { id: 'mod-01-architecture', title: 'Architecture Rationale' };
    const resolvedPath = `${gitInfo.gitopsPath}#${mockSlide.id}`;

    assert.ok(resolvedPath.startsWith('/'), 'Resolved path must be an absolute path');
    assert.ok(resolvedPath.includes('.robos/elearning.yaml'), 'Resolved path must point to elearning.yaml');
    assert.ok(resolvedPath.endsWith('#mod-01-architecture'), 'Resolved path must end with module anchor ID');
  });

  it('7. Multi-repo courses resolve correct checkout path and clean slug anchor', () => {
    const appJs = fs.readFileSync(path.join(rootRepo, 'packages/robos-elearning/renderer/app.js'), 'utf8');
    assert.ok(appJs.includes('resolveGitopsPathForCourse'), 'app.js must define resolveGitopsPathForCourse');
    assert.ok(appJs.includes('getCourseAnchorSlug'), 'app.js must define getCourseAnchorSlug');

    const resolveFn = new Function('course', 'srcInfo', appJs.match(/function resolveGitopsPathForCourse[\s\S]*?^}/m)[0] + '; return resolveGitopsPathForCourse(course, srcInfo);');
    const slugFn = new Function('course', appJs.match(/function getCourseAnchorSlug[\s\S]*?^}/m)[0] + '; return getCourseAnchorSlug(course);');

    const hermetiqCourse = {
      '@id': 'urn:hermetiq:elearning:grpc-cache-proxy',
      'robos:gitopsFile': 'projects/grpc-cache-proxy/elearning/course.json',
      'robos:evidence': [{ repository: 'Hermetiq/hermetiq-genai-agent' }],
    };

    const resolved = resolveFn(hermetiqCourse, { repoRoot: '/home/ndipiazza/source/robos' });
    const slug = slugFn(hermetiqCourse);

    assert.equal(resolved, '/home/ndipiazza/source/hermetiq/hermetiq-genai-agent/projects/grpc-cache-proxy/elearning/course.json');
    assert.equal(slug, 'grpc-cache-proxy', 'Anchor slug must strip urn:*:elearning: prefix');
    assert.ok(fs.existsSync(resolved), 'Resolved path must physically exist on disk');
  });

  it('8. renderOverviewContent formats rich markdown and preserves semantic HTML', () => {
    const { renderOverviewContent } = require(path.join(rootRepo, 'packages/robos-elearning/main.js'));
    assert.ok(typeof renderOverviewContent === 'function', 'main.js must export renderOverviewContent');

    // 1. Markdown conversion
    const md = '### Test Header\n\nThis is **bold** and *italic* with `inline code`.\n\n- Bullet 1\n- Bullet 2\n\n| Param | Value |\n|---|---|\n| Mode | Fast |\n\n```bash\necho hello\n```';
    const htmlFromMd = renderOverviewContent(md);
    assert.ok(htmlFromMd.includes('<h3>Test Header</h3>'), 'Must render h3');
    assert.ok(htmlFromMd.includes('<strong>bold</strong>'), 'Must render strong');
    assert.ok(htmlFromMd.includes('<em>italic</em>'), 'Must render em');
    assert.ok(htmlFromMd.includes('<code>inline code</code>'), 'Must render inline code');
    assert.ok(htmlFromMd.includes('<ul><li>Bullet 1</li><li>Bullet 2</li></ul>'), 'Must render ul/li');
    assert.ok(htmlFromMd.includes('<table><thead><tr><th>Param</th><th>Value</th></tr></thead>'), 'Must render table');
    assert.ok(htmlFromMd.includes('<pre><code class="language-bash">echo hello</code></pre>'), 'Must render code block');

    // 2. HTML preservation
    const mixedHtml = '<p>A Bazel build asks Buildbarn for cached results.</p>\n<dl><dt>gRPC</dt><dd>The RPC protocol</dd></dl>\n<figure class="flow-diagram"><img src="data:image/jpeg;base64,123"></figure>';
    const htmlFromHtml = renderOverviewContent(mixedHtml);
    assert.ok(htmlFromHtml.includes('<dl><dt>gRPC</dt><dd>The RPC protocol</dd></dl>'), 'Must preserve dl/dt/dd');
    assert.ok(htmlFromHtml.includes('<figure class="flow-diagram"><img src="data:image/jpeg;base64,123"></figure>'), 'Must preserve figure');
  });

  it('9. Zoom controls (Ctrl +, Ctrl -, Ctrl 0) are wired in Electron main, preload, renderer, and web generator', () => {
    // 1. Verify preload.js exposes zoom controls
    const preloadJs = fs.readFileSync(path.join(rootRepo, 'packages/robos-elearning/preload.js'), 'utf8');
    assert.ok(preloadJs.includes('getZoom:'), 'preload.js must expose getZoom');
    assert.ok(preloadJs.includes('setZoom:'), 'preload.js must expose setZoom');
    assert.ok(preloadJs.includes('zoomIn:'), 'preload.js must expose zoomIn');
    assert.ok(preloadJs.includes('zoomOut:'), 'preload.js must expose zoomOut');
    assert.ok(preloadJs.includes('zoomReset:'), 'preload.js must expose zoomReset');
    assert.ok(preloadJs.includes('onZoomChanged:'), 'preload.js must expose onZoomChanged');

    // 2. Verify main.js handles before-input-event and IPC handlers
    const mainJs = fs.readFileSync(path.join(rootRepo, 'packages/robos-elearning/main.js'), 'utf8');
    assert.ok(mainJs.includes('before-input-event'), 'main.js must listen for before-input-event');
    assert.ok(mainJs.includes("elearning:get-zoom"), 'main.js must handle elearning:get-zoom');
    assert.ok(mainJs.includes("elearning:set-zoom"), 'main.js must handle elearning:set-zoom');
    assert.ok(mainJs.includes("elearning:zoom-in"), 'main.js must handle elearning:zoom-in');
    assert.ok(mainJs.includes("elearning:zoom-out"), 'main.js must handle elearning:zoom-out');
    assert.ok(mainJs.includes("elearning:zoom-reset"), 'main.js must handle elearning:zoom-reset');
    assert.ok(mainJs.includes("elearning:zoom-changed"), 'main.js must broadcast elearning:zoom-changed');

    // 3. Verify renderer app.js defines zoom controls and indicator
    const appJs = fs.readFileSync(path.join(rootRepo, 'packages/robos-elearning/renderer/app.js'), 'utf8');
    assert.ok(appJs.includes('function showZoomIndicator'), 'app.js must define showZoomIndicator');
    assert.ok(appJs.includes('function initZoomControls'), 'app.js must define initZoomControls');
    assert.ok(appJs.includes('initZoomControls()'), 'app.js must initialize zoom controls in initApp');
    assert.ok(appJs.includes('async function zoomIn'), 'app.js must define zoomIn');
    assert.ok(appJs.includes('async function zoomOut'), 'app.js must define zoomOut');
    assert.ok(appJs.includes('async function zoomReset'), 'app.js must define zoomReset');

    // 4. Verify style.css defines .zoom-indicator and .zoom-indicator.visible
    const styleCss = fs.readFileSync(path.join(rootRepo, 'packages/robos-elearning/renderer/style.css'), 'utf8');
    assert.ok(styleCss.includes('.zoom-indicator {'), 'style.css must style .zoom-indicator');
    assert.ok(styleCss.includes('.zoom-indicator.visible {'), 'style.css must style .zoom-indicator.visible');

    // 5. Verify standalone exported slides and web generator include zoom controls
    assert.ok(SLIDE_OFFLINE_CSS.includes('.zoom-indicator {'), 'SLIDE_OFFLINE_CSS must include .zoom-indicator');
    const webGenJs = fs.readFileSync(path.join(rootRepo, 'packages/robos-graph/lib/elearning-web-generator.js'), 'utf8');
    assert.ok(webGenJs.includes('.zoom-indicator {'), 'web generator must include .zoom-indicator style');
    assert.ok(webGenJs.includes('function showZoomIndicator'), 'web generator must define showZoomIndicator');
  });
});


