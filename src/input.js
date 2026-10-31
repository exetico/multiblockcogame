export const KEYMAP = {
  KeyA: [0, 'left'], KeyD: [0, 'right'], KeyS: [0, 'down'],
  KeyW: [0, 'cw'], KeyQ: [0, 'ccw'], Space: [0, 'drop'], KeyC: [0, 'park'], KeyV: [0, 'exchange'],
  ArrowLeft: [1, 'left'], ArrowRight: [1, 'right'], ArrowDown: [1, 'down'],
  ArrowUp: [1, 'cw'], Slash: [1, 'ccw'], Enter: [1, 'drop'], Period: [1, 'park'], Comma: [1, 'exchange'],
};
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
    window.addEventListener('keydown', event => {
      if (this.isDialogOpen()) return;
      if (event.code === 'Escape' && !event.repeat) {
        event.preventDefault();
        this.onPause();
        return;
      }
      if (!KEYMAP[event.code] || event.target.closest('button, input, a')) return;
      event.preventDefault();
      if (!event.repeat) {
        this.keys.add(event.code);
        const [id, action] = KEYMAP[event.code];
        if (CONTINUOUS.has(action)) this.taps[id].add(action);
        else this.pending.push([id, action]);
      }
    });
    window.addEventListener('keyup', event => this.keys.delete(event.code));
    window.addEventListener('blur', () => this.reset());
  }

  reset() {
    this.keys.clear();
    this.taps = [new Set(), new Set()];
    this.pending = [];
    this.previous = [new Set(), new Set()];
    this.repeat = [{ direction: 0, horizontal: 0, down: 0 }, { direction: 0, horizontal: 0, down: 0 }];
  }

  pollPads() {
    const pads = navigator.getGamepads ? Array.from(navigator.getGamepads()).filter(pad => pad?.connected) : [];
    const standard = pads.filter(pad => pad.mapping === 'standard');
    const signature = pads.map(pad => `${pad.index}:${pad.mapping}:${pad.id}`).join('|');
    if (signature !== this.padSignature) {
      const lost = this.padSlots.some(slot => !standard.some(pad => pad.index === slot.index));
      this.padSignature = signature;
      this.padSlots = standard.slice(0, 2).map((pad, index) => ({ index: pad.index, player: index === 0 ? 1 : 0 }));
      this.onPads(this.padSlots, lost, pads.some(pad => pad.mapping !== 'standard'));
    }
    return standard;
  }

  update(dt, game) {
    const actions = [new Set(), new Set()];
    const taps = this.taps;
    this.taps = [new Set(), new Set()];
    const pending = this.pending;
    this.pending = [];
    for (const key of this.keys) {
      const [id, action] = KEYMAP[key];
      if (CONTINUOUS.has(action)) actions[id].add(action);
    }
    taps.forEach((set, id) => set.forEach(action => actions[id].add(action)));
    let menuPressed = false;
    for (const pad of this.pollPads()) {
      const slot = this.padSlots.find(slot => slot.index === pad.index);
      if (!slot) continue;
      const set = actions[slot.player];
      const pressed = index => Boolean(pad.buttons[index]?.pressed);
      if (pressed(14) || pad.axes[0] < -0.5) set.add('left');
      if (pressed(15) || pad.axes[0] > 0.5) set.add('right');
      if (pressed(13) || pad.axes[1] > 0.5) set.add('down');
      if (pressed(0)) set.add('cw');
      if (pressed(1)) set.add('ccw');
      if (pressed(2)) set.add('drop');
      if (pressed(3)) set.add('park');
      if (pressed(4) || pressed(5)) set.add('exchange');
      if (pressed(9) || (!this.isPlaying() && pressed(0))) menuPressed = true;
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
      else game[action](id);
    };
    actions.forEach((set, id) => {
      const previous = this.previous[id];
      const repeat = this.repeat[id];
      const direction = Number(set.has('right')) - Number(set.has('left'));
      if (direction && (direction !== repeat.direction || taps[id].has(direction > 0 ? 'right' : 'left'))) {
        game.move(id, direction);
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
        if (taps[id].has('down')) repeat.down = 0;
        repeat.down -= dt;
        while (repeat.down <= 0) {
          game.move(id, 0, 1, true);
          repeat.down += 35;
        }
      } else repeat.down = 0;
      for (const action of ['cw', 'ccw', 'park', 'exchange', 'drop']) {
        if (!set.has(action) || (previous.has(action) && !taps[id].has(action))) continue;
        apply(id, action);
      }
    });
    pending.forEach(([id, action]) => apply(id, action));
    this.previous = actions;
  }
}
