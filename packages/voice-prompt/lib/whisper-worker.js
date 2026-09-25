'use strict';

const { parentPort } = require('worker_threads');

let transcriberPromise = null;

async function getTranscriber() {
  if (!transcriberPromise) {
    transcriberPromise = (async () => {
      try {
        const { pipeline } = await import('@xenova/transformers');
        return await pipeline('automatic-speech-recognition', 'Xenova/whisper-tiny.en');
      } catch (err) {
        console.warn('[whisper-worker] Failed to load Whisper pipeline:', err.message);
        return null;
      }
    })();
  }
  return transcriberPromise;
}

parentPort.on('message', async (msg) => {
  if (!msg || !msg.type) return;

  if (msg.type === 'shutdown') {
    process.exit(0);
  }

  if (msg.type === 'init') {
    const t = await getTranscriber();
    parentPort.postMessage({ type: 'init-done', ready: Boolean(t) });
    return;
  }

  if (msg.type === 'transcribe') {
    const { id, samples, opts = {} } = msg;
    try {
      const transcriber = await getTranscriber();
      if (!transcriber) {
        parentPort.postMessage({ type: 'transcribe-result', id, text: '', error: 'Transcriber not available' });
        return;
      }
      const res = await transcriber(samples, opts);
      parentPort.postMessage({ type: 'transcribe-result', id, text: res?.text || '' });
    } catch (err) {
      parentPort.postMessage({ type: 'transcribe-result', id, text: '', error: err.message });
    }
  }
});
