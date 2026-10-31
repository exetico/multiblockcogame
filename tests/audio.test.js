import test from 'node:test';
import assert from 'node:assert/strict';
import { Sound } from '../src/audio.js';

test('new sound cues are distinct and all respect mute', () => {
  const sound = new Sound(() => {});
  const cues = new Map();
  let notes = [];
  sound.tone = (...args) => notes.push(args);
  for (const name of ['drop', 'notice', 'level', 'resume', 'pause', 'save', 'load']) {
    notes = [];
    sound.play(name);
    assert.ok(notes.length > 0, `${name} produces sound`);
    cues.set(name, JSON.stringify(notes));
  }
  assert.equal(new Set(cues.values()).size, cues.size, 'cues are distinguishable');
  sound.enabled = false;
  notes = [];
  for (const name of cues.keys()) sound.play(name);
  assert.deepEqual(notes, []);
});

test('soft drop sound is quiet and rate-limited', () => {
  const sound = new Sound(() => {});
  sound.lastSoftDrop = -1000;
  const notes = [];
  sound.tone = (...args) => notes.push(args);
  sound.play('soft-drop');
  sound.play('soft-drop');
  assert.equal(notes.length, 1);
  assert.equal(notes[0][3], 0.01);
});
