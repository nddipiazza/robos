const fs = require('fs');
const path = require('path');
const os = require('os');

function getOnboardingFilePath() {
  if (process.env.ROBOS_ONBOARDING_FILE) {
    return process.env.ROBOS_ONBOARDING_FILE;
  }
  const home = process.env.HOME || os.homedir();
  return path.join(home, '.config', 'robos', 'onboarding-completed.json');
}

function getOnboardingState() {
  const filePath = getOnboardingFilePath();
  try {
    if (!fs.existsSync(filePath)) {
      return { completed: false };
    }
    const content = fs.readFileSync(filePath, 'utf8');
    const data = JSON.parse(content);
    return {
      completed: !!data.completed,
      completedAt: data.completedAt || null,
      version: data.version || '1.0.0',
      config: data.config || {},
      ...data,
    };
  } catch (err) {
    return { completed: false, error: err.message };
  }
}

function isOnboardingCompleted() {
  return getOnboardingState().completed === true;
}

function setOnboardingCompleted(details = {}) {
  const filePath = getOnboardingFilePath();
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const existing = getOnboardingState();
    const payload = {
      ...existing,
      completed: true,
      completedAt: new Date().toISOString(),
      version: '1.0.0',
      config: {
        ...(existing.config || {}),
        ...(details.config || details),
      },
      ...details,
    };
    fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), { mode: 0o600 });
    return { ok: true, state: payload };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

function resetOnboardingState() {
  const filePath = getOnboardingFilePath();
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const payload = {
      completed: false,
      resetAt: new Date().toISOString(),
      version: '1.0.0',
      config: {},
    };
    fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), { mode: 0o600 });
    return { ok: true, state: payload };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

module.exports = {
  getOnboardingFilePath,
  getOnboardingState,
  isOnboardingCompleted,
  setOnboardingCompleted,
  resetOnboardingState,
};
