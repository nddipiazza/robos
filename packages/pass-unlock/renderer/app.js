'use strict';

window.addEventListener('DOMContentLoaded', async () => {
  // Set date
  document.getElementById('date-text').textContent =
    new Date().toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });

  const status = await window.api.getStatus();
  document.getElementById('greeting-text').textContent = status.greeting;

  if (!status.passReady) {
    document.getElementById('lock-msg').textContent =
      'Pass store not initialized.\nRun GPG Pass Initializer first.';
    document.getElementById('btn-unlock').disabled = true;
  }

  if (status.alreadyUnlocked) {
    showUnlocked(status);
  } else {
    showLocked(status);
  }

  document.getElementById('btn-unlock').addEventListener('click', doUnlock);
  document.getElementById('btn-skip').addEventListener('click', () => window.api.skip());
  document.getElementById('btn-close').addEventListener('click', () => window.api.skip());

  document.getElementById('passphrase').addEventListener('keydown', e => {
    if (e.key === 'Enter') doUnlock();
  });

  // Focus passphrase field
  setTimeout(() => document.getElementById('passphrase')?.focus(), 200);
});

function showLocked(status) {
  document.getElementById('state-locked').classList.remove('hidden');
  document.getElementById('state-unlocked').classList.add('hidden');

  // Show yesterday's stats if available
  const log = status.log;
  if (log.total > 0) {
    const wrap = document.getElementById('stats-yesterday');
    wrap.classList.remove('hidden');
    renderStats('stats-row', log);
  }
}

function showUnlocked(status) {
  document.getElementById('state-locked').classList.add('hidden');
  document.getElementById('state-unlocked').classList.remove('hidden');
  document.getElementById('unlock-since').textContent = `Unlocked since ${status.unlockTime}`;
  const log = status.log;
  if (log.total > 0) {
    renderStats('today-stats-row', log);
  } else {
    document.getElementById('today-stats-row').innerHTML =
      '<div style="color:#484f58;font-size:12px">No secret accesses today yet</div>';
  }
}

function renderStats(containerId, log) {
  document.getElementById(containerId).innerHTML = `
    <div class="stat-chip">
      <span class="num">${log.total}</span>
      <span class="lbl">Total</span>
    </div>
    <div class="stat-chip agent">
      <span class="num">${log.agents}</span>
      <span class="lbl">By Agents</span>
    </div>
    <div class="stat-chip user">
      <span class="num">${log.user}</span>
      <span class="lbl">By You</span>
    </div>
  `;
}

async function doUnlock() {
  const passphrase = document.getElementById('passphrase').value;
  const btn = document.getElementById('btn-unlock');
  const errEl = document.getElementById('error-msg');

  if (!passphrase) {
    errEl.textContent = 'Please enter your GPG passphrase.';
    errEl.classList.remove('hidden');
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Unlocking…';
  errEl.classList.add('hidden');

  const res = await window.api.unlock(passphrase);

  if (res.ok) {
    // Clear passphrase from input immediately
    document.getElementById('passphrase').value = '';
    // Show success splash with countdown
    document.getElementById('state-locked').classList.add('hidden');
    document.getElementById('state-success').classList.remove('hidden');
    let n = 3;
    const cd = document.getElementById('countdown');
    const iv = setInterval(() => {
      n--;
      cd.textContent = n;
      if (n <= 0) { clearInterval(iv); window.api.skip(); }
    }, 1000);
  } else {
    btn.disabled = false;
    btn.textContent = 'Unlock for Today';
    errEl.textContent = res.error || 'Unlock failed.';
    errEl.classList.remove('hidden');
    // Shake the input
    const pw = document.getElementById('passphrase');
    pw.value = '';
    pw.focus();
  }
}
