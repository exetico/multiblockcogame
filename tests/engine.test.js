import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, WIDTH, HEIGHT, FIELD, STRIDE, TYPES, cells } from '../src/engine.js';

const make = options => new Game({ random: () => 0.43, relays: false, ...options });
const piece = (type, x, y, extra = {}) => ({ type, x, y, rotation: 0, relayOwner: null, lastRotate: false, ...extra });
const solid = () => ({ type: 'J', owner: 0 });

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
  game.players[0].piece = piece('O', 0, 9);
  game.hold = { type: 'T', relayOwner: null };
  game.board[0][3] = solid();
  const before = structuredClone(game.players[0].piece);
  assert.equal(game.park(0), false);
  assert.deepEqual(game.players[0].piece, before);
  assert.equal(game.hold.type, 'T');
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

test('blocked exchange leaves both active pieces untouched', () => {
  const game = make();
  game.players[0].piece = piece('T', 1, 7);
  game.players[1].piece = piece('L', 7, 7);
  game.board[0][3] = solid();
  const before = game.players.map(p => structuredClone(p.piece));
  game.exchange(0);
  assert.equal(game.exchange(1), false);
  assert.deepEqual(game.players.map(p => p.piece), before);
});

test('relay pieces cannot lock until handed to the other player', () => {
  const game = make();
  game.players[0].piece = piece('T', 1, 0, { relayOwner: 0 });
  game.hardDrop(0);
  assert.equal(game.board.flat().filter(Boolean).length, 0);
  for (let n = 0; n < 10; n++) game.tick(100);
  assert.equal(game.board.flat().filter(Boolean).length, 0);
  game.exchange(0);
  game.exchange(1);
  assert.equal(game.players[1].piece.type, 'T');
  assert.equal(game.players[1].piece.relayOwner, null);
  game.hardDrop(1);
  assert.equal(game.board.flat().filter(Boolean).length, 4);
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

test('spawn obstruction ends the team round and further inputs do not mutate it', () => {
  const game = make();
  game.board[0].fill(solid());
  game.spawn(game.players[0], { type: 'T', relayOwner: null });
  assert.equal(game.over, true);
  const before = JSON.stringify(game.board);
  assert.equal(game.move(1, 1), false);
  game.hardDrop(1);
  game.tick(100);
  assert.equal(JSON.stringify(game.board), before);
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
