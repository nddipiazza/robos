'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('ctx', {
  readSources:      ()        => ipcRenderer.invoke('read-sources'),
  writeSources:     (data)    => ipcRenderer.invoke('write-sources', data),
  browseFolder:     ()        => ipcRenderer.invoke('browse-folder'),
  listGitProjects:  ()        => ipcRenderer.invoke('list-git-projects'),
  readSpecialFiles: (src)     => ipcRenderer.invoke('read-special-files', src),
  generateKnowledgeGraph:    (src) => ipcRenderer.invoke('generate-knowledge-graph', src),
  generateAgentsMd:          (src) => ipcRenderer.invoke('generate-agents-md', src),
  generateCopilotInstructions:(src) => ipcRenderer.invoke('generate-copilot-instructions', src),
  writeRepoFile:    (args)    => ipcRenderer.invoke('write-repo-file', args),
  scanSource:       (src)     => ipcRenderer.invoke('scan-source', src),
  readFile:         (args)    => ipcRenderer.invoke('read-file', args),
  cloneSource:      (src)     => ipcRenderer.invoke('clone-source', src),
  pullSource:       (src)     => ipcRenderer.invoke('pull-source', src),
  checkCloned:      (src)     => ipcRenderer.invoke('check-cloned', src),
  openVscode:       (src)     => ipcRenderer.invoke('open-vscode', src),
  openUrl:          (url)     => ipcRenderer.invoke('open-url', url),
  buildContextBlob: (opts)    => ipcRenderer.invoke('build-context-blob', opts),
  searchGhRepos:    (args)    => ipcRenderer.invoke('search-gh-repos', args),
  listMyRepos:      ()        => ipcRenderer.invoke('list-my-repos'),
  onCloneOutput:    (cb)      => {
    const h = (_, d) => cb(d);
    ipcRenderer.on('clone-output', h);
    return () => ipcRenderer.off('clone-output', h);
  },
  onAiProgress:     (cb)      => {
    const h = (_, d) => cb(d);
    ipcRenderer.on('ai-progress', h);
    return () => ipcRenderer.off('ai-progress', h);
  },
});
