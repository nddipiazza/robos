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
    appId: 'git-login-manager',
    label: 'Git Login Manager',
    category: 'Security',
    iconSvg: '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">\n  <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4"/>\n  <path d="M9 18c-4.51 2-5-2-7-2"/>\n</svg>'
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
