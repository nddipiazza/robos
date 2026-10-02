'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { createHash } = require('node:crypto');
const DEFAULT_PR = '## Changes\n\n{{description}}\n';
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
  return { prTemplate: DEFAULT_PR, messageTemplate: DEFAULT_MESSAGE, serverId: '', channel: '', reviewers: [], ...value };
}
function save(repo, input, root) {
  const value = {};
  for (const key of ['prTemplate', 'messageTemplate', 'serverId', 'channel']) {
    if (typeof input[key] !== 'string' || input[key].length > (key === 'prTemplate' ? 65000 : 4000)) throw Error('Invalid review settings.');
    value[key] = input[key];
  }
  value.reviewers = validateReviewers(input.reviewers || []);
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
function validateReviewers(reviewers) {
  if (!Array.isArray(reviewers) || reviewers.length > 100) throw Error('Choose at most 100 reviewers.');
  const seen = new Set();
  return reviewers.map(r => {
    if (!r || typeof r.serverId !== 'string' || !r.serverId || r.serverId.length > 500 || !/^[UW][A-Z0-9]+$/.test(r.userId) || typeof r.name !== 'string' || !r.name.trim() || r.name.length > 300) throw Error('Choose reviewers from the workspace directory.');
    const key = r.serverId + ':' + r.userId;
    if (seen.has(key)) throw Error('Duplicate reviewer.');
    seen.add(key);
    return {serverId:r.serverId,userId:r.userId,name:r.name};
  });
}
async function members(serverId, call = service()) {
  if (!call) throw Error('Configure Team Chat Servers first.');
  const {servers} = await call('servers');
  if (!servers.some(s => s.id === serverId && s.provider === 'slack')) throw Error('Choose a configured Slack workspace for reviewer mentions.');
  const self = await call('status', {serverId});
  if (!/^[UW][A-Z0-9]+$/.test(self.userId)) throw Error('Could not identify the message sender.');
  const result = new Map(), cursors = new Set();
  let cursor = '';
  do {
    const page = await call('members', {serverId,cursor});
    if (page.freshness?.stale) throw Error('Refresh the workspace directory before choosing reviewers.');
    for (const m of page.members) if (/^[UW][A-Z0-9]+$/.test(m.id) && m.id !== self.userId) result.set(m.id, {serverId,userId:m.id,name:m.name || m.id});
    cursor = page.nextCursor || '';
    if (cursor && cursors.has(cursor)) throw Error('Workspace directory pagination failed.');
    cursors.add(cursor);
  } while (cursor);
  return [...result.values()].sort((a,b) => a.name.localeCompare(b.name));
}
async function resolveReviewers(serverId, reviewers, call = service()) {
  if (!Array.isArray(reviewers) || !reviewers.length) throw Error('Choose at least one reviewer other than yourself.');
  const directory = await members(serverId,call);
  return validateReviewers(reviewers).map(r => {
    const member = directory.find(m => m.serverId === r.serverId && m.userId === r.userId);
    if (!member) throw Error('Reviewer ' + r.name + ' is unavailable in this workspace or is the sender. Choose reviewers again.');
    return member;
  });
}
module.exports={members,resolveReviewers,validateReviewers,read,save,format,service,options,channels,DEFAULT_PR,DEFAULT_MESSAGE};
