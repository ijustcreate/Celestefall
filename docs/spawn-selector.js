// Shared pure geometry helper. Only the authority samples randomness in online play.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.EncoreSpawn = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const overlaps = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

  function chooseRespawn({ world, fixed, ledges = [], movers = [], player, actors = [], projectiles = [], random = Math.random, halfWidth = 9, height = 34 }) {
    const blockers = [...fixed, ...ledges, ...movers];
    const candidates = [];
    // Fixed ground and stationary ledges provide reliable support on the next tick.
    for (const surface of [...fixed, ...ledges]) {
      const left = Math.max(halfWidth + 12, surface.x + halfWidth + 12);
      const right = Math.min(world.width - halfWidth - 12, surface.x + surface.w - halfWidth - 12);
      if (surface.y < height + 8 || surface.y > world.height || right < left) continue;
      const count = Math.max(1, Math.ceil((right - left) / 64));
      for (let i = 0; i <= count; i++) {
        const x = left + (right - left) * i / count;
        const y = surface.y;
        const body = { x: x - halfWidth, y: y - height, w: halfWidth * 2, h: height };
        if (!blockers.some(obstacle => overlaps(body, obstacle))) candidates.push({ x, y });
      }
    }
    if (!candidates.length) throw new Error('Level has no safe supported respawn position');
    const hazards = actors.filter(actor => actor && actor !== player && actor.alive !== false).map(actor => ({
      x: actor.x - (actor.width || halfWidth * 2) / 2 - 48,
      y: actor.y - (actor.height || height) - 32,
      w: (actor.width || halfWidth * 2) + 96,
      h: (actor.height || height) + 64
    })).concat(projectiles.map(shot => ({ x: shot.x - 48, y: shot.y - 48, w: 96, h: 96 })));
    const clear = candidates.filter(point => !hazards.some(hazard => overlaps({ x: point.x - halfWidth, y: point.y - height, w: halfWidth * 2, h: height }, hazard)));
    // Under a fully crowded map, retain geometric safety and existing spawn protection.
    const pool = clear.length ? clear : candidates;
    const different = player ? pool.filter(point => Math.hypot(point.x - player.x, point.y - player.y) >= 96) : pool;
    const choices = different.length ? different : pool;
    const sample = Math.max(0, Math.min(0.999999999999, Number(random()) || 0));
    return { ...choices[Math.floor(sample * choices.length)] };
  }
  return { chooseRespawn };
});
