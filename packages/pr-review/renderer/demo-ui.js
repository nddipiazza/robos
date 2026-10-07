'use strict';
window.mountWalkthrough = async function () {
  window.cleanupWalkthrough?.();
  const stage = document.getElementById('stage-6');
  stage.replaceChildren(); stage.classList.add('walkthrough');
  const bar = document.createElement('div'); bar.className = 'walkthrough-bar';
  const title = document.createElement('strong'); title.textContent = 'Walk me through it';
  const jobStatus=document.createElement('robos-agent-job-status');jobStatus.openSession=value=>window.api.openAgentSession(value);stage.append(jobStatus);
  const badge = document.createElement('span'); badge.className = 'walkthrough-status';
  const start = button('Start', 'Start the live walkthrough', () => act('start'));
  const restart = button('Start over', 'Rerun setup and return to checkpoint 1; keep code changes and chat', () => act('restart'));
  const before = button('How it used to work', 'Demo the main branch in a separate checkout', () => act('before'));
  const feature = button('Show the change', 'Return to the feature branch walkthrough', () => act('feature'));
  const explain = button('Explain this step', 'Explain what you are demonstrating at this checkpoint', () => act('explain'));
  const next = button('Next checkpoint →', 'Go to the next checkpoint', () => act(state.status === 'error' ? 'continue' : 'next'));
  const resume = button('Resume agent', 'Continue this saved agent session at the current step', () => act('resume'));
  const retry = button('Recheck this step', 'Retry this checkpoint', () => act('retry'));
  const process = button('Process…', 'Customize this project’s demo process', () => { editor.value = JSON.stringify(state.process, null, 2); dialog.showModal(); });
  const more = document.createElement('details'); more.className = 'walkthrough-more';
  const moreToggle = document.createElement('summary'); moreToggle.textContent = 'More'; moreToggle.setAttribute('aria-label', 'More walkthrough actions');
  const menu = document.createElement('div'); menu.className = 'walkthrough-menu'; menu.append(restart, before, feature, process); more.append(moreToggle, menu);
  menu.addEventListener('click', event => { if (event.target.closest('button')) more.open = false; });
  const dismissMenu = event => { if (!more.contains(event.target)) more.open = false; };
  const escapeMenu = event => { if (event.key === 'Escape' && more.open) { more.open = false; moreToggle.focus(); } };
  document.addEventListener('click', dismissMenu); document.addEventListener('keydown', escapeMenu);
  next.className = 'walkthrough-primary'; start.className = 'walkthrough-primary'; retry.className = '';
  bar.append(title, badge, more);
  const checkpoint = document.createElement('section'); checkpoint.className = 'walkthrough-checkpoint'; checkpoint.setAttribute('aria-live', 'polite');
  const stepActions = document.createElement('div'); stepActions.className = 'walkthrough-step-actions'; stepActions.append(start, resume, explain, retry, next);
  const progress = document.createElement('section'); progress.className = 'walkthrough-progress'; progress.setAttribute('aria-label', 'Demo progress');
  const activity = document.createElement('div'); activity.setAttribute('role', 'status');
  const elapsed = document.createElement('small');
  progress.append(activity, elapsed);
  const historyNotice = document.createElement('small'); historyNotice.className = 'walkthrough-history-note';
  const chatHeader = document.createElement('div'); chatHeader.className = 'walkthrough-chat-header';
  const clearChat = button('Clear chat', 'Clear this conversation', () => clearDialog.showModal()); const savedHistory = button('Saved history', 'Browse the saved conversation', () => { historyDialog.showModal(); loadHistory(); }); chatHeader.append(historyNotice, savedHistory, clearChat);
  const error = document.createElement('p'); error.className='walkthrough-error'; error.setAttribute('role','alert');
  stage.append(bar,checkpoint,stepActions,error);
  for(const id of ['changes','recovery','walkthrough'])window.reviewAgent?.register(id,{controls:chatHeader});
  const dialog = document.createElement('dialog'); dialog.className = 'walkthrough-process';
  const heading = document.createElement('h3'); heading.textContent = 'Project demo process';
  const hint = document.createElement('p'); hint.textContent = 'Edit demo instructions, checkpoint intent, and the optional before-change walkthrough. Saving restarts the walkthrough at its beginning. The agent executable is configured separately on this workstation.';
  const editor = document.createElement('textarea'); editor.setAttribute('aria-label', 'Demo process JSON'); editor.rows = 18;
  const editorError = document.createElement('p'); editorError.setAttribute('role', 'alert');
  const save = button('Save process', 'Save process and reset walkthrough', async () => { try { const result = await window.api.saveDemoProcess(JSON.parse(editor.value)); if (!result.ok) throw new Error(result.error); render(result.state); dialog.close(); } catch (e) { editorError.textContent = e.message; } });
  dialog.append(heading, hint, editor, editorError, save, button('Cancel', 'Close without saving', () => dialog.close())); document.body.append(dialog);
  const clearDialog = document.createElement('dialog'); clearDialog.className = 'walkthrough-clear-dialog'; clearDialog.setAttribute('aria-labelledby', 'clear-chat-title');
  const clearTitle = document.createElement('h3'); clearTitle.id = 'clear-chat-title'; clearTitle.textContent = 'Clear chat?';
  const clearDescription = document.createElement('p'); clearDescription.textContent = 'Clear the chat window? Your current step and code changes will stay. Previously saved messages remain in the local archive. A running agent will continue and may add new messages.';
  const cancelClear = button('Cancel', 'Keep the conversation', () => clearDialog.close()); cancelClear.autofocus = true;
  const confirmClear = button('Clear chat', 'Confirm clearing the conversation', async () => {
    confirmClear.disabled = true;
    try { const result = await window.api.clearDemoChat(); if (!result.ok) throw new Error(result.error); render(result.state); clearDialog.close(); clearChat.focus(); }
    catch (e) { clearError.textContent = e.message; }
    finally { confirmClear.disabled = false; }
  });
  const clearError = document.createElement('p'); clearError.setAttribute('role', 'alert');
  clearDialog.append(clearTitle, clearDescription, clearError, cancelClear, confirmClear); document.body.append(clearDialog);
  const historyDialog = document.createElement('dialog'); historyDialog.className = 'walkthrough-history-dialog'; historyDialog.setAttribute('aria-label', 'Saved conversation');
  const historyTitle = document.createElement('h3'); historyTitle.textContent = 'Saved conversation';
  const historyBody = document.createElement('div'); historyBody.className = 'walkthrough-saved-messages';
  let historyCursor;
  const older = button('Older messages', 'Load the previous page', () => loadHistory(historyCursor));
  const newest = button('Latest messages', 'Return to the latest saved page', () => loadHistory());
  historyDialog.append(historyTitle, historyBody, older, newest, button('Close', 'Close saved history', () => historyDialog.close())); document.body.append(historyDialog);
  async function openSessionFile() { try { const result = await window.api.openDemoSessionFile(); if (!result.ok) throw new Error(result.error); } catch(e) { error.textContent = e.message; } }
  async function loadHistory(before) {
    older.disabled = true;
    try { const page = await window.api.getDemoHistory(before); historyCursor = page.before; historyBody.replaceChildren();
      for (const message of page.messages) { const entry = document.createElement('p'); const who = message.role === 'user' ? 'You' : message.agentName || 'Status'; const when = button(new Date(message.timestamp).toLocaleString(), 'Open saved session in your default text editor', openSessionFile); when.className = 'walkthrough-timestamp'; const text = document.createElement('span'); text.textContent = `\n${message.text}`; entry.append(who + ' · ', when, text); historyBody.append(entry); }
      if (!page.messages.length) historyBody.textContent = 'No saved messages in this conversation yet.';
      older.disabled = !historyCursor; historyBody.scrollTop = 0;
    } catch(e) { historyBody.textContent = e.message; }
  }
  let state; let lastNarration = ''; let lastActionStart;
  function button(text, label, fn) { const b = document.createElement('button'); b.type = 'button'; b.textContent = text; b.title = label; b.addEventListener('click', fn); return b; }
  function render(value) {
    jobStatus.value={...value,activity:value.activitySummary?.text};
    savedHistory.hidden = !value.historyAvailable;
    resume.hidden = !value.restored || value.status === 'running';
    if (value.persistenceError) error.textContent = value.persistenceError;
    clearChat.disabled = value.messages.length === 0;
    state = value; const busy = value.status === 'running';
    const stepIndex = value.status === 'error' ? (value.failedIndex ?? Math.max(0, value.index)) : value.index;
    const lastStep = stepIndex >= value.total - 1;
    badge.textContent = busy ? 'In progress' : value.status === 'paused' ? lastStep ? 'Walkthrough complete' : `Step ${value.index + 1} of ${value.total}` : value.status === 'error' ? `Step ${stepIndex + 1} of ${value.total} · Check incomplete` : `Ready · ${value.total} steps`;
    start.hidden = busy || value.index >= 0 || value.status === 'error'; start.disabled = busy;
    restart.hidden = value.messages.length === 0; restart.disabled = busy;
    before.hidden = !value.process.before || value.mode === 'before'; before.disabled = busy;
    feature.hidden = value.mode !== 'before'; feature.disabled = busy;
    more.hidden = busy; if (busy) more.open = false;
    explain.hidden = busy || value.index < 0; explain.disabled = busy || value.index < 0;
    next.hidden = busy || !['paused', 'error'].includes(value.status) || lastStep;
    next.disabled = busy;
    next.textContent = value.status === 'error' ? `Continue to step ${stepIndex + 2} →` : `Next step: ${(value.mode === 'before' ? value.process.before?.checkpoints : value.process.checkpoints)?.[value.index + 1]?.title || 'Continue'} →`;
    retry.hidden = value.status !== 'error'; process.disabled = busy;
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
    if (value.status === 'error') { const reason = document.createElement('p'); reason.className = 'walkthrough-blocker'; reason.textContent = (value.messages.filter(m => m.kind !== 'progress' && m.role !== 'user').at(-1)?.text || 'This step could not be verified.') + (lastStep ? ' You can recheck or ask for a change below.' : ' Recheck this step, ask for a change below, or continue with this check marked unverified.'); checkpoint.append(reason); }
    if (!value.remediating && value.status === 'paused' && lastStep) { const done = document.createElement('p'); done.textContent = 'You’ve reached the end of this walkthrough. You can keep asking for changes, or use More to start over. This does not approve or merge the PR.'; checkpoint.append(done); }
    historyNotice.textContent=value.historyAvailable?'Conversation saved locally':'';
  }
  async function act(action, text) { error.textContent = '';window.reviewAgent?.open('walkthrough'); try { const result = await window.api.demoAction({ action, text }); if (!result.ok) throw new Error(result.error); render(result.state); return true; } catch (e) { error.textContent = e.message; return false; } }
  function updateElapsed() { if (!state?.startedAt || state.status !== 'running') return; const seconds = Math.floor((Date.now() - state.startedAt) / 1000); const quiet = Math.floor((Date.now() - (state.activitySummary?.at || state.progress?.at(-1)?.at || state.startedAt)) / 1000); elapsed.textContent = `${Math.floor(seconds / 60)}m ${seconds % 60}s elapsed` + (quiet >= 20 ? ` · Last status ${quiet}s ago` : ''); }
  const unsubscribe = window.api.onDemoState(render); const timer = setInterval(updateElapsed, 1000);
  window.cleanupWalkthrough = () => { dialog.remove();clearDialog.remove();historyDialog.remove();clearInterval(timer); unsubscribe?.(); document.removeEventListener('click', dismissMenu); document.removeEventListener('keydown', escapeMenu); };
  render(await window.api.getDemoState());
};
