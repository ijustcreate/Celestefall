// Shared pickup rules; multiplayer calls this only inside the server.
(function(root) {
// Room-owned pickups. Call drop only on an authoritative alive -> dead transition.
function createHeartDrops({ random = Math.random } = {}) {
  let hearts = [];
  let nextId = 0;
  return {
    drop(creature) {
      if (!['bat', 'slug'].includes(creature.type) || random() >= 0.5) return null;
      const heart = { id: `heart-${++nextId}`, x: creature.x, y: creature.y - creature.height / 2, vy: -1.5, life: 1800 };
      hearts.push(heart);
      return { ...heart };
    },
    update({ players, surfaces = [], emit = () => {} }) {
      const candidates = [...players];
      hearts = hearts.filter(heart => {
        if (--heart.life <= 0) return false;
        heart.vy = Math.min(heart.vy + 0.2, 4);
        const nextY = heart.y + heart.vy;
        const landing = heart.vy >= 0 ? surfaces.filter(s =>
          heart.x + 6 > s.x && heart.x - 6 < s.x + s.w &&
          heart.y + 6 <= s.y + 1 && nextY + 6 >= s.y
        ).sort((a, b) => a.y - b.y)[0] : null;
        heart.y = landing ? landing.y - 6 : nextY;
        if (landing) heart.vy = 0;
        for (const player of candidates) {
          if (!player.alive || !player.connected || player.health >= player.maxHealth) continue;
          const height = player.crouching ? 21 : 34;
          if (heart.x + 6 <= player.x - 9 || heart.x - 6 >= player.x + 9 ||
              heart.y + 6 <= player.y - height || heart.y - 6 >= player.y) continue;
          player.health = Math.min(player.maxHealth, player.health + 1);
          emit('heal', { targetId: player.id, heartId: heart.id, x: heart.x, y: heart.y, health: player.health });
          return false;
        }
        return true;
      });
    },
    snapshot: () => hearts.map(heart => ({ ...heart }))
  };
}

root.EncoreHeartDrops = { createHeartDrops };
})(globalThis);
