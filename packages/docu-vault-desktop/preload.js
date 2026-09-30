'use strict';
const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getAppName: () => 'DocuVault Desktop',
  getAppVersion: () => '1.0.0',
});
