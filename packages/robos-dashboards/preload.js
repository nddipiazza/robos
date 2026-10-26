'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('robosDashboards', {
  getOverview: (dashboardId) => ipcRenderer.invoke('dashboards:getOverview', dashboardId),
  setActiveDashboard: (dashboardId) => ipcRenderer.invoke('dashboards:setActive', dashboardId),
  configureSlideshow: (payload) => ipcRenderer.invoke('dashboards:configureSlideshow', payload),
  stepSlideshow: (payload) => ipcRenderer.invoke('dashboards:stepSlideshow', payload),
  setLayout: (payload) => ipcRenderer.invoke('dashboards:setLayout', payload),
  createDashboard: (payload) => ipcRenderer.invoke('dashboards:create', payload),
  deleteDashboard: (dashboardId) => ipcRenderer.invoke('dashboards:delete', dashboardId),
  addCard: (payload) => ipcRenderer.invoke('dashboards:addCard', payload),
  removeCard: (payload) => ipcRenderer.invoke('dashboards:removeCard', payload),
  addCalendarEvent: (payload) => ipcRenderer.invoke('dashboards:addCalendarEvent', payload),
  appendAgentStatusLine: (payload) => ipcRenderer.invoke('dashboards:appendAgentStatusLine', payload),
  getKGraphNodes: (dashboardId) => ipcRenderer.invoke('dashboards:getKGraphNodes', dashboardId),
  castToSmartTv: (payload) => ipcRenderer.invoke('dashboards:castToSmartTv', payload),
  stopSmartTvCast: (payload) => ipcRenderer.invoke('dashboards:stopSmartTvCast', payload),
  openTvWallboardExternal: () => ipcRenderer.invoke('dashboards:openTvWallboardExternal'),
  launchSmartTvApp: () => ipcRenderer.invoke('dashboards:launchSmartTvApp'),
});
