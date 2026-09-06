import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHeartDrops } from '../server/heart-drops.mjs';
const corpse = { type: 'bat', x: 100, y: 100, height: 24 };
test('50 percent threshold applies to bats and slugs only', () => {
  for (const type of ['bat', 'slug']) {
    assert.equal(createHeartDrops({ random: () => 0.4999 }).drop({ ...corpse, type }).id, 'heart-1');
    assert.equal(createHeartDrops({ random: () => 0.5 }).drop({ ...corpse, type }), null);
  }
  assert.equal(createHeartDrops({ random: () => 0 }).drop({ ...corpse, type: 'player' }), null);
});
test('one shared heart heals one eligible player once; full/dead/disconnected skip', () => {
  const store = createHeartDrops({ random: () => 0 });
  store.drop(corpse);
  const player = { id: 'a', x: 100, y: 100, health: 2, maxHealth: 3, alive: true, connected: true };
  const players = [{ ...player, health: 3 }, { ...player, alive: false }, { ...player, connected: false }, player, { ...player, id: 'b' }];
  const events = [];
  store.update({ players, emit: (...args) => events.push(args) });
  store.update({ players, emit: (...args) => events.push(args) });
  assert.equal(player.health, 3);
  assert.equal(players[4].health, 2);
  assert.equal(events.length, 1);
  assert.equal(store.snapshot().length, 0);
});
test('hearts land, survive full-health overlap, expire, and snapshots are copies', () => {
  const store = createHeartDrops({ random: () => 0 });
  store.drop(corpse);
  const snapshot = store.snapshot(); snapshot[0].x = -100;
  assert.equal(store.snapshot()[0].x, 100);
  const players = [{ x: 100, y: 110, health: 3, maxHealth: 3, alive: true, connected: true }];
  const surfaces = [{ x: 0, y: 110, w: 200 }];
  for (let i = 0; i < 100; i++) store.update({ players, surfaces });
  assert.equal(store.snapshot()[0].y, 104);
  for (let i = 0; i < 1700; i++) store.update({ players, surfaces });
  assert.equal(store.snapshot().length, 0);
});
