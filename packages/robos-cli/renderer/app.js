'use strict';

function esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const term = document.getElementById('term-output');

function logPrompt(cmd) {
  const line = document.createElement('div');
  line.className = 'term-line prompt';
  line.textContent = '$ ' + cmd;
  term.appendChild(line);
  term.scrollTop = term.scrollHeight;
}

function logOutput(text, type = '') {
  const line = document.createElement('div');
  line.className = 'term-line ' + type;
  line.textContent = text;
  term.appendChild(line);
  term.scrollTop = term.scrollHeight;
}

// Clear terminal
document.getElementById('btn-clear-term').addEventListener('click', () => {
  term.innerHTML = '';
});

// Tab navigation
document.querySelectorAll('.nav-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    tab.classList.add('active');
    const panel = document.getElementById('panel-' + tab.dataset.tab);
    if (panel) panel.classList.add('active');
  });
});

// 1. robos-notify
document.getElementById('btn-run-notify').addEventListener('click', async () => {
  const title = document.getElementById('notify-title').value;
  const msg = document.getElementById('notify-msg').value;
  const cat = document.getElementById('notify-cat').value;
  const tier = document.getElementById('notify-tier').value;

  const cmdStr = `robos-notify --title "${title}" --category ${cat} --tier ${tier} "${msg}"`;
  logPrompt(cmdStr);

  const res = await window.cli.runCli({
    binary: 'robos-notify',
    args: ['--title', title, '--category', cat, '--tier', tier, msg],
  });

  if (res.stdout) logOutput(res.stdout, 'success');
  if (res.stderr) logOutput(res.stderr, 'error');
});

document.getElementById('btn-run-notify-json').addEventListener('click', async () => {
  const title = document.getElementById('notify-title').value;
  const msg = document.getElementById('notify-msg').value;
  const cat = document.getElementById('notify-cat').value;
  const tier = document.getElementById('notify-tier').value;

  const jsonPayload = JSON.stringify({ title, message: msg, category: cat, tier });
  const cmdStr = `echo '${jsonPayload}' | robos-notify --json`;
  logPrompt(cmdStr);

  const res = await window.cli.runCli({
    binary: 'robos-notify',
    args: ['--json'],
    input: jsonPayload,
  });

  if (res.stdout) logOutput(res.stdout, 'success');
  if (res.stderr) logOutput(res.stderr, 'error');
});

// 2. robos-active-task
document.getElementById('btn-run-task-set').addEventListener('click', async () => {
  const taskId = document.getElementById('task-input').value;
  const cmdStr = `robos-active-task set "${taskId}"`;
  logPrompt(cmdStr);

  const res = await window.cli.runCli({
    binary: 'robos-active-task',
    args: ['set', taskId],
  });

  if (res.stdout) logOutput(res.stdout, 'success');
  if (res.stderr) logOutput(res.stderr, 'error');
});

document.getElementById('btn-run-task-get').addEventListener('click', async () => {
  const cmdStr = `robos-active-task get`;
  logPrompt(cmdStr);

  const res = await window.cli.runCli({
    binary: 'robos-active-task',
    args: ['get'],
  });

  if (res.stdout) logOutput(res.stdout, 'info');
  if (res.stderr) logOutput(res.stderr, 'error');
});

document.getElementById('btn-run-task-clear').addEventListener('click', async () => {
  const cmdStr = `robos-active-task clear`;
  logPrompt(cmdStr);

  const res = await window.cli.runCli({
    binary: 'robos-active-task',
    args: ['clear'],
  });

  if (res.stdout) logOutput(res.stdout, 'warning');
  if (res.stderr) logOutput(res.stderr, 'error');
});

// 3. robos-journal-append
document.getElementById('btn-run-journal').addEventListener('click', async () => {
  const text = document.getElementById('journal-text').value;
  const section = document.getElementById('journal-section').value;
  const type = document.getElementById('journal-type').value;

  const args = ['--section', section];
  if (type) args.push('--type', type);
  args.push(text);

  const cmdStr = `robos-journal-append --section "${section}" ${type ? '--type "' + type + '" ' : ''}"${text}"`;
  logPrompt(cmdStr);

  const res = await window.cli.runCli({
    binary: 'robos-journal-append',
    args,
  });

  if (res.stdout) logOutput(res.stdout, 'success');
  if (res.stderr) logOutput(res.stderr, 'error');
});

// 4. robos-event
document.getElementById('btn-run-event-emit').addEventListener('click', async () => {
  const type = document.getElementById('event-type').value;
  const payload = document.getElementById('event-payload').value;

  const cmdStr = `robos-event emit ${type} --payload '${payload}'`;
  logPrompt(cmdStr);

  const res = await window.cli.runCli({
    binary: 'robos-event',
    args: ['emit', type, '--payload', payload],
  });

  if (res.stdout) logOutput(res.stdout, 'success');
  if (res.stderr) logOutput(res.stderr, 'error');
});

document.getElementById('btn-run-event-history').addEventListener('click', async () => {
  const cmdStr = `robos-event history --last 5`;
  logPrompt(cmdStr);

  const res = await window.cli.runCli({
    binary: 'robos-event',
    args: ['history', '--last', '5'],
  });

  if (res.stdout) logOutput(res.stdout, 'info');
  if (res.stderr) logOutput(res.stderr, 'error');
});
