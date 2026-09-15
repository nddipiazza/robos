'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('robosELearning', {
  getInitialTarget: () => ipcRenderer.invoke('elearning:get-initial-target'),
  listCourses: () => ipcRenderer.invoke('elearning:list-courses'),
  getCourse: (id) => ipcRenderer.invoke('elearning:get-course', id),
  issueCertificate: (payload) => ipcRenderer.invoke('elearning:issue-certificate', payload),
  listCertificates: (opts) => ipcRenderer.invoke('elearning:list-certificates', opts),
});
contextBridge.exposeInMainWorld('robosCourseEditor',{openLink:url=>ipcRenderer.invoke('robos-course-open-link',url),preview:input=>ipcRenderer.invoke('robos-course-preview',input),apply:id=>ipcRenderer.invoke('robos-course-apply',id)});
