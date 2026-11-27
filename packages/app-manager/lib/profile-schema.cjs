'use strict';
const { randomUUID } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_PORT = 19406;
const INVITE = /^robos1\.([a-f0-9]{64})\.([a-f0-9]{32})$/;
const DEVICE_ID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const DEVICE_TOKEN = /^([a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12})\.[a-f0-9]{64}$/;
const APP_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const boundedText = (value, limit) => typeof value === 'string' && value.trim() && value.length <= limit && !/[\u0000-\u001f\u007f]/.test(value);
const object = value => value && typeof value === 'object' && !Array.isArray(value);

function validateProfile(value) {
  if (!object(value) || value.schema !== 1 || !boundedText(value.name, 80) ||
      !Number.isSafeInteger(value.revision) || value.revision < 1 ||
      !Array.isArray(value.apps) || value.apps.length > 100 ||
      !value.apps.every(id => typeof id === 'string' && id.length <= 80 && APP_ID.test(id)) ||
      new Set(value.apps).size !== value.apps.length || !object(value.settings)) {
    throw new Error('Invalid RobOS setup profile');
  }
  const settings = {};
  for (const [key, setting] of Object.entries(value.settings)) {
    const valid = key === 'theme' ? ['dark', 'light'].includes(setting) :
      ['toast_enabled', 'notification_sound', 'dnd_default'].includes(key) && typeof setting === 'boolean';
    if (!valid) throw new Error('The setup profile contains an unsupported setting');
    settings[key] = setting;
  }
  return { schema: 1, name: value.name, revision: value.revision, apps: value.apps, settings };
}

function readJSON(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT' && fallback !== undefined) return fallback; throw error; }
}

function writeJSON(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const temp = file + '.' + randomUUID() + '.tmp';
  try {
    fs.writeFileSync(temp, JSON.stringify(value, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
    fs.renameSync(temp, file);
  } finally {
    fs.rmSync(temp, { force: true });
  }
}

module.exports = { DEFAULT_PORT, INVITE, DEVICE_ID, DEVICE_TOKEN, boundedText, object, validateProfile, readJSON, writeJSON };
