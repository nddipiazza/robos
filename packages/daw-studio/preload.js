'use strict';

const { contextBridge, ipcRenderer, webUtils } = require('electron');

function subscribe(channel, cb) {
  const listener = (_e, payload) => cb(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

contextBridge.exposeInMainWorld('robos', {
  // Hardware & Audio Devices
  getAudioSnapshot: () => ipcRenderer.invoke('daw:audio-snapshot'),
  saveAudioEngine: (payload) => ipcRenderer.invoke('daw:save-audio-engine', payload),
  setFocusriteControl: (payload) => ipcRenderer.invoke('daw:set-focusrite-control', payload),
  testInputCapture: (payload) => ipcRenderer.invoke('daw:test-input', payload),
  playTestTone: (payload) => ipcRenderer.invoke('daw:play-test-tone', payload),
  onHardwareChanged: (cb) => subscribe('daw:hardware-changed', cb),

  // Studio Init, Add Mic Wizard & Drum Instruments
  getStudioInit: () => ipcRenderer.invoke('daw:get-studio-init'),
  wizardStartTapDetect: (payload) => ipcRenderer.invoke('daw:wizard-start-tap-detect', payload),
  wizardStopTapDetect: () => ipcRenderer.invoke('daw:wizard-stop-tap-detect'),
  onTapLevels: (cb) => subscribe('daw:tap-levels', cb),

  addMicTrack: (payload) => ipcRenderer.invoke('daw:add-mic-track', payload),
  updateProjectMeta: (payload) => ipcRenderer.invoke('daw:update-project-meta', payload),
  updateTrack: (payload) => ipcRenderer.invoke('daw:update-track', payload),
  syncProject: (payload) => ipcRenderer.invoke('daw:sync-project', payload),
  deleteTrack: (payload) => ipcRenderer.invoke('daw:delete-track', payload),
  clearTrackClips: (payload) => ipcRenderer.invoke('daw:clear-track-clips', payload),

  getDrumkitsStatus: () => ipcRenderer.invoke('daw:drumkits-status'),
  downloadDrumkit: (payload) => ipcRenderer.invoke('daw:download-drumkit', payload),
  onDrumkitProgress: (cb) => subscribe('daw:drumkit-progress', cb),
  readAudioFile: (payload) => ipcRenderer.invoke('daw:read-audio-file', payload),

  // Custom VST / LV2 / CLAP & Sample Library Directories
  vstDirsGet: () => ipcRenderer.invoke('daw:vst-dirs-get'),
  vstDirsAdd: (payload) => ipcRenderer.invoke('daw:vst-dirs-add', payload),
  vstDirsRemove: (payload) => ipcRenderer.invoke('daw:vst-dirs-remove', payload),
  openFolderPath: (payload) => ipcRenderer.invoke('daw:open-folder-path', payload),

  // DrumSet AI All-Mic Soundcheck Wizard (All Mics -> RobOS Agent / Gemini)
  soundcheckStart: (payload) => ipcRenderer.invoke('daw:soundcheck-start', payload),
  soundcheckCancel: () => ipcRenderer.invoke('daw:soundcheck-cancel'),
  soundcheckStopAndClassify: (payload) => ipcRenderer.invoke('daw:soundcheck-stop-and-classify', payload),
  soundcheckApply: (payload) => ipcRenderer.invoke('daw:soundcheck-apply', payload),
  onSoundcheckLevels: (cb) => subscribe('daw:soundcheck-levels', cb),
  onSoundcheckStatus: (cb) => subscribe('daw:soundcheck-status', cb),

  // Multi-Track Recording & Project Save / Open
  recordStart: (payload) => ipcRenderer.invoke('daw:record-start', payload),
  recordStop: (payload) => ipcRenderer.invoke('daw:record-stop', payload),
  recordCancel: () => ipcRenderer.invoke('daw:record-cancel'),
  onRecordProgress: (cb) => subscribe('daw:record-progress', cb),

  projectNew: (payload) => ipcRenderer.invoke('daw:project-new', payload),
  projectSave: (payload) => ipcRenderer.invoke('daw:project-save', payload),
  projectOpen: (payload) => ipcRenderer.invoke('daw:project-open', payload),
  projectList: () => ipcRenderer.invoke('daw:project-list'),

  addBlankTracks: (payload) => ipcRenderer.invoke('daw:add-blank-tracks', payload),
  importAudioFiles: (payload) => ipcRenderer.invoke('daw:import-audio-files', payload),
  getPathForFile: (file) => {
    try {
      if (webUtils && typeof webUtils.getPathForFile === 'function') {
        return webUtils.getPathForFile(file) || file?.path || '';
      }
      return file?.path || '';
    } catch {
      return file?.path || '';
    }
  },
  exportMixdownWav: (payload) => ipcRenderer.invoke('daw:export-mixdown-wav', payload),
  openSessionFolder: () => ipcRenderer.invoke('daw:open-session-folder'),
});
