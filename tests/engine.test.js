import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, WIDTH, HEIGHT, FIELD, STRIDE, TYPES, cells } from '../src/engine.js';

const make = options => new Game({ random: () => 0.43, relays: false, ...options });
const piece = (type, x, y, extra = {}) => ({ type, x, y, rotation: 0, relayOwner: null, lastRotate: false, ...extra });
const solid = () => ({ type: 'J', owner: 0 });

test('progressive speed follows cleared rows; steady mode keeps starting gravity', () => {
  const game = make();
  assert.equal(game.gravityInterval, 900);
  game.level = 2;
  game.lines = 10;
  assert.equal(game.gravityInterval, 711);
  game.progressiveSpeed = false;
  assert.equal(game.gravityInterval, 900);
  game.level = 100;
  assert.equal(game.gravityInterval, 900);
  game.progressiveSpeed = true;
  assert.equal(game.gravityInterval, 65);
});

test('the tenth cleared row speeds progressive mode up, but not steady mode or XP', () => {
  const games = [make(), make({ progressiveSpeed: false })];
  for (const game of games) {
    for (let n = 0; n < 10; n++) game.tick(100);
    assert.equal(game.level, 1, 'elapsed time does not increase level');
    assert.equal(game.gravityInterval, 900);
    game.lines = 9;
    game.xp = 900;
    game.board[11] = Array.from({ length: WIDTH }, (_, x) => x === 2 ? null : solid());
    game.players[0].piece = piece('I', 0, 8, { rotation: 1 });
    game.lock(0);
    assert.equal(game.lines, 10);
    assert.equal(game.level, 2);
    assert.equal(game.score, 100);
    assert.equal(game.xp, 1000);
  }
  assert.equal(games[0].gravityInterval, 711);
  assert.equal(games[1].gravityInterval, 900);
});

test('saved stages round-trip all engine state and continue identically', () => {
  const game = make({ relays: true, progressiveSpeed: false });
  game.hardDrop(0);
  game.park(1);
  game.move(0, -1);
  game.rotate(1);
  game.tick(63.5);
  game.exchange(0);
  const snapshot = game.snapshot();
  let randomCalls = 0;
  const restored = Game.restore(JSON.parse(JSON.stringify(snapshot)), { random: () => { randomCalls++; return 0.43; } });
  assert.equal(randomCalls, 0, 'restoring does not consume random draws');
  assert.deepEqual(restored.snapshot(), snapshot);
  assert.deepEqual(restored.events, [], 'transient events are not replayed');
  assert.notEqual(restored.board, game.board);
  assert.notEqual(restored.players[0].piece, game.players[0].piece);
  game.drainEvents();
  for (const instance of [game, restored]) {
    instance.exchange(1);
    instance.hardDrop(1);
    instance.hardDrop(0);
    instance.tick(100);
    instance.park(0);
  }
  assert.deepEqual(restored.snapshot(), game.snapshot());
  assert.deepEqual(restored.drainEvents(), game.drainEvents());
  snapshot.board[0][0] = solid();
  assert.equal(restored.board[0][0], null, 'save data cannot mutate a restored game');
});

test('stages preserve scoring, relay handoffs and the remaining lock delay', () => {
  const game = make({ relays: true });
  game.players[0].piece = piece('O', 0, 10);
  game.players[0].lockTime = 400;
  game.players[0].canHold = false;
  game.players[1].piece.relayOwner = 1;
  game.hold = { type: 'T', relayOwner: 0 };
  game.score = 2300;
  game.xp = 1500;
  game.lines = 10;
  game.level = 2;
  game.combo = 2;
  game.backToBack = true;
  const restored = Game.restore(game.snapshot());
  assert.deepEqual(restored.snapshot(), game.snapshot());
  restored.tick(99);
  assert.equal(restored.board.flat().filter(Boolean).length, 0);
  restored.tick(1);
  assert.equal(restored.board.flat().filter(Boolean).length, 4);
  assert.equal(restored.players[0].canHold, true);
  assert.equal(restored.players[1].piece.relayOwner, 1);
});

test('stage validation rejects unsupported, malformed, unsafe and impossible states', () => {
  const game = make();
  assert.throws(() => Game.restore(null), /damaged/);
  for (const corrupt of [
    data => { data.version = 2; },
    data => { data.board.pop(); },
    data => { data.board[0][0] = { type: 'unknown', owner: 0 }; },
    data => { data.players[0].piece.rotation = 9; },
    data => { data.players[0].piece.x = 9; },
    data => { data.players[0].piece.lastRotate = null; },
    data => { data.players[0].gravity = Infinity; },
    data => { data.players[0].lockTime = 500; },
    data => { data.players[0].resets = 16; },
    data => { data.players[0].queue = []; },
    data => { data.players[0].bag = ['I', 'I']; },
    data => { data.score = -10; },
    data => { data.level = 3; },
    data => { data.progressiveSpeed = 'false'; },
    data => { data.exchangeRequest = 2; },
    data => { data.hold = { type: 'T', relayOwner: 9 }; },
    data => { data.board[11] = Array.from({ length: WIDTH }, solid); },
  ]) {
    const snapshot = game.snapshot();
    corrupt(snapshot);
    assert.throws(() => Game.restore(snapshot), /damaged/);
  }
  game.over = true;
  assert.throws(() => game.snapshot(), /unfinished/);
});

test('12 × 12 board, two seven-column fields, exactly two shared columns', () => {
  const game = make();
  assert.equal(WIDTH, 12);
  assert.equal(HEIGHT, 12);
  assert.equal(FIELD, 7);
  assert.equal(STRIDE, 5);
  assert.equal(game.board.length, 12);
  assert.ok(game.board.every(row => row.length === 12));
  assert.equal(FIELD - STRIDE, 2);
  game.players[1].piece.y = 5;
  assert.ok(game.fits(piece('O', 4, 1), 0));
  assert.ok(game.fits(piece('O', 4, 1), 1));
  assert.equal(game.fits(piece('O', 5, 1), 0), false);
  assert.equal(game.fits(piece('O', 3, 1), 1), false);
});

test('independent seven bags contain every shape once', () => {
  const game = make();
  for (const p of game.players) {
    const sequence = [p.piece.type];
    for (let n = 0; n < 20; n++) {
      sequence.push(p.queue.shift().type);
      game.fillQueue(p);
    }
    for (let n = 0; n < 21; n += 7) assert.deepEqual(sequence.slice(n, n + 7).sort(), [...TYPES].sort());
  }
});

test('seven-piece bags bound repeats and droughts across bag seams for both players', () => {
  let seed = 0x12345678;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 0x100000000;
  };
  const game = make({ random });
  const sequences = game.players.map(player => {
    const sequence = [player.piece.type];
    for (let n = 1; n < 7000; n++) {
      sequence.push(player.queue.shift().type);
      game.fillQueue(player);
    }
    return sequence;
  });
  assert.notDeepEqual(sequences[0], sequences[1], 'players have separate draws');
  for (const sequence of sequences) {
    let run = 0, previous = null, maxRun = 0, maxGap = 0;
    const last = new Map();
    sequence.forEach((type, index) => {
      run = type === previous ? run + 1 : 1;
      previous = type;
      maxRun = Math.max(maxRun, run);
      if (last.has(type)) maxGap = Math.max(maxGap, index - last.get(type) - 1);
      last.set(type, index);
    });
    for (let n = 0; n < sequence.length; n += 7) {
      assert.deepEqual(sequence.slice(n, n + 7).sort(), [...TYPES].sort());
    }
    assert.equal(maxRun, 2, 'boundary repeats occur, but never three');
    assert.equal(maxGap, 12, 'the maximum drought is twelve intervening pieces');
  }
});

test('four rotations restore every shape and preserve four unique cells', () => {
  const game = make();
  for (const type of TYPES) {
    game.players[0].piece = piece(type, 1, 3);
    const original = cells(game.players[0].piece).sort();
    for (let i = 0; i < 4; i++) game.rotate(0);
    assert.deepEqual(cells(game.players[0].piece).sort(), original);
    assert.equal(new Set(cells(game.players[0].piece).map(cell => cell.join(','))).size, 4);
  }
});

test('wall kicks rotate an I piece away from the player boundary', () => {
  const game = make();
  game.players[0].piece = piece('I', -2, 3, { rotation: 1 });
  assert.ok(game.fits(game.players[0].piece, 0));
  assert.equal(game.rotate(0), true);
  assert.ok(game.fits(game.players[0].piece, 0));
  assert.ok(cells(game.players[0].piece).every(([x]) => x >= 0 && x < 7));
});

test('neither player can cross their reach or overlap an active partner', () => {
  const game = make();
  game.players[0].piece = piece('O', 4, 4);
  game.players[1].piece = piece('O', 6, 4);
  assert.equal(game.move(1, -1), false);
  assert.equal(game.move(0, 1), false);
  for (let n = 0; n < 20; n++) game.move(0, -1);
  assert.equal(Math.min(...cells(game.players[0].piece).map(([x]) => x)), 0);
});

test('a hard drop onto an airborne partner does not lock floating blocks', () => {
  const game = make();
  game.players[0].piece = piece('O', 4, 0);
  game.players[1].piece = piece('O', 4, 6);
  game.hardDrop(0);
  assert.equal(game.players[0].piece.y, 4);
  assert.equal(game.board.flat().filter(Boolean).length, 0);
  for (let i = 0; i < 6; i++) game.tick(100);
  assert.equal(game.board.flat().filter(Boolean).length, 0);
});

test('a piece locks after 500ms on the settled floor, not before', () => {
  const game = make();
  game.players[0].piece = piece('O', 0, 10);
  for (let i = 0; i < 4; i++) game.tick(100);
  assert.equal(game.board.flat().filter(Boolean).length, 0);
  game.tick(100);
  assert.equal(game.board.flat().filter(Boolean).length, 4);
  assert.equal(game.players[0].canHold, true);
});

for (const [count, score, xp] of [[1, 100, 100], [2, 300, 300], [3, 500, 600], [4, 800, 1000]]) {
  test(`${count}-row clear awards exact score and row-dependent XP across the full width`, () => {
    const game = make();
    for (let y = HEIGHT - count; y < HEIGHT; y++) {
      game.board[y] = Array.from({ length: WIDTH }, (_, x) => x === 2 ? null : solid());
    }
    game.players[0].piece = piece('I', 0, HEIGHT - 4, { rotation: 1 });
    game.lock(0);
    assert.equal(game.score, score);
    assert.equal(game.xp, xp);
    assert.equal(game.lines, count);
    assert.equal(game.board.length, HEIGHT);
    assert.ok(game.board.every(row => row.length === WIDTH));
    assert.equal(game.drainEvents().find(event => event.type === 'clear').count, count);
  });
}

test('a row filled on only one side does not clear', () => {
  const game = make();
  game.board[11] = Array.from({ length: WIDTH }, (_, x) => x < 5 ? solid() : null);
  game.players[0].piece = piece('O', 4, 10);
  game.lock(0);
  assert.equal(game.lines, 0);
  assert.equal(game.xp, 0);
});

test('shared park can be taken by either player and is once per active piece', () => {
  const game = make();
  game.players[0].piece = piece('T', 1, 4);
  game.players[1].piece = piece('L', 7, 4);
  assert.equal(game.park(0), true);
  assert.equal(game.hold.type, 'T');
  assert.equal(game.park(0), false);
  assert.equal(game.park(1), true);
  assert.equal(game.players[1].piece.type, 'T');
  assert.equal(game.hold.type, 'L');
  game.hardDrop(0);
  assert.equal(game.players[0].canHold, true);
});

test('park fails atomically if the incoming piece has no spawn space', () => {
  const game = make();
  game.players[1].piece = piece('O', 8, 9);
  game.players[0].piece = piece('I', 4, -2, { rotation: 1 });
  game.hold = { type: 'I', relayOwner: null };
  const before = structuredClone(game.players[1].piece);
  assert.equal(game.park(1), false);
  assert.deepEqual(game.players[1].piece, before);
  assert.equal(game.hold.type, 'I');
  assert.equal(game.over, false);
});

test('exchange needs consent from both players, resets positions and preserves hold limits', () => {
  const game = make();
  game.players[0].piece = piece('T', 1, 7);
  game.players[1].piece = piece('L', 7, 7);
  game.players[0].canHold = false;
  assert.equal(game.exchange(0), false);
  assert.equal(game.players[0].piece.type, 'T');
  assert.equal(game.exchange(1), true);
  assert.equal(game.players[0].piece.type, 'L');
  assert.equal(game.players[1].piece.type, 'T');
  assert.equal(game.players[0].piece.y, -1);
  assert.equal(game.players[0].canHold, false);
  assert.equal(game.exchangeRequest, null);
});

test('exchange at a crowded top uses hidden spawn rows without ending the round', () => {
  const game = make();
  game.players[0].piece = piece('T', 1, 7);
  game.players[1].piece = piece('L', 7, 7);
  game.board[0][3] = solid();
  game.exchange(0);
  assert.equal(game.exchange(1), true);
  assert.equal(game.players[0].piece.y, -2);
  assert.equal(game.over, false);
  assert.ok(game.players.every(p => game.fits(p.piece, p.id)));
});

test('relay handoff succeeds before locking, without a missed-relay notice', () => {
  const game = make();
  game.players[0].piece = piece('T', 1, 0, { relayOwner: 0 });
  game.exchange(0);
  game.exchange(1);
  assert.equal(game.players[1].piece.type, 'T');
  assert.equal(game.players[1].piece.relayOwner, null);
  game.hardDrop(1);
  assert.equal(game.board.flat().filter(Boolean).length, 4);
  assert.equal(game.drainEvents().some(event => event.message?.includes('Relay missed')), false);
});

test('both untraded relays lock at the deadline and spawn successors instead of deadlocking', () => {
  const game = make();
  game.players[0].piece = piece('T', 1, 10, { relayOwner: 0 });
  game.players[1].piece = piece('O', 8, 10, { relayOwner: 1 });
  game.exchange(0);
  for (let n = 0; n < 4; n++) game.tick(100);
  assert.equal(game.board.flat().filter(Boolean).length, 0);
  game.tick(100);
  assert.equal(game.board.flat().filter(Boolean).length, 8);
  assert.equal(game.exchangeRequest, null);
  assert.equal(game.over, false);
  assert.ok(game.players.every(p => p.piece.y === -1));
  const misses = game.drainEvents().filter(event => event.message?.includes('Relay missed'));
  assert.deepEqual(misses.map(event => event.id), [0, 1]);
});

test('hard-dropping an untraded relay reports a miss, locks and gives a new piece', () => {
  const game = make();
  game.players[0].piece = piece('T', 1, 0, { relayOwner: 0 });
  game.hardDrop(0);
  assert.equal(game.board.flat().filter(Boolean).length, 4);
  assert.equal(game.players[0].piece.y, -1);
  assert.equal(game.over, false);
  assert.equal(game.drainEvents().filter(event => event.message?.includes('Relay missed')).length, 1);
});

test('parking relays only satisfies the handoff if the partner retrieves it', () => {
  const game = make();
  const relay = { type: 'T', relayOwner: 0 };
  assert.equal(game.received(relay, 0).relayOwner, 0);
  assert.equal(game.received(relay, 1).relayOwner, null);
  game.players[0].piece = piece('T', 1, 1, { relayOwner: 0 });
  game.park(0);
  game.park(1);
  assert.equal(game.players[1].piece.type, 'T');
  assert.equal(game.players[1].piece.relayOwner, null);
});

test('relays appear every tenth drawn piece, but can be disabled', () => {
  for (const relays of [true, false]) {
    const game = make({ relays });
    const player = game.players[0];
    const sequence = [game.item(player.piece)];
    for (let n = 0; n < 19; n++) {
      sequence.push(player.queue.shift());
      game.fillQueue(player);
    }
    assert.deepEqual(sequence.map((p, index) => p.relayOwner !== null ? index + 1 : 0).filter(Boolean), relays ? [10, 20] : []);
  }
});

test('back-to-back four-row clears, combos, and level multiplier use team progress', () => {
  const game = make();
  function four() {
    for (let y = 8; y < 12; y++) game.board[y] = Array.from({ length: WIDTH }, (_, x) => x === 2 ? null : solid());
    game.players[0].piece = piece('I', 0, 8, { rotation: 1 });
    game.lock(0);
  }
  four();
  four();
  assert.equal(game.score, 800 + 1200 + 50);
  assert.equal(game.xp, 2000);
  four();
  assert.equal(game.level, 2);
  assert.equal(game.lines, 12);
});

test('T-spin corner detection grants spin points without inventing XP', () => {
  const game = make();
  game.players[0].piece = piece('T', 1, 9, { lastRotate: true });
  for (const [x, y] of [[1, 9], [1, 11], [3, 11]]) game.board[y][x] = solid();
  assert.equal(game.isSpin(game.players[0].piece, 0), true);
  game.lock(0);
  assert.equal(game.score, 400);
  assert.equal(game.xp, 0);
});

test('row collapse never leaves an airborne partner inside a settled cell', () => {
  const game = make();
  game.board[11] = Array.from({ length: WIDTH }, (_, x) => x === 2 ? null : solid());
  game.board[5][9] = solid();
  game.players[1].piece = piece('O', 8, 6);
  game.players[0].piece = piece('I', 0, 8, { rotation: 1 });
  game.lock(0);
  assert.equal(game.lines, 1);
  assert.ok(game.fits(game.players[1].piece, 1));
});

test('a crowded spawn gives a lock window; only locking above the board ends the round', () => {
  const game = make();
  game.board[0].fill(solid());
  game.spawn(game.players[0], { type: 'T', relayOwner: null });
  assert.equal(game.over, false);
  assert.equal(game.players[0].piece.y, -2);
  assert.ok(game.fits(game.players[0].piece, 0));
  for (let n = 0; n < 4; n++) game.tick(100);
  assert.equal(game.over, false);
  game.tick(100);
  assert.equal(game.over, true);
  const before = JSON.stringify(game.board);
  assert.equal(game.move(1, 1), false);
  game.hardDrop(1);
  game.tick(100);
  assert.equal(JSON.stringify(game.board), before);
});

test('repeated trade requests on an empty field cannot end the round or mutate pieces', () => {
  const game = make();
  game.park(0);
  const pieces = structuredClone(game.players.map(player => player.piece));
  for (let n = 0; n < 200; n++) game.exchange(1);
  assert.equal(game.over, false);
  assert.deepEqual(game.players.map(player => player.piece), pieces);
  assert.equal(game.board.flat().filter(Boolean).length, 0);
  for (let n = 0; n < 50; n++) {
    game.exchange(0);
    game.exchange(1);
    assert.equal(game.over, false);
    assert.ok(game.players.every(player => game.fits(player.piece, player.id)));
  }
});

test('lock timing counts only actual grounded time and new pieces get a full gravity interval', () => {
  const game = make();
  game.players[0].piece = piece('O', 0, 9);
  game.players[0].gravity = 850;
  game.tick(100);
  assert.equal(game.players[0].piece.y, 10);
  assert.equal(game.players[0].lockTime, 50, 'only the last half of the frame was grounded');
  for (let n = 0; n < 4; n++) game.tick(100);
  assert.equal(game.board.flat().filter(Boolean).length, 0);
  game.tick(100);
  assert.equal(game.board.flat().filter(Boolean).length, 4);
  assert.equal(game.players[0].gravity, 0);
  const y = game.players[0].piece.y;
  for (let n = 0; n < 8; n++) game.tick(100);
  game.tick(99);
  assert.equal(game.players[0].piece.y, y);
  game.tick(1);
  assert.equal(game.players[0].piece.y, y + 1);
});

test('soft drop resets gravity and spawning during input does not consume the old frame', () => {
  const game = make();
  game.players[0].gravity = 899;
  const y = game.players[0].piece.y;
  game.move(0, 0, 1, true);
  game.tick(10);
  assert.equal(game.players[0].piece.y, y + 1);
  game.hardDrop(0);
  game.tick(100, [0]);
  assert.equal(game.players[0].gravity, 0);
  assert.equal(game.players[0].lockTime, 0);
});

test('a new piece blocked by an airborne partner enters nearby without false game over', () => {
  const game = make();
  game.players[0].piece = piece('I', 4, -2, { rotation: 1 });
  game.spawn(game.players[1], { type: 'I', relayOwner: null });
  assert.equal(game.over, false);
  assert.ok(game.fits(game.players[1].piece, 1));
  assert.equal(game.players[1].piece.y, -3);
  assert.equal(game.players[1].piece.x, 7);
  assert.deepEqual(Game.restore(game.snapshot()).snapshot(), game.snapshot());
});

test('square rotations refresh lock delay and rapid rotations work up to the reset limit', () => {
  const game = make();
  game.players[0].piece = piece('O', 0, 10);
  for (let n = 0; n < 15; n++) {
    game.tick(100);
    assert.equal(game.rotate(0), true);
    assert.equal(game.players[0].lockTime, 0);
  }
  assert.equal(game.players[0].resets, 15);
  game.tick(100);
  game.rotate(0);
  assert.equal(game.players[0].lockTime, 100, 'resets remain bounded');
  for (let n = 0; n < 4; n++) game.tick(100);
  assert.equal(game.board.flat().filter(Boolean).length, 4);
});

test('bounded randomized play maintains board dimensions and valid active pieces', () => {
  let seed = 1269;
  const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  for (let round = 0; round < 35; round++) {
    const game = new Game({ random });
    for (let n = 0; n < 500 && !game.over; n++) {
      const id = Math.floor(random() * 2);
      const action = Math.floor(random() * 7);
      if (action < 2) game.move(id, action ? 1 : -1);
      else if (action === 2) game.rotate(id, random() > 0.5 ? 1 : -1);
      else if (action === 3) game.hardDrop(id);
      else if (action === 4) game.park(id);
      else if (action === 5) game.exchange(id);
      game.tick(100);
      assert.equal(game.board.length, HEIGHT);
      assert.ok(game.board.every(row => row.length === WIDTH));
      if (!game.over) game.players.forEach(p => assert.ok(game.fits(p.piece, p.id), `Invalid active piece in round ${round}, step ${n}`));
    }
  }
});
