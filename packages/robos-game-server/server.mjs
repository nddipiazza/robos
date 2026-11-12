import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const { values: options } = parseArgs({
  options: {
    godot: { type: 'string', default: process.env.GODOT_BIN || 'godot' },
    bind: { type: 'string', default: '127.0.0.1' },
    port: { type: 'string', default: '18110' },
    map: { type: 'string', default: 'iron-narrows' },
    seed: { type: 'string' },
    help: { type: 'boolean' },
  },
});

if (options.help) {
  console.log('robos-game-server [--godot PATH] [--bind ADDRESS] [--port UDP_PORT] [--map MAP_ID] [--seed SEED]');
  process.exit(0);
}

const project = fileURLToPath(new URL('../../games/robos-rts/', import.meta.url));
const rts = spawn(options.godot, [
  '--headless', '--path', project, '--script', 'res://scripts/network/RTSService.gd',
  '--', '--dedicated-rts', `--rts-bind=${options.bind}`, `--rts-port=${options.port}`, `--rts-map=${options.map}`,
  ...(options.seed === undefined ? [] : [`--rts-seed=${options.seed}`]),
], {
  stdio: 'inherit',
  windowsHide: true,
  env: { ...process.env, RTS_MODE: 'backend' },
});

rts.on('error', (error) => {
  console.error(`Could not start the RTS service. Set GODOT_BIN or pass --godot. ${error.message}`);
  process.exitCode = 1;
});
rts.on('exit', (code, signal) => {
  process.exitCode = code ?? (signal === 'SIGINT' || signal === 'SIGTERM' ? 0 : 1);
});
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => {
    rts.kill(signal);
  });
}
