(() => {
  'use strict';

  const STORAGE_KEY = 'bcd:pixel-characters:v2';
  const CURRENT_KEY = 'bcd:pixel-character-current:v2';
  const GRID_W = 24;
  const GRID_H = 32;
  const PAINT_LAYERS = ['hair', 'face', 'hood', 'outfit', 'armor', 'backpack', 'weapon'];
  const LEGACY = [
    { id: 'legacy-ash', name: 'Ash', kind: 'legacy', rig: 'ash' },
    { id: 'legacy-p2', name: 'Player 2', kind: 'legacy', rig: 'p2' }
  ];
  const MODULES = {
    hair: ['Tucked', 'Spikes', 'Bob', 'Ponytail', 'None'],
    face: ['Focused', 'Bright', 'Masked', 'Scar'],
    hood: ['Half hood', 'Full hood', 'Bandana', 'None'],
    outfit: ['Ranger', 'Jacket', 'Tunic', 'Scout'],
    armor: ['Shoulders', 'Chest plate', 'Light', 'None'],
    backpack: ['Adventure pack', 'Quiver', 'Cape', 'None'],
    weapon: ['Hand cannon', 'Pulse bow', 'Short sword', 'Blaster']
  };
  const DEFAULT = Object.freeze({
    name: 'New Fighter', kind: 'pixel',
    modules: { base: 'ash', hair: 'Tucked', face: 'Focused', hood: 'Half hood', outfit: 'Ranger', armor: 'Shoulders', backpack: 'Adventure pack', weapon: 'Hand cannon' },
    colors: { skin: '#d99b72', hair: '#352536', clothing: '#b73555', trim: '#e1b15c', weapon: '#8e9db4', effects: '#ffe06b' },
    paint: {}
  });
  const POSES = ['idle', 'run', 'jump', 'fall', 'cling', 'crouch', 'look', 'shoot', 'dash', 'melee', 'meleeUp', 'meleeDown'];

  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function cleanName(value) { return String(value || '').trim().replace(/\s+/g, ' ').slice(0, 32); }
  function validColor(value, fallback = '#ffffff') { return /^#[0-9a-f]{6}$/i.test(String(value || '')) ? String(value).toLowerCase() : fallback; }
  function safeRead(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch (_) { return fallback; } }
  function safeWrite(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) {} }

  function protectedPixel(layer, x, y) {
    if (x < 0 || y < 0 || x >= GRID_W || y >= GRID_H) return false;
    return Boolean({
      hair: x >= 5 && x <= 18 && y >= 1 && y <= 10,
      face: x >= 7 && x <= 16 && y >= 5 && y <= 13,
      hood: x >= 3 && x <= 20 && y >= 0 && y <= 14,
      outfit: x >= 5 && x <= 18 && y >= 12 && y <= 27,
      armor: x >= 2 && x <= 21 && y >= 11 && y <= 24,
      backpack: x >= 1 && x <= 22 && y >= 8 && y <= 27,
      weapon: x >= 0 && x <= 23 && y >= 10 && y <= 29
    }[layer]);
  }

  function normalize(raw = {}) {
    const item = clone(DEFAULT);
    item.id = String(raw.id || `fighter-${Date.now().toString(36)}`);
    item.name = cleanName(raw.name) || DEFAULT.name;
    item.createdAt = Number(raw.createdAt) || Date.now();
    Object.keys(item.modules).forEach(key => {
      if (key === 'base') item.modules.base = raw.modules?.base === 'p2' ? 'p2' : 'ash';
      else if (MODULES[key].includes(raw.modules?.[key])) item.modules[key] = raw.modules[key];
    });
    Object.keys(item.colors).forEach(key => { item.colors[key] = validColor(raw.colors?.[key], item.colors[key]); });
    item.paint = {};
    PAINT_LAYERS.forEach(layer => {
      item.paint[layer] = Object.fromEntries(Object.entries(raw.paint?.[layer] || {}).filter(([key, color]) => {
        const [x, y] = key.split(',').map(Number);
        return Number.isInteger(x) && Number.isInteger(y) && protectedPixel(layer, x, y) && /^#[0-9a-f]{6}$/i.test(color);
      }).map(([key, color]) => [key, color.toLowerCase()]));
    });
    return item;
  }

  class PixelCharacterRenderer {
    constructor(context) { this.context = context; }

    draw(character, x, y, facing = 1, animation = 'idle', time = 0, scale = 1.5, stretch = 1, squash = 1, targetContext = this.context) {
      if (!character || character.kind !== 'pixel') return;
      const ctx = targetContext;
      const model = normalize(character);
      const run = animation === 'run';
      const crouch = animation === 'crouch';
      const dash = animation === 'dash';
      const cling = animation === 'cling';
      const bob = animation === 'idle' ? Math.round(Math.sin(time * 5)) : 0;
      const stride = run ? (Math.floor(time * 12) % 2 ? 2 : -2) : 0;
      const pixel = scale;
      const ox = -12;
      const oy = -31 + bob;
      const colors = model.colors;
      const shade = (hex, amount) => {
        const number = parseInt(hex.slice(1), 16);
        const r = Math.max(0, Math.min(255, (number >> 16) + amount));
        const g = Math.max(0, Math.min(255, ((number >> 8) & 255) + amount));
        const b = Math.max(0, Math.min(255, (number & 255) + amount));
        return `rgb(${r},${g},${b})`;
      };
      const rect = (px, py, w, h, color) => { ctx.fillStyle = color; ctx.fillRect(Math.round((ox + px) * pixel), Math.round((oy + py) * pixel), Math.ceil(w * pixel), Math.ceil(h * pixel)); };
      const dot = (px, py, color) => rect(px, py, 1, 1, color);

      ctx.save();
      ctx.translate(Math.round(x), Math.round(y));
      ctx.scale(facing * stretch, squash);
      if (dash) ctx.rotate(-facing * .12);
      if (cling) ctx.rotate(facing * .04);
      if (crouch) ctx.translate(0, 7 * pixel);

      if (model.modules.backpack === 'Cape') {
        rect(5, 12, 14, 14, shade(colors.clothing, -40)); rect(4, 17, 3, 10, colors.clothing); rect(17, 18, 3, 9, colors.clothing);
      } else if (model.modules.backpack === 'Quiver') {
        rect(17, 9, 3, 16, shade(colors.trim, -25)); rect(18, 7, 1, 5, colors.weapon); rect(20, 8, 1, 5, colors.weapon);
      } else if (model.modules.backpack === 'Adventure pack') {
        rect(3, 13, 5, 12, shade(colors.clothing, -45)); rect(2, 16, 2, 7, colors.trim);
      }

      const legY = crouch ? 22 : 24;
      rect(7 + Math.max(0, stride), legY, 4, crouch ? 5 : 7, shade(colors.clothing, -38));
      rect(13 + Math.min(0, stride), legY, 4, crouch ? 5 : 7, shade(colors.clothing, -28));
      rect(5 + Math.max(0, stride), 29, 6, 3, '#302a35'); rect(13 + Math.min(0, stride), 29, 6, 3, '#302a35');
      rect(6, 12, 12, 13, colors.clothing);
      if (model.modules.outfit === 'Jacket') { rect(11, 12, 2, 13, colors.trim); rect(7, 20, 10, 2, shade(colors.clothing, 25)); }
      if (model.modules.outfit === 'Tunic') { rect(5, 21, 14, 5, colors.clothing); dot(11, 18, colors.trim); dot(13, 18, colors.trim); }
      if (model.modules.outfit === 'Scout') { rect(6, 17, 12, 3, colors.trim); rect(9, 12, 6, 2, shade(colors.clothing, 30)); }

      const shooting = animation === 'shoot' || animation === 'look';
      const melee = animation.startsWith('melee');
      if (shooting) rect(facing > 0 ? 16 : 3, 14, 7, 4, colors.skin);
      else if (melee) rect(facing > 0 ? 16 : 3, animation === 'meleeUp' ? 9 : 14, 6, 4, colors.skin);
      else { rect(3, 13 + (run ? -stride / 2 : 0), 4, 10, colors.skin); rect(17, 13 + (run ? stride / 2 : 0), 4, 10, colors.skin); }

      rect(7, 4, 10, 9, colors.skin);
      if (model.modules.face === 'Masked') rect(7, 9, 10, 4, shade(colors.clothing, -48));
      else {
        dot(model.modules.base === 'p2' ? 9 : 10, 8, '#241d2a'); dot(model.modules.base === 'p2' ? 14 : 15, 8, '#241d2a');
        if (model.modules.face === 'Bright') rect(11, 11, 3, 1, '#f7c0a1');
        if (model.modules.face === 'Scar') { dot(15, 9, colors.trim); dot(16, 10, colors.trim); }
      }
      if (model.modules.hood === 'Full hood') {
        rect(5, 1, 14, 5, colors.clothing); rect(4, 4, 4, 9, colors.clothing); rect(16, 4, 4, 9, colors.clothing);
      } else if (model.modules.hood === 'Half hood') {
        rect(5, 2, 14, 4, colors.clothing); rect(4, 5, 4, 5, colors.clothing);
      } else if (model.modules.hood === 'Bandana') {
        rect(5, 3, 14, 3, colors.clothing); rect(18, 4, 4, 2, colors.trim); rect(20, 6, 3, 2, colors.trim);
      }
      if (model.modules.hair !== 'None') {
        if (model.modules.hair === 'Spikes') { rect(7, 1, 10, 4, colors.hair); dot(6, 0, colors.hair); dot(10, 0, colors.hair); dot(15, 0, colors.hair); }
        else if (model.modules.hair === 'Bob') { rect(6, 2, 12, 5, colors.hair); rect(5, 5, 3, 7, colors.hair); rect(16, 5, 3, 7, colors.hair); }
        else if (model.modules.hair === 'Ponytail') { rect(7, 2, 11, 4, colors.hair); rect(17, 4, 5, 4, colors.hair); rect(20, 7, 3, 6, colors.hair); }
        else { rect(7, 2, 11, 4, colors.hair); rect(6, 5, 4, 3, colors.hair); }
      }

      if (model.modules.armor === 'Shoulders') { rect(3, 11, 6, 4, colors.trim); rect(15, 11, 6, 4, colors.trim); }
      if (model.modules.armor === 'Chest plate') { rect(8, 13, 8, 8, shade(colors.trim, -18)); rect(10, 14, 4, 5, colors.trim); }
      if (model.modules.armor === 'Light') { rect(6, 12, 12, 2, colors.trim); rect(7, 22, 10, 2, colors.trim); }

      if (melee) {
        if (animation === 'meleeUp') { rect(18, 2, 2, 14, colors.weapon); rect(16, 12, 6, 2, colors.trim); rect(18, 0, 2, 3, colors.effects); }
        else if (animation === 'meleeDown') { rect(18, 16, 2, 14, colors.weapon); rect(16, 17, 6, 2, colors.trim); rect(18, 29, 2, 3, colors.effects); }
        else { rect(18, 14, 6, 2, colors.weapon); rect(16, 12, 2, 6, colors.trim); rect(23, 13, 1, 4, colors.effects); }
      } else if (shooting || ['Hand cannon', 'Blaster'].includes(model.modules.weapon)) {
        const wy = animation === 'look' ? 5 : 14;
        rect(17, wy, 7, 4, colors.weapon); rect(19, wy + 4, 3, 3, shade(colors.weapon, -35));
        if (animation === 'shoot') rect(23, wy - 1, 1, 6, colors.effects);
      } else if (model.modules.weapon === 'Pulse bow') {
        rect(19, 9, 2, 18, colors.weapon); rect(21, 11, 1, 14, colors.effects);
      } else { rect(19, 11, 2, 17, colors.weapon); rect(17, 12, 6, 2, colors.trim); }

      PAINT_LAYERS.forEach(layer => Object.entries(model.paint[layer] || {}).forEach(([key, color]) => {
        const [px, py] = key.split(',').map(Number);
        if (protectedPixel(layer, px, py)) dot(px, py, color);
      }));
      ctx.restore();
    }
  }

  class PixelCharacterStudio {
    constructor({ renderer, legacyRigs = {} } = {}) {
      this.renderer = renderer;
      this.legacyRigs = legacyRigs;
      this.root = document.getElementById('skinEditor');
      this.button = document.getElementById('skinEditorButton');
      this.carousel = document.getElementById('characterCarousel');
      this.previewCanvas = document.getElementById('skinPreview');
      this.previewContext = this.previewCanvas.getContext('2d');
      this.paintCanvas = document.getElementById('pixelPaint');
      this.paintContext = this.paintCanvas.getContext('2d');
      this.saved = safeRead(STORAGE_KEY, []).map(normalize);
      this.selectedId = String(safeRead(CURRENT_KEY, 'legacy-ash'));
      this.draft = null;
      this.pose = 'idle';
      this.paintLayer = 'outfit';
      this.paintTool = 'pencil';
      this.undo = [];
      this.opened = false;
      this.previewFrame = 0;
      this.previewTime = 0;
      this.bind();
      this.populateControls();
      if (!this.allCharacters().some(item => item.id === this.selectedId)) this.selectedId = 'legacy-ash';
      this.rebuildLibrary();
      this.updateCarousel();
    }

    allCharacters() { return [...LEGACY, ...this.saved]; }
    activeCharacter() { return this.allCharacters().find(item => item.id === this.selectedId) || LEGACY[0]; }
    activeRig() { const item = this.activeCharacter(); return item.kind === 'legacy' ? this.legacyRigs[item.rig] : null; }

    bind() {
      this.button.addEventListener('click', () => this.open());
      this.root.querySelectorAll('[data-skin-close]').forEach(button => button.addEventListener('click', () => this.close()));
      this.carousel.querySelector('[data-character-open]').addEventListener('click', () => this.open());
      this.carousel.querySelector('[data-character-prev]').addEventListener('click', () => this.cycle(-1));
      this.carousel.querySelector('[data-character-next]').addEventListener('click', () => this.cycle(1));
      this.root.querySelector('[data-skin-library]').addEventListener('change', event => this.select(event.target.value, true));
      this.root.querySelector('[data-skin-pose]').addEventListener('change', event => { this.pose = POSES.includes(event.target.value) ? event.target.value : 'idle'; });
      this.root.querySelector('[data-skin-new]').addEventListener('click', () => this.newCharacter());
      this.root.querySelector('[data-skin-duplicate]').addEventListener('click', () => this.duplicateCharacter());
      this.root.querySelector('[data-skin-save]').addEventListener('click', () => this.saveCharacter());
      this.root.querySelector('[data-skin-delete]').addEventListener('click', () => this.deleteCharacter());
      this.root.querySelectorAll('[data-module]').forEach(select => select.addEventListener('change', () => this.readControls()));
      this.root.querySelectorAll('[data-skin-color]').forEach(input => input.addEventListener('input', () => this.readControls()));
      this.root.querySelectorAll('[data-studio-tab]').forEach(button => button.addEventListener('click', () => this.showTab(button.dataset.studioTab)));
      this.root.querySelector('[data-paint-layer]').addEventListener('change', event => { this.paintLayer = event.target.value; this.renderPaintGrid(); });
      this.root.querySelectorAll('[data-paint-tool]').forEach(button => button.addEventListener('click', () => this.setPaintTool(button.dataset.paintTool)));
      this.root.querySelector('[data-paint-undo]').addEventListener('click', () => this.undoPaint());
      this.root.querySelector('[data-paint-mirror]').addEventListener('click', () => this.mirrorPaint());
      this.root.querySelector('[data-paint-clear]').addEventListener('click', () => this.clearPaint());
      this.paintCanvas.addEventListener('pointerdown', event => this.paintAt(event));
      this.paintCanvas.addEventListener('pointermove', event => { if (event.buttons === 1 && this.paintTool !== 'fill') this.paintAt(event, false); });
      window.addEventListener('keydown', event => { if (event.key === 'Escape' && this.opened) { event.stopImmediatePropagation(); this.close(); } }, true);
    }

    populateControls() {
      Object.entries(MODULES).forEach(([key, values]) => {
        const select = this.root.querySelector(`[data-module="${key}"]`);
        select.replaceChildren(...values.map(value => new Option(value, value)));
      });
      const layers = this.root.querySelector('[data-paint-layer]');
      layers.replaceChildren(...PAINT_LAYERS.map(value => new Option(value[0].toUpperCase() + value.slice(1), value)));
      layers.value = this.paintLayer;
    }

    setAdmin() { this.button.hidden = false; }
    hydrateMainRig() { this.select(this.selectedId, false); }

    select(id, fromStudio = false) {
      const item = this.allCharacters().find(entry => entry.id === id) || LEGACY[0];
      this.selectedId = item.id;
      safeWrite(CURRENT_KEY, item.id);
      if (fromStudio || this.opened) {
        this.draft = item.kind === 'pixel' ? normalize(item) : normalize({ ...DEFAULT, name: `${item.name} Custom`, modules: { ...DEFAULT.modules, base: item.rig } });
        this.writeControls();
      }
      this.rebuildLibrary();
      this.updateCarousel();
      window.dispatchEvent(new CustomEvent('characterstudio:change', { detail: { character: this.activeCharacter() } }));
    }

    cycle(direction) {
      const items = this.allCharacters();
      const index = Math.max(0, items.findIndex(item => item.id === this.selectedId));
      this.select(items[(index + direction + items.length) % items.length].id, false);
    }

    rebuildLibrary() {
      const select = this.root.querySelector('[data-skin-library]');
      select.replaceChildren(...this.allCharacters().map(item => new Option(`${item.kind === 'legacy' ? 'LEGACY · ' : 'CUSTOM · '}${item.name}`, item.id)));
      select.value = this.selectedId;
    }

    updateCarousel() {
      const item = this.activeCharacter();
      this.carousel.querySelector('[data-character-name]').textContent = item.name.toUpperCase();
      this.carousel.dataset.kind = item.kind;
    }

    writeControls() {
      const model = this.draft || normalize(DEFAULT);
      this.root.querySelector('[data-skin-name]').value = model.name;
      Object.entries(model.modules).forEach(([key, value]) => { const input = this.root.querySelector(`[data-module="${key}"]`); if (input) input.value = value; });
      Object.entries(model.colors).forEach(([key, value]) => { this.root.querySelector(`[data-skin-color="${key}"]`).value = value; });
      this.root.querySelector('[data-skin-delete]').disabled = !this.saved.some(item => item.id === this.selectedId);
      this.renderPaintGrid();
    }

    readControls() {
      if (!this.draft) this.draft = normalize(DEFAULT);
      const typedName = cleanName(this.root.querySelector('[data-skin-name]').value);
      if (typedName) this.draft.name = typedName;
      this.root.querySelectorAll('[data-module]').forEach(input => { this.draft.modules[input.dataset.module] = input.value; });
      this.root.querySelectorAll('[data-skin-color]').forEach(input => { this.draft.colors[input.dataset.skinColor] = input.value; });
      return this.draft;
    }

    newCharacter() {
      this.selectedId = 'draft';
      this.draft = normalize({ ...DEFAULT, id: `fighter-${Date.now().toString(36)}`, name: 'New Fighter' });
      this.undo = [];
      this.writeControls();
      this.root.querySelector('[data-skin-name]').select();
      this.setStatus('New fighter ready to build.');
    }

    duplicateCharacter() {
      const source = this.draft || (this.activeCharacter().kind === 'pixel' ? this.activeCharacter() : DEFAULT);
      this.draft = normalize({ ...clone(source), id: `fighter-${Date.now().toString(36)}`, name: `${source.name || 'Fighter'} Copy`, createdAt: Date.now() });
      this.selectedId = 'draft';
      this.writeControls();
      this.setStatus('Duplicate created. Rename it, then save.');
    }

    saveCharacter() {
      const model = this.readControls();
      const name = cleanName(this.root.querySelector('[data-skin-name]').value);
      if (!name) { this.root.querySelector('[data-skin-name]').focus(); this.setStatus('Give your fighter a name first.', true); return; }
      model.name = name;
      let existing = this.saved.find(item => item.id === this.selectedId);
      if (!existing) {
        model.id = this.saved.some(item => item.id === model.id) ? `fighter-${Date.now().toString(36)}` : model.id;
        this.saved.push(normalize(model));
        existing = this.saved[this.saved.length - 1];
      } else Object.assign(existing, normalize({ ...model, id: existing.id, createdAt: existing.createdAt }));
      this.selectedId = existing.id;
      this.draft = normalize(existing);
      safeWrite(STORAGE_KEY, this.saved);
      safeWrite(CURRENT_KEY, this.selectedId);
      this.rebuildLibrary();
      this.updateCarousel();
      this.root.querySelector('[data-skin-delete]').disabled = false;
      window.dispatchEvent(new CustomEvent('characterstudio:change', { detail: { character: this.activeCharacter() } }));
      this.setStatus(`${name} saved and selected on this device.`);
    }

    deleteCharacter() {
      const item = this.saved.find(entry => entry.id === this.selectedId);
      if (!item) return;
      this.saved = this.saved.filter(entry => entry.id !== item.id);
      safeWrite(STORAGE_KEY, this.saved);
      this.select('legacy-ash', true);
      this.setStatus(`${item.name} deleted. Ash is selected.`);
    }

    showTab(tab) {
      this.root.querySelectorAll('[data-studio-tab]').forEach(button => button.classList.toggle('is-active', button.dataset.studioTab === tab));
      this.root.querySelectorAll('[data-studio-pane]').forEach(pane => { pane.hidden = pane.dataset.studioPane !== tab; });
      if (tab === 'paint') this.renderPaintGrid();
    }

    setPaintTool(tool) {
      this.paintTool = ['pencil', 'eraser', 'fill'].includes(tool) ? tool : 'pencil';
      this.root.querySelectorAll('[data-paint-tool]').forEach(button => button.classList.toggle('is-active', button.dataset.paintTool === this.paintTool));
    }

    pushUndo() { this.undo.push(clone(this.draft.paint)); if (this.undo.length > 30) this.undo.shift(); }

    paintAt(event, snapshot = true) {
      if (!this.draft) return;
      const bounds = this.paintCanvas.getBoundingClientRect();
      const x = Math.floor((event.clientX - bounds.left) / bounds.width * GRID_W);
      const y = Math.floor((event.clientY - bounds.top) / bounds.height * GRID_H);
      if (!protectedPixel(this.paintLayer, x, y)) { this.setStatus('That pixel is outside the protected layer.', true); return; }
      if (snapshot) this.pushUndo();
      const layer = this.draft.paint[this.paintLayer] ||= {};
      const key = `${x},${y}`;
      if (this.paintTool === 'eraser') delete layer[key];
      else if (this.paintTool === 'fill') {
        const color = this.root.querySelector('[data-paint-color]').value;
        for (let py = 0; py < GRID_H; py += 1) for (let px = 0; px < GRID_W; px += 1) if (protectedPixel(this.paintLayer, px, py)) layer[`${px},${py}`] = color;
      } else layer[key] = this.root.querySelector('[data-paint-color]').value;
      this.renderPaintGrid();
    }

    mirrorPaint() {
      this.pushUndo();
      const layer = this.draft.paint[this.paintLayer] ||= {};
      Object.entries({ ...layer }).forEach(([key, color]) => {
        const [x, y] = key.split(',').map(Number);
        const mirrorX = GRID_W - 1 - x;
        if (protectedPixel(this.paintLayer, mirrorX, y)) layer[`${mirrorX},${y}`] = color;
      });
      this.renderPaintGrid();
      this.setStatus(`${this.paintLayer} paint mirrored.`);
    }

    undoPaint() {
      const prior = this.undo.pop();
      if (!prior) { this.setStatus('Nothing to undo yet.'); return; }
      this.draft.paint = prior;
      this.renderPaintGrid();
    }

    clearPaint() {
      this.pushUndo();
      this.draft.paint[this.paintLayer] = {};
      this.renderPaintGrid();
      this.setStatus(`${this.paintLayer} paint cleared.`);
    }

    renderPaintGrid() {
      if (!this.draft) return;
      const ctx = this.paintContext;
      const cellW = this.paintCanvas.width / GRID_W;
      const cellH = this.paintCanvas.height / GRID_H;
      ctx.fillStyle = '#100d19'; ctx.fillRect(0, 0, this.paintCanvas.width, this.paintCanvas.height);
      for (let y = 0; y < GRID_H; y += 1) for (let x = 0; x < GRID_W; x += 1) {
        ctx.fillStyle = protectedPixel(this.paintLayer, x, y) ? 'rgba(224,180,92,.13)' : 'rgba(255,255,255,.018)';
        ctx.fillRect(x * cellW, y * cellH, cellW, cellH);
        const color = this.draft.paint[this.paintLayer]?.[`${x},${y}`];
        if (color) { ctx.fillStyle = color; ctx.fillRect(x * cellW + 1, y * cellH + 1, cellW - 2, cellH - 2); }
      }
      ctx.strokeStyle = 'rgba(244,236,215,.08)';
      for (let x = 0; x <= GRID_W; x += 1) { ctx.beginPath(); ctx.moveTo(x * cellW, 0); ctx.lineTo(x * cellW, this.paintCanvas.height); ctx.stroke(); }
      for (let y = 0; y <= GRID_H; y += 1) { ctx.beginPath(); ctx.moveTo(0, y * cellH); ctx.lineTo(this.paintCanvas.width, y * cellH); ctx.stroke(); }
    }

    setStatus(message, error = false) {
      const status = this.root.querySelector('[data-skin-status]');
      status.textContent = message;
      status.classList.toggle('is-error', error);
    }

    open() {
      const active = this.activeCharacter();
      this.draft = active.kind === 'pixel' ? normalize(active) : normalize({ ...DEFAULT, id: `fighter-${Date.now().toString(36)}`, name: `${active.name} Custom`, modules: { ...DEFAULT.modules, base: active.rig } });
      this.opened = true;
      this.root.hidden = false;
      document.body.classList.add('skin-editor-open');
      this.writeControls();
      this.setStatus(active.kind === 'legacy' ? `${active.name} stays untouched. Save to create an editable pixel copy.` : 'Build, paint, preview, then save and use.');
      this.startPreview();
    }

    close() {
      if (!this.opened) return;
      this.opened = false;
      this.root.hidden = true;
      document.body.classList.remove('skin-editor-open');
      cancelAnimationFrame(this.previewFrame);
      this.previewFrame = 0;
    }

    startPreview() {
      if (this.previewFrame) return;
      let then = performance.now();
      const tick = now => {
        if (!this.opened) return;
        const delta = Math.min(.05, (now - then) / 1000); then = now; this.previewTime += delta;
        const ctx = this.previewContext, w = this.previewCanvas.width, h = this.previewCanvas.height;
        const gradient = ctx.createLinearGradient(0, 0, 0, h); gradient.addColorStop(0, '#181425'); gradient.addColorStop(1, '#49314f');
        ctx.fillStyle = gradient; ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = 'rgba(255,222,135,.12)'; ctx.beginPath(); ctx.ellipse(w / 2, h - 42, 100, 28, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#9b713d'; ctx.fillRect(35, h - 32, w - 70, 4);
        this.renderer.draw(this.readControls(), w / 2, h - 34, 1, this.pose, this.previewTime, 6.2, 1, 1, ctx);
        ctx.fillStyle = '#f7df9b'; ctx.font = 'bold 11px monospace'; ctx.textAlign = 'center'; ctx.fillText(this.draft.name.toUpperCase(), w / 2, 23);
        this.previewFrame = requestAnimationFrame(tick);
      };
      this.previewFrame = requestAnimationFrame(tick);
    }

    state() {
      const active = this.activeCharacter();
      return {
        open: this.opened,
        selectedId: this.selectedId,
        selectedName: active.name,
        selectedKind: active.kind,
        savedCharacters: this.saved.length,
        paintPixels: active.kind === 'pixel' ? PAINT_LAYERS.reduce((sum, layer) => sum + Object.keys(active.paint[layer] || {}).length, 0) : 0,
        pose: this.pose,
        paintLayer: this.paintLayer,
        paintTool: this.paintTool
      };
    }
  }

  window.PixelCharacterRenderer = PixelCharacterRenderer;
  window.PixelCharacterStudio = PixelCharacterStudio;
})();
