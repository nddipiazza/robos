'use strict';

const { contextBridge, ipcRenderer } = require('electron');

const call = (channel) => (...args) => ipcRenderer.invoke(channel, ...args);
const listen = (channel) => (fn) => {
  const h = (_e, payload) => fn(payload);
  ipcRenderer.on(channel, h);
  return () => ipcRenderer.removeListener(channel, h);
};

contextBridge.exposeInMainWorld('robos', {
  listCameras: call('camera:list'),
  saveCamera: call('camera:save'),
  removeCamera: call('camera:remove'),
  setEnabled: call('camera:setEnabled'),
  setMotion: call('camera:setMotion'),
  testCamera: call('camera:test'),
  discover: call('camera:discover'),
  listLocalDevices: call('camera:listLocalDevices'),
  ptzMove: call('camera:ptzMove'),
  ptzStop: call('camera:ptzStop'),
  ptzPresets: call('camera:ptzPresets'),
  ptzGoto: call('camera:ptzGoto'),
  startRecording: call('camera:startRecording'),
  stopRecording: call('camera:stopRecording'),
  snapshot: call('camera:snapshot'),
  listEvents: call('events:list'),
  clearEvents: call('events:clear'),
  listRecordings: call('recordings:list'),
  deleteRecording: call('recordings:delete'),
  revealRecording: call('recordings:reveal'),
  openRecordingsFolder: call('recordings:openFolder'),
  getSettings: call('settings:get'),
  saveSettings: call('settings:save'),
  pickFolder: call('settings:pickFolder'),
  checkFfmpeg: call('settings:checkFfmpeg'),
  onStatus: listen('camera:status'),
  onScore: listen('camera:score'),
  onEvent: listen('camera:event'),
  onLog: listen('camera:log'),
  onRecordingsChanged: listen('camera:recordings-changed'),
});
