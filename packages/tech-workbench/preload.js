const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('tps', {
  // Sessions
  listSessions:     ()             => ipcRenderer.invoke('list-sessions'),
  createSession:    (name)         => ipcRenderer.invoke('create-session', { name }),
  loadSession:      (slug)         => ipcRenderer.invoke('load-session', slug),
  savePrompt:       (slug, prompt) => ipcRenderer.invoke('save-prompt', { slug, prompt }),
  renameSession:    (slug, name)   => ipcRenderer.invoke('rename-session', { slug, name }),
  deleteSession:    (slug)         => ipcRenderer.invoke('delete-session', slug),
  openFolder:       (slug)         => ipcRenderer.invoke('open-session-folder', slug),

  // AI
  generateDraft:    (slug)         => ipcRenderer.invoke('generate-draft', { slug }),
  generateQuestions:(slug)         => ipcRenderer.invoke('generate-questions', { slug }),
  saveAnswers:      (slug, answers)=> ipcRenderer.invoke('save-answers', { slug, answers }),
  refineDocs:       (slug)         => ipcRenderer.invoke('refine-docs', { slug }),

  // Filesystem
  listPath:         (prefix)        => ipcRenderer.invoke('list-path', prefix),

  // Journal
  journalLogEvent:  (evt)          => ipcRenderer.invoke('journal-log-event', evt),
  getProjectsReport: (slug)        => ipcRenderer.invoke('get-projects-report', slug),
  openExternal:     (url)          => ipcRenderer.invoke('open-external', url),

  // Events
  onStream:         (cb)           => ipcRenderer.on('stream', (_, d) => cb(d)),
  offStream:        ()             => ipcRenderer.removeAllListeners('stream'),
  quickAsk:         (args)         => ipcRenderer.invoke('quick-ask', args),
  onQuickAskStream: (cb)           => { const h = (_, d) => cb(d); ipcRenderer.on('quick-ask-stream', h); return () => ipcRenderer.removeListener('quick-ask-stream', h); },
});
