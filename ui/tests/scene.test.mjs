import { test } from 'node:test';
import assert from 'node:assert/strict';

// disc-textures.js preloads images at import time; stub the browser globals it touches.
globalThis.window = globalThis;
globalThis.Image = class {};
const { getStageLayout } = await import('../js/scene.js');

test('getStageLayout: the focused Disc is the full-size centerpiece', () => {
  const l = getStageLayout(3, 3);
  assert.deepEqual(l, { x: 0, y: 0, z: 30, rotY: 0, scale: 1.0, opacity: 1.0 });
});

test('getStageLayout: neighbors flank symmetrically and recede in depth', () => {
  const right = getStageLayout(4, 3);
  const left = getStageLayout(2, 3);
  assert.equal(right.x, 115);
  assert.equal(left.x, -115);
  assert.equal(right.z, left.z);
  assert.equal(right.rotY, -left.rotY);
  assert.ok(right.z < 30);
  assert.ok(getStageLayout(5, 3).z < right.z);
  assert.ok(getStageLayout(5, 3).x > right.x);
});

test('getStageLayout: scale and opacity shrink with distance but hit their floors', () => {
  assert.ok(getStageLayout(1, 0).scale < 1);
  assert.equal(getStageLayout(9, 0).scale, 0.55);
  assert.equal(getStageLayout(9, 0).opacity, 0.18);
});
