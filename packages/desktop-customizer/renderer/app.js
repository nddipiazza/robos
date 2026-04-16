'use strict';

const messagesEl = document.getElementById('messages');
const inputEl = document.getElementById('prompt-input');
const sendBtn = document.getElementById('btn-send');
const autocompleteEl = document.getElementById('autocomplete');
const warningBanner = document.getElementById('warning-banner');
const btnDismiss = document.getElementById('btn-dismiss-warning');
const btnHelp = document.getElementById('btn-help');
const btnSnapshots = document.getElementById('btn-snapshots');

let commands = [];
let history = [];
let acIndex = -1;

// ── Init ─────────────────────────────────────────────────────────────────────

async function init() {
  commands = await window.robos.getCommands();
  history = await window.robos.loadHistory();

  // Restore previous messages
  for (const msg of history) {
    appendMessage(msg.role, msg.content, false);
  }
  scrollToBottom();
}

// ── Messages ─────────────────────────────────────────────────────────────────

function esc(str) {
  const el = document.createElement('span');
  el.textContent = str;
  return el.innerHTML;
}

function formatOutput(text) {
  // Convert lines starting with spaces to pre blocks, and inline code
  let html = esc(text);
  // Wrap multi-line output in pre
  if (html.includes('\n')) {
    html = '<pre>' + html + '</pre>';
  }
  return html;
}

function appendMessage(role, content, save = true) {
  const div = document.createElement('div');
  div.className = `message ${role}`;

  const msgDiv = document.createElement('div');
  msgDiv.className = 'msg-content';

  if (role === 'user') {
    msgDiv.innerHTML = `<code>${esc(content)}</code>`;
  } else if (role === 'error') {
    msgDiv.innerHTML = `<p>${formatOutput(content)}</p>`;
  } else {
    msgDiv.innerHTML = `<p>${formatOutput(content)}</p>`;
  }

  div.appendChild(msgDiv);
  messagesEl.appendChild(div);
  scrollToBottom();

  if (save) {
    history.push({ role, content, ts: Date.now() });
    // Keep last 200 messages
    if (history.length > 200) history = history.slice(-200);
    window.robos.saveHistory(history);
  }
}

function scrollToBottom() {
  const main = document.querySelector('main');
  main.scrollTop = main.scrollHeight;
}

// ── Command execution ────────────────────────────────────────────────────────

async function executeInput() {
  const input = inputEl.value.trim();
  if (!input) return;

  inputEl.value = '';
  hideAutocomplete();
  sendBtn.disabled = true;

  appendMessage('user', input);

  try {
    const result = await window.robos.executeCommand(input);
    if (result.ok) {
      appendMessage('assistant', result.output || 'Done.');
    } else {
      appendMessage('error', result.error || 'Command failed.');
    }
  } catch (e) {
    appendMessage('error', `Error: ${e.message}`);
  }

  sendBtn.disabled = false;
  inputEl.focus();
}

// ── Autocomplete ─────────────────────────────────────────────────────────────

function showAutocomplete(filter) {
  const filtered = commands.filter(c =>
    c.name.includes(filter) || c.description.toLowerCase().includes(filter.toLowerCase())
  );

  if (filtered.length === 0) {
    hideAutocomplete();
    return;
  }

  autocompleteEl.innerHTML = filtered.map((c, i) => `
    <div class="ac-item${i === acIndex ? ' selected' : ''}" data-cmd="/${c.name}">
      <span class="ac-name">/${c.name}</span>
      <span class="ac-desc">${esc(c.description)}</span>
    </div>
  `).join('');

  autocompleteEl.classList.remove('hidden');

  // Click handlers
  for (const item of autocompleteEl.querySelectorAll('.ac-item')) {
    item.addEventListener('click', () => {
      inputEl.value = item.dataset.cmd + ' ';
      hideAutocomplete();
      inputEl.focus();
    });
  }
}

function hideAutocomplete() {
  autocompleteEl.classList.add('hidden');
  acIndex = -1;
}

// ── Event handlers ───────────────────────────────────────────────────────────

inputEl.addEventListener('input', () => {
  const val = inputEl.value;
  if (val.startsWith('/') && !val.includes(' ')) {
    showAutocomplete(val.slice(1));
  } else {
    hideAutocomplete();
  }
});

inputEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    if (!autocompleteEl.classList.contains('hidden')) {
      const selected = autocompleteEl.querySelector('.ac-item.selected') || autocompleteEl.querySelector('.ac-item');
      if (selected) {
        inputEl.value = selected.dataset.cmd + ' ';
        hideAutocomplete();
        return;
      }
    }
    executeInput();
  }

  if (e.key === 'Tab') {
    e.preventDefault();
    if (!autocompleteEl.classList.contains('hidden')) {
      const selected = autocompleteEl.querySelector('.ac-item.selected') || autocompleteEl.querySelector('.ac-item');
      if (selected) {
        inputEl.value = selected.dataset.cmd + ' ';
        hideAutocomplete();
      }
    }
  }

  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    if (!autocompleteEl.classList.contains('hidden')) {
      e.preventDefault();
      const items = autocompleteEl.querySelectorAll('.ac-item');
      if (e.key === 'ArrowDown') acIndex = Math.min(acIndex + 1, items.length - 1);
      else acIndex = Math.max(acIndex - 1, 0);
      items.forEach((it, i) => it.classList.toggle('selected', i === acIndex));
    }
  }

  if (e.key === 'Escape') {
    hideAutocomplete();
  }
});

sendBtn.addEventListener('click', executeInput);

btnDismiss.addEventListener('click', () => {
  warningBanner.classList.add('hidden');
});

btnHelp.addEventListener('click', () => {
  inputEl.value = '/help';
  executeInput();
});

btnSnapshots.addEventListener('click', () => {
  inputEl.value = '/snapshot list';
  executeInput();
});

// ── Start ────────────────────────────────────────────────────────────────────
init();
