'use strict';

// Reruns the cRPG eLearning generators on temporary copies of the committed files.
// Every generator runs in a child process with its working directory and HOME inside
// the copy, because the generator resolves docs paths from process.cwd().

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const { spawnSync } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');

const { parseLivingDocMarkdown } = require('../../../robos-graph/lib/elearning-web-generator');

const REPO_ROOT = path.resolve(__dirname, '../../../../');
const COPIED_PATHS = [
  '.robos',
  'docs/projects/crpg-realm',
  'packages/robos-graph',
  'packages/robos-elearning/cli-export-web.js',
  'packages/crpg-game-builder-elearning',
  'scripts/export-crpg-game-builder-training.js',
];
const COURSE_PAGE = 'docs/projects/crpg-realm/elearning/index.html';
const BUILDER_PAGE = 'docs/projects/crpg-realm/create-your-own-game/elearning/index.html';
const BUNDLED_COURSE = 'packages/crpg-game-builder-elearning/renderer/course.html';
const APP_FILES = ['main.js', 'package.json', 'build-course.js', 'crpg-game-builder-elearning.desktop', 'icon.svg', 'icon.png']
  .map(file => `packages/crpg-game-builder-elearning/${file}`);
const COURSE_ID = 'urn:robos:elearning:course:robos-crpg';
const BUILDER_ID = 'urn:robos:elearning:course:crpg-game-builder';
const REGENERATE_HINT = 'If the generator template or the course changed on purpose, regenerate the pages: '
  + 'node scripts/export-crpg-game-builder-training.js and '
  + `ROBOS_GRAPH_ROOT=.robos node packages/robos-elearning/cli-export-web.js --course=${COURSE_ID}`;

const temporaryRoots = [];

function createFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'robos-crpg-rerun-'));
  temporaryRoots.push(root);
  for (const rel of COPIED_PATHS) {
    fs.cpSync(path.join(REPO_ROOT, rel), path.join(root, rel), { recursive: true });
  }
  return root;
}

function runNode(root, args, env = {}) {
  const baseEnv = { ...process.env, HOME: root, ...env };
  if (!env.ROBOS_GRAPH_ROOT) delete baseEnv.ROBOS_GRAPH_ROOT;
  const result = spawnSync(process.execPath, args, { cwd: root, env: baseEnv, encoding: 'utf8' });
  assert.strictEqual(result.status, 0, `node ${args[0]} failed:\n${result.stdout}\n${result.stderr}`);
  return result;
}

function runExportScript(root) {
  return runNode(root, ['scripts/export-crpg-game-builder-training.js']);
}

function generate(root, options) {
  const code = `
    const path = require('path');
    const { SDLCKnowledgeGraphStore } = require(path.resolve('packages/robos-graph/index.js'));
    const store = new SDLCKnowledgeGraphStore({ filePath: path.resolve('.robos/knowledge-graph.jsonld'), rootDir: path.resolve('.robos') });
    const result = store.generateELearningWebsite(${JSON.stringify(options)});
    if (!result.ok) throw new Error(result.error);
  `;
  return runNode(root, ['-e', code]);
}

function read(root, rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function hashTree(dir) {
  const hashes = {};
  for (const entry of fs.readdirSync(dir, { withFileTypes: true, recursive: true })) {
    if (!entry.isFile()) continue;
    const file = path.join(entry.parentPath, entry.name);
    hashes[path.relative(dir, file)] = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  }
  return hashes;
}

function hashFiles(root, files) {
  return Object.fromEntries(files.map(rel => [rel, crypto.createHash('sha256').update(fs.readFileSync(path.join(root, rel))).digest('hex')]));
}

function frontMatterOf(html) {
  return html.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n/)[0];
}

function articleOf(html) {
  return html.match(/<article class="doc-article">\s*([\s\S]*?)\s*<\/article>/)[1];
}

// The embedded graph data follows the graph, so a graph edit is not a page regression.
function withoutGraphData(html) {
  return html.replace(/^\s*const (COURSE|MODULES|APP)_DATA = .*$/gm, '');
}

function withoutArticle(html) {
  return html.replace(articleOf(html), '');
}

function embeddedData(html, name) {
  return JSON.parse(html.match(new RegExp(`^\\s*const ${name} = (.*);$`, 'm'))[1]);
}

function assertInlineScriptsParse(html, label) {
  const scripts = [...html.matchAll(/<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/g)];
  assert.ok(scripts.length > 0, `${label} must have an inline script`);
  for (const [, source] of scripts) {
    assert.doesNotThrow(() => new vm.Script(source), `${label} must have valid inline JavaScript`);
  }
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  }
  return value;
}

function replaceInFile(root, rel, pattern, replacement) {
  const before = read(root, rel);
  const after = before.replace(pattern, () => replacement);
  assert.notStrictEqual(after, before, `${pattern} must match ${rel}`);
  fs.writeFileSync(path.join(root, rel), after);
}

describe('cRPG eLearning generators are safe to rerun', () => {
  const realFiles = [
    COURSE_PAGE,
    BUILDER_PAGE,
    BUNDLED_COURSE,
    ...APP_FILES,
    '.robos/knowledge-graph.jsonld',
    '.robos/kgraphs/learning/package.jsonld',
    '.robos/kgraphs/crpg/package.jsonld',
  ];
  let realHashesBefore;

  before(() => {
    realHashesBefore = hashFiles(REPO_ROOT, realFiles);
  });

  after(() => {
    for (const root of temporaryRoots) fs.rmSync(root, { recursive: true, force: true });
  });

  describe('course generator on the committed course page', () => {
    let root;
    let committed;
    let regenerated;

    before(() => {
      root = createFixture();
      committed = read(root, COURSE_PAGE);
      generate(root, { courseId: COURSE_ID });
      regenerated = read(root, COURSE_PAGE);
    });

    it('keeps the page apart from the embedded graph data', () => {
      assert.ok(withoutGraphData(regenerated) === withoutGraphData(committed), `Rerun changed ${COURSE_PAGE}. ${REGENERATE_HINT}`);
    });

    it('keeps the Engine Specification, whose markdown source no longer exists', () => {
      assert.ok(!fs.existsSync(path.join(root, 'docs/projects/crpg-realm/elearning-masterclass.md')));
      assert.ok(regenerated.includes('<h1>Engine Specification</h1>'));
      assert.ok(!regenerated.includes('No living documentation markdown source attached'));
    });

    it('keeps the front matter description and adds no retired redirects', () => {
      assert.strictEqual(frontMatterOf(regenerated), frontMatterOf(committed));
      assert.match(frontMatterOf(regenerated), /^description: /m);
      assert.ok(!regenerated.includes('/elearning/robos-crpg-engine'));
    });

    it('embeds the current graph nodes', () => {
      const graph = JSON.parse(read(root, '.robos/knowledge-graph.jsonld'));
      const course = graph['robos:nodes'].find(node => node['@id'] === COURSE_ID);
      const app = graph['robos:nodes'].find(node => node['@id'] === course['robos:targetApplication']);
      assert.deepStrictEqual(canonical(embeddedData(regenerated, 'COURSE_DATA')), canonical(course));
      assert.deepStrictEqual(canonical(embeddedData(regenerated, 'APP_DATA')), canonical(app));
    });

    it('has page scripts that parse', () => {
      assertInlineScriptsParse(regenerated, COURSE_PAGE);
    });

    it('gives the same bytes on a second run', () => {
      generate(root, { courseId: COURSE_ID });
      assert.ok(read(root, COURSE_PAGE) === regenerated);
    });

    it('matches through the documented CLI command, which leaves the graph alone', () => {
      const cliRoot = createFixture();
      const graphBefore = hashTree(path.join(cliRoot, '.robos'));
      runNode(cliRoot, ['packages/robos-elearning/cli-export-web.js', `--course=${COURSE_ID}`], { ROBOS_GRAPH_ROOT: '.robos' });
      assert.deepStrictEqual(hashTree(path.join(cliRoot, '.robos')), graphBefore);
      assert.ok(read(cliRoot, COURSE_PAGE) === regenerated);
    });
  });

  describe('export script on the committed Game Builder files', () => {
    let root;
    let committedPage;
    let committedBundle;
    let graphBefore;
    let appBefore;

    before(() => {
      root = createFixture();
      committedPage = read(root, BUILDER_PAGE);
      committedBundle = read(root, BUNDLED_COURSE);
      graphBefore = hashTree(path.join(root, '.robos'));
      appBefore = hashFiles(root, APP_FILES);
      runExportScript(root);
    });

    it('does not write to the graph', () => {
      assert.deepStrictEqual(hashTree(path.join(root, '.robos')), graphBefore);
    });

    it('does not change the maintained app files', () => {
      assert.deepStrictEqual(hashFiles(root, APP_FILES), appBefore);
      assert.match(read(root, APP_FILES[0]), /renderer', 'course\.html'/);
      assert.match(read(root, APP_FILES[3]), /^StartupWMClass=robos-crpg-game-builder-elearning$/m);
    });

    it('keeps the navigation front matter', () => {
      const frontMatter = frontMatterOf(read(root, BUILDER_PAGE));
      assert.strictEqual(frontMatter, frontMatterOf(committedPage));
      assert.match(frontMatter, /^parent: Extending the CRPG$/m);
      assert.match(frontMatter, /^grand_parent: Realm of Heroes CRPG$/m);
      assert.match(frontMatter, /^nav_order: 4$/m);
    });

    it('keeps the page and bundle apart from graph data and the doc tab', () => {
      const clean = html => withoutArticle(withoutGraphData(html));
      assert.ok(clean(read(root, BUILDER_PAGE)) === clean(committedPage), `Rerun changed ${BUILDER_PAGE}. ${REGENERATE_HINT}`);
      assert.ok(clean(read(root, BUNDLED_COURSE)) === clean(committedBundle), `Rerun changed ${BUNDLED_COURSE}. ${REGENERATE_HINT}`);
    });

    it('renders the doc tab from the maintained guide', () => {
      const article = articleOf(read(root, BUILDER_PAGE));
      assert.ok(article.startsWith('<h1>Extending the CRPG</h1>'));
      assert.ok(!article.includes('<td>relative_url'), 'A Liquid pipe must not split a table cell');
    });

    it('builds a standalone bundle without Jekyll markup and with scripts that parse', () => {
      const bundle = read(root, BUNDLED_COURSE);
      assertInlineScriptsParse(read(root, BUILDER_PAGE), BUILDER_PAGE);
      assertInlineScriptsParse(bundle, BUNDLED_COURSE);
      assert.ok(bundle.startsWith('<!DOCTYPE html>'));
      assert.ok(!bundle.includes('| relative_url }}'));
    });

    it('gives the same bytes on a second run', () => {
      const page = read(root, BUILDER_PAGE);
      const bundle = read(root, BUNDLED_COURSE);
      runExportScript(root);
      assert.ok(read(root, BUILDER_PAGE) === page);
      assert.ok(read(root, BUNDLED_COURSE) === bundle);
    });

    it('keeps later hand edits to the front matter and app files', () => {
      const editedRoot = createFixture();
      replaceInFile(editedRoot, BUILDER_PAGE, /^nav_order: 4$/m, 'nav_order: 12');
      replaceInFile(editedRoot, APP_FILES[0], /^'use strict';$/m, "'use strict';\n// hand edit");
      runExportScript(editedRoot);
      assert.match(frontMatterOf(read(editedRoot, BUILDER_PAGE)), /^nav_order: 12$/m);
      assert.ok(read(editedRoot, APP_FILES[0]).includes('// hand edit'));
    });
  });

  describe('maintained page parts', () => {
    const output = 'out/course/index.html';
    const permalink = '/out/course/';
    let root;
    const publishedPage = () => read(root, output);

    before(() => {
      root = createFixture();
    });

    it('writes default front matter and the placeholder for a new page', () => {
      generate(root, { courseId: BUILDER_ID, outputFilePath: path.resolve(root, output), permalink });
      const page = publishedPage();
      assert.match(frontMatterOf(page), /^description: "The definitive/m);
      assert.match(frontMatterOf(page), new RegExp(`^permalink: ${permalink}$`, 'm'));
      assert.ok(!frontMatterOf(page).includes('/elearning/robos-crpg-engine'));
      assert.ok(articleOf(page).includes('No living documentation markdown source attached'));
    });

    it('keeps a published doc tab when no source is found', () => {
      replaceInFile(root, output, 'No living documentation markdown source attached.', 'Only copy of this text. Costs $1 & $& more.');
      generate(root, { courseId: BUILDER_ID, outputFilePath: path.resolve(root, output) });
      assert.ok(articleOf(publishedPage()).includes('Only copy of this text. Costs $1 & $& more.'));
    });

    it('reuses the published permalink when the caller does not give one', () => {
      assert.ok(publishedPage().includes(`<link rel="canonical" href="https://rowbose.com/v1${permalink}">`));
    });

    it('replaces the doc tab when a source exists and still keeps the front matter', () => {
      const frontMatter = frontMatterOf(publishedPage());
      fs.writeFileSync(path.join(root, 'out/guide.md'), '# Fresh guide\n\nBody text.\n');
      generate(root, { courseId: BUILDER_ID, outputFilePath: path.resolve(root, output), docFilePath: path.resolve(root, 'out/guide.md') });
      const page = publishedPage();
      assert.ok(articleOf(page).startsWith('<h1>Fresh guide</h1>'));
      assert.ok(!page.includes('Only copy of this text'));
      assert.strictEqual(frontMatterOf(page), frontMatter);
    });

    it('changes only the permalink line when the caller moves the page', () => {
      const frontMatter = frontMatterOf(publishedPage());
      generate(root, { courseId: BUILDER_ID, outputFilePath: path.resolve(root, output), permalink: '/moved/course/' });
      const moved = frontMatterOf(publishedPage());
      assert.strictEqual(moved, frontMatter.replace(`permalink: ${permalink}`, 'permalink: /moved/course/'));
      assert.ok(publishedPage().includes('<link rel="canonical" href="https://rowbose.com/v1/moved/course/">'));
    });
  });

  describe('living doc markdown', () => {
    it('keeps a Liquid filter inside one table cell and renders inline markdown there', () => {
      const html = parseLivingDocMarkdown([
        '| Want | Use |',
        '|:---|:---|',
        "| Maps | The [editor]({{ '/editor.html' | relative_url }}) and `data/` |",
        '',
      ].join('\n'));
      assert.ok(html.includes(`<td>The <a href="{{ '/editor.html' | relative_url }}"`));
      assert.ok(html.includes('<code>data/</code></td></tr>'));
    });

    it('wraps text that directly follows a table in a paragraph', () => {
      const html = parseLivingDocMarkdown('| A |\n|---|\n| b |\nNext line.\n');
      assert.ok(html.includes('</table>\n\n<p>Next line.</p>'));
    });

    it('drops the Kramdown table of contents block', () => {
      const html = parseLivingDocMarkdown('# T\n\n<details open markdown="block">\n  <summary>On this page</summary>\n  {: .text-delta }\n1. TOC\n{:toc}\n</details>\n\n## Next\n');
      assert.ok(!html.includes('details'));
      assert.ok(!html.includes('1. TOC'));
      assert.ok(html.includes('<h2>Next</h2>'));
    });

    it('restores code blocks containing dollar patterns unchanged', () => {
      const html = parseLivingDocMarkdown('```sh\necho "$& $1"\n```\n');
      assert.ok(html.includes('echo "$&amp; $1"'));
    });

    it('escapes HTML tags and protects asterisks and dollar signs inside inline code spans', () => {
      const html = parseLivingDocMarkdown(
        'Inspects HTML `<title>` and `<table>` tags, `file_*.png` and `other_*.png`, plus `$B100` and `$B400`.\n'
      );
      assert.ok(!html.includes('<code><title></code>'), 'Must not emit raw <title> RCDATA tag');
      assert.ok(html.includes('<code>&lt;title&gt;</code>'));
      assert.ok(html.includes('<code>&lt;table&gt;</code>'));
      assert.ok(html.includes('<code>file_*.png</code>'));
      assert.ok(html.includes('<code>$B100</code>'));
      assert.ok(html.includes('<code>$B400</code>'));
    });
  });

  it('never touches the real repository files', () => {
    assert.deepStrictEqual(hashFiles(REPO_ROOT, realFiles), realHashesBefore);
  });
});
