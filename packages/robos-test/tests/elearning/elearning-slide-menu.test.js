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
    assert.ok(html.includes('slide-editor-modal'), 'HTML must contain slide editor modal');
    assert.ok(html.includes('toast-notice'), 'HTML must contain toast notice element');

    // style.css checks
    assert.ok(css.includes('.slide-header-actions'), 'CSS must define slide-header-actions');
    assert.ok(css.includes('.slide-menu-container'), 'CSS must define slide-menu-container');
    assert.ok(css.includes('.slide-dropdown-menu'), 'CSS must define slide-dropdown-menu');
    assert.ok(css.includes('.toast-notice'), 'CSS must define toast-notice');

    // app.js checks
    assert.ok(js.includes('toggleSlideMenu'), 'app.js must define toggleSlideMenu');
    assert.ok(js.includes('copySlidePath'), 'app.js must define copySlidePath');
    assert.ok(js.includes('copySlideGitUrl'), 'app.js must define copySlideGitUrl');
    assert.ok(js.includes('exportSlideAsZip'), 'app.js must define exportSlideAsZip');
    assert.ok(js.includes('copySlideMarkdown'), 'app.js must define copySlideMarkdown');
    assert.ok(js.includes('copySlideUri'), 'app.js must define copySlideUri');
    assert.ok(js.includes('openSlideEditor'), 'app.js must define openSlideEditor');
  });

  it('5. Web generator includes slide menu, git copying and pure-JS zip exporter', () => {
    const webGenPath = path.join(rootRepo, 'docs', 'projects', 'crpg-realm', 'elearning', 'index.html');
    assert.ok(fs.existsSync(webGenPath), 'Generated web index.html must exist');

    const content = fs.readFileSync(webGenPath, 'utf8');
    assert.ok(content.includes('slide-header-actions'), 'Generated HTML must include slide-header-actions');
    assert.ok(content.includes('Copy Path on File System'), 'Generated HTML must include Copy Path on File System');
    assert.ok(content.includes('Copy Git URL Path'), 'Generated HTML must include Copy Git URL Path');
    assert.ok(content.includes('Export as HTML Zip'), 'Generated HTML must include Export as HTML Zip');
    assert.ok(content.includes('function createZipBlob'), 'Generated script must include pure-JS createZipBlob');
    assert.ok(content.includes('function exportSlideAsZip'), 'Generated script must include exportSlideAsZip');
  });
});
