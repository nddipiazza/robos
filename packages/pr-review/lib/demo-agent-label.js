'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
// Read only the display settings; never expose the rest of the agent config.
function agentLabel(agent, configFile = path.join(process.env.CODEX_HOME || path.join(os.homedir(), '.codex'), 'config.toml')) {
  const args = agent?.args || []; const settings = {}; const profiles = {}; let section = '';
  let source = ''; try { source = fs.readFileSync(configFile, 'utf8'); } catch {}
  for (const line of source.split('\n')) {
    const header = line.match(/^\s*\[([^\]]+)\]/); if (header) { section = header[1]; continue; }
    const match = line.match(/^\s*(model|model_reasoning_effort|profile)\s*=\s*["']([^"']+)["']/);
    if (!match) continue;
    if (!section) settings[match[1]] = match[2];
    else if (section.startsWith('profiles.')) { const name = section.slice(9).replace(/^["']|["']$/g, ''); (profiles[name] ||= {})[match[1]] = match[2]; }
  }
  const flags = {}; const overrides = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (['--model', '-m'].includes(arg)) flags.model = args[++i];
    else if (arg.startsWith('--model=')) flags.model = arg.slice(8);
    else if (['--profile', '-p'].includes(arg)) flags.profile = args[++i];
    else if (arg.startsWith('--profile=')) flags.profile = arg.slice(10);
    else if (['-c', '--config'].includes(arg) || arg.startsWith('--config=')) {
      const value = arg.startsWith('--config=') ? arg.slice(9) : args[++i];
      const match = value?.match(/^(model|model_reasoning_effort|profile)\s*=\s*["']?([^"']+?)["']?$/);
      if (match) overrides[match[1]] = match[2];
    }
  }
  const selected = {...settings, ...profiles[flags.profile || overrides.profile || settings.profile], ...overrides, ...flags};
  return [agent?.name || 'Codex', selected.model || 'model not reported', selected.model_reasoning_effort ? `${selected.model_reasoning_effort} reasoning` : 'reasoning not reported'].join(' · ');
}
module.exports = { agentLabel };
