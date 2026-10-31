import test from 'node:test';
import assert from 'node:assert/strict';
import { Input } from '../src/input.js';

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
