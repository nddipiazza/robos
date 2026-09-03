'use strict';
const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('viewer', {
  getStreams: () => [
    {
      taskId: 'TASK-101',
      username: 'agent-task-101',
      role: 'Senior Code Reviewer',
      display: ':10',
      status: 'active',
      streamUrl: 'http://localhost:19160/stream',
      fps: 60,
      cpu: '12%',
      memory: '340 MB',
    },
    {
      taskId: 'TASK-202',
      username: 'agent-task-202',
      role: 'Lead Security Auditor',
      display: ':11',
      status: 'active',
      streamUrl: 'http://localhost:19161/stream',
      fps: 60,
      cpu: '18%',
      memory: '480 MB',
    },
    {
      taskId: 'TASK-303',
      username: 'agent-task-303',
      role: 'BDD Test Implementer',
      display: ':12',
      status: 'active',
      streamUrl: 'http://localhost:19162/stream',
      fps: 60,
      cpu: '9%',
      memory: '290 MB',
    },
  ],
});
