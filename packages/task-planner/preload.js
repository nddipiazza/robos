(() => {
'use strict';
const{contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('workTask',Object.fromEntries(['launch-options','open-runner','select','open-implementer','state','folder','save','approve-plan','agent','route','review','quiz','merge'].map(name=>[name,input=>ipcRenderer.invoke('work-task-'+name,input)])));

})();
'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('robos', {
  learningRoots: () => ipcRenderer.invoke('planner-learning-roots'),
  existingLearning: id => ipcRenderer.invoke('planner-existing-learning',id),
  createLearning: input => ipcRenderer.invoke('planner-learning',input),
  people: () => ipcRenderer.invoke('planner-people'),
  saveSignoff: input => ipcRenderer.invoke('planner-signoff',input),
  listPlans: () => ipcRenderer.invoke('project-plan-list'),
  viewPlan: input => ipcRenderer.invoke('project-plan-view', input),
  proposePlan: input => ipcRenderer.invoke('project-plan-propose', input),
  applyPlan: id => ipcRenderer.invoke('project-plan-apply', id),
  readSettings:    ()        => ipcRenderer.invoke('read-settings'),
  getServerInfo:   ()        => ipcRenderer.invoke('get-server-info'),
  saveTaskRepositories: (input) => ipcRenderer.invoke('save-task-repositories',input),
  featureTasks: (url) => ipcRenderer.invoke('feature-tasks',url),
  reviseMarkdown: (input) => ipcRenderer.invoke('revise-markdown',input),
  generateTasks:   (p)       => ipcRenderer.invoke('generate-tasks', p),
  createTasks:     (p)       => ipcRenderer.invoke('create-tasks', p),
  syncTask:        (p)       => ipcRenderer.invoke('sync-task', p),
  fetchJiraEpics:  (p)       => ipcRenderer.invoke('fetch-jira-epics', p),
  openUrl:         (url)     => ipcRenderer.invoke('open-url', url),
  openTaskServers: ()        => ipcRenderer.invoke('open-task-servers'),
  logsSearch:      (opts)    => ipcRenderer.invoke('logs-search', opts),
  logsListApps:    ()        => ipcRenderer.invoke('logs-list-apps'),
  searchIndex:     (prefix)  => ipcRenderer.invoke('tp-list-path', prefix),
  // Projects
  searchImportTasks: (p) => ipcRenderer.invoke('search-import-tasks',p),
  importTasks: (p) => ipcRenderer.invoke('import-tasks',p),
  setProjectProduct: (p) => ipcRenderer.invoke('set-project-product',p),
  listProjects:    ()        => ipcRenderer.invoke('list-projects'),
  loadProject:     (id)      => ipcRenderer.invoke('load-project', id),
  saveProject:     (p)       => ipcRenderer.invoke('save-project', p),
  deleteProject:   (id)      => ipcRenderer.invoke('delete-project', id),
  dialogConfirm:   (p)       => ipcRenderer.invoke('dialog-confirm', p),

  // Templates
  listTaskTemplates:    ()        => ipcRenderer.invoke('list-task-templates'),
  getTaskTemplate:      (id)      => ipcRenderer.invoke('get-task-template', id),
  saveCustomTemplate:   (t)       => ipcRenderer.invoke('save-custom-template', t),
  deleteCustomTemplate: (id)      => ipcRenderer.invoke('delete-custom-template', id),
  generateTemplatePlan: (p)       => ipcRenderer.invoke('generate-template-plan', p),

  // Story 31.08 DAG & Planning Mode
  getTaskGraph:     ()       => ipcRenderer.invoke('dag-get-task-graph'),
  dispatchPlanning: (id)     => ipcRenderer.invoke('dag-dispatch-planning', id),
  grillTurn:        (p)      => ipcRenderer.invoke('dag-grill-turn', p),
  approvePlan:      (id)     => ipcRenderer.invoke('dag-approve-plan', id),
  switchBranch:     (b)      => ipcRenderer.invoke('dag-switch-branch', b),
  minimize:         ()       => ipcRenderer.invoke('minimize-window'),
});

contextBridge.exposeInMainWorld('robosProviders',{list:options=>ipcRenderer.invoke('robos-provider-catalog',options)});

contextBridge.exposeInMainWorld('robosKGraphs',{list:()=>ipcRenderer.invoke('robos-kgraphs-list'),add:()=>ipcRenderer.invoke('robos-kgraphs-add')});

contextBridge.exposeInMainWorld('robosCourseEditor',{preview:input=>ipcRenderer.invoke('robos-course-preview',input),apply:id=>ipcRenderer.invoke('robos-course-apply',id)});
