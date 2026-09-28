const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('robos', {
  getPaths: () => ipcRenderer.invoke('app:get-paths'),
  
  // Campaign APIs
  listCampaigns: () => ipcRenderer.invoke('campaigns:list'),
  loadCampaign: (slug) => ipcRenderer.invoke('campaigns:load', slug),
  saveCampaign: (payload) => ipcRenderer.invoke('campaigns:save', payload),
  deleteCampaign: (slug) => ipcRenderer.invoke('campaigns:delete', slug),
  renderCampaignAsGame: (payload) => ipcRenderer.invoke('campaigns:render-as-game', payload),

  // Character & NPC APIs
  listCharacters: () => ipcRenderer.invoke('characters:list'),
  loadCharacter: (slug) => ipcRenderer.invoke('characters:load', slug),
  saveCharacter: (payload) => ipcRenderer.invoke('characters:save', payload),
  deleteCharacter: (slug) => ipcRenderer.invoke('characters:delete', slug),

  // Map APIs
  listMaps: () => ipcRenderer.invoke('maps:list'),
  loadMap: (slug) => ipcRenderer.invoke('maps:load', slug),
  saveMap: (payload) => ipcRenderer.invoke('maps:save', payload),
  buildMap: (payload) => ipcRenderer.invoke('maps:build', payload),
  exportMapPng: (payload) => ipcRenderer.invoke('maps:export-png', payload),

  // Item APIs
  listItems: () => ipcRenderer.invoke('items:list'),
  loadItem: (slug) => ipcRenderer.invoke('items:load', slug),
  saveItem: (payload) => ipcRenderer.invoke('items:save', payload),
  deleteItem: (slug) => ipcRenderer.invoke('items:delete', slug),

  // Enemy / Monster APIs
  listEnemies: () => ipcRenderer.invoke('enemies:list'),
  loadEnemy: (slug) => ipcRenderer.invoke('enemies:load', slug),
  saveEnemy: (payload) => ipcRenderer.invoke('enemies:save', payload),
  deleteEnemy: (slug) => ipcRenderer.invoke('enemies:delete', slug),

  // Spell APIs
  listSpells: () => ipcRenderer.invoke('spells:list'),
  loadSpell: (slug) => ipcRenderer.invoke('spells:load', slug),
  saveSpell: (payload) => ipcRenderer.invoke('spells:save', payload),
  deleteSpell: (slug) => ipcRenderer.invoke('spells:delete', slug),

  // Ability APIs
  listAbilities: () => ipcRenderer.invoke('abilities:list'),
  loadAbility: (slug) => ipcRenderer.invoke('abilities:load', slug),
  saveAbility: (payload) => ipcRenderer.invoke('abilities:save', payload),
  deleteAbility: (slug) => ipcRenderer.invoke('abilities:delete', slug),

  // Game Event APIs (Knowledge Graph & Infinity Engine interactions)
  listGameEvents: () => ipcRenderer.invoke('events:list'),
  loadGameEvent: (slug) => ipcRenderer.invoke('events:load', slug),
  saveGameEvent: (payload) => ipcRenderer.invoke('events:save', payload),
  deleteGameEvent: (slug) => ipcRenderer.invoke('events:delete', slug),

  // Scene APIs
  listScenes: () => ipcRenderer.invoke('scenes:list'),

  // Visual Asset & 3D Model APIs
  listAssets: (filter) => ipcRenderer.invoke('assets:list', filter),
  importAsset: (payload) => ipcRenderer.invoke('assets:import', payload),
  generateToken: (payload) => ipcRenderer.invoke('assets:generate-token', payload),

  // Platform info
  platform: process.platform,
});
