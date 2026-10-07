'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');
const cli = path.resolve(__dirname, '../../../robos-lib/evidence-runner-cli.js');
const template = require('../../../robos-lib/evidence-templates').BUILTIN[3];

function fixture(mode = 'pass') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'evidence-cli-'));
  execFileSync('git', ['init', '-q', root]);
  execFileSync('git', ['-C', root, '-c', 'user.name=Test', '-c', 'user.email=test@example.test', 'commit', '--allow-empty', '-qm', 'baseline']);
  const agent = path.join(root, 'fixture-agent');
  fs.writeFileSync(agent, `#!/usr/bin/env node
const fs = require('node:fs'), path = require('node:path');
const output = process.argv[process.argv.indexOf('--output-last-message') + 1];
let prompt = ''; process.stdin.on('data', data => prompt += data);
process.stdin.on('end', () => {
  if (${JSON.stringify(mode)} === 'error') process.exit(3);
  fs.writeFileSync(path.join(path.dirname(output), 'request.txt'), prompt);
  fs.writeFileSync(path.join(path.dirname(output), 'response.txt'), 'Fixture child executed; not MCP product evidence.');
  fs.writeFileSync(output, JSON.stringify({summary:'Fixture execution', questions:[],
    scenarios:[{id:'capture', status:'passed', summary:'Observed child output', artifacts:['request.txt','response.txt']}],
    templateArtifacts:[{scenarioId:'capture',slotId:'result',path:'response.txt'}]}));
});`, { mode: 0o700 });
  const review = path.join(root, 'review.json');
  const plan = path.join(root, 'plan.json');
  fs.writeFileSync(review, JSON.stringify({workspace:root,title:'CLI lifecycle test',demoAgent:{command:agent,args:['exec'],evidenceTimeoutMs:2000}}));
  fs.writeFileSync(plan, JSON.stringify({markdown:'Capture the fixture child output.',scenarios:[{id:'capture',title:'Capture output'},...(mode==='missing'?[{id:'unreturned',title:'Missing check'}]:[])],template}));
  const output = path.join(root, 'new-run');
  return {root, output, args:[cli,'--review',review,'--plan',plan,'--output-dir',output]};
}

test('headless CLI executes the shared runner and will not overwrite a prior run', () => {
  const f = fixture();
  const child = spawnSync(process.execPath, f.args, {encoding:'utf8'});
  assert.equal(child.status, 0, child.stderr);
  const reported = JSON.parse(child.stdout);
  const bundle = JSON.parse(fs.readFileSync(reported.resultPath));
  assert.equal(bundle['@type'], 'robos:EvidenceBundle');
  assert.equal(bundle.scenarios[0].title, 'Capture output');
  assert.equal(bundle.templateBindings.length, 1);
  assert.match(fs.readFileSync(bundle.artifacts[0].path, 'utf8'), /Do not invent assistant exchanges/);
  const original = fs.readFileSync(reported.resultPath, 'utf8');
  const repeat = spawnSync(process.execPath, f.args, {encoding:'utf8'});
  assert.equal(repeat.status, 1);
  assert.equal(fs.readFileSync(reported.resultPath, 'utf8'), original);
});

test('missing checks return needs-attention and agent failure returns an error', () => {
  for (const [mode, code, status] of [['missing',2,'needs-attention'],['error',1,'error']]) {
    const f = fixture(mode);
    const child = spawnSync(process.execPath, f.args, {encoding:'utf8'});
    assert.equal(child.status, code, child.stderr);
    assert.equal(JSON.parse(child.stdout).status, status);
  }
});

test('review adapter and CLI use the same library, with no Electron dependency', () => {
  assert.equal(require('../../../pr-review/lib/evidence-runner'), require('../../../robos-lib/evidence-runner'));
  assert.doesNotMatch(fs.readFileSync(path.resolve(__dirname,'../../../robos-lib/evidence-runner.js'),'utf8'), /require\(['"].*(?:electron|pr-review)/);
});

test('presentation refresh preserves capture timestamps and invalidates altered artifacts', () => {
 const f=fixture();
 const child=spawnSync(process.execPath,f.args,{encoding:'utf8'});
 assert.equal(child.status,0,child.stderr);
 const source=JSON.parse(child.stdout).resultPath;
 const original=JSON.parse(fs.readFileSync(source));
 const output=path.join(f.root,'refreshed.json');
 const {run}=require('../../../robos-lib/evidence-template-cli');
 let bundle=run(['refresh','--bundle',source,'--workspace',f.root,'--output',output]);
 assert.equal(bundle.finishedAt,original.finishedAt);
 assert.deepEqual(bundle.artifacts,original.artifacts);
 assert.equal(bundle.regeneration.kind,'presentation-only');
 fs.appendFileSync(original.artifacts[0].path,'changed');
 bundle=run(['refresh','--bundle',source,'--workspace',f.root,'--output',output]);
 assert.equal(bundle.status,'needs-attention');
 assert.equal(bundle.scenarios[0].status,'blocked');
 const review={workspace:f.root,evidenceBundlePath:output};
 assert.throws(()=>require('../../../pr-review/lib/task-evidence-view').read(review,original.artifacts[0].id),/changed/);
 assert.throws(()=>require('../../../pr-review/lib/task-evidence-view').read(review,'unknown'),/Unknown/);
});
