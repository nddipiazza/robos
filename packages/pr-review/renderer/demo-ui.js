'use strict';
window.mountWalkthrough = async function () {
  window.cleanupWalkthrough?.();
  const stage = document.getElementById('stage-6');
  stage.replaceChildren(); stage.classList.add('walkthrough');
  const bar = document.createElement('div'); bar.className = 'walkthrough-bar';
  const title = document.createElement('strong'); title.textContent = 'Walk me through it';
  const badge = document.createElement('span'); badge.className = 'walkthrough-status';
  const start = button('Start', 'Start the live walkthrough', () => act('start'));
  const restart = button('Start over', 'Rerun setup and return to checkpoint 1; keep code changes and chat', () => act('restart'));
  const before = button('How it used to work', 'Demo the main branch in a separate checkout', () => act('before'));
  const feature = button('Show the change', 'Return to the feature branch walkthrough', () => act('feature'));
  const explain = button('Explain', 'Explain what you are demonstrating at this checkpoint', () => act('explain'));
  const next = button('Next checkpoint →', 'Go to the next checkpoint', () => act('next'));
  const retry = button('Retry', 'Retry this checkpoint', () => act('retry'));
  const process = button('Process…', 'Customize this project’s demo process', () => { editor.value = JSON.stringify(state.process, null, 2); dialog.showModal(); });
  const more = document.createElement('details'); more.className = 'walkthrough-more';
  const moreToggle = document.createElement('summary'); moreToggle.textContent = 'More'; moreToggle.setAttribute('aria-label', 'More walkthrough actions');
  const menu = document.createElement('div'); menu.className = 'walkthrough-menu'; menu.append(restart, before, feature, process); more.append(moreToggle, menu);
  menu.addEventListener('click', event => { if (event.target.closest('button')) more.open = false; });
  const dismissMenu = event => { if (!more.contains(event.target)) more.open = false; };
  const escapeMenu = event => { if (event.key === 'Escape' && more.open) { more.open = false; moreToggle.focus(); } };
  document.addEventListener('click', dismissMenu); document.addEventListener('keydown', escapeMenu);
  next.className = 'walkthrough-primary'; start.className = 'walkthrough-primary'; retry.className = 'walkthrough-primary';
  bar.append(title, badge, explain, start, next, retry, more);
  const checkpoint = document.createElement('section'); checkpoint.className = 'walkthrough-checkpoint'; checkpoint.setAttribute('aria-live', 'polite');
  const progress = document.createElement('section'); progress.className = 'walkthrough-progress'; progress.setAttribute('aria-label', 'Demo progress');
  const activity = document.createElement('div'); activity.setAttribute('role', 'status');
  const elapsed = document.createElement('small');
  progress.append(activity, elapsed);
  const historyNotice = document.createElement('small'); historyNotice.className = 'walkthrough-history-note';
  const chat = document.createElement('div'); chat.className = 'walkthrough-chat'; chat.setAttribute('role', 'log'); chat.setAttribute('aria-label', 'Live demo conversation');
  let pendingMessage = null;
  const receipt = document.createElement('div'); receipt.className = 'walkthrough-receipt'; receipt.setAttribute('role', 'status');
  const form = document.createElement('div'); form.className = 'walkthrough-compose';
  const input = document.createElement('robos-ai-textarea');
  input.setAttribute('min-height', '64'); input.setAttribute('max-chars', '16000');
  input.setAttribute('show-agent', 'false');
  input.setAttribute('placeholder', 'Ask a question or request a change at this checkpoint…');
  const error = document.createElement('p'); error.className = 'walkthrough-error'; error.setAttribute('role', 'alert');
  form.append(input, progress, receipt); stage.append(bar, checkpoint, historyNotice, chat, error, form);
  const send = input.querySelector('.robos-submit-btn'); send.textContent = 'Send'; send.type = 'button';
  const editable = input.querySelector('.robos-ai-inner'); editable.setAttribute('role', 'textbox'); editable.setAttribute('aria-label', 'Message the demo agent'); editable.setAttribute('aria-multiline', 'true');
  const dialog = document.createElement('dialog'); dialog.className = 'walkthrough-process';
  const heading = document.createElement('h3'); heading.textContent = 'Project demo process';
  const hint = document.createElement('p'); hint.textContent = 'Edit demo instructions, checkpoint intent, and the optional before-change walkthrough. Saving restarts the walkthrough at its beginning. The agent executable is configured separately on this workstation.';
  const editor = document.createElement('textarea'); editor.setAttribute('aria-label', 'Demo process JSON'); editor.rows = 18;
  const editorError = document.createElement('p'); editorError.setAttribute('role', 'alert');
  const save = button('Save process', 'Save process and reset walkthrough', async () => { try { const result = await window.api.saveDemoProcess(JSON.parse(editor.value)); if (!result.ok) throw new Error(result.error); render(result.state); dialog.close(); } catch (e) { editorError.textContent = e.message; } });
  dialog.append(heading, hint, editor, editorError, save, button('Cancel', 'Close without saving', () => dialog.close())); stage.append(dialog);
  const receivedTimes = new Map(); let historyInitialized = false;
  let state; let lastNarration = ''; let lastActionStart;
  function button(text, label, fn) { const b = document.createElement('button'); b.type = 'button'; b.textContent = text; b.title = label; b.addEventListener('click', fn); return b; }
  function render(value) {
    const currentIds = new Set(value.messages.map(m => m.id));
    for (const id of receivedTimes.keys()) if (!currentIds.has(id)) receivedTimes.delete(id);
    for (const m of value.messages) if (m.id && !receivedTimes.has(m.id)) receivedTimes.set(m.id, historyInitialized ? Date.now() : null);
    historyInitialized = true;
    state = value; const busy = value.status === 'running';
    if (pendingMessage && value.messages.some(m => m.role === 'user' && m.text === pendingMessage.text && m.id !== pendingMessage.lastId)) {
      if (input.value.trim() === pendingMessage.text) { input.value = ''; input.dispatchEvent(new Event('input')); }
      pendingMessage = null;
    }
    receipt.hidden = busy;
    if (!busy && !pendingMessage) receipt.textContent = value.index < 0 ? 'Start the walkthrough to chat with the demo agent.' : 'Ready for your next message.';
    badge.textContent = busy ? 'In progress' : value.status === 'paused' ? `Paused · ${value.index + 1}/${value.total}` : value.status === 'error' ? 'Needs attention' : 'Ready';
    start.hidden = busy || value.index >= 0 || value.status === 'error'; start.disabled = busy;
    restart.hidden = value.messages.length === 0; restart.disabled = busy;
    before.hidden = !value.process.before || value.mode === 'before'; before.disabled = busy;
    feature.hidden = value.mode !== 'before'; feature.disabled = busy;
    more.hidden = busy; if (busy) more.open = false;
    explain.hidden = busy || value.index < 0; explain.disabled = busy || value.index < 0;
    next.hidden = busy || value.status !== 'paused' || value.index >= value.total - 1;
    next.disabled = busy || value.status !== 'paused' || value.index >= value.total - 1;
    retry.hidden = value.status !== 'error'; process.disabled = busy; send.disabled = !busy && value.index < 0; send.textContent = busy ? 'Steer' : 'Send';
    // Older running sessions can be upgraded without interrupting their agent.
    if (lastActionStart !== value.startedAt) { lastNarration = ''; lastActionStart = value.startedAt; }
    const meaningful = [...(value.progress || [])].reverse().find(e => !/^(Running a local setup|Local check finished|A local check failed)/.test(e.text));
    lastNarration = value.activitySummary?.text || meaningful?.text || lastNarration;
    progress.hidden = true; activity.textContent = lastNarration || `Preparing ${value.checkpoint?.title || 'this checkpoint'}…`; activity.title = activity.textContent;
    updateElapsed();
    checkpoint.replaceChildren();
    const c = value.checkpoint;
    if (c) { const h = document.createElement('h3'); h.textContent = c.title; const p = document.createElement('p'); p.textContent = busy ? `I’m preparing “${c.title}”. I’ll show you what to try and pause when it’s ready.` : value.guidance || c.summary || 'Ask Explain for a walkthrough of this step, or try the app before moving on.'; checkpoint.append(h, p); if (value.baseline) { const note = document.createElement('small'); note.textContent = `Before the change · ${value.baseline.ref} · ${value.baseline.revision.slice(0, 8)}`; checkpoint.append(note); } }
    else checkpoint.textContent = 'Start the dev app and demonstrate one checkpoint at a time. You decide when we move on.';
    const followTail = chat.scrollHeight - chat.scrollTop - chat.clientHeight < 60;
    historyNotice.textContent = value.droppedMessages ? `${value.droppedMessages} older entries removed. History keeps the newest 120 entries, up to 128 KB.` : 'History keeps the newest 120 entries, up to 128 KB; oldest entries are removed first.';
    chat.replaceChildren();
    for (const message of value.messages) { const bubble = document.createElement('div'); bubble.className = 'walkthrough-bubble ' + message.role + (message.kind === 'progress' ? ' progress-entry' : ''); const label = document.createElement('strong'); label.textContent = message.role === 'user' ? 'You' : message.role === 'assistant' ? message.agentName || value.agentName || 'Demo agent' : 'Status'; label.textContent = label.textContent.replace(/ · configured default$/, '');
      const timestamp = document.createElement('time');
      const recordedTime = message.timestamp ?? receivedTimes.get(message.id);
      if (Number.isFinite(recordedTime)) {
        const date = new Date(recordedTime); timestamp.dateTime = date.toISOString();
        timestamp.textContent = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }); timestamp.title = (message.timestamp ? '' : 'Received: ') + date.toLocaleString();
      } else { timestamp.textContent = '—'; timestamp.title = 'Time was not recorded for this older message.'; }
      const header = document.createElement('div'); header.className = 'walkthrough-bubble-header'; header.append(label, timestamp);
      const body = document.createElement('p'); body.textContent = message.text; bubble.append(header, body); chat.append(bubble); }
    if (followTail) chat.scrollTop = chat.scrollHeight;
  }
  async function act(action, text) { error.textContent = ''; try { const result = await window.api.demoAction({ action, text }); if (!result.ok) throw new Error(result.error); render(result.state); return true; } catch (e) { error.textContent = e.message; return false; } }
  input.addEventListener('robos-submit', async event => {
    if (pendingMessage) return;
    if (state.index < 0 && state.status !== 'running') { error.textContent = 'Start the walkthrough before sending a message.'; return; }
    const text = event.detail.value.trim(); if (!text) return;
    if (text.length > 16000) { error.textContent = 'Keep your message under 16,000 characters.'; return; }
    pendingMessage = { text, lastId: state.messages.filter(m => m.role === 'user').at(-1)?.id }; receipt.textContent = 'Sending your message…';
    if (!await act('message', text)) { pendingMessage = null; receipt.textContent = 'Message was not sent. Your draft is still here.'; }
  });
  function updateElapsed() { if (!state?.startedAt || state.status !== 'running') return; const seconds = Math.floor((Date.now() - state.startedAt) / 1000); const quiet = Math.floor((Date.now() - (state.activitySummary?.at || state.progress?.at(-1)?.at || state.startedAt)) / 1000); elapsed.textContent = `${Math.floor(seconds / 60)}m ${seconds % 60}s elapsed` + (quiet >= 20 ? ` · Last status ${quiet}s ago` : ''); }
  const unsubscribe = window.api.onDemoState(render); const timer = setInterval(updateElapsed, 1000);
  window.cleanupWalkthrough = () => { clearInterval(timer); unsubscribe?.(); document.removeEventListener('click', dismissMenu); document.removeEventListener('keydown', escapeMenu); };
  render(await window.api.getDemoState());
};
