(() => {
  'use strict';

  if (window.parent !== window || new URLSearchParams(location.search).get('embed') === '1') {
    document.body.classList.add('is-embedded');
  }

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d', { alpha: false });
  ctx.imageSmoothingEnabled = false;

  const STEP = 1 / 60;
  // One display tall and exactly three landscape camera widths wide.
  const WORLD = { width: 1920, height: 360 };
  const VIEW = { width: 640, height: 360 };
  const PLAYER_HALF_W = 9;
  const PLAYER_H = 34;
  const PLAYER_CROUCH_H = 21;
  const SPAWN = { x: 120, y: 328 };
  const BOT_SPAWN = { x: 430, y: 328 };

  const imageSources = {
    background: 'assets/background.png',
    clouds: 'assets/clouds.png',
    platformSolid: 'assets/platform-solid.png',
    platformOneWay: 'assets/platform-oneway.png',
    reverser: 'assets/reverser.png',
    jump: 'assets/player-jump.png',
    fall: 'assets/player-fall.png',
    cling: 'assets/player-cling.png',
    ...Object.fromEntries(Array.from({ length: 5 }, (_, i) => [`idle${i}`, `assets/player-idle-${i}.png`])),
    ...Object.fromEntries(Array.from({ length: 6 }, (_, i) => [`run${i}`, `assets/player-run-${i}.png`]))
  };
  const images = {};
  const ash = window.AshCharacter ? new window.AshCharacter(ctx) : null;
  const skinEditor = window.AshSkinEditor && ash ? new window.AshSkinEditor(ash) : null;
  const botRig = window.BulletAgeCharacter ? new window.BulletAgeCharacter(ctx, {
    assetName: 'Player2',
    basePath: 'assets/player2'
  }) : null;

  const fixed = [
    { x: 0, y: 0, w: 16, h: 360, kind: 'solid' },
    { x: 0, y: 328, w: 260, h: 32, kind: 'solid' },
    { x: 260, y: 312, w: 120, h: 48, kind: 'solid' },
    { x: 380, y: 328, w: 268, h: 32, kind: 'solid' },
    { x: 648, y: 344, w: 212, h: 16, kind: 'solid' },
    { x: 860, y: 320, w: 128, h: 40, kind: 'solid' },
    { x: 988, y: 336, w: 292, h: 24, kind: 'solid' },
    { x: 1280, y: 328, w: 168, h: 32, kind: 'solid' },
    { x: 1448, y: 304, w: 144, h: 56, kind: 'solid' },
    { x: 1592, y: 328, w: 208, h: 32, kind: 'solid' },
    { x: 1800, y: 312, w: 120, h: 48, kind: 'solid' },
    { x: 1904, y: 0, w: 16, h: 360, kind: 'solid' }
  ];

  const ledges = [
    { id: 'ledge-1a', x: 72, y: 260, w: 96, h: 7, kind: 'oneway' },
    { id: 'ledge-1b', x: 430, y: 235, w: 108, h: 7, kind: 'oneway' },
    { id: 'ledge-2a', x: 690, y: 265, w: 100, h: 7, kind: 'oneway' },
    { id: 'ledge-2b', x: 1040, y: 224, w: 108, h: 7, kind: 'oneway' },
    { id: 'ledge-2c', x: 1190, y: 278, w: 82, h: 7, kind: 'oneway' },
    { id: 'ledge-3a', x: 1340, y: 238, w: 100, h: 7, kind: 'oneway' },
    { id: 'ledge-3b', x: 1625, y: 248, w: 112, h: 7, kind: 'oneway' },
    { id: 'ledge-3c', x: 1810, y: 214, w: 80, h: 7, kind: 'oneway' }
  ];

  function makeMovers() {
    return [
      { id: 'west-lift', x: 205, y: 286, w: 65, h: 7, axis: 'y', min: 220, max: 300, speed: .42, dir: -1, kind: 'oneway' },
      { id: 'cling-wall', x: 565, y: 258, w: 16, h: 60, axis: 'y', min: 246, max: 266, speed: .24, dir: -1, kind: 'solid' },
      { id: 'mid-carrier', x: 735, y: 302, w: 65, h: 7, axis: 'x', min: 680, max: 900, speed: .55, dir: 1, kind: 'oneway' },
      { id: 'center-lift', x: 970, y: 286, w: 65, h: 7, axis: 'y', min: 208, max: 304, speed: .45, dir: -1, kind: 'oneway' },
      { id: 'east-carrier', x: 1320, y: 284, w: 65, h: 7, axis: 'x', min: 1300, max: 1510, speed: .5, dir: 1, kind: 'oneway' },
      { id: 'final-lift', x: 1738, y: 290, w: 65, h: 7, axis: 'y', min: 186, max: 300, speed: .4, dir: -1, kind: 'oneway' }
    ];
  }

  const input = {
    left: false,
    right: false,
    up: false,
    down: false,
    shootHeld: false,
    shootReleased: false,
    aimAxisX: 0,
    aimAxisY: 0,
    meleePressed: false,
    dashPressed: false,
    jumpPressed: false,
    jumpHeld: false
  };

  const game = {
    mode: 'playing',
    time: 0,
    frame: 0,
    deaths: 0,
    playerName: 'Climber',
    camera: { x: 0, y: 0 },
    cloudX: 0,
    particles: [],
    projectiles: [],
    kills: 0,
    movers: makeMovers(),
    bot: null,
    player: null
  };

  const localAdminPreview = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) && new URLSearchParams(location.search).get('admin') === '1';
  skinEditor?.setAdmin(localAdminPreview);

  function freshPlayer() {
    return {
      x: SPAWN.x,
      y: SPAWN.y,
      vx: 0,
      vy: 0,
      xRemainder: 0,
      yRemainder: 0,
      facing: 1,
      grounded: false,
      clinging: false,
      clingSide: 0,
      crouching: false,
      lookingUp: false,
      coyote: 0,
      jumpBuffer: 0,
      dropping: 0,
      shootTimer: 0,
      shootCooldown: 0,
      aiming: false,
      aimX: 1,
      aimY: 0,
      meleeTimer: 0,
      meleeCooldown: 0,
      meleeConnected: false,
      stompCooldown: 0,
      dashTimer: 0,
      dashCooldown: 0,
      dashVX: 0,
      dashVY: 0,
      hitTimer: 0,
      animation: 'idle',
      animationTime: 0,
      squash: 1,
      stretch: 1
    };
  }

  function freshBot(x = BOT_SPAWN.x, y = BOT_SPAWN.y) {
    return {
      x,
      y,
      vx: 0,
      vy: 0,
      facing: -1,
      grounded: false,
      health: 3,
      maxHealth: 3,
      alive: true,
      respawnTimer: 0,
      shootCooldown: 150,
      shootTimer: 0,
      hitTimer: 0,
      animation: 'idle'
    };
  }

  function resetGame(countDeath = false) {
    if (countDeath) game.deaths += 1;
    game.player = freshPlayer();
    game.bot = freshBot();
    game.movers = makeMovers();
    game.camera.x = innerHeight > innerWidth ? SPAWN.x - VIEW.width / 2 : 0;
    game.camera.y = 0;
    game.particles.length = 0;
    game.projectiles.length = 0;
    input.jumpPressed = false;
    input.jumpHeld = false;
    input.shootHeld = false;
    input.shootReleased = false;
    input.aimAxisX = input.aimAxisY = 0;
    input.meleePressed = false;
    input.dashPressed = false;
    vibrate(countDeath ? 30 : 12);
  }

  function rectAt(x = game.player.x, y = game.player.y, height = game.player.crouching ? PLAYER_CROUCH_H : PLAYER_H) {
    return { x: x - PLAYER_HALF_W, y: y - height, w: PLAYER_HALF_W * 2, h: height };
  }

  function overlap(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  function solids(includeOneWay = false) {
    return fixed.concat(game.movers.filter(m => includeOneWay || m.kind === 'solid'));
  }

  function collidesSolid(x, y, height) {
    const r = rectAt(x, y, height);
    return solids(false).find(s => overlap(r, s)) || null;
  }

  function standingSurface(x = game.player.x, y = game.player.y) {
    const feet = rectAt(x, y + 1);
    for (const s of fixed.concat(ledges, game.movers)) {
      if (s.kind === 'oneway' && game.player.dropping > 0) continue;
      if (feet.y + feet.h < s.y || feet.y + feet.h > s.y + 2) continue;
      if (feet.x < s.x + s.w && feet.x + feet.w > s.x) return s;
    }
    return null;
  }

  function sideSurface(side) {
    return collidesSolid(game.player.x + side, game.player.y);
  }

  function movePlayerX(amount, squashed = false) {
    const p = game.player;
    p.xRemainder += amount;
    let move = Math.trunc(p.xRemainder);
    p.xRemainder -= move;
    const direction = Math.sign(move);
    while (move !== 0) {
      if (collidesSolid(p.x + direction, p.y)) {
        p.vx = 0;
        p.xRemainder = 0;
        if (squashed) resetGame(true);
        break;
      }
      p.x += direction;
      move -= direction;
    }
  }

  function movePlayerY(amount, squashed = false) {
    const p = game.player;
    p.yRemainder += amount;
    let move = Math.trunc(p.yRemainder);
    p.yRemainder -= move;
    const direction = Math.sign(move);
    while (move !== 0) {
      const solid = collidesSolid(p.x, p.y + direction);
      let oneWay = null;
      if (!solid && direction > 0 && p.dropping <= 0) {
        const next = rectAt(p.x, p.y + direction);
        const previousBottom = p.y;
        oneWay = ledges.concat(game.movers).find(s => s.kind === 'oneway' && previousBottom <= s.y + 1 && overlap(next, s));
      }
      if (solid || oneWay) {
        p.vy = 0;
        p.yRemainder = 0;
        if (squashed) resetGame(true);
        break;
      }
      p.y += direction;
      move -= direction;
    }
  }

  function movePlatforms() {
    const p = game.player;
    for (const platform of game.movers) {
      const old = { x: platform.x, y: platform.y, w: platform.w, h: platform.h };
      const wasRiding = Math.abs(p.y - old.y) <= 1 && rectAt().x < old.x + old.w && rectAt().x + rectAt().w > old.x;

      if (platform.axis === 'x') platform.x += platform.speed * platform.dir;
      else platform.y += platform.speed * platform.dir;

      const value = platform.axis === 'x' ? platform.x : platform.y;
      if (value <= platform.min || value >= platform.max) {
        if (platform.axis === 'x') platform.x = Math.max(platform.min, Math.min(platform.max, platform.x));
        else platform.y = Math.max(platform.min, Math.min(platform.max, platform.y));
        platform.dir *= -1;
      }

      const dx = platform.x - old.x;
      const dy = platform.y - old.y;
      if (wasRiding) {
        movePlayerX(dx);
        movePlayerY(dy);
      } else if (platform.kind === 'solid' && overlap(rectAt(), platform)) {
        if (dx > 0) movePlayerX(platform.x + platform.w - rectAt().x, true);
        else if (dx < 0) movePlayerX(platform.x - (rectAt().x + rectAt().w), true);
        if (dy > 0) movePlayerY(platform.y + platform.h - rectAt().y, true);
        else if (dy < 0) movePlayerY(platform.y - (rectAt().y + rectAt().h), true);
      }
    }
  }

  function emitDust(x, y, amount = 5) {
    for (let i = 0; i < amount; i += 1) {
      game.particles.push({
        x: x + (Math.random() - .5) * 12,
        y,
        vx: (Math.random() - .5) * 1.4,
        vy: -Math.random() * 1.3,
        life: 16 + Math.random() * 14
      });
    }
  }

  function updateParticles() {
    for (const particle of game.particles) {
      particle.x += particle.vx;
      particle.y += particle.vy;
      particle.vy += .07;
      particle.life -= 1;
    }
    game.particles = game.particles.filter(particle => particle.life > 0);
  }

  function approach(value, target, amount) {
    if (value < target) return Math.min(value + amount, target);
    if (value > target) return Math.max(value - amount, target);
    return target;
  }

  function botRect(x = game.bot.x, y = game.bot.y) {
    return { x: x - PLAYER_HALF_W, y: y - PLAYER_H, w: PLAYER_HALF_W * 2, h: PLAYER_H };
  }

  function botSolidAt(x, y) {
    const rect = botRect(x, y);
    return solids(false).find(surface => overlap(rect, surface)) || null;
  }

  function botStandingSurface() {
    const bot = game.bot;
    return fixed.concat(ledges, game.movers).find(surface =>
      Math.abs(bot.y - surface.y) <= 2 &&
      bot.x + PLAYER_HALF_W > surface.x &&
      bot.x - PLAYER_HALF_W < surface.x + surface.w
    ) || null;
  }

  function groundAtX(x) {
    return fixed
      .filter(surface => surface.w > 30 && x > surface.x + PLAYER_HALF_W && x < surface.x + surface.w - PLAYER_HALF_W)
      .sort((a, b) => a.y - b.y)[0] || null;
  }

  function landingSurface(actor, nextY) {
    return fixed.concat(ledges, game.movers).find(surface =>
      actor.y <= surface.y + 1 &&
      nextY >= surface.y &&
      actor.x + PLAYER_HALF_W > surface.x &&
      actor.x - PLAYER_HALF_W < surface.x + surface.w
    ) || null;
  }

  function spawnProjectile(actor, owner, aimX = actor.facing, aimY = 0) {
    const length = Math.hypot(aimX, aimY) || 1;
    const directionX = aimX / length;
    const directionY = aimY / length;
    const speed = owner === 'player' ? 6.2 : 4.3;
    game.projectiles.push({
      owner,
      x: actor.x + directionX * 15,
      y: actor.y - 22 + directionY * 8,
      vx: directionX * speed,
      vy: directionY * speed,
      life: 105
    });
    emitDust(actor.x + directionX * 12, actor.y - 21 + directionY * 8, 3);
  }

  function damageBot(amount, knockbackX, knockbackY, effectX = game.bot.x, effectY = game.bot.y - 17) {
    const bot = game.bot;
    if (!bot.alive) return false;
    bot.health -= amount;
    bot.vx = knockbackX;
    bot.vy = knockbackY;
    bot.hitTimer = 16;
    emitDust(effectX, effectY, bot.health > 0 ? 9 : 18);
    vibrate(bot.health > 0 ? 18 : [24, 24, 32]);
    if (bot.health <= 0) {
      bot.alive = false;
      bot.respawnTimer = 105;
      bot.animation = 'death';
      game.kills += 1;
    }
    return true;
  }

  function respawnBot() {
    const desiredX = Math.max(48, Math.min(WORLD.width - 48, game.player.x + game.player.facing * 190));
    const floor = groundAtX(desiredX) || groundAtX(BOT_SPAWN.x);
    game.bot = freshBot(desiredX, floor?.y || BOT_SPAWN.y);
  }

  function updateBot() {
    const bot = game.bot;
    if (!bot.alive) {
      bot.respawnTimer -= 1;
      bot.animation = 'death';
      botRig?.update(STEP, bot.animation);
      if (bot.respawnTimer <= 0) respawnBot();
      return;
    }

    bot.shootCooldown = Math.max(0, bot.shootCooldown - 1);
    bot.shootTimer = Math.max(0, bot.shootTimer - 1);
    bot.hitTimer = Math.max(0, bot.hitTimer - 1);
    bot.grounded = botStandingSurface();

    const distance = game.player.x - bot.x;
    const direction = Math.abs(distance) > 78 ? Math.sign(distance) : 0;
    if (direction) bot.facing = direction;

    if (bot.hitTimer > 0) bot.vx *= .93;
    else bot.vx = approach(bot.vx, direction * 1.35, direction ? .11 : .18);

    if (bot.grounded && direction) {
      const aheadX = bot.x + direction * 20;
      const aheadGround = groundAtX(aheadX);
      const blocked = botSolidAt(bot.x + direction * 3, bot.y);
      if (blocked || !aheadGround || aheadGround.y < bot.y - 8) bot.vy = -6.2;
    }

    const nextX = bot.x + bot.vx;
    if (!botSolidAt(nextX, bot.y)) bot.x = Math.max(24, Math.min(WORLD.width - 24, nextX));
    else {
      bot.vx = 0;
      if (bot.grounded) bot.vy = -6.2;
    }
    if (overlap(botRect(), rectAt())) {
      const side = Math.sign(distance) || -bot.facing || 1;
      bot.x = game.player.x - side * 34;
      bot.vx = -side * .7;
    }

    if (!bot.grounded || bot.vy < 0) bot.vy = Math.min(5.2, bot.vy + .36);
    else bot.vy = 0;
    const nextY = bot.y + bot.vy;
    const landing = bot.vy >= 0 ? landingSurface(bot, nextY) : null;
    if (landing) {
      bot.y = landing.y;
      bot.vy = 0;
      bot.grounded = landing;
    } else bot.y = nextY;

    if (Math.abs(distance) > 90 && Math.abs(distance) < 380 && bot.shootCooldown <= 0) {
      spawnProjectile(bot, 'bot');
      bot.shootTimer = 15;
      bot.shootCooldown = 150 + Math.floor(Math.random() * 55);
    }

    if (bot.y > WORLD.height + 45) {
      respawnBot();
      return;
    }

    if (bot.hitTimer > 0) bot.animation = 'hit';
    else if (bot.shootTimer > 0) bot.animation = 'shoot';
    else if (!bot.grounded) bot.animation = bot.vy < 0 ? 'jump' : 'fall';
    else if (Math.abs(bot.vx) > .18) bot.animation = 'run';
    else bot.animation = 'idle';
    botRig?.update(STEP, bot.animation);
  }

  function updateProjectiles() {
    const player = game.player;
    const bot = game.bot;
    for (const note of game.projectiles) {
      note.x += note.vx;
      note.y += note.vy;
      note.life -= 1;
      if (collidesSolid(note.x, note.y + PLAYER_H / 2, 2)) note.life = 0;

      if (note.owner === 'player' && bot.alive && overlap({ x: note.x - 4, y: note.y - 4, w: 8, h: 8 }, botRect())) {
        note.life = 0;
        damageBot(1, Math.sign(note.vx || game.player.facing) * 3.4, -2.5);
      }

      if (note.owner === 'bot' && overlap({ x: note.x - 4, y: note.y - 4, w: 8, h: 8 }, rectAt())) {
        note.life = 0;
        player.vx = Math.sign(note.vx) * 2.8;
        player.vy = -2.5;
        player.hitTimer = 14;
        emitDust(player.x, player.y - 17, 8);
        vibrate([16, 24, 16]);
      }
    }
    game.projectiles = game.projectiles.filter(note => note.life > 0 && note.x > 0 && note.x < WORLD.width && note.y > 0 && note.y < WORLD.height);
  }

  function aimVector() {
    const p = game.player;
    let x = input.aimAxisX;
    let y = input.aimAxisY;
    if (Math.hypot(x, y) < .12) {
      x = Number(input.right) - Number(input.left);
      y = Number(input.down) - Number(input.up);
    }
    if (Math.hypot(x, y) < .12) return { x: p.aimX || p.facing, y: p.aimY || 0 };
    const length = Math.hypot(x, y);
    return { x: x / length, y: y / length };
  }

  function updateMeleeHit() {
    const p = game.player;
    if (p.meleeTimer < 5 || p.meleeTimer > 11 || p.meleeConnected || !game.bot.alive) return;
    const reach = 31;
    const hitbox = {
      x: p.facing > 0 ? p.x + 5 : p.x - reach - 5,
      y: p.y - 30,
      w: reach,
      h: 28
    };
    if (overlap(hitbox, botRect())) {
      p.meleeConnected = true;
      damageBot(1, p.facing * 4.2, -2.8, game.bot.x, game.bot.y - 15);
    }
  }

  function checkHeadStomp(previousFeetY) {
    const p = game.player;
    const bot = game.bot;
    if (!bot.alive || p.stompCooldown > 0 || p.vy < 0) return;
    const top = bot.y - PLAYER_H;
    const horizontal = Math.abs(p.x - bot.x) < PLAYER_HALF_W * 2;
    if (horizontal && previousFeetY <= top + 3 && p.y >= top && p.y <= top + 12) {
      p.y = top;
      p.vy = -6.7;
      p.yRemainder = 0;
      p.stompCooldown = 18;
      p.squash = .82;
      p.stretch = 1.16;
      damageBot(1, Math.sign(bot.x - p.x || p.facing) * 2.2, 2.3, bot.x, top + 5);
      emitDust(p.x, p.y, 7);
    }
  }

  function update() {
    if (game.mode !== 'playing') return;
    const p = game.player;
    const wasGrounded = p.grounded;
    game.time += STEP;
    game.frame += 1;
    game.cloudX = (game.cloudX + .25) % 448;
    if (p.dropping > 0) p.dropping -= 1;
    p.shootTimer = Math.max(0, p.shootTimer - 1);
    p.shootCooldown = Math.max(0, p.shootCooldown - 1);
    p.meleeTimer = Math.max(0, p.meleeTimer - 1);
    p.meleeCooldown = Math.max(0, p.meleeCooldown - 1);
    p.stompCooldown = Math.max(0, p.stompCooldown - 1);
    p.dashTimer = Math.max(0, p.dashTimer - 1);
    p.dashCooldown = Math.max(0, p.dashCooldown - 1);
    p.hitTimer = Math.max(0, p.hitTimer - 1);

    movePlatforms();

    const movementDirection = Number(input.right) - Number(input.left);
    if (input.shootHeld) {
      const aim = aimVector();
      p.aimX = aim.x;
      p.aimY = aim.y;
      p.aiming = true;
      if (Math.abs(aim.x) > .2) p.facing = Math.sign(aim.x);
    }
    if (input.shootReleased && !p.aiming) {
      const aim = aimVector();
      p.aimX = aim.x;
      p.aimY = aim.y;
      p.aiming = true;
    }
    const direction = p.aiming ? 0 : movementDirection;
    if (!p.aiming && direction) p.facing = direction;

    if (input.shootReleased && p.aiming && p.shootCooldown <= 0) {
      spawnProjectile(p, 'player', p.aimX, p.aimY);
      p.shootTimer = 15;
      p.shootCooldown = 16;
      p.aiming = false;
      vibrate(9);
    }
    if (!input.shootHeld && !input.shootReleased) p.aiming = false;

    if (input.meleePressed && p.meleeCooldown <= 0) {
      p.meleeTimer = 15;
      p.meleeCooldown = 24;
      p.meleeConnected = false;
      vibrate(11);
    }

    if (input.dashPressed && p.dashCooldown <= 0) {
      let dashX = direction;
      let dashY = Number(input.down) - Number(input.up);
      if (!dashX && !dashY) dashX = p.facing;
      const length = Math.hypot(dashX, dashY) || 1;
      p.dashVX = dashX / length * 6.6;
      p.dashVY = dashY / length * 6.6;
      p.dashTimer = 10;
      p.dashCooldown = 40;
      p.crouching = false;
      emitDust(p.x, p.y, 10);
      vibrate(15);
    }

    p.grounded = standingSurface();
    if (p.grounded) p.coyote = 7;
    else p.coyote = Math.max(0, p.coyote - 1);
    if (input.jumpPressed) p.jumpBuffer = 7;
    else p.jumpBuffer = Math.max(0, p.jumpBuffer - 1);

    // Down is a true crouch. Down + Jump intentionally drops through pink
    // one-way platforms, leaving the joystick's down direction useful on land.
    if (input.down && input.jumpPressed && p.grounded?.kind === 'oneway') {
      p.dropping = 12;
      p.y += 5;
      p.grounded = false;
      p.jumpBuffer = 0;
    }

    const wantsCrouch = Boolean(input.down && p.grounded);
    if (wantsCrouch) p.crouching = true;
    else if (!collidesSolid(p.x, p.y, PLAYER_H)) p.crouching = false;
    p.lookingUp = Boolean(input.up && p.grounded && !p.crouching && direction === 0);

    const wallSide = sideSurface(1) ? 1 : (sideSurface(-1) ? -1 : 0);
    // Clinging is automatic only when Ash is airborne and the player is
    // actively pressing the joystick toward the wall.
    p.clinging = Boolean(wallSide && !p.grounded && direction === wallSide && p.dashTimer <= 0);
    p.clingSide = p.clinging ? wallSide : 0;

    if (p.dashTimer > 0) {
      p.clinging = false;
      p.vx = p.dashVX;
      p.vy = p.dashVY;
    } else if (p.clinging) {
      p.vx = 0;
      p.vy = .12;
      p.yRemainder = 0;
      if (p.jumpBuffer > 0) {
        p.clinging = false;
        p.vx = -wallSide * 3.8;
        p.vy = -7.2;
        p.facing = -wallSide;
        p.jumpBuffer = 0;
        emitDust(p.x + wallSide * 7, p.y - 8, 7);
        vibrate(14);
      }
    } else {
      const topSpeed = p.crouching ? .75 : (p.lookingUp ? 0 : 2.25);
      const targetSpeed = direction * topSpeed;
      const acceleration = p.grounded ? .3 : .16;
      const deceleration = p.grounded ? .38 : .09;
      p.vx = approach(p.vx, targetSpeed, direction ? acceleration : deceleration);
      if (p.jumpBuffer > 0 && p.coyote > 0 && !p.crouching) {
        p.vy = -7.2;
        p.jumpBuffer = 0;
        p.coyote = 0;
        p.squash = 1.16;
        p.stretch = .86;
        emitDust(p.x, p.y, 6);
        vibrate(12);
      } else if (p.grounded) p.vy = 0;
      else p.vy = Math.min(p.vy + .36, 5.2);

      // Releasing Jump trims upward velocity, which gives short and tall
      // jumps without changing the single-button mobile layout.
      if (!input.jumpHeld && p.vy < -3.2) p.vy = approach(p.vy, -3.2, .45);
    }

    const previousFeetY = p.y;
    movePlayerX(p.vx);
    movePlayerY(p.vy);
    checkHeadStomp(previousFeetY);
    updateMeleeHit();
    p.grounded = standingSurface();

    if (!wasGrounded && p.grounded && p.vy === 0) {
      emitDust(p.x, p.y, 8);
      p.squash = .82;
      p.stretch = 1.16;
      vibrate(8);
    }

    p.squash += (1 - p.squash) * .2;
    p.stretch += (1 - p.stretch) * .2;
    p.animationTime += STEP;
    if (p.hitTimer > 0) p.animation = 'hit';
    else if (p.dashTimer > 0) p.animation = 'dash';
    else if (p.meleeTimer > 0) p.animation = 'melee';
    else if (p.shootTimer > 0) p.animation = 'shoot';
    else if (p.aiming && p.aimY < -.35) p.animation = 'look';
    else if (p.clinging) p.animation = 'cling';
    else if (!p.grounded) p.animation = p.vy < 0 ? 'jump' : 'fall';
    else if (p.crouching) p.animation = 'crouch';
    else if (p.lookingUp) p.animation = 'look';
    else if (Math.abs(p.vx) > .2) p.animation = 'run';
    else p.animation = 'idle';
    ash?.update(STEP, p.animation);

    if (p.y > WORLD.height + 40) resetGame(true);
    updateParticles();
    updateBot();
    updateProjectiles();
    updateCamera();
    input.jumpPressed = false;
    input.shootReleased = false;
    input.meleePressed = false;
    input.dashPressed = false;
  }

  function updateCamera(force = false) {
    const p = game.player;
    const lookAhead = p.facing * Math.min(46, Math.abs(p.vx) * 18);
    const portrait = innerHeight > innerWidth;
    // Portrait CSS deliberately crops the wide canvas to create the requested
    // zoom. Let the logical camera travel beyond the level bounds there so the
    // player stays in that central crop at both ends of the map.
    const minX = portrait ? -VIEW.width / 2 + 24 : 0;
    const maxX = portrait ? WORLD.width - VIEW.width / 2 - 24 : WORLD.width - VIEW.width;
    const targetX = Math.max(minX, Math.min(maxX, p.x - VIEW.width / 2 + lookAhead));
    if (force) game.camera.x = targetX;
    else game.camera.x += (targetX - game.camera.x) * .075;
    game.camera.y = 0;
  }

  function recenterAfterLayoutChange() {
    requestAnimationFrame(() => {
      updateCamera(true);
      render();
    });
  }

  window.addEventListener('resize', recenterAfterLayoutChange);
  screen.orientation?.addEventListener?.('change', recenterAfterLayoutChange);

  function drawBackdrop() {
    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    gradient.addColorStop(0, '#363542');
    gradient.addColorStop(.14, '#363542');
    gradient.addColorStop(.15, '#e3cca3');
    gradient.addColorStop(.54, '#e3cca3');
    gradient.addColorStop(.55, '#d3aaa0');
    gradient.addColorStop(1, '#d3aaa0');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // A restrained three-act skyline makes horizontal progress legible while
    // remaining behind the original cloud layer.
    const parallax = game.camera.x * .22;
    ctx.fillStyle = 'rgba(83,77,103,.12)';
    for (let worldX = 40; worldX < WORLD.width; worldX += 170) {
      const x = Math.round(worldX - parallax);
      const height = 42 + ((worldX / 170) % 3) * 18;
      ctx.fillRect(x, 190 - height, 54, height);
      ctx.fillRect(x + 15, 176 - height, 24, 16);
    }

    const cloud = images.clouds;
    if (cloud) {
      const y = 252 - game.camera.y;
      const start = -((game.cloudX + game.camera.x * .2) % cloud.width) - cloud.width;
      for (let x = start; x < canvas.width + cloud.width; x += cloud.width) ctx.drawImage(cloud, Math.round(x), Math.round(y));
    }

    ctx.save();
    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(54,53,66,.56)';
    for (let section = 0; section < 3; section += 1) {
      const x = section * VIEW.width + VIEW.width / 2 - game.camera.x;
      if (x > -80 && x < canvas.width + 80) ctx.fillText(`PATH ${section + 1} / 3`, Math.round(x), 116);
    }
    ctx.restore();
  }

  function drawRockBlock(block) {
    const x = Math.round(block.x - game.camera.x);
    const y = Math.round(block.y - game.camera.y);
    if (x + block.w < -24 || x > canvas.width + 24) return;
    ctx.fillStyle = '#3b3949';
    ctx.fillRect(x, y, block.w, block.h);
    ctx.fillStyle = '#65627c';
    for (let py = y + 2; py < y + block.h; py += 10) {
      for (let px = x + ((py / 10) % 2 ? 2 : 8); px < x + block.w; px += 14) {
        ctx.fillRect(px, py, 5, 4);
        ctx.fillStyle = '#7d7896';
        ctx.fillRect(px + 1, py, 3, 1);
        ctx.fillStyle = '#65627c';
      }
    }
    if (block.w > block.h) {
      ctx.fillStyle = '#2f6c63';
      ctx.fillRect(x, y, block.w, 5);
      ctx.fillStyle = '#58a174';
      for (let px = x; px < x + block.w; px += 8) {
        ctx.fillRect(px, y, 6, 2);
        ctx.fillRect(px + 2, y + 2, 3, 3);
      }
    }
  }

  function drawThinPlatform(platform) {
    const x = Math.round(platform.x - game.camera.x);
    const y = Math.round(platform.y - game.camera.y);
    if (x + platform.w < -20 || x > canvas.width + 20) return;
    const image = platform.kind === 'oneway' ? images.platformOneWay : images.platformSolid;
    if (image) ctx.drawImage(image, x, y, platform.w, platform.h);
    else {
      ctx.fillStyle = platform.kind === 'oneway' ? '#ce146c' : '#7f7c92';
      ctx.fillRect(x, y, platform.w, platform.h);
    }
    ctx.fillStyle = 'rgba(255,255,255,.45)';
    ctx.fillRect(x + 3, y + 1, Math.max(1, platform.w - 6), 1);
  }

  function drawPlatforms() {
    fixed.forEach(drawRockBlock);
    ledges.forEach(drawThinPlatform);
    game.movers.forEach(drawThinPlatform);
  }

  function playerFrame() {
    const p = game.player;
    if (p.animation === 'run') return images[`run${Math.floor(p.animationTime * 8.5) % 6}`];
    if (p.animation === 'idle') return images[`idle${Math.floor(p.animationTime * 10) % 5}`];
    if (p.animation === 'crouch' || p.animation === 'look') return images.idle0;
    return images[p.animation];
  }

  function drawPlayer() {
    const p = game.player;
    const x = Math.round((p.x - game.camera.x) * 2) / 2;
    const y = Math.round(p.y - game.camera.y);
    if (ash?.ready) {
      ash.draw(x, y, p.facing, p.stretch, p.squash);
      return;
    }

    const image = playerFrame();
    if (!image) return;
    ctx.save();
    ctx.translate(x, y);
    if (p.animation === 'crouch') ctx.scale(p.facing * p.stretch * 1.12, p.squash * .7);
    else if (p.animation === 'look') ctx.scale(p.facing * p.stretch * .96, p.squash * 1.04);
    else ctx.scale(p.facing * p.stretch, p.squash);
    ctx.drawImage(image, -image.width / 2, -image.height);
    ctx.restore();

    if (p.animation === 'look') {
      ctx.fillStyle = '#f4ecd7';
      ctx.fillRect(Math.round(x - 1), Math.round(y - image.height - 7), 2, 4);
      ctx.fillRect(Math.round(x - 3), Math.round(y - image.height - 5), 2, 2);
      ctx.fillRect(Math.round(x + 1), Math.round(y - image.height - 5), 2, 2);
    }
  }

  function drawBot() {
    const bot = game.bot;
    if (!bot || (!bot.alive && bot.respawnTimer < 75)) return;
    const x = Math.round((bot.x - game.camera.x) * 2) / 2;
    const y = Math.round(bot.y - game.camera.y);
    if (x < -60 || x > canvas.width + 60) return;

    if (botRig?.ready) botRig.draw(x, y, bot.facing, 1, 1);
    else {
      ctx.fillStyle = '#2267c9';
      ctx.fillRect(x - 9, y - 27, 18, 27);
      ctx.fillStyle = '#f4ecd7';
      ctx.fillRect(x - 4, y - 22, 8, 5);
    }

    if (bot.alive) {
      ctx.fillStyle = '#363542';
      ctx.fillRect(x - 13, y - 43, 26, 7);
      for (let index = 0; index < bot.maxHealth; index += 1) {
        ctx.fillStyle = index < bot.health ? '#62b6ff' : '#5d586c';
        ctx.fillRect(x - 10 + index * 8, y - 41, 6, 3);
      }
    }
  }

  function drawProjectiles() {
    ctx.save();
    ctx.font = 'bold 15px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const note of game.projectiles) {
      const x = Math.round(note.x - game.camera.x);
      const y = Math.round(note.y - game.camera.y);
      const speed = Math.hypot(note.vx, note.vy) || 1;
      const trailX = note.vx / speed;
      const trailY = note.vy / speed;
      ctx.strokeStyle = note.owner === 'player' ? '#fff3b0' : '#8ed7ff';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x - trailX * 15, y - trailY * 15);
      ctx.lineTo(x - trailX * 5, y - trailY * 5);
      ctx.stroke();
      ctx.fillStyle = note.owner === 'player' ? '#ce146c' : '#2267c9';
      ctx.strokeStyle = '#363542';
      ctx.lineWidth = 2;
      ctx.strokeText('♪', x, y);
      ctx.fillText('♪', x, y);
    }
    ctx.restore();
  }

  function drawAimGuide() {
    const p = game.player;
    if (!p.aiming) return;
    const originX = p.x - game.camera.x + p.aimX * 10;
    const originY = p.y - game.camera.y - 22 + p.aimY * 6;
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 243, 176, .82)';
    ctx.fillStyle = '#ce146c';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([3, 4]);
    ctx.beginPath();
    ctx.moveTo(originX, originY);
    ctx.lineTo(originX + p.aimX * 70, originY + p.aimY * 70);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.font = 'bold 13px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('♪', originX + p.aimX * 76, originY + p.aimY * 76);
    ctx.restore();
  }

  function drawParticles() {
    ctx.fillStyle = '#f4ecd7';
    for (const particle of game.particles) {
      const alpha = Math.min(1, particle.life / 10);
      ctx.globalAlpha = alpha;
      ctx.fillRect(Math.round(particle.x - game.camera.x), Math.round(particle.y - game.camera.y), 2, 2);
    }
    ctx.globalAlpha = 1;
  }

  function render() {
    ctx.imageSmoothingEnabled = false;
    drawBackdrop();
    drawPlatforms();
    drawParticles();
    drawProjectiles();
    drawBot();
    drawPlayer();
    drawAimGuide();
  }

  function vibrate(pattern) {
    if (!navigator.userActivation?.hasBeenActive) return;
    try { navigator.vibrate?.(pattern); } catch (_) {}
  }

  const keyMap = new Map([
    ['ArrowLeft', 'left'], ['KeyA', 'left'],
    ['ArrowRight', 'right'], ['KeyD', 'right'],
    ['ArrowUp', 'up'], ['KeyW', 'up'],
    ['ArrowDown', 'down'], ['KeyS', 'down']
  ]);

  window.addEventListener('keydown', event => {
    if (document.body.classList.contains('skin-editor-open')) return;
    if (keyMap.has(event.code)) {
      input[keyMap.get(event.code)] = true;
      event.preventDefault();
    }
    if (!event.repeat && event.code === 'Space') {
      input.jumpPressed = true;
      input.jumpHeld = true;
      event.preventDefault();
    }
    if (!event.repeat && ['ShiftLeft', 'ShiftRight', 'KeyX', 'KeyJ'].includes(event.code)) {
      input.shootHeld = true;
      event.preventDefault();
    }
    if (!event.repeat && ['KeyV', 'KeyL', 'KeyM'].includes(event.code)) {
      input.meleePressed = true;
      event.preventDefault();
    }
    if (!event.repeat && ['KeyB', 'KeyC', 'KeyK'].includes(event.code)) {
      input.dashPressed = true;
      event.preventDefault();
    }
    if (!event.repeat && event.code === 'KeyF') {
      if (document.fullscreenElement) document.exitFullscreen();
      else document.documentElement.requestFullscreen?.();
    }
    hideHelpSoon();
  });

  window.addEventListener('keyup', event => {
    if (document.body.classList.contains('skin-editor-open')) return;
    if (keyMap.has(event.code)) input[keyMap.get(event.code)] = false;
    if (event.code === 'Space') input.jumpHeld = false;
    if (['ShiftLeft', 'ShiftRight', 'KeyX', 'KeyJ'].includes(event.code) && input.shootHeld) {
      input.shootHeld = false;
      input.shootReleased = true;
    }
  });

  window.addEventListener('blur', () => {
    input.left = input.right = input.up = input.down = input.jumpHeld = input.shootHeld = false;
    input.aimAxisX = input.aimAxisY = 0;
  });

  const joystick = document.getElementById('joystick');
  const joystickKnob = document.getElementById('joystickKnob');
  let joystickPointer = null;

  function updateJoystick(event) {
    const box = joystick.getBoundingClientRect();
    const centerX = box.left + box.width / 2;
    const centerY = box.top + box.height / 2;
    const max = box.width * .27;
    const rawX = event.clientX - centerX;
    const rawY = event.clientY - centerY;
    const length = Math.hypot(rawX, rawY) || 1;
    const scale = Math.min(1, max / length);
    const x = rawX * scale;
    const y = rawY * scale;
    input.aimAxisX = Math.max(-1, Math.min(1, rawX / max));
    input.aimAxisY = Math.max(-1, Math.min(1, rawY / max));
    joystickKnob.style.transform = `translate(${x}px, ${y}px)`;
    input.left = rawX < -box.width * .12;
    input.right = rawX > box.width * .12;
    input.up = rawY < -box.height * .16;
    input.down = rawY > box.height * .16;
  }

  joystick.addEventListener('pointerdown', event => {
    joystickPointer = event.pointerId;
    joystick.setPointerCapture(event.pointerId);
    updateJoystick(event);
    hideHelpSoon();
  });
  joystick.addEventListener('pointermove', event => {
    if (event.pointerId === joystickPointer) updateJoystick(event);
  });
  function releaseJoystick(event) {
    if (event.pointerId !== joystickPointer) return;
    joystickPointer = null;
    input.left = input.right = input.up = input.down = false;
    input.aimAxisX = input.aimAxisY = 0;
    joystickKnob.style.transform = 'translate(0, 0)';
  }
  joystick.addEventListener('pointerup', releaseJoystick);
  joystick.addEventListener('pointercancel', releaseJoystick);

  function bindTapButton(button, property) {
    const release = event => {
      if (button.hasPointerCapture?.(event.pointerId)) button.releasePointerCapture(event.pointerId);
      button.classList.remove('is-active');
    };
    button.addEventListener('pointerdown', event => {
      button.setPointerCapture(event.pointerId);
      input[property] = true;
      button.classList.add('is-active');
      hideHelpSoon();
      event.preventDefault();
    });
    button.addEventListener('pointerup', release);
    button.addEventListener('pointercancel', release);
  }

  const shootButton = document.getElementById('shootButton');
  const meleeButton = document.getElementById('meleeButton');
  const dashButton = document.getElementById('dashButton');
  const jumpButton = document.getElementById('jumpButton');
  let shootPointer = null;
  shootButton.addEventListener('pointerdown', event => {
    shootPointer = event.pointerId;
    shootButton.setPointerCapture(event.pointerId);
    shootButton.classList.add('is-active');
    input.shootHeld = true;
    hideHelpSoon();
    event.preventDefault();
  });
  shootButton.addEventListener('pointerup', event => {
    if (event.pointerId !== shootPointer) return;
    shootPointer = null;
    if (shootButton.hasPointerCapture?.(event.pointerId)) shootButton.releasePointerCapture(event.pointerId);
    shootButton.classList.remove('is-active');
    input.shootHeld = false;
    input.shootReleased = true;
  });
  shootButton.addEventListener('pointercancel', event => {
    if (event.pointerId !== shootPointer) return;
    shootPointer = null;
    shootButton.classList.remove('is-active');
    input.shootHeld = false;
  });
  bindTapButton(meleeButton, 'meleePressed');
  bindTapButton(dashButton, 'dashPressed');
  jumpButton.addEventListener('pointerdown', event => {
    input.jumpPressed = true;
    input.jumpHeld = true;
    jumpButton.classList.add('is-active');
    jumpButton.setPointerCapture(event.pointerId);
    hideHelpSoon();
    event.preventDefault();
  });
  const releaseJump = event => {
    if (jumpButton.hasPointerCapture?.(event.pointerId)) jumpButton.releasePointerCapture(event.pointerId);
    jumpButton.classList.remove('is-active');
    input.jumpHeld = false;
  };
  jumpButton.addEventListener('pointerup', releaseJump);
  jumpButton.addEventListener('pointercancel', releaseJump);

  canvas.addEventListener('pointerdown', () => {
    canvas.focus({ preventScroll: true });
    hideHelpSoon();
  });
  document.getElementById('helpButton').addEventListener('click', () => {
    const help = document.getElementById('help');
    help.classList.toggle('is-hidden');
  });

  window.addEventListener('ash-skin-editor:close', () => {
    canvas.focus({ preventScroll: true });
  });

  let helpTimer = 0;
  function hideHelpSoon() {
    clearTimeout(helpTimer);
    helpTimer = setTimeout(() => document.getElementById('help').classList.add('is-hidden'), 1300);
  }

  window.addEventListener('message', event => {
    const trustedParent = event.source === window.parent && event.origin === location.origin;
    if (event.data?.type === 'bcd:encore:init') {
      if (!trustedParent) return;
      game.playerName = event.data.payload?.playerName || 'Climber';
      skinEditor?.setAdmin(event.data.payload?.isAdmin === true);
    }
    // Closing the host overlay never pauses or rewinds this always-live simulation.
  });

  window.render_game_to_text = () => JSON.stringify({
    coordinateSystem: 'origin top-left; x increases right; y increases down; world units are pixels',
    mode: game.mode,
    world: WORLD,
    camera: { x: Math.round(game.camera.x), y: Math.round(game.camera.y), width: VIEW.width, height: VIEW.height },
    player: {
      name: game.playerName,
      x: Math.round(game.player.x),
      y: Math.round(game.player.y),
      vx: Number(game.player.vx.toFixed(2)),
      vy: Number(game.player.vy.toFixed(2)),
      grounded: Boolean(game.player.grounded),
      clinging: game.player.clinging,
      crouching: game.player.crouching,
      lookingUp: game.player.lookingUp,
      facing: game.player.facing,
      animation: game.player.animation,
      character: ash?.ready ? 'Ash' : (ash?.failed ? 'Pirate fallback' : 'Ash loading'),
      rigAnimation: ash?.currentAnimation || null,
      shooting: game.player.shootTimer > 0,
      aiming: game.player.aiming,
      aim: { x: Number(game.player.aimX.toFixed(2)), y: Number(game.player.aimY.toFixed(2)) },
      melee: game.player.meleeTimer > 0,
      dashing: game.player.dashTimer > 0,
      dashCooldown: game.player.dashCooldown,
      section: Math.min(3, Math.floor(game.player.x / VIEW.width) + 1)
    },
    bot: game.bot ? {
      character: botRig?.ready ? 'Player2' : 'Programmatic fallback',
      x: Math.round(game.bot.x),
      y: Math.round(game.bot.y),
      health: game.bot.health,
      alive: game.bot.alive,
      respawnTimer: game.bot.respawnTimer,
      animation: game.bot.animation,
      rigAnimation: botRig?.currentAnimation || null
    } : null,
    projectiles: game.projectiles.map(note => ({ owner: note.owner, x: Math.round(note.x), y: Math.round(note.y), vx: Number(note.vx.toFixed(2)), vy: Number(note.vy.toFixed(2)) })),
    movingPlatforms: game.movers.map(m => ({ id: m.id, x: Math.round(m.x), y: Math.round(m.y), width: m.w, height: m.h, kind: m.kind })),
    deaths: game.deaths,
    botKnockouts: game.kills,
    skinEditor: skinEditor?.state?.() || null
  });

  window.advanceTime = milliseconds => {
    const steps = Math.max(1, Math.round(milliseconds / (1000 / 60)));
    for (let i = 0; i < steps; i += 1) update();
    render();
  };

  function frame(now) {
    if (!frame.last) frame.last = now;
    frame.accumulator = Math.min(.1, (frame.accumulator || 0) + (now - frame.last) / 1000);
    frame.last = now;
    while (frame.accumulator >= STEP) {
      update();
      frame.accumulator -= STEP;
    }
    render();
    requestAnimationFrame(frame);
  }

  async function boot() {
    // Start physics and controls immediately. The high-resolution Spine rigs
    // can finish streaming without leaving the canvas or input loop inert.
    resetGame();
    render();
    requestAnimationFrame(frame);

    const fallbackImages = Promise.all(Object.entries(imageSources).map(([key, source]) => new Promise(resolve => {
      const image = new Image();
      image.onload = () => { images[key] = image; resolve(); };
      image.onerror = () => resolve();
      image.src = source;
    })));
    const ashRig = ash?.load().catch(error => {
      ash.failed = true;
      console.error('Ash character failed to load; using the pirate fallback.', error);
    });
    const blueRig = botRig?.load().catch(error => {
      botRig.failed = true;
      console.error('Player 2 bot failed to load; using the programmatic fallback.', error);
    });
    await Promise.all([fallbackImages, ashRig, blueRig]);
    skinEditor?.hydrateMainRig();
    ash?.update(0, game.player.animation);
    botRig?.update(0, game.bot.animation);
    render();
    window.parent?.postMessage({ type: 'bcd:encore:ready' }, '*');
  }

  boot();
})();
