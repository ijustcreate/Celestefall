(() => {
  'use strict';

  if (new URLSearchParams(location.search).get('embed') === '1') document.body.classList.add('is-embedded');

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d', { alpha: false });
  ctx.imageSmoothingEnabled = false;

  const STEP = 1 / 60;
  const WORLD = { width: 832, height: 384 };
  const VIEW = { width: 640, height: 360 };
  const PLAYER_HALF_W = 7;
  const PLAYER_H = 16;
  const SPAWN = { x: 384, y: 320 };

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

  const fixed = [
    { x: 48, y: 48, w: 736, h: 16, kind: 'solid' },
    { x: 48, y: 64, w: 16, h: 288, kind: 'solid' },
    { x: 768, y: 64, w: 16, h: 288, kind: 'solid' },
    { x: 64, y: 352, w: 288, h: 32, kind: 'solid' },
    { x: 352, y: 320, w: 64, h: 64, kind: 'solid' },
    { x: 416, y: 352, w: 352, h: 32, kind: 'solid' }
  ];

  function makeMovers() {
    return [
      { id: 'west-carrier', x: 176, y: 336, w: 65, h: 7, axis: 'x', min: 160, max: 279, speed: 1, dir: 1, kind: 'solid' },
      { id: 'east-wall', x: 608, y: 272, w: 65, h: 55, axis: 'y', min: 208, max: 289, speed: 1, dir: -1, kind: 'solid' },
      { id: 'center-lift', x: 448, y: 304, w: 65, h: 7, axis: 'y', min: 256, max: 320, speed: 1, dir: -1, kind: 'oneway' },
      { id: 'center-runner', x: 256, y: 304, w: 65, h: 7, axis: 'x', min: 224, max: 328, speed: 1, dir: 1, kind: 'oneway' },
      { id: 'east-lift', x: 678, y: 225, w: 65, h: 7, axis: 'y', min: 208, max: 320, speed: 1, dir: 1, kind: 'solid' }
    ];
  }

  const input = {
    left: false,
    right: false,
    down: false,
    grab: false,
    jumpPressed: false
  };

  const game = {
    mode: 'playing',
    time: 0,
    frame: 0,
    deaths: 0,
    playerName: 'Climber',
    camera: { x: 64, y: 12 },
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
    game.camera.x = 64;
    game.camera.y = 12;
    game.particles.length = 0;
    input.jumpPressed = false;
    vibrate(countDeath ? 30 : 12);
  }

  function rectAt(x = game.player.x, y = game.player.y) {
    return { x: x - PLAYER_HALF_W, y: y - PLAYER_H, w: PLAYER_HALF_W * 2, h: PLAYER_H };
  }

  function overlap(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  function solids(includeOneWay = false) {
    return fixed.concat(game.movers.filter(m => includeOneWay || m.kind === 'solid'));
  }

  function collidesSolid(x, y) {
    const r = rectAt(x, y);
    return solids(false).find(s => overlap(r, s)) || null;
  }

  function standingSurface(x = game.player.x, y = game.player.y) {
    const feet = rectAt(x, y + 1);
    for (const s of fixed.concat(game.movers)) {
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
        oneWay = game.movers.find(s => s.kind === 'oneway' && previousBottom <= s.y + 1 && overlap(next, s));
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

    const wallSide = sideSurface(1) ? 1 : (sideSurface(-1) ? -1 : 0);
    p.clinging = Boolean(input.grab && wallSide && !p.grounded);
    p.clingSide = p.clinging ? wallSide : 0;

    if (input.down && p.grounded && p.grounded.kind === 'oneway') {
      p.dropping = 10;
      p.y += 5;
      p.grounded = false;
    }

    if (p.clinging) {
      p.vx = 0;
      p.vy = 0;
      p.yRemainder = 0;
      if (input.jumpPressed) {
        p.clinging = false;
        p.vx = -wallSide * 4.5;
        p.vy = -8;
        p.facing = -wallSide;
        emitDust(p.x + wallSide * 7, p.y - 8, 7);
        vibrate(14);
      }
    } else {
      p.vx = direction * 3;
      p.vy = Math.min(p.vy + .5, 6);
      if (input.jumpPressed && p.grounded) {
        p.vy = -8;
        p.squash = 1.16;
        p.stretch = .86;
        emitDust(p.x, p.y, 6);
        vibrate(12);
      }
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
    else if (direction) p.animation = 'run';
    else p.animation = 'idle';

    if (p.y > WORLD.height + 40) resetGame(true);
    updateParticles();
    updateCamera();
    input.jumpPressed = false;
  }

  function updateCamera() {
    const p = game.player;
    const targetX = Math.max(0, Math.min(WORLD.width - VIEW.width, p.x - VIEW.width / 2));
    const targetY = Math.max(0, Math.min(WORLD.height - VIEW.height, p.y - VIEW.height / 2));
    game.camera.x += (targetX - game.camera.x) * .12;
    game.camera.y += (targetY - game.camera.y) * .12;
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

    const cloud = images.clouds;
    if (cloud) {
      const y = 252 - game.camera.y;
      const start = -((game.cloudX + game.camera.x * .2) % cloud.width) - cloud.width;
      for (let x = start; x < canvas.width + cloud.width; x += cloud.width) ctx.drawImage(cloud, Math.round(x), Math.round(y));
    }
  }

  function drawRockBlock(block) {
    const x = Math.round(block.x - game.camera.x);
    const y = Math.round(block.y - game.camera.y);
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
    if (block.w > block.h || block.y === 320) {
      ctx.fillStyle = '#2f6c63';
      ctx.fillRect(x, y, block.w, 5);
      ctx.fillStyle = '#58a174';
      for (let px = x; px < x + block.w; px += 8) {
        ctx.fillRect(px, y, 6, 2);
        ctx.fillRect(px + 2, y + 2, 3, 3);
      }
    }
  }

  function drawPlatforms() {
    fixed.forEach(drawRockBlock);
    for (const platform of game.movers) {
      const x = Math.round(platform.x - game.camera.x);
      const y = Math.round(platform.y - game.camera.y);
      const image = platform.kind === 'oneway' ? images.platformOneWay : images.platformSolid;
      if (image) ctx.drawImage(image, x, y, platform.w, platform.h);
      else {
        ctx.fillStyle = platform.kind === 'oneway' ? '#ce146c' : '#7f7c92';
        ctx.fillRect(x, y, platform.w, platform.h);
      }
      ctx.fillStyle = 'rgba(255,255,255,.45)';
      ctx.fillRect(x + 3, y + 1, Math.max(1, platform.w - 6), 1);
    }
  }

  function playerFrame() {
    const p = game.player;
    if (p.animation === 'run') return images[`run${Math.floor(p.animationTime * 10) % 6}`];
    if (p.animation === 'idle') return images[`idle${Math.floor(p.animationTime * 10) % 5}`];
    return images[p.animation];
  }

  function drawPlayer() {
    const p = game.player;
    const image = playerFrame();
    if (!image) return;
    const x = Math.round(p.x - game.camera.x);
    const y = Math.round(p.y - game.camera.y);
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(p.facing * p.stretch, p.squash);
    ctx.drawImage(image, -image.width / 2, -image.height);
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
    ['ArrowDown', 'down'], ['KeyS', 'down'],
    ['ShiftLeft', 'grab'], ['ShiftRight', 'grab'], ['KeyB', 'grab']
  ]);

  window.addEventListener('keydown', event => {
    if (keyMap.has(event.code)) {
      input[keyMap.get(event.code)] = true;
      event.preventDefault();
    }
    if (!event.repeat && ['ArrowUp', 'KeyW', 'Space'].includes(event.code)) {
      input.jumpPressed = true;
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
  });

  window.addEventListener('blur', () => {
    input.left = input.right = input.down = input.grab = false;
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
    input.left = input.right = input.down = false;
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
    jumpButton.classList.add('is-active');
    jumpButton.setPointerCapture(event.pointerId);
    hideHelpSoon();
    event.preventDefault();
  });
  const releaseJump = event => {
    if (jumpButton.hasPointerCapture?.(event.pointerId)) jumpButton.releasePointerCapture(event.pointerId);
    jumpButton.classList.remove('is-active');
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
      facing: game.player.facing,
      animation: game.player.animation
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
    await Promise.all(Object.entries(imageSources).map(([key, source]) => new Promise(resolve => {
      const image = new Image();
      image.onload = () => { images[key] = image; resolve(); };
      image.onerror = () => resolve();
      image.src = source;
    })));
    resetGame();
    render();
    requestAnimationFrame(frame);
    window.parent?.postMessage({ type: 'bcd:encore:ready' }, '*');
  }

  boot();
})();
