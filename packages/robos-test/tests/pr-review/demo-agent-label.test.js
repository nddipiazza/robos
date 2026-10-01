'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {agentLabel}=require('../../../pr-review/lib/demo-agent-label');
test('labels resolve config, selected profile, and command overrides',()=>{
 const file=path.join(fs.mkdtempSync(path.join(os.tmpdir(),'agent-label-')),'config.toml');
 fs.writeFileSync(file,'model = "default-model"\nmodel_reasoning_effort = "medium"\n[profiles.review]\nmodel = "review-model"\nmodel_reasoning_effort = "high"\n');
 assert.equal(agentLabel({},file),'Codex · default-model · medium reasoning');
 assert.equal(agentLabel({args:['exec','-p','review']},file),'Codex · review-model · high reasoning');
 assert.equal(agentLabel({args:['exec','-p','review','--model','chosen-model','-c','model_reasoning_effort="low"']},file),'Codex · chosen-model · low reasoning');
 assert.equal(agentLabel({},file+'.missing'),'Codex · model not reported · reasoning not reported');
});
