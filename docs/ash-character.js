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
    dash: { name: 'Dash_Pistol', loop: false },
    hit: { name: 'Hit_Pistol', loop: false },
    death: { name: 'Death', loop: false }
  };

  class BulletAgeCharacter {
    constructor(context, options = {}) {
      this.context = context;
      this.assetName = options.assetName || 'Ash';
      this.basePath = options.basePath || 'assets/ash';
      this.scale = options.scale || 0.086;
      this.skin = options.skin || 'pistol_01';
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

      const stateData = new spine.AnimationStateData(data);
      stateData.defaultMix = 0.09;
      this.state = new spine.AnimationState(stateData);
      this.renderer = new spine.canvas.SkeletonRenderer(this.context);
      // Ash uses weighted meshes for her torso, hood, and clothing.
      this.renderer.triangleRendering = true;
      this.setState('idle', true);
      this.ready = true;
      return this;
    }

    setState(logicalState, immediate = false) {
      if (!this.state) return;
      const next = ANIMATIONS[logicalState] || ANIMATIONS.idle;
      if (!immediate && this.currentState === logicalState) return;
      if (immediate) this.state.clearTracks();
      this.state.setAnimation(0, next.name, next.loop);
      this.currentState = logicalState;
      this.currentAnimation = next.name;
    }

    update(delta, logicalState) {
      if (!this.ready) return;
      this.setState(logicalState);
      this.state.update(delta);
      this.state.apply(this.skeleton);
    }

    draw(x, y, facing, stretch = 1, squash = 1) {
      if (!this.ready) return;
      const skeleton = this.skeleton;
      skeleton.x = x;
      skeleton.y = y;
      skeleton.scaleX = facing * stretch;
      skeleton.scaleY = -squash;
      skeleton.updateWorldTransform();
      this.renderer.draw(skeleton);
    }
  }

  window.BulletAgeCharacter = BulletAgeCharacter;
  window.AshCharacter = class AshCharacter extends BulletAgeCharacter {
    constructor(context) {
      super(context, { assetName: 'Ash', basePath: 'assets/ash' });
    }
  };
})();
