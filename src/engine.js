export const WIDTH = 12;
export const HEIGHT = 12;
export const FIELD = 7;
export const OVERLAP = 2;
export const STRIDE = FIELD - OVERLAP;
export const TYPES = ['I', 'J', 'L', 'O', 'S', 'T', 'Z'];
export const COLORS = { I: '#79dce8', J: '#8faaf5', L: '#efb476', O: '#ead585', S: '#99d6a5', T: '#c4a0e9', Z: '#ed99ac' };
const SHAPES = {
  I: [[0, 1], [1, 1], [2, 1], [3, 1]],
  J: [[0, 0], [0, 1], [1, 1], [2, 1]],
  L: [[2, 0], [0, 1], [1, 1], [2, 1]],
  O: [[1, 0], [2, 0], [1, 1], [2, 1]],
  S: [[1, 0], [2, 0], [0, 1], [1, 1]],
  T: [[1, 0], [0, 1], [1, 1], [2, 1]],
  Z: [[0, 0], [1, 0], [1, 1], [2, 1]],
};
// SRS kick coordinates are expressed in screen space (positive y points down).
const KICKS = {
  '0>1': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  '1>0': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
  '1>2': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
  '2>1': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  '2>3': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  '3>2': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  '3>0': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  '0>3': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
};
const I_KICKS = {
  '0>1': [[0, 0], [-2, 0], [1, 0], [-2, 1], [1, -2]],
  '1>0': [[0, 0], [2, 0], [-1, 0], [2, -1], [-1, 2]],
  '1>2': [[0, 0], [-1, 0], [2, 0], [-1, -2], [2, 1]],
  '2>1': [[0, 0], [1, 0], [-2, 0], [1, 2], [-2, -1]],
  '2>3': [[0, 0], [2, 0], [-1, 0], [2, -1], [-1, 2]],
  '3>2': [[0, 0], [-2, 0], [1, 0], [-2, 1], [1, -2]],
  '3>0': [[0, 0], [1, 0], [-2, 0], [1, 2], [-2, -1]],
  '0>3': [[0, 0], [-1, 0], [2, 0], [-1, -2], [2, 1]],
};

export function cells(piece) {
  let shape = SHAPES[piece.type];
  if (piece.type !== 'O') {
    const size = piece.type === 'I' ? 4 : 3;
    for (let r = 0; r < piece.rotation; r++) shape = shape.map(([x, y]) => [size - 1 - y, x]);
  }
  return shape.map(([x, y]) => [x + piece.x, y + piece.y]);
}

export class Game {
  constructor({ random = Math.random, relays = true, progressiveSpeed = true } = {}) {
    this.random = random;
    this.relays = relays;
    this.progressiveSpeed = progressiveSpeed;
    this.board = Array.from({ length: HEIGHT }, () => Array(WIDTH).fill(null));
    this.players = [0, 1].map(id => ({
      id, piece: null, queue: [], bag: [], count: 0, canHold: true,
      gravity: 0, lockTime: 0, resets: 0, serial: 0,
    }));
    this.hold = null;
    this.exchangeRequest = null;
    this.score = 0;
    this.xp = 0;
    this.lines = 0;
    this.level = 1;
    this.combo = -1;
    this.backToBack = false;
    this.over = false;
    this.events = [];
    for (const p of this.players) {
      this.fillQueue(p);
      this.spawn(p);
    }
  }

  emit(type, data = {}) { this.events.push({ type, ...data }); }
  drainEvents() { return this.events.splice(0); }
  get gravityInterval() { return this.progressiveSpeed ? Math.max(65, 900 * Math.pow(0.79, this.level - 1)) : 900; }

  snapshot() {
    if (this.over) throw new Error('Only an unfinished round can be saved.');
    return JSON.parse(JSON.stringify({
      version: 1, board: this.board, players: this.players, hold: this.hold,
      exchangeRequest: this.exchangeRequest, score: this.score, xp: this.xp,
      lines: this.lines, level: this.level, combo: this.combo,
      backToBack: this.backToBack, relays: this.relays, progressiveSpeed: this.progressiveSpeed,
    }));
  }

  static restore(data, { random = Math.random } = {}) {
    const fail = () => { throw new Error('This stage is damaged or uses an unsupported save format.'); };
    const integer = (value, min, max = Number.MAX_SAFE_INTEGER) => Number.isSafeInteger(value) && value >= min && value <= max;
    const boolean = value => typeof value === 'boolean';
    const item = value => value && TYPES.includes(value.type) &&
      (value.relayOwner === null || integer(value.relayOwner, 0, 1));
    const piece = value => item(value) && integer(value.x, -4, WIDTH) &&
      integer(value.y, -3, HEIGHT - 1) && integer(value.rotation, 0, 3) && boolean(value.lastRotate);
    if (!data || data.version !== 1 || !boolean(data.relays) || !boolean(data.progressiveSpeed) ||
      !integer(data.score, 0) || !integer(data.xp, 0) || !integer(data.lines, 0) ||
      data.level !== 1 + Math.floor(data.lines / 10) || !integer(data.combo, -1, data.lines) ||
      !boolean(data.backToBack) || !(data.hold === null || item(data.hold)) ||
      !(data.exchangeRequest === null || integer(data.exchangeRequest, 0, 1)) ||
      !Array.isArray(data.board) || data.board.length !== HEIGHT ||
      !data.board.every(row => Array.isArray(row) && row.length === WIDTH &&
        row.every(cell => cell === null || (cell && TYPES.includes(cell.type) && integer(cell.owner, 0, 1)))) ||
      !Array.isArray(data.players) || data.players.length !== 2 ||
      !data.players.every((player, id) => player && player.id === id && piece(player.piece) &&
        Array.isArray(player.queue) && player.queue.length === 5 && player.queue.every(item) &&
        Array.isArray(player.bag) && player.bag.length <= 7 && player.bag.every(type => TYPES.includes(type)) &&
        new Set(player.bag).size === player.bag.length && integer(player.count, 6) && boolean(player.canHold) &&
        Number.isFinite(player.gravity) && player.gravity >= 0 && player.gravity <= 1000 &&
        Number.isFinite(player.lockTime) && player.lockTime >= 0 && player.lockTime < 500 &&
        integer(player.resets, 0, 15) && (player.serial === undefined || integer(player.serial, 0)))) fail();
    const copy = JSON.parse(JSON.stringify(data));
    const game = Object.create(Game.prototype);
    copy.players.forEach(player => { player.serial ??= 0; });
    Object.assign(game, {
      random, board: copy.board, players: copy.players, hold: copy.hold,
      exchangeRequest: copy.exchangeRequest, score: copy.score, xp: copy.xp,
      lines: copy.lines, level: copy.level, combo: copy.combo,
      backToBack: copy.backToBack, relays: copy.relays, progressiveSpeed: copy.progressiveSpeed,
      over: false, events: [],
    });
    if (!game.players.every(player => game.fits(player.piece, player.id)) ||
      game.board.some(row => row.every(Boolean))) fail();
    return game;
  }

  fillQueue(player) {
    while (player.queue.length < 5) {
      if (!player.bag.length) {
        player.bag = [...TYPES];
        for (let i = player.bag.length - 1; i > 0; i--) {
          const j = Math.floor(this.random() * (i + 1));
          [player.bag[i], player.bag[j]] = [player.bag[j], player.bag[i]];
        }
      }
      player.count++;
      player.queue.push({ type: player.bag.pop(), relayOwner: this.relays && player.count % 10 === 0 ? player.id : null });
    }
  }

  atSpawn(item, id) {
    return { ...item, x: id * STRIDE + (item.type === 'I' ? 1 : 2), y: -1, rotation: 0, lastRotate: false };
  }

  spawn(player, item) {
    player.piece = this.spawnCandidate(item ?? player.queue.shift(), player.id);
    if (!this.fits(player.piece, player.id) && this.fits(player.piece, player.id, false)) {
      // A partner in the shared hidden columns must not cause spawn top-out.
      for (const dx of [1, -1, 2, -2]) {
        const candidate = { ...player.piece, x: player.piece.x + dx };
        if (this.fits(candidate, player.id)) { player.piece = candidate; break; }
      }
    }
    this.fillQueue(player);
    player.serial = (player.serial ?? 0) + 1;
    player.gravity = 0;
    player.lockTime = 0;
    player.resets = 0;
    if (!this.fits(player.piece, player.id)) this.end(player.id);
  }

  spawnCandidate(item, id, includePartner = true) {
    const candidate = this.atSpawn(item, id);
    // A crowded top row is recoverable: enter in the hidden rows and give
    // the normal lock window to move, rotate, park or trade out of trouble.
    if (!this.fits(candidate, id, includePartner)) candidate.y = item.type === 'I' ? -3 : -2;
    return candidate;
  }

  fits(piece, id, includePartner = true) {
    const other = includePartner ? this.players[1 - id].piece : null;
    const occupied = other ? cells(other) : [];
    return cells(piece).every(([x, y]) =>
      x >= id * STRIDE && x < id * STRIDE + FIELD && y >= -2 && y < HEIGHT &&
      (y < 0 || !this.board[y][x]) && !occupied.some(([ox, oy]) => ox === x && oy === y),
    );
  }

  grounded(id, includePartner = true) {
    const p = this.players[id].piece;
    return p && !this.fits({ ...p, y: p.y + 1 }, id, includePartner);
  }

  move(id, dx, dy = 0, soft = false) {
    if (this.over) return false;
    const player = this.players[id];
    const piece = player.piece;
    const candidate = { ...piece, x: piece.x + dx, y: piece.y + dy, lastRotate: false };
    if (!this.fits(candidate, id)) return false;
    const wasGrounded = this.grounded(id);
    player.piece = candidate;
    if (soft && dy > 0) {
      this.score += dy;
      player.gravity = 0;
      this.emit('soft-drop', { id });
    }
    if (dx && wasGrounded && player.resets < 15) {
      player.lockTime = 0;
      player.resets++;
    }
    if (dx) this.emit('move', { id });
    return true;
  }

  rotate(id, direction = 1) {
    if (this.over) return false;
    const player = this.players[id];
    const piece = player.piece;
    if (piece.type === 'O') {
      if (this.grounded(id) && player.resets < 15) {
        player.lockTime = 0;
        player.resets++;
      }
      this.emit('rotate', { id });
      return true;
    }
    const rotation = (piece.rotation + direction + 4) % 4;
    const tests = (piece.type === 'I' ? I_KICKS : KICKS)[`${piece.rotation}>${rotation}`];
    const wasGrounded = this.grounded(id);
    for (const [dx, dy] of tests) {
      const candidate = { ...piece, rotation, x: piece.x + dx, y: piece.y + dy, lastRotate: true };
      if (this.fits(candidate, id)) {
        player.piece = candidate;
        if (wasGrounded && player.resets < 15) {
          player.lockTime = 0;
          player.resets++;
        }
        this.emit('rotate', { id });
        return true;
      }
    }
    return false;
  }

  ghost(id) {
    let piece = { ...this.players[id].piece };
    while (this.fits({ ...piece, y: piece.y + 1 }, id)) piece.y++;
    return piece;
  }

  hardDrop(id) {
    if (this.over) return;
    const player = this.players[id];
    const landing = this.ghost(id);
    this.emit('drop', { id });
    this.score += (landing.y - player.piece.y) * 2;
    player.piece = { ...landing, lastRotate: landing.lastRotate && landing.y === player.piece.y };
    if (this.grounded(id, false)) {
      this.lock(id);
    } else {
      this.emit('notice', { id, message: 'Your partner is underneath. Give them room.' });
    }
  }

  park(id) {
    if (this.over) return false;
    const player = this.players[id];
    if (!player.canHold) {
      this.emit('notice', { id, message: 'Lock or complete a trade before parking again.' });
      return false;
    }
    const current = this.item(player.piece);
    const incoming = this.hold ? this.received(this.hold, id) : player.queue[0];
    if (!this.fits(this.spawnCandidate(incoming, id), id)) {
      this.emit('notice', { id, message: 'No room to take a piece. Clear the spawn area.' });
      return false;
    }
    const parked = this.hold;
    this.hold = current;
    this.spawn(player, parked ? this.received(parked, id) : undefined);
    player.canHold = false;
    this.exchangeRequest = null;
    this.emit('park', { id });
    return true;
  }

  item(piece) { return { type: piece.type, relayOwner: piece.relayOwner }; }
  received(item, id) { return { ...item, relayOwner: item.relayOwner !== id ? null : item.relayOwner }; }

  exchange(id) {
    if (this.over) return false;
    if (this.exchangeRequest === id) {
      this.exchangeRequest = null;
      this.emit('notice', { message: 'Exchange request cancelled.' });
      return false;
    }
    if (this.exchangeRequest === null) {
      this.exchangeRequest = id;
      this.emit('request', { id });
      return false;
    }
    const incoming = this.players.map((_, i) => this.received(this.item(this.players[1 - i].piece), i));
    const candidates = incoming.map((item, i) => this.spawnCandidate(item, i, false));
    if (!candidates.every((candidate, i) => this.fits(candidate, i, false)) ||
      cells(candidates[0]).some(([x, y]) => cells(candidates[1]).some(([ox, oy]) => x === ox && y === oy))) {
      this.emit('notice', { message: 'Exchange blocked — clear both spawn areas first.' });
      return false;
    }
    this.players.forEach(p => {
      p.piece = candidates[p.id];
      p.serial = (p.serial ?? 0) + 1;
      p.gravity = 0;
      p.lockTime = 0;
      p.resets = 0;
      p.canHold = true;
    });
    this.exchangeRequest = null;
    this.emit('exchange');
    return true;
  }

  isSpin(piece, id) {
    if (piece.type !== 'T' || !piece.lastRotate) return false;
    const cx = piece.x + 1, cy = piece.y + 1;
    return [[-1, -1], [1, -1], [-1, 1], [1, 1]].filter(([dx, dy]) => {
      const x = cx + dx, y = cy + dy;
      return x < id * STRIDE || x >= id * STRIDE + FIELD || y >= HEIGHT || (y >= 0 && this.board[y][x]);
    }).length >= 3;
  }

  lock(id) {
    if (this.over) return;
    const player = this.players[id];
    const piece = player.piece;
    if (!this.grounded(id, false)) return;
    if (cells(piece).some(([, y]) => y < 0)) { this.end(id); return; }
    if (piece.relayOwner !== null) {
      this.emit('notice', { id, message: 'Relay missed — hand off before the piece locks next time.' });
      piece.relayOwner = null;
    }
    const spin = this.isSpin(piece, id);
    for (const [x, y] of cells(piece)) this.board[y][x] = { type: piece.type, owner: id };
    player.piece = null;
    const cleared = [];
    this.board.forEach((row, y) => { if (row.every(Boolean)) cleared.push(y); });
    const count = cleared.length;
    const base = spin ? [400, 800, 1200, 1600][count] : [0, 100, 300, 500, 800][count];
    const difficult = count === 4 || (spin && count > 0);
    const b2b = difficult && this.backToBack;
    this.score += (base ?? 0) * this.level * (b2b ? 1.5 : 1);
    if (count) {
      this.combo++;
      this.score += Math.max(0, this.combo) * 50 * this.level;
      const xp = [0, 100, 300, 600, 1000][count];
      this.xp += xp;
      this.lines += count;
      const previousLevel = this.level;
      this.level = 1 + Math.floor(this.lines / 10);
      this.backToBack = difficult;
      this.board = this.board.filter((_, y) => !cleared.includes(y));
      while (this.board.length < HEIGHT) this.board.unshift(Array(WIDTH).fill(null));
      // Settled rows can descend into an airborne partner. Lift only as far as
      // needed to retain a legal active piece after the atomic row collapse.
      const partner = this.players[1 - id];
      while (!this.fits(partner.piece, partner.id) && partner.piece.y > -2) partner.piece.y--;
      if (!this.fits(partner.piece, partner.id)) this.end(partner.id);
      this.emit('clear', { count, xp, spin, combo: this.combo, b2b, rows: cleared, levelUp: this.level > previousLevel });
    } else {
      this.combo = -1;
      this.emit('lock', { id, spin });
    }
    player.canHold = true;
    this.exchangeRequest = null;
    if (!this.over) this.spawn(player);
  }

  tick(dt, skipPlayers = []) {
    if (this.over) return;
    dt = Math.min(dt, 100);
    for (const player of this.players) {
      if (this.over) break;
      const id = player.id;
      if (skipPlayers.includes(id)) continue;
      let remaining = dt;
      while (remaining > 0 && !this.over) {
        const grounded = this.grounded(id, false);
        const step = Math.min(remaining, Math.max(0, this.gravityInterval - player.gravity), grounded ? 500 - player.lockTime : Infinity);
        player.gravity += step;
        if (grounded) player.lockTime += step;
        else player.lockTime = 0;
        remaining -= step;
        if (grounded && player.lockTime >= 500) {
          this.lock(id);
          // The elapsed frame belongs to the old piece, not its successor.
          break;
        }
        if (player.gravity >= this.gravityInterval) {
          player.gravity = 0;
          this.move(id, 0, 1);
        }
      }
    }
  }

  end(id) {
    if (this.over) return;
    this.over = true;
    this.exchangeRequest = null;
    this.emit('over', { id });
  }
}
