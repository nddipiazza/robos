'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

module.exports = {
  type: 'notify',
  label: 'Send Notification',
  description: 'Send a categorized toast notification',
  params: {
    tier: { type: 'enum', values: ['critical', 'warning', 'info'], required: true },
    category: { type: 'enum', values: ['pr_review', 'ci_cd', 'task', 'agent', 'system', 'git', 'journal'], required: true },
    title: { type: 'string', required: true, templatable: true },
    message: { type: 'string', required: false, templatable: true },
    action: { type: 'string', required: false, templatable: true },
  },

  async execute(params, _context) {
    const notifDir = path.join(os.homedir(), '.config', 'robos');
    fs.mkdirSync(notifDir, { recursive: true });
    const notifFile = path.join(notifDir, 'notifications.json');

    let notifications = [];
    try {
      if (fs.existsSync(notifFile)) {
        notifications = JSON.parse(fs.readFileSync(notifFile, 'utf8'));
      }
    } catch (_) {
      notifications = [];
    }

    const notification = {
      id: `notif_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      ts: new Date().toISOString(),
      tier: params.tier,
      category: params.category,
      title: params.title,
      message: params.message || '',
      action: params.action || null,
      read: false,
    };

    notifications.push(notification);
    fs.writeFileSync(notifFile, JSON.stringify(notifications, null, 2));

    return { success: true, output: notification };
  },
};
