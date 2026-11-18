'use strict';
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('services', Object.fromEntries(['hosts', 'save-host', 'key', 'probe', 'install', 'list', 'action', 'linger', 'connection'].map(name => [name.replace(/-([a-z])/g, (_, c) => c.toUpperCase()), (...args) => ipcRenderer.invoke(`services:${name}`, ...args)])));
