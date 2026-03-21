'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

module.exports = {
  type: 'journal_append',
  label: 'Journal Append',
  description: 'Write a journal entry to the work journal',
  params: {
    text: { type: 'string', required: true, templatable: true },
    type: { type: 'enum', values: ['note', 'auto', 'event'], required: false },
  },

  async execute(params, _context) {
    const journalDir = path.join(os.homedir(), '.config', 'robos', 'journal');
    fs.mkdirSync(journalDir, { recursive: true });

    const date = new Date().toISOString().slice(0, 10);
    const filePath = path.join(journalDir, `${date}.jsonl`);

    const entry = {
      ts: new Date().toISOString(),
      type: params.type || 'auto',
      text: params.text,
    };

    fs.appendFileSync(filePath, JSON.stringify(entry) + '\n');

    return { success: true, output: entry };
  },
};
