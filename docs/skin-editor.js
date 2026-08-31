(() => {
  'use strict';

  const STORAGE_KEY = 'bcd:ash-skins:v1';
  const CURRENT_KEY = 'bcd:ash-current-skin:v1';
  const ORIGINAL = {
    id: 'original',
    name: 'Original Ash',
    baseSkin: 'pistol_01',
    palette: { head: '#ffffff', body: '#ffffff', gear: '#ffffff', weapon: '#ffffff' }
  };
  const POSES = ['idle', 'run', 'jump', 'fall', 'cling', 'crouch', 'look', 'shoot', 'dash'];

  function safeRead(key, fallback) {
    try {
      const value = JSON.parse(localStorage.getItem(key));
      return value ?? fallback;
    } catch (_) { return fallback; }
  }

  function safeWrite(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) {}
  }

  function cleanName(value) {
    return String(value || '').trim().replace(/\s+/g, ' ').slice(0, 32);
  }

  function normalizePalette(palette = {}) {
    const fallback = window.ASH_DEFAULT_PALETTE || ORIGINAL.palette;
    const valid = value => /^#[0-9a-f]{6}$/i.test(String(value || '')) ? String(value).toLowerCase() : '#ffffff';
    return {
      head: valid(palette.head || fallback.head),
      body: valid(palette.body || fallback.body),
      gear: valid(palette.gear || fallback.gear),
      weapon: valid(palette.weapon || fallback.weapon)
    };
  }

  class AshSkinEditor {
    constructor(mainRig) {
      this.mainRig = mainRig;
      this.root = document.getElementById('skinEditor');
      this.button = document.getElementById('skinEditorButton');
      this.previewCanvas = document.getElementById('skinPreview');
      this.previewContext = this.previewCanvas.getContext('2d');
      this.previewContext.imageSmoothingEnabled = true;
      this.previewRig = null;
      this.previewPromise = null;
      this.previewFrame = 0;
      this.previewTime = 0;
      this.pose = 'idle';
      this.admin = false;
      this.opened = false;
      this.selectedId = 'original';
      this.saved = safeRead(STORAGE_KEY, []).filter(item => item?.id && item?.name).map(item => ({
        id: String(item.id),
        name: cleanName(item.name),
        baseSkin: String(item.baseSkin || 'pistol_01'),
        palette: normalizePalette(item.palette),
        createdAt: Number(item.createdAt) || Date.now()
      }));
      this.bind();
      this.rebuildLibrary();
    }

    bind() {
      this.button.addEventListener('click', () => this.open());
      this.root.querySelectorAll('[data-skin-close]').forEach(button => button.addEventListener('click', () => this.close()));
      this.root.querySelector('[data-skin-new]').addEventListener('click', () => this.newSkin());
      this.root.querySelector('[data-skin-save]').addEventListener('click', () => this.saveSkin());
      this.root.querySelector('[data-skin-delete]').addEventListener('click', () => this.deleteSkin());
      this.root.querySelector('[data-skin-library]').addEventListener('change', event => this.selectSkin(event.target.value));
      this.root.querySelector('[data-skin-base]').addEventListener('change', () => this.applyControls());
      this.root.querySelector('[data-skin-pose]').addEventListener('change', event => {
        this.pose = POSES.includes(event.target.value) ? event.target.value : 'idle';
        this.previewRig?.setState(this.pose, true);
      });
      this.root.querySelectorAll('input[type="color"]').forEach(input => input.addEventListener('input', () => this.applyControls()));
      window.addEventListener('keydown', event => {
        if (event.key === 'Escape' && this.opened) {
          event.stopImmediatePropagation();
          this.close();
        }
      }, true);
    }

    setAdmin(value) {
      this.admin = value === true;
      this.button.hidden = !this.admin;
      if (!this.admin) this.close();
    }

    hydrateMainRig() {
      const currentId = safeRead(CURRENT_KEY, 'original');
      const current = this.saved.find(item => item.id === currentId) || ORIGINAL;
      this.selectedId = current.id;
      this.applyAppearance(current);
      this.rebuildLibrary();
    }

    async ensurePreview() {
      if (this.previewRig?.ready) return this.previewRig;
      if (!this.previewPromise) {
        this.previewRig = new window.BulletAgeCharacter(this.previewContext, {
          assetName: 'Ash',
          basePath: 'assets/ash',
          scale: 0.42,
          skin: this.currentAppearance().baseSkin,
          palette: this.currentAppearance().palette
        });
        this.previewPromise = this.previewRig.load().then(() => {
          this.populateBaseSkins();
          this.previewRig.setState(this.pose, true);
          return this.previewRig;
        }).catch(error => {
          this.setStatus('Preview could not load. The live Ash skin still works.', true);
          console.error('Ash skin preview failed to load.', error);
          return null;
        });
      }
      return this.previewPromise;
    }

    populateBaseSkins() {
      const select = this.root.querySelector('[data-skin-base]');
      const current = select.value || this.currentAppearance().baseSkin;
      const skins = this.mainRig?.listBaseSkins?.().length ? this.mainRig.listBaseSkins() : this.previewRig?.listBaseSkins?.() || [];
      select.replaceChildren(...skins.map(name => {
        const option = document.createElement('option');
        option.value = name;
        option.textContent = name.replaceAll('_', ' ');
        return option;
      }));
      select.value = skins.includes(current) ? current : 'pistol_01';
    }

    currentAppearance() {
      const item = this.saved.find(entry => entry.id === this.selectedId) || ORIGINAL;
      return { baseSkin: item.baseSkin, palette: normalizePalette(item.palette) };
    }

    applyAppearance(item) {
      const appearance = {
        baseSkin: item?.baseSkin || 'pistol_01',
        palette: normalizePalette(item?.palette)
      };
      this.mainRig?.setBaseSkin?.(appearance.baseSkin);
      this.mainRig?.applyPalette?.(appearance.palette);
      this.previewRig?.setBaseSkin?.(appearance.baseSkin);
      this.previewRig?.applyPalette?.(appearance.palette);
      this.writeControls({ ...item, ...appearance });
      safeWrite(CURRENT_KEY, item?.id || 'original');
    }

    writeControls(item) {
      const palette = normalizePalette(item.palette);
      this.root.querySelector('[data-skin-name]').value = item.id === 'original' ? '' : item.name || '';
      this.root.querySelector('[data-skin-base]').value = item.baseSkin || 'pistol_01';
      Object.entries(palette).forEach(([key, value]) => {
        this.root.querySelector(`[data-skin-color="${key}"]`).value = value;
      });
      this.root.querySelector('[data-skin-delete]').disabled = item.id === 'original';
    }

    readControls() {
      return {
        baseSkin: this.root.querySelector('[data-skin-base]').value || 'pistol_01',
        palette: Object.fromEntries(['head', 'body', 'gear', 'weapon'].map(key => [key, this.root.querySelector(`[data-skin-color="${key}"]`).value]))
      };
    }

    applyControls() {
      const appearance = this.readControls();
      this.mainRig?.setBaseSkin?.(appearance.baseSkin);
      this.mainRig?.applyPalette?.(appearance.palette);
      this.previewRig?.setBaseSkin?.(appearance.baseSkin);
      this.previewRig?.applyPalette?.(appearance.palette);
      this.setStatus('Live preview applied. Save it when you like it.');
    }

    rebuildLibrary() {
      const select = this.root.querySelector('[data-skin-library]');
      const items = [ORIGINAL, ...this.saved];
      select.replaceChildren(...items.map(item => {
        const option = document.createElement('option');
        option.value = item.id;
        option.textContent = item.name;
        return option;
      }));
      select.value = items.some(item => item.id === this.selectedId) ? this.selectedId : 'original';
    }

    selectSkin(id) {
      const item = this.saved.find(entry => entry.id === id) || ORIGINAL;
      this.selectedId = item.id;
      this.applyAppearance(item);
      this.rebuildLibrary();
      this.setStatus(`${item.name} applied to Ash.`);
    }

    newSkin() {
      this.selectedId = 'original';
      this.applyAppearance({ ...ORIGINAL, id: 'draft', name: '' });
      this.root.querySelector('[data-skin-name]').focus();
      this.root.querySelector('[data-skin-delete]').disabled = true;
      this.setStatus('New unsaved skin. Pick colors, gear, and a name.');
    }

    saveSkin() {
      const nameInput = this.root.querySelector('[data-skin-name]');
      const name = cleanName(nameInput.value);
      if (!name) {
        nameInput.focus();
        this.setStatus('Give this skin a name before saving.', true);
        return;
      }
      const existing = this.saved.find(item => item.id === this.selectedId);
      const item = {
        id: existing?.id || `ash-${Date.now().toString(36)}`,
        name,
        ...this.readControls(),
        createdAt: existing?.createdAt || Date.now()
      };
      if (existing) Object.assign(existing, item);
      else this.saved.push(item);
      this.selectedId = item.id;
      safeWrite(STORAGE_KEY, this.saved);
      safeWrite(CURRENT_KEY, item.id);
      this.rebuildLibrary();
      this.applyAppearance(item);
      this.setStatus(`${name} saved on this device.`);
    }

    deleteSkin() {
      const item = this.saved.find(entry => entry.id === this.selectedId);
      if (!item) return;
      this.saved = this.saved.filter(entry => entry.id !== item.id);
      safeWrite(STORAGE_KEY, this.saved);
      this.selectedId = 'original';
      this.rebuildLibrary();
      this.applyAppearance(ORIGINAL);
      this.setStatus(`${item.name} deleted.`);
    }

    setStatus(message, error = false) {
      const status = this.root.querySelector('[data-skin-status]');
      status.textContent = message;
      status.classList.toggle('is-error', error);
    }

    async open() {
      if (!this.admin) return;
      this.opened = true;
      this.root.hidden = false;
      document.body.classList.add('skin-editor-open');
      window.dispatchEvent(new CustomEvent('ash-skin-editor:open'));
      this.populateBaseSkins();
      this.writeControls(this.saved.find(item => item.id === this.selectedId) || ORIGINAL);
      this.setStatus('Changes preview live. Saved skins stay on this device.');
      await this.ensurePreview();
      this.root.querySelector('[data-skin-name]').focus({ preventScroll: true });
      this.startPreview();
    }

    close() {
      if (!this.opened) return;
      this.opened = false;
      this.root.hidden = true;
      document.body.classList.remove('skin-editor-open');
      window.dispatchEvent(new CustomEvent('ash-skin-editor:close'));
      cancelAnimationFrame(this.previewFrame);
      this.previewFrame = 0;
    }

    startPreview() {
      if (this.previewFrame) return;
      let then = performance.now();
      const tick = now => {
        if (!this.opened) return;
        const delta = Math.min(0.05, (now - then) / 1000);
        then = now;
        this.previewTime += delta;
        const context = this.previewContext;
        const width = this.previewCanvas.width;
        const height = this.previewCanvas.height;
        const gradient = context.createLinearGradient(0, 0, 0, height);
        gradient.addColorStop(0, '#181425');
        gradient.addColorStop(1, '#39243f');
        context.fillStyle = gradient;
        context.fillRect(0, 0, width, height);
        context.fillStyle = 'rgba(235,197,118,.12)';
        context.beginPath();
        context.ellipse(width / 2, height - 38, 94, 26, 0, 0, Math.PI * 2);
        context.fill();
        context.strokeStyle = '#c9a257';
        context.lineWidth = 2;
        context.beginPath();
        context.moveTo(36, height - 24);
        context.lineTo(width - 36, height - 24);
        context.stroke();
        if (this.previewRig?.ready) {
          this.previewRig.update(delta, this.pose);
          this.previewRig.draw(width / 2, height - 28, 1, 1, 1);
        } else {
          context.fillStyle = '#ead7a8';
          context.font = '12px monospace';
          context.textAlign = 'center';
          context.fillText('LOADING ASH RIG…', width / 2, height / 2);
        }
        this.previewFrame = requestAnimationFrame(tick);
      };
      this.previewFrame = requestAnimationFrame(tick);
    }

    state() {
      return {
        admin: this.admin,
        open: this.opened,
        selectedId: this.selectedId,
        savedSkins: this.saved.length,
        appearance: this.mainRig?.getAppearance?.() || this.currentAppearance()
      };
    }
  }

  window.AshSkinEditor = AshSkinEditor;
})();
