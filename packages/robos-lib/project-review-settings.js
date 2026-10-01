'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { createHash } = require('node:crypto');
const DEFAULT_PR = '## Changes\n\n{{description}}\n\n## Validation\n\n';
const DEFAULT_MESSAGE = 'Please review {{title}}\n{{url}}\n\nRepository: {{repo}}\nBranch: {{branch}}';
function repoKey(value) {
  const key = String(value || '').replace(/^https?:\/\/github.com\//, '').replace(/^git@github.com:/, '').replace(/\.git\/?$/, '').replace(/\/$/, '');
  if (!/^[\w.-]+\/[\w.-]+$/.test(key)) throw Error('Choose a GitHub project.');
  return key.toLowerCase();
}
function file(repo, root = path.join(os.homedir(), '.robos', 'project-review-settings')) {
  return path.join(root, createHash('sha256').update(repoKey(repo)).digest('hex') + '.json');
}
function read(repo, root) {
  let value = {}; try { value = JSON.parse(fs.readFileSync(file(repo, root), 'utf8')); } catch(e) { if(e.code !== 'ENOENT') throw e; }
  return { prTemplate: DEFAULT_PR, messageTemplate: DEFAULT_MESSAGE, serverId: '', channel: '', ...value };
}
function save(repo, input, root) {
  const value = {};
  for (const key of ['prTemplate', 'messageTemplate', 'serverId', 'channel']) {
    if (typeof input[key] !== 'string' || input[key].length > (key === 'prTemplate' ? 65000 : 4000)) throw Error('Invalid review settings.');
    value[key] = input[key];
  }
  if (!value.messageTemplate.includes('{{url}}')) throw Error('The notification template must include {{url}}.');
  const target = file(repo, root); fs.mkdirSync(path.dirname(target), {recursive:true, mode:0o700});
  fs.writeFileSync(target+'.tmp', JSON.stringify(value,null,2)+'\n', {mode:0o600}); fs.renameSync(target+'.tmp',target);
  return value;
}
function format(template, data) { return template.replace(/\{\{(title|url|repo|branch|description)\}\}/g, (_, key) => String(data[key] || '')); }
function service() {
  // Prefer the bundled service. Older review checkouts can use the installed RobOS runtime.
  const roots = [path.resolve(__dirname, '..'), process.env.ROBOS_HOME && path.join(process.env.ROBOS_HOME,'packages'), path.join(os.homedir(),'.hermetiq','robos','packages')].filter(Boolean);
  const candidate = roots.map(root=>path.join(root,'team-chat-servers/lib/agent-chat.js')).find(p=>fs.existsSync(p));
  if (!candidate) return null;
  return require(candidate).createService();
}
async function options(repo, call = service(), root) {
  const settings = read(repo, root);
  const servers = call ? (await call('servers')).servers : [];
  const providers = [...new Set(servers.map(s=>s.provider))];
  return {settings, servers, appName: providers.length === 1 ? ({slack:'Slack',teams:'Microsoft Teams',discord:'Discord',zulip:'Zulip',mattermost:'Mattermost','google-chat':'Google Chat',matrix:'Matrix','rocket-chat':'Rocket.Chat'}[providers[0]] || servers[0].name) : 'messaging app'};
}
async function channels(serverId, call = service()) {
  if (!call) throw Error('Configure Team Chat Servers first.');
  const result=[];let cursor='';do {const page=await call('channels',{serverId,cursor});result.push(...page.channels);cursor=page.nextCursor;} while(cursor);
  return result;
}
module.exports={read,save,format,service,options,channels,DEFAULT_PR,DEFAULT_MESSAGE};
