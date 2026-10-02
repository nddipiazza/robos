'use strict';
const { execFileSync } = require('child_process');

function pipewireSources() {
  const objects = JSON.parse(execFileSync('pw-dump', [], { encoding: 'utf8', timeout: 3000, maxBuffer: 8 * 1024 * 1024 }));
  return objects.filter(object => object.type === 'PipeWire:Interface:Node' && object.info?.props?.['media.class'] === 'Audio/Source')
    .map(object => ({
      id: `pipewire:${object.info.props['node.name']}`,
      legacyId: String(object.id),
      name: object.info.props['node.description'] || object.info.props['node.name'],
      type: 'pipewire',
    }));
}

function captureCommand(device, output, raw = false) {
  device = String(device || 'default');
  if (device.startsWith('pipewire:') || /^\d+$/.test(device)) {
    // Old saved preferences contained wpctl object IDs, not pw-record serials.
    const source = pipewireSources().find(source => source.id === device || source.legacyId === device);
    if (!source) throw new Error('Selected microphone is unavailable. Refresh devices and choose an input.');
    return {
      command: 'pw-record',
      args: ['--target', source.id.slice('pipewire:'.length), '--properties', '{ node.dont-fallback = true node.dont-reconnect = true }', '--rate', '16000', '--channels', '1', ...(raw ? ['--format', 's16'] : []), output],
    };
  }
  if (device !== 'default' && !/^hw:\d+,\d+$/.test(device)) throw new Error('Invalid microphone device.');
  return { command: 'arecord', args: ['-q', '-D', device, ...(raw ? ['-t', 'raw'] : []), '-f', 'S16_LE', '-r', '16000', '-c', '1', output] };
}
module.exports = { pipewireSources, captureCommand };
