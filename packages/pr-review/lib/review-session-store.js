'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const {createHash} = require('node:crypto');
const hash = value => createHash('sha256').update(value).digest('hex').slice(0, 16);
const slug = value => String(value || 'local').replace(/[^a-zA-Z0-9._-]+/g, '-').slice(0, 80);
class ReviewSessionStore {
  constructor({repo, number, branch, workspace, root = path.join(os.homedir(), '.robos', 'pr-reviews')}) {
    const identity = number && /^\d+$/.test(String(number)) ? `pr-${number}` : `branch-${slug(branch)}-${hash(workspace || '')}`;
    this.directory = path.join(root, `${slug(repo)}-${hash(repo || '')}`, identity);
    fs.mkdirSync(this.directory, {recursive:true, mode:0o700});
    this.snapshot = path.join(this.directory, 'session.json');
    this.transcript = path.join(this.directory, 'conversation.jsonl');
  }
  append(message) { fs.appendFileSync(this.transcript, JSON.stringify(message)+'\n', {mode:0o600}); }
  save(value) {
    const temp = this.snapshot + '.tmp';
    fs.writeFileSync(temp, JSON.stringify({version:1,...value}), {mode:0o600});
    fs.renameSync(temp, this.snapshot);
  }
  read() {
    if (!fs.existsSync(this.snapshot)) return null;
    const value = JSON.parse(fs.readFileSync(this.snapshot, 'utf8'));
    if (value.version !== 1) throw new Error('Unsupported saved review version.');
    return value;
  }
  clear() { this.append({type:'clear', timestamp:Date.now()}); }
  // Backward pagination: never read the complete archive into memory.
  page(before, {includeCleared = false} = {}) {
    if (!fs.existsSync(this.transcript)) return {messages:[], before:0};
    const fd = fs.openSync(this.transcript,'r');
    try {
      const size = fs.fstatSync(fd).size;
      if (before !== undefined && (!Number.isSafeInteger(before) || before < 0 || before > size)) throw new Error('Invalid history cursor.');
      let end = before ?? size; let position = end; let carry = Buffer.alloc(0); const messages=[]; let bytes=0;
      while (position > 0) {
        const start = Math.max(0, position-65536); const buffer=Buffer.alloc(position-start); fs.readSync(fd,buffer,0,buffer.length,start);
        carry=Buffer.concat([buffer,carry]); position=start;
        let boundary=carry.length;
        for(let i=carry.length-1;i>=0;i--) {
          if(carry[i]!==10) continue;
          if(i===boundary-1) {boundary=i;continue;}
          const line=carry.subarray(i+1,boundary);const offset=position+i+1;
          let message;try {message=JSON.parse(line.toString('utf8'));}catch {boundary=i;continue;}
          if(message.type==='clear') { if (!includeCleared) return {messages:messages.reverse(),before:0}; boundary=i;continue; }
          if(messages.length && (messages.length>=50 || bytes+line.length>128*1024)) return {messages:messages.reverse(),before:end};
          messages.push({...message,text:String(message.text||'').slice(0,16000)});bytes+=line.length;end=offset;boundary=i;
        }
        carry=carry.subarray(0,boundary);
      }
      if(carry.length && messages.length && (messages.length>=50 || bytes+carry.length>128*1024)) return {messages:messages.reverse(),before:end};
      if(carry.length) {try {const m=JSON.parse(carry.toString('utf8'));if(m.type!=='clear')messages.push({...m,text:String(m.text||'').slice(0,16000)});}catch{}}
      return {messages:messages.reverse(),before:0};
    } finally {fs.closeSync(fd);}
  }
}
module.exports={ReviewSessionStore};
