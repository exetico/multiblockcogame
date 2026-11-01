export const ACTIONS = ['left', 'right', 'down', 'cw', 'ccw', 'drop', 'park', 'exchange'];
export const PAD_ACTIONS = [...ACTIONS, 'pause'];
export const ACTION_LABELS = {
  left: 'Move left', right: 'Move right', down: 'Soft drop', cw: 'Rotate ↻', ccw: 'Rotate ↺',
  drop: 'Hard drop', park: 'Park', exchange: 'Exchange', pause: 'Pause / resume',
};
export const DEFAULT_BINDINGS = Object.freeze({
  keys: [
    { left: ['KeyA'], right: ['KeyD'], down: ['KeyS'], cw: ['KeyE'], ccw: ['KeyQ'], drop: ['KeyW'], park: ['KeyC'], exchange: ['KeyV'] },
    { left: ['ArrowLeft'], right: ['ArrowRight'], down: ['ArrowDown'], cw: ['Period'], ccw: ['Comma'], drop: ['ArrowUp', 'Enter'], park: ['KeyK'], exchange: ['KeyL'] },
  ],
  pad: { left: [14], right: [15], down: [13], cw: [0], ccw: [1], drop: [2], park: [3], exchange: [4, 5], pause: [9] },
});
export const SLOTS = 2;
const RESERVED = new Set(['Escape', 'Tab', 'MetaLeft', 'MetaRight', 'OSLeft', 'OSRight', 'ContextMenu', 'CapsLock', 'NumLock', 'ScrollLock', 'Fn', 'FnLock',
  ...Array.from({ length: 12 }, (_, i) => `F${i + 1}`)]);
export const isReservedKey = code => RESERVED.has(code);
const validCode = code => typeof code === 'string' && /^[A-Za-z0-9]{1,24}$/.test(code) && !RESERVED.has(code);
const validButton = button => Number.isInteger(button) && button >= 0 && button <= 16;

export function cloneBindings(bindings = DEFAULT_BINDINGS) {
  return {
    keys: bindings.keys.map(map => Object.fromEntries(ACTIONS.map(action => [action, [...map[action]]]))),
    pad: Object.fromEntries(PAD_ACTIONS.map(action => [action, [...bindings.pad[action]]])),
  };
}

// Returns valid bindings; any malformed, reserved or duplicated part falls back to defaults.
export function normalizeBindings(raw) {
  const fallback = cloneBindings();
  if (!raw || typeof raw !== 'object') return fallback;
  const list = (value, valid) => Array.isArray(value) && value.length <= SLOTS && value.every(valid) ? [...value] : null;
  let keys = fallback.keys;
  if (Array.isArray(raw.keys) && raw.keys.length === 2) {
    const candidate = raw.keys.map(map => Object.fromEntries(ACTIONS.map(action => [action, list(map?.[action], validCode)])));
    const codes = candidate.flatMap(map => Object.values(map).flatMap(value => value ?? []));
    if (candidate.every(map => Object.values(map).every(Boolean)) && new Set(codes).size === codes.length && codes.length) keys = candidate;
  }
  let pad = fallback.pad;
  if (raw.pad && typeof raw.pad === 'object') {
    const candidate = Object.fromEntries(PAD_ACTIONS.map(action => [action, list(raw.pad[action], validButton)]));
    const buttons = Object.values(candidate).flatMap(value => value ?? []);
    if (Object.values(candidate).every(Boolean) && new Set(buttons).size === buttons.length && buttons.length) pad = candidate;
  }
  return { keys, pad };
}

export function migrateBindings(raw) {
  const bindings = normalizeBindings(raw);
  const previousDefaults = [
    { left: ['KeyA'], right: ['KeyD'], down: ['KeyS'], cw: ['KeyW'], ccw: ['KeyQ'], drop: ['Space'], park: ['KeyC'], exchange: ['KeyV'] },
    { left: ['ArrowLeft'], right: ['ArrowRight'], down: ['ArrowDown'], cw: ['ArrowUp'], ccw: ['ShiftRight', 'Slash'], drop: ['Enter'], park: ['ControlRight', 'Period'], exchange: ['Backspace', 'Comma'] },
  ];
  if (bindings.keys.every((map, id) => ACTIONS.every(action => String(map[action]) === String(previousDefaults[id][action])))) {
    bindings.keys = cloneBindings().keys;
  }
  const previousLeft = { ...DEFAULT_BINDINGS.keys[0], drop: ['Space'] };
  if (ACTIONS.every(action => String(bindings.keys[0][action]) === String(previousLeft[action])) &&
    !Object.values(bindings.keys[1]).some(codes => codes.includes('KeyW'))) {
    bindings.keys[0].drop = ['KeyW'];
  }
  return bindings;
}

export function keymapFrom(bindings) {
  const map = {};
  bindings.keys.forEach((actions, id) => ACTIONS.forEach(action => actions[action].forEach(code => { map[code] = [id, action]; })));
  return map;
}

export const KEYMAP = Object.freeze(keymapFrom(DEFAULT_BINDINGS));

/**
 * Binds `value` to one slot. A conflicting binding elsewhere receives this slot's previous value (a swap).
 * `kind` is 'keys' (target = [player, action, slot]) or 'pad' (target = [action, slot]).
 */
export function assignBinding(bindings, kind, target, value) {
  const next = cloneBindings(bindings);
  const lists = kind === 'keys'
    ? next.keys.flatMap((map, id) => ACTIONS.map(action => [`${id}:${action}`, map[action]]))
    : PAD_ACTIONS.map(action => [action, next.pad[action]]);
  const own = kind === 'keys' ? next.keys[target[0]][target[1]] : next.pad[target[0]];
  const slot = Math.min(target.at(-1), own.length);
  const previous = own[slot];
  if (previous === value) return { bindings: next, moved: null };
  let moved = null;
  for (const [name, values] of lists) {
    const index = values.indexOf(value);
    if (index === -1) continue;
    if (values === own && previous === undefined) return { bindings: next, moved: null };
    if (values !== own) moved = name;
    if (previous === undefined) values.splice(index, 1);
    else values[index] = previous;
  }
  own[slot] = value;
  return { bindings: next, moved };
}

export function clearBinding(bindings, kind, target) {
  const next = cloneBindings(bindings);
  const own = kind === 'keys' ? next.keys[target[0]][target[1]] : next.pad[target[0]];
  own.splice(target.at(-1), 1);
  return next;
}

const KEY_NAMES = {
  Space: 'SPACE', Enter: 'ENTER', Backspace: 'BACKSPACE', ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓',
  ShiftLeft: 'L SHIFT', ShiftRight: 'R SHIFT', ControlLeft: 'L CTRL', ControlRight: 'R CTRL', AltLeft: 'ALT', AltRight: 'ALT GR',
  Slash: '/', Period: '.', Comma: ',', Semicolon: ';', Quote: "'", BracketLeft: '[', BracketRight: ']', Backslash: '\\',
  Minus: '-', Equal: '=', Backquote: '`', IntlBackslash: '<', Delete: 'DEL', Insert: 'INS', Home: 'HOME', End: 'END',
  PageUp: 'PG UP', PageDown: 'PG DN', NumpadEnter: 'NUM ENTER',
};
export function keyLabel(code, layout) {
  const local = layout?.get?.(code);
  if (local && local.trim() && !/^(Arrow|Shift|Control|Alt|Space|Enter|Backspace)/.test(code)) return local.toUpperCase();
  if (KEY_NAMES[code]) return KEY_NAMES[code];
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit\d$/.test(code)) return code.slice(5);
  if (/^Numpad/.test(code)) return 'NUM ' + code.slice(6).replace('Add', '+').replace('Subtract', '-').replace('Multiply', '*').replace('Divide', '/').replace('Decimal', '.').toUpperCase();
  return code.replace(/([a-z])([A-Z])/g, '$1 $2').toUpperCase();
}
const BUTTON_NAMES = ['A / CROSS', 'B / CIRCLE', 'X / SQUARE', 'Y / TRIANGLE', 'LB / L1', 'RB / R1', 'LT / L2', 'RT / R2',
  'BACK / SHARE', 'START / OPTIONS', 'L3', 'R3', 'D-PAD ↑', 'D-PAD ↓', 'D-PAD ←', 'D-PAD →', 'HOME / PS'];
export const buttonLabel = index => BUTTON_NAMES[index] ?? `BUTTON ${index}`;

const CONTINUOUS = new Set(['left', 'right', 'down']);

export class Input {
  constructor({ onPause, onActivate, onPads, isPlaying, isDialogOpen }) {
    this.onPause = onPause;
    this.onActivate = onActivate;
    this.onPads = onPads;
    this.isPlaying = isPlaying;
    this.isDialogOpen = isDialogOpen;
    this.keys = new Set();
    this.taps = [new Set(), new Set()];
    this.pending = [];
    this.previous = [new Set(), new Set()];
    this.repeat = [{ direction: 0, horizontal: 0, down: 0 }, { direction: 0, horizontal: 0, down: 0 }];
    this.padMenu = false;
    this.padSignature = '';
    this.padSlots = [];
    this.setBindings(DEFAULT_BINDINGS);
    window.addEventListener('keydown', event => {
      if (this.isDialogOpen()) return;
      if (event.code === 'Escape' && !event.repeat) {
        event.preventDefault();
        this.onPause();
        return;
      }
      if (!this.keymap[event.code] || event.target.closest('button, input, a')) return;
      event.preventDefault();
      const [id, action] = this.keymap[event.code];
      if (event.repeat && (action === 'cw' || action === 'ccw')) {
        this.pending.push([id, action]);
      }
      if (!event.repeat) {
        this.keys.add(event.code);
        if (CONTINUOUS.has(action)) this.taps[id].add(action);
        this.pending.push([id, action]);
      }
    });
    window.addEventListener('keyup', event => this.keys.delete(event.code));
    window.addEventListener('blur', () => this.reset());
  }

  setBindings(bindings) {
    this.bindings = cloneBindings(bindings);
    this.keymap = keymapFrom(this.bindings);
    this.reset();
  }

  reset() {
    this.keys.clear();
    this.taps = [new Set(), new Set()];
    this.pending = [];
    this.previous = [new Set(), new Set()];
    this.repeat = [{ direction: 0, horizontal: 0, down: 0 }, { direction: 0, horizontal: 0, down: 0 }];
    this.pieceSerials = [null, null];
  }

  pollPads() {
    const pads = navigator.getGamepads ? Array.from(navigator.getGamepads()).filter(pad => pad?.connected) : [];
    const standard = pads.filter(pad => pad.mapping === 'standard');
    const signature = pads.map(pad => `${pad.index}:${pad.mapping}:${pad.id}`).join('|');
    if (signature !== this.padSignature) {
      const lost = this.padSlots.some(slot => !standard.some(pad => pad.index === slot.index));
      this.padSignature = signature;
      this.padSlots = this.padSlots.filter(slot => standard.some(pad => pad.index === slot.index));
      for (const pad of standard) {
        if (this.padSlots.length === 2) break;
        if (this.padSlots.some(slot => slot.index === pad.index)) continue;
        const player = this.padSlots.some(slot => slot.player === 1) ? 0 : 1;
        this.padSlots.push({ index: pad.index, player, name: pad.id });
      }
      this.reset();
      this.onPads(this.padSlots, lost, pads.some(pad => pad.mapping !== 'standard'));
    }
    return standard;
  }

  swapPads() {
    this.padSlots.forEach(slot => { slot.player = 1 - slot.player; });
    this.reset();
    this.onPads(this.padSlots, false, false);
  }

  update(dt, game) {
    const actions = [new Set(), new Set()];
    const taps = this.taps;
    this.taps = [new Set(), new Set()];
    const pending = this.pending;
    this.pending = [];
    for (const key of this.keys) {
      const [id, action] = this.keymap[key] ?? [];
      if (CONTINUOUS.has(action)) actions[id].add(action);
    }
    let menuPressed = false;
    for (const pad of this.pollPads()) {
      const slot = this.padSlots.find(slot => slot.index === pad.index);
      if (!slot) continue;
      const set = actions[slot.player];
      const held = action => this.bindings.pad[action].some(index => pad.buttons[index]?.pressed);
      for (const action of ACTIONS) if (held(action)) set.add(action);
      if (pad.axes[0] < -0.5) set.add('left');
      if (pad.axes[0] > 0.5) set.add('right');
      if (pad.axes[1] > 0.5) set.add('down');
      if (held('pause') || (!this.isPlaying() && (held('cw') || pad.buttons[0]?.pressed))) menuPressed = true;
    }
    const menuEdge = menuPressed && !this.padMenu;
    this.padMenu = menuPressed;
    if (menuEdge && !this.isDialogOpen()) {
      if (this.isPlaying()) this.onPause();
      else this.onActivate();
      this.previous = actions;
      return;
    }
    if (!this.isPlaying() || !game || this.isDialogOpen()) {
      this.previous = actions;
      return;
    }
    const apply = (id, action) => {
      if (action === 'cw' || action === 'ccw') game.rotate(id, action === 'cw' ? 1 : -1);
      else if (action === 'drop') game.hardDrop(id);
      else if (action === 'left' || action === 'right') game.move(id, action === 'right' ? 1 : -1);
      else if (action === 'down') game.move(id, 0, 1, true);
      else game[action](id);
    };
    const serials = game.players?.map(player => player.serial);
    const replaced = id => serials && game.players[id].serial !== serials[id];
    actions.forEach((set, id) => {
      if (replaced(id)) return;
      const previous = this.previous[id];
      const repeat = this.repeat[id];
      if (serials && serials[id] !== this.pieceSerials[id]) {
        repeat.down = 35;
        repeat.direction = 0;
        repeat.horizontal = 0;
      }
      const direction = Number(set.has('right')) - Number(set.has('left'));
      if (direction && (direction !== repeat.direction || taps[id].has(direction > 0 ? 'right' : 'left'))) {
        if (!taps[id].has(direction > 0 ? 'right' : 'left')) game.move(id, direction);
        repeat.horizontal = 155;
      } else if (direction) {
        repeat.horizontal -= dt;
        while (repeat.horizontal <= 0) {
          game.move(id, direction);
          repeat.horizontal += 45;
        }
      }
      repeat.direction = direction;
      if (set.has('down')) {
        if (taps[id].has('down')) repeat.down = 35 + dt;
        repeat.down -= dt;
        while (repeat.down <= 0) {
          game.move(id, 0, 1, true);
          repeat.down += 35;
        }
      } else repeat.down = 0;
      for (const action of ['cw', 'ccw', 'park', 'exchange', 'drop']) {
        if (replaced(id)) break;
        if (!set.has(action) || (previous.has(action) && !taps[id].has(action))) continue;
        apply(id, action);
      }
    });
    pending.forEach(([id, action]) => { if (!replaced(id)) apply(id, action); });
    if (serials) this.pieceSerials = serials;
    this.previous = actions;
  }
}
