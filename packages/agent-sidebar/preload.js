'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('sidebar', {
  getAgentContext: () => ({
    taskId: process.env.ROBOS_TASK_ID || 'TASK-101',
    role: process.env.ROBOS_AGENT_ROLE || 'Senior Code Reviewer',
    username: process.env.USER || 'agent-task-101',
    model: 'claude-sonnet-4-20250514',
  }),
});
