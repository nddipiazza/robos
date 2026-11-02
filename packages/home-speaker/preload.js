'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('robosSpeaker', {
  scanSpeakers: () => ipcRenderer.invoke('speakers:scan'),
  getSpeakers: () => ipcRenderer.invoke('speakers:get'),
  probeSpeakers: () => ipcRenderer.invoke('speakers:probe'),
  getSupportedCatalog: () => ipcRenderer.invoke('speakers:getSupportedCatalog'),
  discoverHADevices: (options) => ipcRenderer.invoke('speakers:discoverHA', options),
  probeSingleDevice: (params) => ipcRenderer.invoke('speakers:probeSingle', params),
  addDevice: (deviceData) => ipcRenderer.invoke('speakers:addDevice', deviceData),
  removeDevice: (ip) => ipcRenderer.invoke('speakers:removeDevice', ip),
  setDeviceLedRing: (ip, options) => ipcRenderer.invoke('speakers:setLedRing', ip, options),
  testDevice: (ip, options) => ipcRenderer.invoke('speakers:testDevice', ip, options),
  scanBleDevices: (timeoutSec) => ipcRenderer.invoke('speakers:scanBle', timeoutSec),
  provisionBleWifi: (params) => ipcRenderer.invoke('speakers:provisionBleWifi', params),
  startVoiceListener: (ip, options) => ipcRenderer.invoke('speakers:startListener', ip, options),
  stopVoiceListener: () => ipcRenderer.invoke('speakers:stopListener'),
  getVoiceListenerStatus: () => ipcRenderer.invoke('speakers:getListenerStatus'),
  clearVoiceInbox: () => ipcRenderer.invoke('speakers:clearInbox'),
  triggerSpeakerMicNow: (ip, options) => ipcRenderer.invoke('speakers:triggerMicNow', ip, options),
  onVoiceListenerUpdate: (cb) => {
    const handler = (_event, status) => cb(status);
    ipcRenderer.on('speakers:listener-update', handler);
    return () => ipcRenderer.removeListener('speakers:listener-update', handler);
  },
  getStatus: (targetIp) => ipcRenderer.invoke('speakers:getStatus', targetIp),
  setVolume: (targetIp, level, muted) => ipcRenderer.invoke('speakers:setVolume', targetIp, level, muted),
  stopPlayback: (targetIp) => ipcRenderer.invoke('speakers:stop', targetIp),
  pausePlayback: (targetIp) => ipcRenderer.invoke('speakers:pause', targetIp),
  resumePlayback: (targetIp) => ipcRenderer.invoke('speakers:resume', targetIp),
  openTvStudio: () => ipcRenderer.invoke('speakers:openTvStudio'),
  castFile: (target, filePath, metadata) => ipcRenderer.invoke('speakers:castFile', target, filePath, metadata),
  castTTS: (target, text, options) => ipcRenderer.invoke('speakers:castTTS', target, text, options),
  castVoiceRecording: (target, arrayBuffer, options) => ipcRenderer.invoke('speakers:castVoiceRecording', target, arrayBuffer, options),
  playSound: (target, soundId) => ipcRenderer.invoke('speakers:playSound', target, soundId),
  playAmbient: (target, soundType, durationMinutes) => ipcRenderer.invoke('speakers:playAmbient', target, soundType, durationMinutes),
  listSounds: () => ipcRenderer.invoke('speakers:listSounds'),
  listVoices: () => ipcRenderer.invoke('speakers:listVoices'),
  openAudioFileDialog: () => ipcRenderer.invoke('dialog:openAudioFile'),

  // RobOS Media Player Music Library
  getLibraryTracks: (limit) => ipcRenderer.invoke('library:getTracks', limit),
  searchLibrary: (query, limit) => ipcRenderer.invoke('library:search', query, limit),
  getLibraryAlbums: () => ipcRenderer.invoke('library:getAlbums'),
  castLibraryTrack: (target, queryOrId) => ipcRenderer.invoke('library:castTrack', target, queryOrId),

  // Scheduled Broadcasts
  listSchedules: () => ipcRenderer.invoke('schedule:list'),
  getSchedule: (id) => ipcRenderer.invoke('schedule:get', id),
  addSchedule: (jobData) => ipcRenderer.invoke('schedule:add', jobData),
  updateSchedule: (id, partial) => ipcRenderer.invoke('schedule:update', id, partial),
  removeSchedule: (id) => ipcRenderer.invoke('schedule:remove', id),
  triggerSchedule: (id) => ipcRenderer.invoke('schedule:trigger', id),
});

