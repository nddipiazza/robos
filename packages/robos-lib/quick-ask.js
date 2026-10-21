/**
 * robos-lib/quick-ask.js
 *
 * Default answer for the "?" quick-ask button in <robos-ai-textarea>. The
 * question goes through ai-agent.ask(): the active coding-agent CLI, or the
 * optional API mode when the user turned it on.
 *
 * Main process:
 *   require('/usr/local/share/robos/robos-lib/quick-ask').registerQuickAskIPC(ipcMain);
 *
 * Preload (sets window.robosQuickAsk, which the textarea calls):
 *   contextBridge.exposeInMainWorld('robosQuickAsk', (question, context, contextFiles, onChunk, onDone, onError) => {
 *     ipcRenderer.invoke('robos-quick-ask', { question, context, contextFiles })
 *       .then(r => { if (r && r.ok) { onChunk(r.text); onDone(); } else onError((r && r.error) || 'No answer'); })
 *       .catch(e => onError(e.message));
 *   });
 */
'use strict';

const MAX_CONTEXT = 12000;

function buildQuickAskPrompt(question, context = '', contextFiles = []) {
  const files = (Array.isArray(contextFiles) ? contextFiles : []).filter(f => typeof f === 'string' && f).slice(0, 40);
  const text = String(context || '').slice(0, MAX_CONTEXT);
  return [
    'Answer the question below briefly and directly, in plain text. Do not edit files or run commands.',
    text ? `\nThe user is writing this text:\n"""\n${text}\n"""` : '',
    files.length ? `\nFiles they referenced:\n${files.map(f => `- ${f}`).join('\n')}` : '',
    `\nQuestion: ${String(question || '').trim()}`,
  ].filter(Boolean).join('\n');
}

function registerQuickAskIPC(ipcMain, { aiAgent = require('./ai-agent') } = {}) {
  ipcMain.handle('robos-quick-ask', async (_, { question, context, contextFiles } = {}) => {
    if (!question || !String(question).trim()) return { ok: false, error: 'Type a question first.' };
    try {
      const res = await aiAgent.ask(buildQuickAskPrompt(question, context, contextFiles));
      return { ok: res.ok, text: res.text, error: res.error, via: res.via };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });
}

module.exports = { registerQuickAskIPC, buildQuickAskPrompt };
