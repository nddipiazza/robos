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
];

function getIcon(appId) {
  const entry = BUILTIN_APPS.find(a => a.appId === appId);
  return entry ? entry.iconSvg : null;
}

function getAllIcons() {
  return BUILTIN_APPS;
}

module.exports = { BUILTIN_APPS, getIcon, getAllIcons };
