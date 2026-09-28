'use strict';
// Hardware integration test: needs PipeWire and an available audio source.
const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const os = require('node:os');
const path = require('node:path');
const { pipewireSources, captureCommand } = require('../../../voice-prompt/lib/capture-device');
const { MicrophoneTest } = require('../../../voice-prompt/lib/microphone-test');
const { STTEngine } = require('../../../voice-prompt/lib/stt-engine');
const dump = () => JSON.parse(execFileSync('pw-dump', [], { encoding: 'utf8' }));
async function assertRoute(proc, source) {
  for (let attempt = 0; attempt < 30; attempt++) {
    const objects = dump();
    const client = objects.find(o => o.type === 'PipeWire:Interface:Client' && String(o.info?.props?.['application.process.id']) === String(proc.pid));
    const stream = client && objects.find(o => o.type === 'PipeWire:Interface:Node' && o.info?.props?.['client.id'] === client.id);
    const links = stream && objects.filter(o => o.type === 'PipeWire:Interface:Link' && o.info?.['input-node-id'] === stream.id);
    if (links?.length) {
      assert(links.every(link => String(link.info['output-node-id']) === source.legacyId), 'Capture must link only to the selected microphone');
      assert.equal(stream.info.props['target.object'], source.id.slice(9));
      assert.equal(stream.info.props['node.dont-fallback'], true);
      console.log(`Verified ${source.name}: source ${source.legacyId} -> capture ${stream.id}`);
      return;
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.fail('Capture did not connect to the selected source');
}
test('preview and dictation link to the selected PipeWire source, including legacy IDs', async () => {
  const sources = pipewireSources();
  const source = sources.find(s => /OBSBOT/.test(s.name)) || sources[0];
  assert(source, 'A real PipeWire microphone is required');
  assert.equal(captureCommand(source.legacyId, '-').args[1], source.id.slice(9));
  assert.throws(() => captureCommand('pipewire:missing-robos-microphone', '-'), /unavailable/);
  const preview = new MicrophoneTest();
  preview.start(source.id, () => {});
  try { await assertRoute(preview.session.process, source); } finally { preview.stop(); }
  const engine = new STTEngine();
  const proc = engine._startRecordingProcess(path.join(os.tmpdir(), `robos-routing-${process.pid}.wav`), source.legacyId);
  assert(proc);
  try { await assertRoute(proc, source); } finally { proc.kill('SIGTERM'); }
});
