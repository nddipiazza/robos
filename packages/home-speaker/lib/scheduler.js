'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const EventEmitter = require('events');

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

class SpeakerScheduler extends EventEmitter {
  constructor(options = {}) {
    super();
    this.configDir = options.configDir || path.join(os.homedir(), '.config', 'robos');
    this.scheduleFile = path.join(this.configDir, 'speaker-schedules.json');
    this.schedules = [];
    this.timer = null;
    this.tickIntervalMs = options.tickIntervalMs || 15000;
    this.executor = options.executor || null;

    this._load();
  }

  _load() {
    try {
      if (fs.existsSync(this.scheduleFile)) {
        const raw = fs.readFileSync(this.scheduleFile, 'utf8');
        const data = JSON.parse(raw);
        this.schedules = Array.isArray(data.schedules) ? data.schedules : [];
      } else {
        this.schedules = [];
      }
    } catch (err) {
      console.warn('[SpeakerScheduler] Failed to load schedules:', err.message);
      this.schedules = [];
    }
  }

  _save() {
    try {
      fs.mkdirSync(this.configDir, { recursive: true });
      fs.writeFileSync(this.scheduleFile, JSON.stringify({
        updatedAt: new Date().toISOString(),
        schedules: this.schedules
      }, null, 2));
    } catch (err) {
      console.warn('[SpeakerScheduler] Failed to save schedules:', err.message);
    }
  }

  setExecutor(fn) {
    this.executor = fn;
  }

  start() {
    if (this.timer) return;
    this.timer = setInterval(() => this.tick(), this.tickIntervalMs);
    this.timer.unref?.();
    console.log('[SpeakerScheduler] Scheduler daemon started.');
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      console.log('[SpeakerScheduler] Scheduler daemon stopped.');
    }
  }

  list() {
    this._load();
    return this.schedules;
  }

  get(id) {
    this._load();
    return this.schedules.find(s => s.id === id);
  }

  add(jobData) {
    this._load();
    const id = jobData.id || `sch_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const newJob = {
      id,
      name: jobData.name || 'Scheduled Alert',
      enabled: jobData.enabled !== false,
      time: jobData.time || '12:00', // HH:MM in 24hr format
      days: Array.isArray(jobData.days) && jobData.days.length > 0 ? jobData.days : ['Daily'],
      date: jobData.date || null, // YYYY-MM-DD for one-time schedules
      target: jobData.target || 'Kitchen speaker',
      actionType: jobData.actionType || 'sound', // 'sound' | 'tts' | 'music' | 'file' | 'ambient'
      payload: jobData.payload || {},
      volume: typeof jobData.volume === 'number' ? jobData.volume : null,
      lastRun: null,
      createdAt: new Date().toISOString()
    };

    this.schedules.push(newJob);
    this._save();
    this.emit('schedule:added', newJob);
    return newJob;
  }

  update(id, partial) {
    this._load();
    const idx = this.schedules.findIndex(s => s.id === id);
    if (idx === -1) return null;

    this.schedules[idx] = {
      ...this.schedules[idx],
      ...partial,
      id // preserve ID
    };

    this._save();
    this.emit('schedule:updated', this.schedules[idx]);
    return this.schedules[idx];
  }

  remove(id) {
    this._load();
    const idx = this.schedules.findIndex(s => s.id === id);
    if (idx === -1) return false;

    const removed = this.schedules.splice(idx, 1)[0];
    this._save();
    this.emit('schedule:removed', removed);
    return true;
  }

  async trigger(id) {
    const job = this.get(id);
    if (!job) throw new Error(`Schedule job not found: ${id}`);
    return this._executeJob(job, true);
  }

  /**
   * Check if a job matches current time and day
   */
  matches(job, now = new Date()) {
    if (!job.enabled) return false;

    // Check HH:MM
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const currentTime = `${hours}:${minutes}`;

    if (job.time !== currentTime) return false;

    // Check if already executed in the same minute
    if (job.lastRun) {
      const last = new Date(job.lastRun);
      if (
        last.getFullYear() === now.getFullYear() &&
        last.getMonth() === now.getMonth() &&
        last.getDate() === now.getDate() &&
        last.getHours() === now.getHours() &&
        last.getMinutes() === now.getMinutes()
      ) {
        return false;
      }
    }

    // Check One-Time date
    if (job.days.includes('Once')) {
      if (job.date) {
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const todayStr = `${year}-${month}-${day}`;
        return job.date === todayStr;
      }
      return true;
    }

    // Check Daily
    if (job.days.includes('Daily') || job.days.includes('All')) {
      return true;
    }

    // Check Weekdays
    const dayOfWeek = DAY_NAMES[now.getDay()];
    if (job.days.includes('Weekdays')) {
      return ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].includes(dayOfWeek);
    }

    // Check Weekends
    if (job.days.includes('Weekends')) {
      return ['Sat', 'Sun'].includes(dayOfWeek);
    }

    // Check explicit days array (e.g. ['Mon', 'Wed', 'Fri'])
    return job.days.includes(dayOfWeek);
  }

  async tick(now = new Date()) {
    this._load();
    for (const job of this.schedules) {
      if (this.matches(job, now)) {
        console.log(`[SpeakerScheduler] Triggering scheduled broadcast: "${job.name}" (${job.time})`);
        job.lastRun = now.toISOString();

        if (job.days.includes('Once')) {
          job.enabled = false;
        }

        this._save();

        try {
          await this._executeJob(job, false);
        } catch (err) {
          console.error(`[SpeakerScheduler] Error executing job "${job.name}":`, err.message);
        }
      }
    }
  }

  async _executeJob(job, manual = false) {
    this.emit('schedule:triggered', { job, manual });
    if (typeof this.executor === 'function') {
      return this.executor(job);
    }
    return { ok: true, scheduled: true };
  }
}

module.exports = { SpeakerScheduler, DAY_NAMES };
