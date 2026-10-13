'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

// Minimal DOM shim for Node environment
class MockHTMLElement {
  constructor() {
    this._attrs = new Map();
    this.children = [];
    this.innerHTML = '';
    this._listeners = new Map();
    this.parentNode = null;
    const classes = new Set();
    this.classList = {
      add: (c) => classes.add(c),
      remove: (c) => classes.delete(c),
      contains: (c) => classes.has(c),
      toggle: (c) => classes.has(c) ? classes.delete(c) : classes.add(c),
    };
    this._childMap = new Map();
    this.style = {};
  }

  getAttribute(name) {
    return this._attrs.get(name) || null;
  }

  setAttribute(name, value) {
    const old = this._attrs.get(name);
    this._attrs.set(name, String(value));
    if (typeof this.attributeChangedCallback === 'function' && old !== value) {
      this.attributeChangedCallback(name, old, String(value));
    }
  }

  hasAttribute(name) {
    return this._attrs.has(name);
  }

  removeAttribute(name) {
    const old = this._attrs.get(name);
    this._attrs.delete(name);
    if (typeof this.attributeChangedCallback === 'function') {
      this.attributeChangedCallback(name, old, null);
    }
  }

  addEventListener(type, listener) {
    if (!this._listeners.has(type)) this._listeners.set(type, []);
    this._listeners.get(type).push(listener);
  }

  removeEventListener(type, listener) {
    const arr = this._listeners.get(type);
    if (arr) {
      const idx = arr.indexOf(listener);
      if (idx !== -1) arr.splice(idx, 1);
    }
  }

  dispatchEvent(event) {
    event.target = this;
    const arr = this._listeners.get(event.type) || [];
    for (const l of arr) l(event);
    return true;
  }

  querySelector(sel) {
    if (!this._childMap.has(sel)) {
      this._childMap.set(sel, new MockHTMLElement());
    }
    return this._childMap.get(sel);
  }

  querySelectorAll(sel) {
    return [this.querySelector(sel)];
  }

  appendChild(el) {
    el.parentNode = this;
    this.children.push(el);
    return el;
  }

  removeChild(el) {
    const idx = this.children.indexOf(el);
    if (idx !== -1) this.children.splice(idx, 1);
    el.parentNode = null;
    return el;
  }

  remove() {
    if (this.parentNode) {
      this.parentNode.removeChild(this);
    }
  }
}

global.HTMLElement = MockHTMLElement;
global.CustomEvent = class MockCustomEvent {
  constructor(type, init = {}) {
    this.type = type;
    this.detail = init.detail || null;
    this.bubbles = Boolean(init.bubbles);
  }
};

const definedElements = new Map();
global.customElements = {
  get: (name) => definedElements.get(name),
  define: (name, cls) => definedElements.set(name, cls),
};

global.document = {
  createElement: () => new MockHTMLElement(),
  head: new MockHTMLElement(),
  body: new MockHTMLElement(),
  getElementById: () => null,
};

// Mock fetch to avoid real network attempts during test
global.fetch = async () => ({
  ok: false,
  status: 500,
  json: async () => ({}),
});

// Require the component
const { RobosVoiceButton } = require('../robos-voice-button');
require('../robos-ui');

test('RobosVoiceButton is defined and registered', () => {
  assert.ok(RobosVoiceButton, 'RobosVoiceButton class should be defined');
  assert.equal(customElements.get('robos-voice-button'), RobosVoiceButton);
  assert.ok(global.RobosUI.RobosVoiceButton, 'RobosVoiceButton should be exposed in RobosUI');
});

test('RobosVoiceButton initializes with attributes and guidance prompt', () => {
  const vb = new RobosVoiceButton();
  vb.setAttribute('label', 'Add items via voice');
  vb.setAttribute('guidance-prompt', 'Dictate map setup commands: add 3 skeletons to room 1');
  vb.connectedCallback();

  assert.equal(vb.getAttribute('label'), 'Add items via voice');
  assert.equal(vb.guidancePrompt, 'Dictate map setup commands: add 3 skeletons to room 1');
  assert.equal(vb.isRecording, false);
});

test('RobosVoiceButton start -> simulateInput -> stop emits robos-voice-complete with guidance prompt', async () => {
  const vb = new RobosVoiceButton();
  vb.setAttribute('label', 'Add items via voice');
  vb.guidancePrompt = 'Tabletop quest assistant: add monsters, furniture, and traps';
  vb.connectedCallback();

  let startEvent = null;
  const interimEvents = [];
  let completeEvent = null;

  vb.addEventListener('robos-voice-start', (e) => { startEvent = e; });
  vb.addEventListener('robos-voice-interim', (e) => { interimEvents.push(e); });
  vb.addEventListener('robos-voice-complete', (e) => { completeEvent = e; });

  await vb.start();
  assert.equal(vb.isRecording, true);
  assert.ok(startEvent, 'robos-voice-start should be fired');
  assert.equal(startEvent.detail.guidancePrompt, 'Tabletop quest assistant: add monsters, furniture, and traps');

  // Simulate user speaking words
  vb.simulateInput('add 3 skeletons to room 1', true);
  assert.equal(interimEvents.length, 1);
  assert.equal(interimEvents[0].detail.text, 'add 3 skeletons to room 1');

  // User clicks stop
  const result = await vb.stop();
  assert.equal(vb.isRecording, false);
  assert.ok(completeEvent, 'robos-voice-complete must be dispatched');
  assert.equal(completeEvent.detail.text, 'add 3 skeletons to room 1');
  assert.equal(completeEvent.detail.guidancePrompt, 'Tabletop quest assistant: add monsters, furniture, and traps');
  assert.ok(completeEvent.detail.fullPrompt.includes('[Guidance Context]'));
  assert.ok(completeEvent.detail.fullPrompt.includes('"add 3 skeletons to room 1"'));
  assert.equal(result.text, 'add 3 skeletons to room 1');
});

test('RobosVoiceButton cancel aborts session without complete event', async () => {
  const vb = new RobosVoiceButton();
  vb.connectedCallback();

  let completed = false;
  let cancelled = false;
  vb.addEventListener('robos-voice-complete', () => { completed = true; });
  vb.addEventListener('robos-voice-cancel', () => { cancelled = true; });

  await vb.start();
  vb.simulateInput('place a chest');
  vb.cancel();

  assert.equal(vb.isRecording, false);
  assert.equal(completed, false, 'Should not emit complete on cancel');
  assert.equal(cancelled, true, 'Should emit robos-voice-cancel');
});

test('RobosVoiceButton icon-only removes all text elements from button', () => {
  const vb = new RobosVoiceButton();
  vb.setAttribute('icon-only', '');
  vb.setAttribute('title', 'Add items via voice');
  vb.connectedCallback();

  assert.ok(vb.innerHTML.includes('icon-only'), 'Button has icon-only class');
  assert.ok(!vb.innerHTML.includes('robos-voice-label-text'), 'Button must not contain label-text element');
  assert.ok(!vb.innerHTML.includes('robos-voice-timer'), 'Button must not contain timer element');
  assert.ok(!vb.innerHTML.includes('robos-voice-rec-dot'), 'Button must not contain rec-dot element');
  assert.ok(vb.innerHTML.includes('aria-label="Add items via voice"'), 'Accessible aria-label is present');
});

test('RobosVoiceButton empty label attribute acts as icon-only without text', () => {
  const vb = new RobosVoiceButton();
  vb.setAttribute('label', '');
  vb.setAttribute('title', 'Dictate commands');
  vb.connectedCallback();

  assert.ok(vb.innerHTML.includes('icon-only'), 'Button with label="" has icon-only class');
  assert.ok(!vb.innerHTML.includes('robos-voice-label-text'), 'Button must not contain label-text element');
  assert.ok(!vb.innerHTML.includes('robos-voice-timer'), 'Button must not contain timer element');
});

