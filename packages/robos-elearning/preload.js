'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('robosELearning', {
  getInitialTarget: () => ipcRenderer.invoke('elearning:get-initial-target'),
  listCourses: () => ipcRenderer.invoke('elearning:list-courses'),
  getCourse: (id) => ipcRenderer.invoke('elearning:get-course', id),
  issueCertificate: (payload) => ipcRenderer.invoke('elearning:issue-certificate', payload),
  listCertificates: (opts) => ipcRenderer.invoke('elearning:list-certificates', opts),
});