// Headless Spine regression: node tests/idle-head.mjs [URL] [output directory]
import { createRequire } from 'node:module';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const require = createRequire('C:/Users/17148/.codex/skills/develop-web-game/package.json');
const { chromium } = require('playwright');
const out = process.argv[3] || 'output/idle-head';
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
await page.goto(process.argv[2] || 'http://127.0.0.1:4193/');
await page.waitForFunction(() => window.BulletAgeCharacter && window.spine);
const result = await page.evaluate(async () => {
  const canvas = document.createElement('canvas');
  canvas.width = 1000; canvas.height = 480;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#313445'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  const report = {};
  for (const [row, assetName, basePath] of [[0, 'Player2', 'assets/player2'], [1, 'Ash', 'assets/ash']]) {
    const rig = new BulletAgeCharacter(ctx, { assetName, basePath });
    await rig.load();
    const head = rig.skeleton.findSlot('Heads');
    const measure = () => {
      rig.skeleton.updateWorldTransform();
      const a = head.getAttachment(), b = head.bone;
      const vertices = new Float32Array(8);
      a.computeWorldVertices(b, vertices, 0, 2);
      return { name: a.name, width: Math.hypot(vertices[6]-vertices[0],vertices[7]-vertices[1]),
        height: Math.hypot(vertices[2]-vertices[0],vertices[3]-vertices[1]),
        x: b.worldX, y: b.worldY, scaleX: b.scaleX, scaleY: b.scaleY };
    };
    const frames = [];
    for (let frame = 0; frame < 1200; frame++) {
      rig.update(1/120, 'idle');
      frames.push(measure());
    }
    const names = [...new Set(frames.map(f => f.name))];
    const extent = key => Math.max(...frames.map(f => f[key])) - Math.min(...frames.map(f => f[key]));
    const jump = key => Math.max(...frames.slice(1).map((f,i) => Math.abs(f[key]-frames[i][key])));
    report[assetName] = { names, widthRange: extent('width'), heightRange: extent('height'),
      maxWidthStep: jump('width'), maxHeightStep: jump('height'), maxPositionStep: Math.max(jump('x'),jump('y')),
      idleBob: extent('y'), scaleXRange: extent('scaleX'), scaleYRange: extent('scaleY') };
    for (const [col, time] of [0.4917, 0.5, 0.6583, 0.675, 1.0].entries()) {
      rig.setState('idle', true); rig.update(time, 'idle');
      ctx.save(); ctx.translate(col * 200 + 100, row * 240 + 215); ctx.scale(4,4);
      rig.draw(0, 0, 1); ctx.restore();
      ctx.fillStyle = '#fff'; ctx.font = '14px sans-serif';
      ctx.fillText(`${assetName}: ${time.toFixed(4)}s`, col * 200 + 12, row * 240 + 20);
    }
    const transitions = [];
    for (const from of ['run','jump','fall','crouch','cling','shoot','melee','dash','hit','death']) {
      rig.setState(from, true); rig.update(.2, from);
      const settled = [];
      for (let i=0; i<300; i++) {
        rig.update(1/120, 'idle');
        const f = measure();
        if (![f.width,f.height,f.x,f.y].every(Number.isFinite)) throw Error(`${assetName}: invalid ${from} transition`);
        if (i > 24) settled.push(f);
      }
      transitions.push({ from, names: [...new Set(settled.map(f => f.name))],
        widthRange: Math.max(...settled.map(f=>f.width))-Math.min(...settled.map(f=>f.width)),
        heightRange: Math.max(...settled.map(f=>f.height))-Math.min(...settled.map(f=>f.height)) });
    }
    report[assetName].transitions = transitions;
  }
  return { report, image: canvas.toDataURL('image/png') };
});
fs.writeFileSync(`${out}/frames.png`, Buffer.from(result.image.split(',')[1], 'base64'));
fs.writeFileSync(`${out}/metrics.json`, JSON.stringify({ ...result.report, errors }, null, 2));
console.log(JSON.stringify({ ...result.report, errors }, null, 2));
await browser.close();
assert.deepEqual(errors, []);
for (const [name, metrics] of Object.entries(result.report)) {
  assert.equal(metrics.names.length, 2, `${name} must still blink`);
  assert.ok(metrics.maxWidthStep < .001 && metrics.maxHeightStep < .001, `${name} head size pops`);
  assert.ok(metrics.idleBob > .01, `${name} idle motion must remain active`);
  assert.ok(metrics.maxPositionStep < .05, `${name} head position jumps`);
  for (const transition of metrics.transitions) {
    assert.equal(transition.names.length, 2, `${name} blink after ${transition.from}`);
    assert.ok(transition.widthRange < .001 && transition.heightRange < .001, `${name} size after ${transition.from}`);
  }
}
