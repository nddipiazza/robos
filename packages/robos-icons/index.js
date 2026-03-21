/**
 * RobOS Built-in App Icon Registry
 *
 * Each entry: { appId, label, category, iconSvg }
 * Icons are 48x48 SVG in Lucide style with RobOS color palette.
 *
 * Color palette:
 *   Cyan accent:  #00bcd4
 *   Teal:         #14b8a6
 *   Green:        #22c55e
 *   Blue:         #3b82f6
 *   Purple:       #7c3aed
 *   Pink:         #ec4899
 *   Orange:       #f97316
 *   Yellow:       #eab308
 *   Red:          #ef4444
 *   Gray:         #8b949e
 */

const BUILTIN_APPS = [
  {
    appId: 'desktop-manager',
    label: 'Desktop Manager',
    category: 'System',
    iconSvg: '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#00bcd4" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/><circle cx="12" cy="10" r="3"/></svg>'
  },
  {
    appId: 'desktop-widgets',
    label: 'Desktop Widgets',
    category: 'System',
    iconSvg: '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#14b8a6" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>'
  },
  {
    appId: 'issue-manager',
    label: 'Issue Manager',
    category: 'Development',
    iconSvg: '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#00bcd4" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>'
  },
  {
    appId: 'git-login-manager',
    label: 'Git Login Manager',
    category: 'Security',
    iconSvg: '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">\n  <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4"/>\n  <path d="M9 18c-4.51 2-5-2-7-2"/>\n</svg>'
  },
  {
    appId: 'notifications',
    label: 'Notifications',
    category: 'System',
    iconSvg: '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#00bcd4" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>'
  },
  {
    appId: 'pass-manager',
    label: 'Pass Manager',
    category: 'Security',
    iconSvg: '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#00bcd4" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">\n  <rect width="18" height="11" x="3" y="11" rx="2" ry="2"/>\n  <path d="M7 11V7a5 5 0 0 1 10 0v4"/>\n  <circle cx="12" cy="16" r="1"/>\n</svg>'
  },
  {
    appId: 'pass-unlock',
    label: 'Pass Unlock',
    category: 'Security',
    iconSvg: '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">\n  <rect width="18" height="11" x="3" y="11" rx="2" ry="2"/>\n  <path d="M7 11V7a5 5 0 0 1 9.9-1"/>\n  <circle cx="12" cy="16" r="1"/>\n</svg>'
  },
  {
    appId: 'workflow-studio',
    label: 'Workflow Studio',
    category: 'Development',
    iconSvg: '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#00bcd4" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="8" height="8" rx="2"/><rect x="13" y="13" width="8" height="8" rx="2"/><path d="M7 11v2a2 2 0 0 0 2 2h2"/><path d="M17 7h-2a2 2 0 0 0-2 2v2"/></svg>'
  },
  {
    appId: 'task-board',
    label: 'Task Board',
    category: 'Development',
    iconSvg: '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#00bcd4" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="3" x2="9" y2="21"/><line x1="15" y1="3" x2="15" y2="21"/></svg>'
  },
  {
    appId: 'task-servers',
    label: 'Task Servers',
    category: 'Development',
    iconSvg: '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#00bcd4" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="8" x="2" y="2" rx="2" ry="2"/><rect width="20" height="8" x="2" y="14" rx="2" ry="2"/><line x1="6" x2="6.01" y1="6" y2="6"/><line x1="6" x2="6.01" y1="18" y2="18"/></svg>'
  },
  {
    appId: 'robos-preferences',
    label: 'RobOS Preferences',
    category: 'System',
    iconSvg: '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#8b949e" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>'
  },
  {
    appId: 'robos-toast',
    label: 'Toast Daemon',
    category: 'System',
    iconSvg: '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#f97316" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/><path d="M2 8c0-3.5 2.5-6.5 6-7"/><path d="M22 8c0-3.5-2.5-6.5-6-7"/></svg>'
  },
  {
    appId: 'search-index',
    label: 'Search Index',
    category: 'System',
    iconSvg: '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>'
  },
  {
    appId: 'security-setup',
    label: 'Security Setup',
    category: 'Security',
    iconSvg: '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#14b8a6" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">\n  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>\n  <path d="m9 12 2 2 4-4"/>\n</svg>'
  },
];

function getIcon(appId) {
  const entry = BUILTIN_APPS.find(a => a.appId === appId);
  return entry ? entry.iconSvg : null;
}

function getAllIcons() {
  return BUILTIN_APPS;
}

module.exports = { BUILTIN_APPS, getIcon, getAllIcons };
