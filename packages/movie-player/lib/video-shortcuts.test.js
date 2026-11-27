'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { findVideoShortcut } = require('./video-shortcuts');

test('video shortcuts distinguish seek, queue navigation, and modifier combinations', () => {
  assert.deepEqual(findVideoShortcut({ key: 'ArrowLeft' }), { action: 'seekBy', amount: -10, repeat: true, local: undefined });
  assert.equal(findVideoShortcut({ key: 'ArrowRight', shiftKey: true }).amount, 30);
  assert.equal(findVideoShortcut({ key: 'ArrowRight', ctrlKey: true }).action, 'next');
  assert.equal(findVideoShortcut({ key: 'ArrowLeft', metaKey: true }).action, 'prev');
  assert.equal(findVideoShortcut({ key: 'P', shiftKey: true }).action, 'prev');
  assert.equal(findVideoShortcut({ key: 'p' }).action, 'pip');
  assert.equal(findVideoShortcut({ key: 'ArrowLeft', altKey: true }), undefined);
  assert.equal(findVideoShortcut({ key: 'f', ctrlKey: true }), undefined);
});

test('video shortcuts cover shifted question mark, space, and percentage jumps', () => {
  assert.equal(findVideoShortcut({ key: '?', shiftKey: true }).action, 'help');
  assert.equal(findVideoShortcut({ key: ' ' }).action, 'toggle');
  assert.equal(findVideoShortcut({ key: '0' }).amount, 0);
  assert.equal(findVideoShortcut({ key: '9' }).amount, 0.9);
  assert.equal(findVideoShortcut({ key: 'Enter', altKey: true }).action, 'fullscreen');
  assert.equal(findVideoShortcut({ key: 'm', isComposing: true }), undefined);
  assert.equal(findVideoShortcut({ key: 'm', defaultPrevented: true }), undefined);
  assert.equal(findVideoShortcut({ key: '?', getModifierState: name => name === 'AltGraph' }), undefined);
});
