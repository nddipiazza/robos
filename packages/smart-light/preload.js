'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('robos', {
  getOverview: () => ipcRenderer.invoke('lights:getOverview'),
  updateLight: (lightId, patch) => ipcRenderer.invoke('lights:updateLight', lightId, patch),
  setRoomState: (roomId, patch) => ipcRenderer.invoke('lights:setRoomState', roomId, patch),
  addOrUpdateLight: (input) => ipcRenderer.invoke('lights:addOrUpdateLight', input),
  removeLight: (lightId) => ipcRenderer.invoke('lights:removeLight', lightId),
  applyScene: (sceneId, roomScope) => ipcRenderer.invoke('lights:applyScene', sceneId, roomScope),
  saveCustomScene: (input) => ipcRenderer.invoke('lights:saveCustomScene', input),
  designSceneWithAi: (payload) => ipcRenderer.invoke('lights:designSceneWithAi', payload),
  applyCircadianHour: (hourFloat, toggleAuto) =>
    ipcRenderer.invoke('lights:applyCircadianHour', hourFloat, toggleAuto),
  addOrUpdateSchedule: (input) => ipcRenderer.invoke('lights:addOrUpdateSchedule', input),
  removeSchedule: (scheduleId) => ipcRenderer.invoke('lights:removeSchedule', scheduleId),
  triggerScheduleNow: (scheduleId) => ipcRenderer.invoke('lights:triggerScheduleNow', scheduleId),
  triggerCiStatusLight: (payload) => ipcRenderer.invoke('lights:triggerCiStatusLight', payload),
  scanLan: () => ipcRenderer.invoke('lights:scanLan'),
  pairHueBridge: (payload) => ipcRenderer.invoke('lights:pairHueBridge', payload),
  launchApp: (appId) => ipcRenderer.invoke('lights:launchApp', appId),
});
