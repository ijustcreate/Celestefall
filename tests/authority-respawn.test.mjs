import test from 'node:test';
import assert from 'node:assert/strict';
import selector from '../docs/spawn-selector.js';
import { createSimulation } from '../server/simulation.mjs';

const geometry = {
  world: { width: 600, height: 360 },
  fixed: [{ x: 0, y: 336, w: 600, h: 24 }, { x: 240, y: 300, w: 80, h: 36 }],
  ledges: [{ x: 80, y: 200, w: 120, h: 8 }],
  movers: [{ x: 90, y: 170, w: 60, h: 8 }]
};
const overlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

test('all random choices have full standing clearance and stationary support', () => {
  const points = new Set();
  for (let i = 0; i < 1000; i++) {
    const point = selector.chooseRespawn({ ...geometry, random: () => i / 1000 });
    points.add(`${point.x},${point.y}`);
    const body = { x: point.x - 9, y: point.y - 34, w: 18, h: 34 };
    assert.ok(![...geometry.fixed, ...geometry.ledges, ...geometry.movers].some(s => overlap(body, s)));
    assert.ok([...geometry.fixed, ...geometry.ledges].some(s => point.y === s.y && body.x >= s.x && body.x + body.w <= s.x + s.w));
  }
  assert.ok(points.size > 5);
});

test('prefers clearance from live actors, projectiles and death location', () => {
  for (let i = 0; i < 100; i++) {
    const point = selector.chooseRespawn({ ...geometry, player: { x: 550, y: 336 }, actors: [{ x: 50, y: 336, alive: true }], projectiles: [{ x: 180, y: 320 }], random: () => i / 100 });
    assert.ok(Math.hypot(point.x - 550, point.y - 336) >= 96);
    assert.ok(!overlap({ x: point.x - 9, y: point.y - 34, w: 18, h: 34 }, { x: -7, y: 270, w: 114, h: 98 }));
    assert.ok(!overlap({ x: point.x - 9, y: point.y - 34, w: 18, h: 34 }, { x: 132, y: 272, w: 96, h: 96 }));
  }
});

test('crowded fallback still has a valid surface', () => {
  const point = selector.chooseRespawn({ ...geometry, actors: [{ x: 300, y: 360, width: 1000, height: 1000 }], random: () => 1 });
  assert.ok(Number.isFinite(point.x));
  assert.ok(point.y <= 336);
});

test('server respawn retains identity, death count, timing and broadcasts chosen position', () => {
  const sim = createSimulation({ random: () => .8 });
  const player = sim.addPlayer('respawner', { name: 'Test', color: '#123456' });
  Object.assign(player, { alive: false, health: 0, respawnTimer: 2, deaths: 4, kills: 2 });
  sim.step();
  assert.equal(player.alive, false);
  sim.step();
  assert.equal(player.alive, true);
  assert.equal(player.health, 3);
  assert.equal(player.deaths, 4);
  assert.equal(player.kills, 2);
  assert.equal(player.name, 'Test');
  assert.equal(player.invulnerable, 90);
  assert.notEqual(player.x, 120);
  const snapshot = sim.snapshot();
  const event = snapshot.events.find(e => e.type === 'respawn');
  assert.ok(event);
  assert.equal(event.x, player.x);
  assert.equal(event.y, player.y);
  assert.equal(snapshot.players[0].x, player.x);
});

test('authored level respawns span all three chambers without intersecting geometry', async () => {
  const { readFile } = await import('node:fs/promises');
  const { runInNewContext } = await import('node:vm');
  const source = await readFile(new URL('../server/simulation.mjs', import.meta.url), 'utf8');
  const constants = ['WORLD', 'fixed', 'ledges'].map(name => {
    const declaration = source.match(new RegExp('const ' + name + ' = ([\\s\\S]*?);'));
    assert.ok(declaration, name);
    return 'const ' + name + ' = ' + declaration[1] + ';';
  }).join('\n');
  const level = runInNewContext(constants + '\n({ world: WORLD, fixed, ledges });');
  const chambers = new Set();
  for (let i = 0; i < 1000; i++) {
    const point = selector.chooseRespawn({ ...level, random: () => i / 1000 });
    chambers.add(Math.floor(point.x / 640));
    const body = { x: point.x - 9, y: point.y - 34, w: 18, h: 34 };
    assert.ok(![...level.fixed, ...level.ledges].some(s => overlap(body, s)));
    assert.ok([...level.fixed, ...level.ledges].some(s => point.y === s.y && body.x >= s.x && body.x + body.w <= s.x + s.w));
  }
  assert.deepEqual([...chambers].sort(), [0, 1, 2]);
});
