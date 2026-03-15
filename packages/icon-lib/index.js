'use strict';
/**
 * RobOS Icon Library
 *
 * Shared module for resolving app icons from the RobOS icon registry.
 * Any RobOS Electron app can use:
 *
 *   const iconLib = require('/usr/local/share/robos/icon-lib');
 *   const path = iconLib.getIconPath('git-projects'); // → '/usr/local/share/robos/...'
 */

const fs   = require('fs');
const path = require('path');

const REGISTRY_PATH  = path.join(process.env.HOME || '/home/robos', '.config', 'robos', 'icon-registry.json');
const ROBOS_BASE     = '/usr/local/share/robos';
const PIXMAPS_BASE   = '/usr/local/share/pixmaps';

function getRegistry() {
  try { return JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8')); }
  catch { return { version: 1, icons: {} }; }
}

/**
 * Returns the resolved icon file path for a given appId.
 * Falls back to conventional locations if the registry has no entry.
 */
function getIconPath(appId) {
  if (!appId) return null;
  const reg = getRegistry();
  const entry = reg.icons?.[appId];
  if (entry?.iconPath) {
    // Confirm the file still exists; if not fall through to defaults
    try { fs.accessSync(entry.iconPath); return entry.iconPath; } catch {}
  }
  // Conventional fallbacks
  const candidates = [
    path.join(ROBOS_BASE, appId, `${appId}.svg`),
    path.join(ROBOS_BASE, appId, 'icon.svg'),
    path.join(ROBOS_BASE, appId, `${appId}.png`),
    path.join(ROBOS_BASE, appId, 'icon.png'),
    path.join(PIXMAPS_BASE, `${appId}.svg`),
    path.join(PIXMAPS_BASE, `${appId}.png`),
  ];
  for (const p of candidates) {
    try { fs.accessSync(p); return p; } catch {}
  }
  return null;
}

/**
 * Returns the full registry icons map: { [appId]: { label, iconPath, desktopFile } }
 */
function getAllIcons() {
  return getRegistry().icons || {};
}

/**
 * Returns the label for a given appId (from registry).
 */
function getLabel(appId) {
  return getRegistry().icons?.[appId]?.label || appId;
}

/**
 * Returns the builtin Lucide SVG string for a given appId (MIT license).
 * Returns null if the appId is not in the builtin catalogue.
 */
function getBuiltinSvg(appId) {
  const BUILTIN_APPS = require('./builtin-apps');
  const entry = BUILTIN_APPS.find(a => a.appId === appId);
  return entry ? entry.iconSvg : null;
}

/**
 * Returns the full builtin app catalogue.
 * Each entry: { appId, label, desc, iconSvg, iconName }
 */
function getBuiltinApps() {
  return require('./builtin-apps');
}

module.exports = { getIconPath, getAllIcons, getLabel, getRegistry, getBuiltinSvg, getBuiltinApps, REGISTRY_PATH };
