'use strict';
window.mountWalkthrough = async function () {
  const stage = document.getElementById('stage-6');
  stage.replaceChildren(); stage.classList.add('walkthrough');
  const bar = document.createElement('div'); bar.className = 'walkthrough-bar';
  const title = document.createElement('strong'); title.textContent = 'Walk me through it';
  const badge = document.createElement('span'); badge.className = 'walkthrough-status';
  const start = button('Start', 'Start the live walkthrough', () => act('start'));
  const restart = button('Start over', 'Rerun setup and return to checkpoint 1; keep code changes and chat', () => act('restart'));
  const explain = button('Explain', 'Explain what you are demonstrating at this checkpoint', () => act('explain'));
  const next = button('Next checkpoint →', 'Go to the next checkpoint', () => act('next'));
  const retry = button('Retry', 'Retry this checkpoint', () => act('retry'));
  const process = button('Process…', 'Customize this project’s demo process', () => { editor.value = JSON.stringify(state.process, null, 2); dialog.showModal(); });
  bar.append(title, badge, start, restart, explain, next, retry, process);
  const checkpoint = document.createElement('section'); checkpoint.className = 'walkthrough-checkpoint'; checkpoint.setAttribute('aria-live', 'polite');
  const chat = document.createElement('div'); chat.className = 'walkthrough-chat'; chat.setAttribute('role', 'log'); chat.setAttribute('aria-label', 'Live demo conversation');
  const form = document.createElement('form'); form.className = 'walkthrough-compose';
  const input = document.createElement('textarea'); input.rows = 2; input.placeholder = 'Ask a question or request a change while we stay at this checkpoint…'; input.setAttribute('aria-label', 'Message the demo agent'); input.maxLength = 16000;
  const send = document.createElement('button'); send.textContent = 'Send'; send.type = 'submit';
  const error = document.createElement('p'); error.className = 'walkthrough-error'; error.setAttribute('role', 'alert');
  form.append(input, send); stage.append(bar, checkpoint, chat, error, form);
  const dialog = document.createElement('dialog'); dialog.className = 'walkthrough-process';
  const heading = document.createElement('h3'); heading.textContent = 'Project demo process';
  const hint = document.createElement('p'); hint.textContent = 'Edit instructions and Given/When/Then checkpoints. Saving restarts the walkthrough at its beginning. The agent executable is configured separately on this workstation.';
  const editor = document.createElement('textarea'); editor.setAttribute('aria-label', 'Demo process JSON'); editor.rows = 18;
  const editorError = document.createElement('p'); editorError.setAttribute('role', 'alert');
  const save = button('Save process', 'Save process and reset walkthrough', async () => { try { const result = await window.api.saveDemoProcess(JSON.parse(editor.value)); if (!result.ok) throw new Error(result.error); render(result.state); dialog.close(); } catch (e) { editorError.textContent = e.message; } });
  dialog.append(heading, hint, editor, editorError, save, button('Cancel', 'Close without saving', () => dialog.close())); stage.append(dialog);
  let state;
  function button(text, label, fn) { const b = document.createElement('button'); b.type = 'button'; b.textContent = text; b.title = label; b.addEventListener('click', fn); return b; }
  function render(value) {
    state = value; const busy = value.status === 'running';
    badge.textContent = busy ? 'Agent working…' : value.status === 'paused' ? `Paused · ${value.index + 1}/${value.total}` : value.status === 'error' ? 'Needs attention' : 'Ready';
    start.hidden = value.index >= 0 || value.status === 'error'; start.disabled = busy;
    restart.hidden = value.messages.length === 0; restart.disabled = busy;
    explain.disabled = busy || value.index < 0;
    next.disabled = busy || value.status !== 'paused' || value.index >= value.total - 1;
    retry.hidden = value.status !== 'error'; process.disabled = busy; send.disabled = busy || value.index < 0;
    checkpoint.replaceChildren();
    const c = value.checkpoint;
    if (c) { const h = document.createElement('h3'); h.textContent = c.title; checkpoint.append(h); for (const key of ['given', 'when', 'then']) { const p = document.createElement('p'); const strong = document.createElement('strong'); strong.textContent = key.toUpperCase() + ' '; p.append(strong, document.createTextNode(c[key])); checkpoint.append(p); } }
    else checkpoint.textContent = 'Start the dev app and demonstrate one checkpoint at a time. You decide when we move on.';
    chat.replaceChildren();
    for (const message of value.messages) { const bubble = document.createElement('div'); bubble.className = 'walkthrough-bubble ' + message.role; const label = document.createElement('strong'); label.textContent = message.role === 'user' ? 'You' : message.role === 'assistant' ? 'Demo agent' : 'Status'; const body = document.createElement('p'); body.textContent = message.text; bubble.append(label, body); chat.append(bubble); }
    chat.scrollTop = chat.scrollHeight;
  }
  async function act(action, text) { error.textContent = ''; try { const result = await window.api.demoAction({ action, text }); if (!result.ok) throw new Error(result.error); render(result.state); } catch (e) { error.textContent = e.message; } }
  form.addEventListener('submit', event => { event.preventDefault(); const text = input.value.trim(); if (!text) return; input.value = ''; act('message', text); });
  window.api.onDemoState(render); render(await window.api.getDemoState());
};
