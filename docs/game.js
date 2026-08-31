(() => {
  'use strict';

  if (new URLSearchParams(location.search).get('embed') === '1') document.body.classList.add('is-embedded');

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
    grab: false,
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
    movers: makeMovers(),
    player: null
  };

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
      animation: 'idle',
      animationTime: 0,
      squash: 1,
      stretch: 1
    };
  }

  function resetGame(countDeath = false) {
    if (countDeath) game.deaths += 1;
    game.player = freshPlayer();
    game.movers = makeMovers();
    game.camera.x = innerHeight > innerWidth ? SPAWN.x - VIEW.width / 2 : 0;
    game.camera.y = 0;
    game.particles.length = 0;
    input.jumpPressed = false;
    input.jumpHeld = false;
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

  function update() {
    if (game.mode !== 'playing') return;
    const p = game.player;
    const wasGrounded = p.grounded;
    game.time += STEP;
    game.frame += 1;
    game.cloudX = (game.cloudX + .25) % 448;
    if (p.dropping > 0) p.dropping -= 1;

    movePlatforms();

    const direction = Number(input.right) - Number(input.left);
    if (direction) p.facing = direction;

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
    p.clinging = Boolean(input.grab && wallSide && !p.grounded);
    p.clingSide = p.clinging ? wallSide : 0;

    if (p.clinging) {
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

    movePlayerX(p.vx);
    movePlayerY(p.vy);
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
    if (p.clinging) p.animation = 'cling';
    else if (!p.grounded) p.animation = p.vy < 0 ? 'jump' : 'fall';
    else if (p.crouching) p.animation = 'crouch';
    else if (p.lookingUp) p.animation = 'look';
    else if (Math.abs(p.vx) > .2) p.animation = 'run';
    else p.animation = 'idle';
    ash?.update(STEP, p.animation);

    if (p.y > WORLD.height + 40) resetGame(true);
    updateParticles();
    updateCamera();
    input.jumpPressed = false;
  }

  function updateCamera() {
    const p = game.player;
    const lookAhead = p.facing * Math.min(46, Math.abs(p.vx) * 18);
    const portrait = innerHeight > innerWidth;
    // Portrait CSS deliberately crops the wide canvas to create the requested
    // zoom. Let the logical camera travel beyond the level bounds there so the
    // player stays in that central crop at both ends of the map.
    const minX = portrait ? -VIEW.width / 2 + 24 : 0;
    const maxX = portrait ? WORLD.width - VIEW.width / 2 - 24 : WORLD.width - VIEW.width;
    const targetX = Math.max(minX, Math.min(maxX, p.x - VIEW.width / 2 + lookAhead));
    game.camera.x += (targetX - game.camera.x) * .075;
    game.camera.y = 0;
  }

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
    drawPlayer();

    if (game.mode === 'paused') {
      ctx.fillStyle = 'rgba(54,53,66,.72)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#f4ecd7';
      ctx.font = 'bold 24px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('PAUSED', canvas.width / 2, canvas.height / 2);
      ctx.font = '12px monospace';
      ctx.fillText('Press P or tap the stage', canvas.width / 2, canvas.height / 2 + 24);
    }
  }

  function togglePause(force) {
    game.mode = force || (game.mode === 'paused' ? 'playing' : 'paused');
    render();
  }

  function vibrate(pattern) {
    if (!navigator.userActivation?.hasBeenActive) return;
    try { navigator.vibrate?.(pattern); } catch (_) {}
  }

  const keyMap = new Map([
    ['ArrowLeft', 'left'], ['KeyA', 'left'],
    ['ArrowRight', 'right'], ['KeyD', 'right'],
    ['ArrowUp', 'up'], ['KeyW', 'up'],
    ['ArrowDown', 'down'], ['KeyS', 'down'],
    ['ShiftLeft', 'grab'], ['ShiftRight', 'grab'], ['KeyB', 'grab']
  ]);

  window.addEventListener('keydown', event => {
    if (keyMap.has(event.code)) {
      input[keyMap.get(event.code)] = true;
      event.preventDefault();
    }
    if (!event.repeat && event.code === 'Space') {
      input.jumpPressed = true;
      input.jumpHeld = true;
      event.preventDefault();
    }
    if (!event.repeat && event.code === 'KeyR') resetGame();
    if (!event.repeat && event.code === 'KeyP') togglePause();
    if (!event.repeat && event.code === 'KeyF') {
      if (document.fullscreenElement) document.exitFullscreen();
      else document.documentElement.requestFullscreen?.();
    }
    hideHelpSoon();
  });

  window.addEventListener('keyup', event => {
    if (keyMap.has(event.code)) input[keyMap.get(event.code)] = false;
    if (event.code === 'Space') input.jumpHeld = false;
  });

  window.addEventListener('blur', () => {
    input.left = input.right = input.up = input.down = input.grab = input.jumpHeld = false;
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
    joystickKnob.style.transform = 'translate(0, 0)';
  }
  joystick.addEventListener('pointerup', releaseJoystick);
  joystick.addEventListener('pointercancel', releaseJoystick);

  function bindHeldButton(button, property) {
    const release = event => {
      if (button.hasPointerCapture?.(event.pointerId)) button.releasePointerCapture(event.pointerId);
      input[property] = false;
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

  const grabButton = document.getElementById('grabButton');
  const jumpButton = document.getElementById('jumpButton');
  bindHeldButton(grabButton, 'grab');
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
    if (game.mode === 'paused') togglePause('playing');
    canvas.focus({ preventScroll: true });
    hideHelpSoon();
  });
  document.getElementById('resetButton').addEventListener('click', () => resetGame());
  document.getElementById('helpButton').addEventListener('click', () => {
    const help = document.getElementById('help');
    help.classList.toggle('is-hidden');
  });

  let helpTimer = 0;
  function hideHelpSoon() {
    clearTimeout(helpTimer);
    helpTimer = setTimeout(() => document.getElementById('help').classList.add('is-hidden'), 1300);
  }

  window.addEventListener('message', event => {
    if (event.data?.type === 'bcd:encore:init') {
      game.playerName = event.data.payload?.playerName || 'Climber';
    }
    if (event.data?.type === 'bcd:encore:command' && event.data.payload?.command === 'close') togglePause('paused');
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
      section: Math.min(3, Math.floor(game.player.x / VIEW.width) + 1)
    },
    movingPlatforms: game.movers.map(m => ({ id: m.id, x: Math.round(m.x), y: Math.round(m.y), width: m.w, height: m.h, kind: m.kind })),
    deaths: game.deaths
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
    await Promise.all([fallbackImages, ashRig]);
    resetGame();
    ash?.update(0, 'idle');
    render();
    requestAnimationFrame(frame);
    window.parent?.postMessage({ type: 'bcd:encore:ready' }, '*');
  }

  boot();
})();
