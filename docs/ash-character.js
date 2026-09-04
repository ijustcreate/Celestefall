(() => {
  'use strict';

  const ANIMATIONS = {
    idle: { name: 'Idle', loop: true },
    run: { name: 'Run', loop: true },
    jump: { name: 'Jump_Up', loop: false },
    fall: { name: 'Jump_Fall', loop: true },
    cling: { name: 'Wall_Cling', loop: true },
    crouch: { name: 'Crouch_Idle', loop: true },
    look: { name: '00_Setup_Aim_Up_Pistol', loop: true },
    shoot: { name: 'Fire_Pistol', loop: false },
    melee: { name: 'Sword_Attack_01', loop: false },
    meleeUp: { name: 'Sword_Attack_Up', loop: false },
    meleeDown: { name: 'Sword_Attack_Down', loop: false },
    dash: { name: 'Dash_Pistol', loop: false },
    hit: { name: 'Hit_Pistol', loop: false },
    death: { name: 'Death', loop: false }
  };

  const DEFAULT_PALETTE = Object.freeze({
    head: '#ffffff',
    body: '#ffffff',
    gear: '#ffffff',
    weapon: '#ffffff'
  });

  const DRAWN_SWORD_STATES = new Set(['melee', 'meleeUp', 'meleeDown']);

  function normalizeHex(value) {
    const candidate = String(value || '').trim();
    return /^#[0-9a-f]{6}$/i.test(candidate) ? candidate.toLowerCase() : '#ffffff';
  }

  function colorChannels(value) {
    const hex = normalizeHex(value);
    return {
      r: parseInt(hex.slice(1, 3), 16) / 255,
      g: parseInt(hex.slice(3, 5), 16) / 255,
      b: parseInt(hex.slice(5, 7), 16) / 255
    };
  }

  function rgbToHsl(r, g, b) {
    const max = Math.max(r, g, b), min = Math.min(r, g, b), lightness = (max + min) / 2;
    if (max === min) return { h: 0, s: 0, l: lightness };
    const delta = max - min;
    let hue = max === r ? (g - b) / delta + (g < b ? 6 : 0) : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4;
    return { h: hue / 6, s: delta / (1 - Math.abs(2 * lightness - 1)), l: lightness };
  }

  function hslToRgb(h, s, l) {
    const hue = ((h % 1) + 1) % 1;
    const chroma = (1 - Math.abs(2 * l - 1)) * s;
    const segment = hue * 6, secondary = chroma * (1 - Math.abs(segment % 2 - 1)), match = l - chroma / 2;
    const [r, g, b] = segment < 1 ? [chroma, secondary, 0]
      : segment < 2 ? [secondary, chroma, 0]
        : segment < 3 ? [0, chroma, secondary]
          : segment < 4 ? [0, secondary, chroma]
            : segment < 5 ? [secondary, 0, chroma] : [chroma, 0, secondary];
    return [Math.round((r + match) * 255), Math.round((g + match) * 255), Math.round((b + match) * 255)];
  }

  function sourceMaterial(source, role, r, g, b) {
    const { h, s, l } = rgbToHsl(r / 255, g / 255, b / 255);
    if (s < .35 || l < .055 || l > .92) return false;
    // Ash's costume is a crimson hue; Player 2's is a saturated royal blue.
    // Keeping this test hue-based preserves the facial skin, hair, black line art,
    // metallic weapons, and the neutral shadows on the same attachment image.
    if (source === 'p2') return h > .57 && h < .65 && s >= .44 && l < .62;
    // Head art shares a texture region with skin and lip details. Use the
    // narrower authored-cloth range there; arm/torso slots are clothing-only.
    if (role === 'head') return (h < .025 || h > .925) && s >= .48 && l < .56;
    return h < .055 || h > .89;
  }

  function costumeSlot(name) {
    if (/hand|gun|bullet|sword|weapon|slash|damage|frame/i.test(name)) return false;
    return /head|torso|arm|leg|pelvis|pack/i.test(name);
  }

  function slotGroup(name) {
    // Keep face, skin, hair, and eyes natural. Only the authored clothing
    // material is replaced, which gives a proper chroma-key team color rather
    // than washing a flat tint across the entire character.
    if (/head|face|hair|skin|eye/i.test(name)) return 'head';
    if (/gun|bullet|sword|weapon/i.test(name)) return 'weapon';
    if (/pack/i.test(name)) return 'gear';
    return 'body';
  }

  class BulletAgeCharacter {
    constructor(context, options = {}) {
      this.context = context;
      this.assetName = options.assetName || 'Ash';
      this.basePath = options.basePath || 'assets/ash';
      this.scale = options.scale || 0.086;
      this.skin = options.skin || 'pistol_01';
      this.animationMap = options.animations || ANIMATIONS;
      this.palette = { ...DEFAULT_PALETTE, ...(options.palette || {}) };
      this.teamChroma = null;
      this.chromaAttachments = [];
      this.chromaTexture = null;
      this.atlasTexture = null;
      this.poseCanvas = null;
      this.poseContext = null;
      this.poseDirty = true;
      this.poseAnchor = { x: 160, y: 190 };
      this.ready = false;
      this.failed = false;
      this.currentState = '';
      this.currentAnimation = '';
      this.renderer = null;
      this.skeleton = null;
      this.state = null;
    }

    async load() {
      if (!window.spine?.canvas) throw new Error('The Spine canvas runtime did not load.');

      const manager = new spine.canvas.AssetManager();
      const jsonPath = `${this.basePath}/${this.assetName}.json`;
      const atlasPath = `${this.basePath}/${this.assetName}.atlas`;
      const texturePath = `${this.basePath}/${this.assetName}.png`;
      manager.loadText(jsonPath);
      manager.loadText(atlasPath);
      manager.loadTexture(texturePath);

      await new Promise((resolve, reject) => {
        const check = () => {
          if (manager.hasErrors()) {
            reject(new Error(Array.from(manager.getErrors().values()).join('; ')));
            return;
          }
          if (manager.isLoadingComplete()) {
            resolve();
            return;
          }
          requestAnimationFrame(check);
        };
        check();
      });

      const atlas = new spine.TextureAtlas(manager.get(atlasPath), path => manager.get(`${this.basePath}/${path}`));
      const parser = new spine.SkeletonJson(new spine.AtlasAttachmentLoader(atlas));
      // Ash was authored at a much larger resolution than this 640×360 arena.
      // Scaling during JSON parsing keeps her physics-sized and preserves the
      // full-resolution artwork without shrinking the entire game canvas.
      parser.scale = this.scale;
      const data = parser.readSkeletonData(manager.get(jsonPath));
      this.skeleton = new spine.Skeleton(data);
      this.skeleton.setSkinByName(this.skin);
      this.skeleton.setSlotsToSetupPose();
      this.atlasTexture = atlas.pages[0]?.texture || null;
      this.collectChromaAttachments(data);
      this.applyTeamChroma();
      this.applyPalette(this.palette);

      const stateData = new spine.AnimationStateData(data);
      stateData.defaultMix = 0.09;
      this.state = new spine.AnimationState(stateData);
      // Spine's Canvas renderer clips and draws the full atlas once per mesh
      // triangle. Render that expensive pose into a small reusable surface only
      // when the animation advances; ordinary frames become one cheap blit.
      this.poseCanvas = document.createElement('canvas');
      this.poseCanvas.width = 320;
      this.poseCanvas.height = 256;
      this.poseContext = this.poseCanvas.getContext('2d', { alpha: true });
      this.poseContext.imageSmoothingEnabled = false;
      this.renderer = new spine.canvas.SkeletonRenderer(this.poseContext);
      // Ash uses weighted meshes for her torso, hood, and clothing.
      this.renderer.triangleRendering = true;
      this.setState('idle', true);
      this.ready = true;
      return this;
    }

    setState(logicalState, immediate = false) {
      if (!this.state) return;
      const next = this.animationMap[logicalState] || this.animationMap.idle || ANIMATIONS.idle;
      if (!immediate && this.currentState === logicalState) return;
      if (immediate) this.state.clearTracks();
      this.state.setAnimation(0, next.name, next.loop);
      this.currentState = logicalState;
      this.currentAnimation = next.name;
      this.poseDirty = true;
    }

    update(delta, logicalState) {
      if (!this.ready) return;
      this.setState(logicalState);
      this.state.update(delta);
      this.state.apply(this.skeleton);
      // Sword clips do not key the Gun slot, so Spine's short crossfade can
      // otherwise leave the previously drawn pistol visible over the slash.
      // Keep the weapon silhouette unambiguous for the full melee state.
      if (DRAWN_SWORD_STATES.has(logicalState)) {
        this.skeleton.findSlot('Gun')?.setAttachment(null);
      }
      this.poseDirty = true;
    }

    listBaseSkins() {
      return this.skeleton?.data?.skins?.map(skin => skin.name) || [];
    }

    setBaseSkin(name) {
      if (!this.skeleton || !this.listBaseSkins().includes(name)) return false;
      this.skin = name;
      this.skeleton.setSkinByName(name);
      this.skeleton.setSlotsToSetupPose();
      this.applyPalette(this.palette);
      this.poseDirty = true;
      return true;
    }

    collectChromaAttachments(data) {
      const seen = new Set();
      this.chromaAttachments = [];
      for (const skin of data.skins || []) {
        for (let slotIndex = 0; slotIndex < skin.attachments.length; slotIndex += 1) {
          const slotName = data.slots[slotIndex]?.name || '';
          if (!costumeSlot(slotName)) continue;
          for (const attachment of Object.values(skin.attachments[slotIndex] || {})) {
            if (!attachment?.region || seen.has(attachment)) continue;
            seen.add(attachment);
            this.chromaAttachments.push({ attachment, region: attachment.region, slotName });
          }
        }
      }
    }

    makeChromaTexture(source, color) {
      const image = this.atlasTexture?.getImage?.();
      if (!image || !image.width || !image.height) return null;
      const canvas = document.createElement('canvas');
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      context.drawImage(image, 0, 0);
      const target = colorChannels(color);
      const targetHsl = rgbToHsl(target.r, target.g, target.b);
      const regions = new Map();
      for (const item of this.chromaAttachments) {
        const region = item.region;
        const packedWidth = region.rotate ? region.height : region.width;
        const packedHeight = region.rotate ? region.width : region.height;
        const key = `${region.x},${region.y},${packedWidth},${packedHeight}`;
        const existing = regions.get(key);
        const role = /head/i.test(item.slotName) ? 'head' : 'body';
        if (existing) existing.role = existing.role === 'head' || role === 'head' ? 'head' : 'body';
        else regions.set(key, { region, role, packedWidth, packedHeight });
      }
      // Only scan atlas rectangles actually referenced by costume attachments.
      // This avoids a multi-million-pixel main-thread pass when a color changes.
      for (const entry of regions.values()) {
        const { region, role, packedWidth, packedHeight } = entry;
        const x = Math.max(0, Math.floor(region.x));
        const y = Math.max(0, Math.floor(region.y));
        const width = Math.min(canvas.width - x, Math.ceil(packedWidth));
        const height = Math.min(canvas.height - y, Math.ceil(packedHeight));
        if (width <= 0 || height <= 0) continue;
        const pixels = context.getImageData(x, y, width, height);
        const replacementHue = source === 'ash' && role === 'head' ? (targetHsl.h + .5) % 1 : targetHsl.h;
        for (let index = 0; index < pixels.data.length; index += 4) {
          if (!pixels.data[index + 3] || !sourceMaterial(source, role, pixels.data[index], pixels.data[index + 1], pixels.data[index + 2])) continue;
          const material = rgbToHsl(pixels.data[index] / 255, pixels.data[index + 1] / 255, pixels.data[index + 2] / 255);
          const [r, g, b] = hslToRgb(replacementHue, Math.max(.42, targetHsl.s * Math.min(1, material.s + .18)), material.l);
          pixels.data[index] = r;
          pixels.data[index + 1] = g;
          pixels.data[index + 2] = b;
        }
        context.putImageData(pixels, x, y);
      }
      return new spine.Texture(canvas);
    }

    applyTeamChroma() {
      if (!this.teamChroma || !this.atlasTexture || !this.chromaAttachments.length) return false;
      this.chromaTexture = this.makeChromaTexture(this.teamChroma.source, this.teamChroma.color);
      if (!this.chromaTexture) return false;
      for (const item of this.chromaAttachments) {
        const region = Object.assign(Object.create(Object.getPrototypeOf(item.region)), item.region, { texture: this.chromaTexture });
        // Mesh rendering reads through region.renderObject while ordinary
        // attachments read region.texture. Point both at the recolored clone.
        region.renderObject = region;
        item.attachment.region = region;
      }
      this.poseDirty = true;
      return true;
    }

    applyPalette(palette = {}) {
      this.palette = {
        head: normalizeHex(palette.head || this.palette.head),
        body: normalizeHex(palette.body || this.palette.body),
        gear: normalizeHex(palette.gear || this.palette.gear),
        weapon: normalizeHex(palette.weapon || this.palette.weapon)
      };
      if (!this.skeleton) return this.palette;
      for (const slot of this.skeleton.slots) {
        const channels = colorChannels(this.palette[slotGroup(slot.data.name)]);
        slot.color.r = channels.r;
        slot.color.g = channels.g;
        slot.color.b = channels.b;
      }
      return { ...this.palette };
    }

    setTeamChroma(source, color) {
      // This is a material replacement, not a flat character tint. Only red
      // Ash or blue P2 pixels on costume attachments are replaced. The same
      // head images retain their skin/hair pixels, and all weapon attachments
      // continue to use the untouched source texture.
      const next = { source: source === 'p2' ? 'p2' : 'ash', color: normalizeHex(color) };
      if (this.teamChroma?.source === next.source && this.teamChroma?.color === next.color) return { ...this.palette };
      this.teamChroma = next;
      this.applyTeamChroma();
      return this.applyPalette({ head: '#ffffff', body: '#ffffff', gear: '#ffffff', weapon: '#ffffff' });
    }

    getAppearance() {
      return { baseSkin: this.skin, palette: { ...this.palette } };
    }

    draw(x, y, facing, stretch = 1, squash = 1) {
      if (!this.ready) return;
      if (this.poseDirty) {
        const skeleton = this.skeleton;
        this.poseContext.clearRect(0, 0, this.poseCanvas.width, this.poseCanvas.height);
        skeleton.x = this.poseAnchor.x;
        skeleton.y = this.poseAnchor.y;
        skeleton.scaleX = 1;
        skeleton.scaleY = -1;
        skeleton.updateWorldTransform();
        this.renderer.draw(skeleton);
        this.poseDirty = false;
      }
      this.context.save();
      this.context.translate(Math.round(x), Math.round(y));
      this.context.scale(facing * stretch, squash);
      this.context.drawImage(this.poseCanvas, -this.poseAnchor.x, -this.poseAnchor.y);
      this.context.restore();
    }
  }

  window.BulletAgeCharacter = BulletAgeCharacter;
  window.ASH_DEFAULT_PALETTE = DEFAULT_PALETTE;
  window.AshCharacter = class AshCharacter extends BulletAgeCharacter {
    constructor(context) {
      super(context, { assetName: 'Ash', basePath: 'assets/ash' });
    }
  };
})();
