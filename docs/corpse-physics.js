// Shared deterministic fixed-tick physics; no lifetime or rendering side effects.
(function (root) {
  function stepBatCorpse(creature, surfaces) {
    if (creature.type !== 'bat' || creature.alive) return;
    if (creature.grounded) {
      const support = surfaces.find((surface, index) =>
        (surface.id || `surface-${index}`) === creature.corpseSupportId);
      if (support) {
        creature.x += support.x - creature.corpseSupportX;
        creature.y = support.y;
        creature.corpseSupportX = support.x;
        creature.vx = creature.vy = 0;
        return;
      }
      creature.grounded = false;
    }
    const oldX = creature.x, oldY = creature.y;
    creature.vy += .22;
    const nextX = oldX + creature.vx, nextY = oldY + creature.vy;
    let landing = null, firstTime = Infinity;
    if (nextY >= oldY) {
      surfaces.forEach((surface, index) => {
        if (surface.y < oldY || surface.y > nextY) return;
        const time = nextY === oldY ? 0 : (surface.y - oldY) / (nextY - oldY);
        const x = oldX + (nextX - oldX) * time;
        if (x + creature.width / 2 <= surface.x || x - creature.width / 2 >= surface.x + surface.w) return;
        if (time < firstTime) {
          firstTime = time;
          landing = { surface, index, x };
        }
      });
    }
    if (landing) {
      creature.x = landing.x;
      creature.y = landing.surface.y;
      creature.vx = creature.vy = 0;
      creature.grounded = true;
      creature.corpseSupportId = landing.surface.id || `surface-${landing.index}`;
      creature.corpseSupportX = landing.surface.x;
    } else {
      creature.x = nextX;
      creature.y = nextY;
      creature.vx *= .96;
    }
  }
  root.CelestefallCorpsePhysics = Object.freeze({ stepBatCorpse });
})(globalThis);
