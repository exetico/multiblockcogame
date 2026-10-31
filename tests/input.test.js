import test from 'node:test';
import assert from 'node:assert/strict';
import { Input, KEYMAP } from '../src/input.js';

test('sub-frame key taps are delivered once, in order across players', () => {
  const handlers = {};
  const oldWindow = globalThis.window;
  globalThis.window = { addEventListener: (name, fn) => { handlers[name] = fn; } };
  try {
    const input = new Input({
      onPause() {}, onActivate() {}, onPads() {},
      isPlaying: () => true, isDialogOpen: () => false,
    });
    input.pollPads = () => [];
    const calls = [];
    const game = {
      move: (id, dx) => calls.push(['move', id, dx]),
      rotate: (id, dir) => calls.push(['rotate', id, dir]),
      park: id => calls.push(['park', id]),
      exchange: id => calls.push(['exchange', id]),
      hardDrop: id => calls.push(['drop', id]),
    };
    for (const code of ['Period', 'KeyV', 'Comma', 'Space', 'Enter']) {
      handlers.keydown({ code, repeat: false, target: { closest: () => null }, preventDefault() {} });
      handlers.keyup({ code });
    }
    input.update(16, game);
    assert.deepEqual(calls, [['park', 1], ['exchange', 0], ['exchange', 1], ['drop', 0], ['drop', 1]]);
    input.update(16, game);
    assert.equal(calls.length, 5);
    for (const code of ['KeyA', 'ArrowRight']) {
      handlers.keydown({ code, repeat: false, target: { closest: () => null }, preventDefault() {} });
      handlers.keyup({ code });
    }
    input.update(16, game);
    assert.deepEqual(calls.slice(-2), [['move', 0, -1], ['move', 1, 1]]);
  } finally {
    globalThis.window = oldWindow;
  }
});

test('right-player shortcuts use nearby non-punctuation physical keys', () => {
  assert.deepEqual(KEYMAP.ShiftRight, [1, 'ccw']);
  assert.deepEqual(KEYMAP.ArrowUp, [1, 'cw']);
  assert.deepEqual(KEYMAP.ControlRight, [1, 'park']);
  assert.deepEqual(KEYMAP.Backspace, [1, 'exchange']);
  assert.deepEqual(KEYMAP.Enter, [1, 'drop']);
  assert.equal(KEYMAP.ShiftLeft, undefined);
});

test('controller assignments survive partner disconnection and can switch sides', () => {
  const oldWindow = globalThis.window;
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  globalThis.window = { addEventListener() {} };
  let pads = [
    { index: 0, id: 'First', mapping: 'standard', connected: true },
    { index: 1, id: 'Second', mapping: 'standard', connected: true },
  ];
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { getGamepads: () => pads } });
  try {
    const notices = [];
    const input = new Input({ onPause() {}, onActivate() {}, onPads: (slots, lost) => notices.push(lost), isPlaying: () => true, isDialogOpen: () => false });
    input.pollPads();
    assert.deepEqual(input.padSlots.map(slot => [slot.index, slot.player]), [[0, 1], [1, 0]]);
    pads = [pads[1]];
    input.pollPads();
    assert.deepEqual(input.padSlots.map(slot => [slot.index, slot.player]), [[1, 0]]);
    assert.equal(notices.at(-1), true);
    input.swapPads();
    assert.equal(input.padSlots[0].player, 1);
    pads.push({ index: 2, id: 'Replacement', mapping: 'standard', connected: true });
    input.pollPads();
    assert.deepEqual(input.padSlots.map(slot => [slot.index, slot.player]), [[1, 1], [2, 0]]);
  } finally {
    globalThis.window = oldWindow;
    if (descriptor) Object.defineProperty(globalThis, 'navigator', descriptor);
    else delete globalThis.navigator;
  }
});
