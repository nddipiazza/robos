'use strict';

// RobOS eLearning: saved learner progress and the Getting Started course data.
const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { readProgressFile, writeProgressFile } = require('../../../robos-elearning/main');

const rootRepo = path.resolve(__dirname, '../../../../');
const learningPkg = path.join(rootRepo, '.robos', 'kgraphs', 'learning', 'package.jsonld');
const rendererDir = path.join(rootRepo, 'packages', 'robos-elearning', 'renderer');

describe('RobOS eLearning saved progress', () => {
  it('reads an empty store when no progress file exists', () => {
    const file = path.join(os.tmpdir(), `robos-elearning-missing-${Date.now()}.json`);
    const data = readProgressFile(file);
    assert.deepStrictEqual(data.courses, {});
    assert.strictEqual(data.lastCourseId, null);
  });

  it('writes and reads back progress, keeping only known fields', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'robos-elearning-'));
    const file = path.join(dir, 'nested', 'progress.json');
    writeProgressFile({
      learnerName: 'Ada',
      lastCourseId: 'urn:robos:elearning:course:getting-started-with-robos',
      courses: { 'urn:x': { labs: { 'l1:0': true }, quizzes: { 'l1:0': { correct: true, tries: 1 } }, percent: 50 } },
      unexpected: 'dropped',
    }, file);
    const back = readProgressFile(file);
    assert.strictEqual(back.learnerName, 'Ada');
    assert.strictEqual(back.courses['urn:x'].percent, 50);
    assert.strictEqual(back.unexpected, undefined);
    assert.ok(!fs.existsSync(`${file}.tmp`), 'temporary file is renamed into place');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('survives a corrupt progress file', () => {
    const file = path.join(os.tmpdir(), `robos-elearning-corrupt-${Date.now()}.json`);
    fs.writeFileSync(file, '{not json');
    assert.deepStrictEqual(readProgressFile(file).courses, {});
    fs.unlinkSync(file);
  });
});

describe('Getting Started with RobOS course', () => {
  const pkg = JSON.parse(fs.readFileSync(learningPkg, 'utf8'));
  const course = pkg['robos:nodes'].find(n => n['@id'] === 'urn:robos:elearning:course:getting-started-with-robos');

  it('is in the learning package, featured, and mirrored in @graph', () => {
    assert.ok(course, 'course node exists');
    assert.strictEqual(course['robos:featured'], true);
    assert.ok(pkg['@graph'].some(n => n['@id'] === course['@id']));
    assert.strictEqual(course['robos:modulesCount'], course['robos:modules'].length);
  });

  it('has lesson text, key ideas, lab steps and explained quiz answers in every lesson', () => {
    const ids = new Set();
    for (const m of course['robos:modules']) {
      assert.ok(m.id && !ids.has(m.id), `unique lesson id: ${m.id}`);
      ids.add(m.id);
      assert.ok(m.overview && m.body, `${m.id} has a summary and lesson text`);
      assert.ok(Array.isArray(m.keyPoints) && m.keyPoints.length, `${m.id} has key ideas`);
      assert.ok(Array.isArray(m.labSteps) && m.labSteps.length, `${m.id} has lab steps`);
      assert.ok(Array.isArray(m.quiz) && m.quiz.length, `${m.id} has quiz questions`);
      for (const q of m.quiz) {
        assert.ok(q.options.includes(q.answer), `answer is an option: ${q.question}`);
        assert.strictEqual(new Set(q.options).size, q.options.length, `no duplicate options: ${q.question}`);
        assert.ok(q.options.length >= 3, `at least three options: ${q.question}`);
        assert.ok(q.explanation, `explanation present: ${q.question}`);
      }
    }
  });

  it('describes every lab step, and every picture it shows is published', () => {
    const siteDir = path.join(rootRepo, 'site');
    for (const m of course['robos:modules']) {
      assert.strictEqual(m.labDetails.length, m.labSteps.length, `${m.id} describes each lab step`);
      const images = [...m.body.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)].map(match => match[1]);
      for (const detail of m.labDetails) {
        if (detail.image) images.push(detail.image);
      }
      for (const image of images) {
        assert.ok(image.startsWith('/assets/'), `${image} is a site path`);
        assert.ok(fs.existsSync(path.join(siteDir, image)), `${image} exists`);
      }
    }
  });

  it('does not teach features that do not exist', () => {
    const text = JSON.stringify(course['robos:modules']);
    assert.ok(!/allowance envelope/i.test(text), 'Household has no envelopes');
    assert.ok(!/Household[^.]*(your own|real) (statements|finances)[^.]*\bAI\b/i.test(text), 'Household has no AI questions');
  });

  it('shows its lesson text on the published page', () => {
    const page = fs.readFileSync(path.join(rootRepo, 'site', 'elearning', 'getting-started-with-robos', 'index.html'), 'utf8');
    const modules = JSON.parse(page.match(/const MODULES_DATA = (.*);\n/)[1]);
    assert.strictEqual(modules.length, course['robos:modules'].length);
    for (const m of modules) {
      assert.match(m.lessonHtml, /<h2>/, `${m.id} has rendered lesson text`);
      assert.doesNotMatch(m.lessonHtml, /math-inline/, `${m.id} keeps prices as text`);
    }
  });
});

describe('Lesson Markdown on the website', () => {
  const { parseLivingDocMarkdown } = require('../../../robos-graph/lib/elearning-web-generator');

  it('renders lists, tables, pictures and notes, and leaves prices alone', () => {
    const html = parseLivingDocMarkdown('A $8.16 total and $11.84 change.\n\n- one\n- `two`\n\n1. first\n2. second\n\n> **Note** text\n\n| a | b |\n|---|---|\n| c | $1 |\n\n![A till](/assets/x.png)\n\nEnd', { math: false });
    assert.match(html, /A \$8\.16 total and \$11\.84 change\./);
    assert.match(html, /<ul><li>one<\/li><li><code>two<\/code><\/li><\/ul>/);
    assert.match(html, /<ol><li>first<\/li><li>second<\/li><\/ol>/);
    assert.match(html, /<blockquote><strong>Note<\/strong> text<\/blockquote>/);
    assert.match(html, /<td>\$1<\/td>/);
    assert.match(html, /<img src="\/assets\/x\.png" alt="A till"/);
  });

  it('still treats dollar signs as math in documentation pages', () => {
    assert.match(parseLivingDocMarkdown('Energy is $E = mc^2$ here.'), /math-inline/);
  });
});

describe('RobOS eLearning renderer', () => {
  const js = fs.readFileSync(path.join(rendererDir, 'app.js'), 'utf8');
  const html = fs.readFileSync(path.join(rendererDir, 'index.html'), 'utf8');

  it('has the library, lesson player, quiz checking and certificate flows', () => {
    for (const fn of ['showLibrary', 'renderLibrary', 'openCourse', 'pickAnswer', 'checkAnswer', 'markLessonComplete', 'showCourseComplete', 'saveCertificatePdf', 'persistLearnerStore']) {
      assert.ok(js.includes(fn), `app.js defines ${fn}`);
    }
    for (const id of ['library-view', 'course-view', 'cert-modal', 'cert-name-input', 'module-nav-list']) {
      assert.ok(html.includes(`id="${id}"`), `index.html has #${id}`);
    }
  });

  it('does not claim certifications the app does not have', () => {
    assert.ok(!/SCORM/i.test(html), 'no SCORM claim');
  });
});
