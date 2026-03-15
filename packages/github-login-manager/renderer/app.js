const statusCard  = document.getElementById('status-card');
const loginCard   = document.getElementById('login-card');
const successCard = document.getElementById('success-card');

const dot         = document.getElementById('status-dot');
const statusText  = document.getElementById('status-text');
const statusDetail= document.getElementById('status-detail');
const btnRefresh  = document.getElementById('btn-refresh');

const codeBlock   = document.getElementById('code-block');
const otpDisplay  = document.getElementById('otp-display');
const btnCopyOtp  = document.getElementById('btn-copy-otp');
const loginOutput = document.getElementById('login-output');
const btnLogin    = document.getElementById('btn-login');
const btnCancel   = document.getElementById('btn-cancel');

const successDetail = document.getElementById('success-detail');
const btnDismiss  = document.getElementById('btn-dismiss');
const nextCheck   = document.getElementById('next-check');

let loginInProgress = false;
let countdownSec = 60;
let countdownTimer = null;

// ── status display ────────────────────────────────────────────────────────────

function setStatus({ ok, output }) {
  dot.className = `dot ${ok ? 'ok' : 'fail'}`;
  if (ok) {
    const match = (output || '').match(/account\s+(\S+)/);
    statusText.textContent = match
      ? `✓ Authenticated as ${match[1]}`
      : '✓ Authenticated with GitHub';
    loginCard.style.display = 'none';
  } else {
    statusText.textContent = '✗ Not authenticated — login required';
    loginCard.style.display = 'block';
  }
  statusDetail.textContent = (output || '').trim();
  resetCountdown();
}

function setChecking() {
  dot.className = 'dot checking';
  statusText.textContent = 'Checking…';
}

// ── countdown ─────────────────────────────────────────────────────────────────

function resetCountdown() {
  countdownSec = 60;
  clearInterval(countdownTimer);
  countdownTimer = setInterval(() => {
    countdownSec--;
    nextCheck.textContent = `Next check in ${countdownSec}s`;
    if (countdownSec <= 0) { clearInterval(countdownTimer); nextCheck.textContent = 'Checking…'; }
  }, 1000);
  nextCheck.textContent = `Next check in ${countdownSec}s`;
}

// ── IPC listeners ─────────────────────────────────────────────────────────────

window.gh.onAuthStatus(setStatus);

window.gh.onLoginOutput((chunk) => {
  loginOutput.textContent += chunk;
  loginOutput.scrollTop = loginOutput.scrollHeight;

  // Extract OTP code if present (format: XXXX-XXXX)
  const otpMatch = chunk.match(/([A-Z0-9]{4}-[A-Z0-9]{4})/);
  if (otpMatch) {
    otpDisplay.textContent = otpMatch[1];
    codeBlock.style.display = 'block';
  }

  // Extract URL and auto-open browser
  const urlMatch = chunk.match(/https:\/\/github\.com\/login\/device\S*/);
  if (urlMatch) {
    window.gh.openUrl(urlMatch[0]);
  }
});

window.gh.onLoginDone(({ code, ok }) => {
  loginInProgress = false;
  btnLogin.disabled = false;
  btnLogin.textContent = '🌐 Login with Browser';
  btnCancel.style.display = 'none';

  if (ok) {
    loginCard.style.display = 'none';
    codeBlock.style.display = 'none';
    loginOutput.textContent = '';
    const match = statusDetail.textContent.match(/account\s+(\S+)/);
    successDetail.textContent = match ? `Logged in as ${match[1]}` : 'GitHub authentication successful.';
    successCard.style.display = 'block';
  } else {
    loginOutput.textContent += '\n✗ Login failed or was cancelled.\n';
  }
});

// ── actions ───────────────────────────────────────────────────────────────────

btnRefresh.addEventListener('click', async () => {
  setChecking();
  const r = await window.gh.forceCheck();
  setStatus(r);
});

btnLogin.addEventListener('click', async () => {
  if (loginInProgress) return;
  loginInProgress = true;
  loginOutput.textContent = '';
  codeBlock.style.display = 'none';
  otpDisplay.textContent = '';
  btnLogin.disabled = true;
  btnLogin.textContent = '⏳ Waiting for GitHub…';
  btnCancel.style.display = 'inline-block';

  const r = await window.gh.startLogin();
  if (r.error) {
    loginOutput.textContent = `Error: ${r.error}`;
    loginInProgress = false;
    btnLogin.disabled = false;
    btnLogin.textContent = '🌐 Login with Browser';
    btnCancel.style.display = 'none';
  }
});

btnCancel.addEventListener('click', async () => {
  await window.gh.cancelLogin();
  loginInProgress = false;
  btnLogin.disabled = false;
  btnLogin.textContent = '🌐 Login with Browser';
  btnCancel.style.display = 'none';
  loginOutput.textContent += '\nCancelled.\n';
});

btnCopyOtp.addEventListener('click', () => {
  const code = otpDisplay.textContent.trim();
  if (code) navigator.clipboard.writeText(code);
});

btnDismiss.addEventListener('click', () => {
  successCard.style.display = 'none';
  window.gh.hideWindow();
});

// ── init ──────────────────────────────────────────────────────────────────────

(async () => {
  setChecking();
  const r = await window.gh.getStatus();
  setStatus(r);
})();


// ── RobOS icon registry injection ────────────────────────────────────
(function() {
  const _apps = window.ROBOS_BUILTIN_APPS || [];
  const _entry = _apps.find(a => a.appId === 'github-login-manager');
  if (_entry) {
    const _el = document.getElementById('app-logo-icon');
    if (_el) _el.innerHTML = _entry.iconSvg
      .replace(/width="48"/, 'width="28"').replace(/height="48"/, 'height="28"');
  }
})();
// ─────────────────────────────────────────────────────────────────────
