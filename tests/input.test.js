import test from 'node:test';
import assert from 'node:assert/strict';
import { Input, KEYMAP, DEFAULT_BINDINGS, cloneBindings, normalizeBindings, migrateBindings, assignBinding, clearBinding, keyLabel, buttonLabel, isReservedKey } from '../src/input.js';

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
    for (const code of ['KeyK', 'KeyV', 'KeyL', 'KeyW', 'ArrowUp']) {
      handlers.keydown({ code, repeat: false, target: { closest: () => null }, preventDefault() {} });
      handlers.keyup({ code });
    }
    input.update(16, game);
    assert.deepEqual(calls, [['park', 1], ['exchange', 0], ['exchange', 1], ['drop', 0], ['drop', 1]]);
    input.update(16, game);
    assert.equal(calls.length, 5);
    for (const code of ['KeyA', 'KeyA', 'ArrowRight', 'KeyD', 'KeyS']) {
      handlers.keydown({ code, repeat: false, target: { closest: () => null }, preventDefault() {} });
      handlers.keyup({ code });
    }
    input.update(16, game);
    assert.deepEqual(calls.slice(-5), [['move', 0, -1], ['move', 0, -1], ['move', 1, 1], ['move', 0, 1], ['move', 0, 0]]);
  } finally {
    globalThis.window = oldWindow;
  }
});

test('defaults use paired rotation keys, Up for hard drop and K/L for park/trade', () => {
  assert.deepEqual(KEYMAP.KeyQ, [0, 'ccw']);
  assert.deepEqual(KEYMAP.KeyE, [0, 'cw']);
  assert.deepEqual(KEYMAP.KeyW, [0, 'drop']);
  assert.equal(KEYMAP.Space, undefined);
  assert.deepEqual(KEYMAP.Comma, [1, 'ccw']);
  assert.deepEqual(KEYMAP.Period, [1, 'cw']);
  assert.deepEqual(KEYMAP.ArrowUp, [1, 'drop']);
  assert.deepEqual(KEYMAP.KeyK, [1, 'park']);
  assert.deepEqual(KEYMAP.KeyL, [1, 'exchange']);
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

test('assigning a key in use swaps it, and adding an extra key moves it', () => {
  const swapped = assignBinding(DEFAULT_BINDINGS, 'keys', [0, 'cw', 0], 'Period');
  assert.equal(swapped.moved, '1:cw');
  assert.deepEqual(swapped.bindings.keys[0].cw, ['Period']);
  assert.deepEqual(swapped.bindings.keys[1].cw, ['KeyE']);
  assert.deepEqual(DEFAULT_BINDINGS.keys[0].cw, ['KeyE'], 'defaults are never mutated');
  const extra = assignBinding(DEFAULT_BINDINGS, 'keys', [0, 'cw', 1], 'KeyR');
  assert.deepEqual(extra.bindings.keys[0].cw, ['KeyE', 'KeyR']);
  assert.equal(extra.moved, null);
  const stolen = assignBinding(DEFAULT_BINDINGS, 'keys', [0, 'cw', 1], 'KeyQ');
  assert.deepEqual(stolen.bindings.keys[0].ccw, [], 'an action may become unbound and is reported in the UI');
  const pad = assignBinding(DEFAULT_BINDINGS, 'pad', ['drop', 0], 5);
  assert.deepEqual(pad.bindings.pad.drop, [5]);
  assert.deepEqual(pad.bindings.pad.exchange, [4, 2]);
  assert.deepEqual(clearBinding(DEFAULT_BINDINGS, 'pad', ['exchange', 0]).pad.exchange, [5]);
});

test('custom bindings drive gameplay for keyboard and controller', () => {
  const handlers = {};
  const oldWindow = globalThis.window;
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  globalThis.window = { addEventListener: (name, fn) => { handlers[name] = fn; } };
  const buttons = Array.from({ length: 17 }, () => ({ pressed: false }));
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { getGamepads: () => [{ index: 0, id: 'Pad', mapping: 'standard', connected: true, buttons, axes: [0, 0] }] } });
  try {
    const input = new Input({ onPause() {}, onActivate() {}, onPads() {}, isPlaying: () => true, isDialogOpen: () => false });
    let bindings = assignBinding(DEFAULT_BINDINGS, 'keys', [1, 'park', 0], 'KeyL').bindings;
    bindings = assignBinding(bindings, 'pad', ['drop', 0], 7).bindings;
    input.setBindings(bindings);
    const calls = [];
    const game = { move() {}, rotate() {}, park: id => calls.push(['park', id]), exchange() {}, hardDrop: id => calls.push(['drop', id]) };
    input.update(16, game);
    handlers.keydown({ code: 'KeyL', repeat: false, target: { closest: () => null }, preventDefault() {} });
    handlers.keydown({ code: 'KeyK', repeat: false, target: { closest: () => null }, preventDefault() {} });
    buttons[2].pressed = true;
    input.update(16, game);
    assert.deepEqual(calls, [['park', 1]], 'old key and old button no longer act');
    buttons[7].pressed = true;
    input.update(16, game);
    assert.deepEqual(calls.at(-1), ['drop', 1]);
  } finally {
    globalThis.window = oldWindow;
    if (descriptor) Object.defineProperty(globalThis, 'navigator', descriptor);
    else delete globalThis.navigator;
  }
});

test('old default keyboards migrate, but custom keyboards and controller bindings are preserved', () => {
  const old = cloneBindings();
  old.keys[0].cw = ['KeyW'];
  old.keys[0].drop = ['Space'];
  Object.assign(old.keys[1], {
    cw: ['ArrowUp'], ccw: ['ShiftRight', 'Slash'], drop: ['Enter'],
    park: ['ControlRight', 'Period'], exchange: ['Backspace', 'Comma'],
  });
  old.pad = assignBinding(old, 'pad', ['drop', 0], 7).bindings.pad;
  const migrated = migrateBindings(old);
  assert.deepEqual(migrated.keys, cloneBindings().keys);
  assert.deepEqual(migrated.pad, old.pad);
  old.keys[0].park = ['KeyB'];
  assert.deepEqual(migrateBindings(old), old);
});

test('previous left defaults migrate to W without changing custom controls', () => {
  const previous = cloneBindings();
  previous.keys[0].drop = ['Space'];
  previous.keys[1].park = ['KeyB'];
  assert.deepEqual(migrateBindings(previous).keys[0], cloneBindings().keys[0]);
  assert.deepEqual(migrateBindings(previous).keys[1], previous.keys[1]);
  previous.keys[0].park = ['KeyN'];
  assert.deepEqual(migrateBindings(previous), previous);
  previous.keys[0].park = ['KeyC'];
  previous.keys[1].park = ['KeyW'];
  assert.deepEqual(migrateBindings(previous), previous, 'never steal a customized key');
});

test('stored bindings are validated; reserved, duplicate or malformed data falls back', () => {
  const custom = assignBinding(DEFAULT_BINDINGS, 'keys', [1, 'drop', 0], 'Numpad0').bindings;
  assert.deepEqual(normalizeBindings(JSON.parse(JSON.stringify(custom))), custom);
  assert.deepEqual(normalizeBindings(null), cloneBindings());
  const reserved = cloneBindings(custom);
  reserved.keys[0].drop = ['Escape'];
  assert.deepEqual(normalizeBindings(reserved).keys, cloneBindings().keys);
  const duplicate = cloneBindings(custom);
  duplicate.keys[0].drop = ['Enter'];
  duplicate.keys[1].drop = ['Enter'];
  assert.deepEqual(normalizeBindings(duplicate).keys, cloneBindings().keys);
  assert.deepEqual(normalizeBindings({ keys: custom.keys, pad: { drop: [99] } }).keys, custom.keys);
  assert.ok(isReservedKey('Escape') && isReservedKey('Tab') && !isReservedKey('KeyA'));
});

test('labels show layout characters when available, otherwise physical names', () => {
  assert.equal(keyLabel('KeyA'), 'A');
  assert.equal(keyLabel('ShiftRight'), 'R SHIFT');
  assert.equal(keyLabel('Slash', new Map([['Slash', '-']])), '-');
  assert.equal(keyLabel('Semicolon', new Map([['Semicolon', 'æ']])), 'Æ');
  assert.equal(keyLabel('ArrowUp', new Map([['ArrowUp', 'x']])), '↑');
  assert.equal(buttonLabel(0), 'A / CROSS');
  assert.equal(buttonLabel(20), 'BUTTON 20');
});

test('rapid rotation taps and keyboard repeats are delivered, but destructive key repeats are ignored', () => {
  const handlers = {};
  const oldWindow = globalThis.window;
  globalThis.window = { addEventListener: (name, fn) => { handlers[name] = fn; } };
  try {
    const input = new Input({ onPause() {}, onActivate() {}, onPads() {}, isPlaying: () => true, isDialogOpen: () => false });
    input.pollPads = () => [];
    const calls = [];
    const key = (code, repeat = false) => handlers.keydown({ code, repeat, target: { closest: () => null }, preventDefault() {} });
    const game = { move() {}, rotate: (id, dir) => calls.push([id, dir]), exchange() {}, hardDrop() {} };
    key('KeyE');
    key('KeyE', true);
    key('KeyE', true);
    key('Comma');
    key('Comma', true);
    key('KeyL', true);
    key('ArrowUp', true);
    input.update(16, game);
    assert.deepEqual(calls, [[0, 1], [0, 1], [0, 1], [1, -1], [1, -1]]);
    input.update(16, game);
    assert.equal(calls.length, 5);
  } finally { globalThis.window = oldWindow; }
});

test('queued old-piece actions cannot drop or park its replacement in the same frame', () => {
  const handlers = {};
  const oldWindow = globalThis.window;
  globalThis.window = { addEventListener: (name, fn) => { handlers[name] = fn; } };
  try {
    const input = new Input({ onPause() {}, onActivate() {}, onPads() {}, isPlaying: () => true, isDialogOpen: () => false });
    input.pollPads = () => [];
    const calls = [];
    const game = {
      players: [{ serial: 1 }, { serial: 1 }],
      move: (...args) => calls.push(['move', ...args]),
      hardDrop(id) { calls.push(['drop', id]); this.players[id].serial++; },
      park: id => calls.push(['park', id]),
      rotate: id => calls.push(['rotate', id]),
    };
    for (const code of ['KeyW', 'KeyW', 'KeyC', 'KeyE', 'ArrowUp']) {
      handlers.keydown({ code, repeat: false, target: { closest: () => null }, preventDefault() {} });
      handlers.keyup({ code });
    }
    input.update(16, game);
    assert.deepEqual(calls, [['drop', 0], ['drop', 1]]);
    handlers.keydown({ code: 'ArrowDown', repeat: false, target: { closest: () => null }, preventDefault() {} });
    input.update(16, game);
    assert.equal(calls.length, 3, 'a fresh soft-drop tap is delivered once');
    input.update(19, game);
    assert.equal(calls.length, 3, 'held drop timer starts fresh on the new piece');
    input.update(16, game);
    assert.equal(calls.length, 4);
    assert.deepEqual(calls.at(-1), ['move', 1, 0, 1, true]);
  } finally { globalThis.window = oldWindow; }
});
