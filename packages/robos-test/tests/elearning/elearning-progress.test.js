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
