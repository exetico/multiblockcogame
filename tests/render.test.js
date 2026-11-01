import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/engine.js';
import { Renderer } from '../src/render.js';

test('overlapping landing outlines remain visible for both players without ownership borders', () => {
  const game = new Game({ relays: false });
  game.players.forEach(player => {
    player.piece = { type: 'O', x: 4, y: 4, rotation: 0, relayOwner: null, lastRotate: false };
  });
  const strokes = [];
  let rect;
  const ctx = {
    setTransform() {}, clearRect() {}, fillRect() {}, beginPath() {},
    createLinearGradient: () => ({ addColorStop() {} }),
    moveTo() {}, lineTo() {}, setLineDash() {}, save() {}, restore() {}, fill() {},
    roundRect(...args) { rect = args; },
    stroke() {
      if (this.strokeStyle === '#79e3cb66' || this.strokeStyle === '#f3a38c66') {
        strokes.push({ color: this.strokeStyle, rect });
      }
    },
  };
  const renderer = Object.create(Renderer.prototype);
  Object.assign(renderer, { ctx, width: 300, height: 300, dpr: 1, showGrid: false, flashUntil: 0 });
  renderer.draw(game);
  assert.equal(strokes.length, 8, 'four ghost cells per player, no active borders');
  assert.deepEqual(strokes[0], { color: '#79e3cb66', rect: [127, 252, 21, 21, 2] });
  assert.deepEqual(strokes[4], { color: '#f3a38c66', rect: [129, 254, 17, 17, 2] });
});
