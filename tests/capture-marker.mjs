// Exercise the shipped renderer with authoritative snapshot-shaped state.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const require = createRequire('C:/Users/17148/.codex/skills/develop-web-game/package.json');
const { chromium } = require('playwright');
const source = fs.readFileSync('docs/game.js', 'utf8');
const draw = source.slice(source.indexOf('  function drawCaptureZones() {'), source.indexOf('\n  function drawRespawnEffects()'));
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1000, height: 220 } });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
await page.setContent('<canvas width="1000" height="220"></canvas>');
const results = await page.evaluate(draw => {
  const canvas = document.querySelector('canvas'), ctx = canvas.getContext('2d');
  ctx.fillStyle = '#252132'; ctx.fillRect(0, 0, 1000, 220);
  const CAPTURE_FRAMES = 180;
  const CAPTURE_ZONES = [{ id: 'test', x: 20, y: 168, w: 74, h: 62, label: 'BACKSTAGE' }];
  const CAPTURE_MARKER_Y = new Map([['test', 90]]);
  const game = { camera: { x: 0, y: 0 }, loadout: { color: '#55ff99' }, captureProgress: new Map(), capturedZones: new Map(), captureProgressByColor: new Map(), captureContested: new Set() };
  const render = eval(`(${draw})`);
  const cases = [
    { name: 'Empty', colors: {} },
    { name: '25%', colors: { '#55ff99': 45 } },
    { name: '50%', colors: { '#55ff99': 90 } },
    { name: '75%', colors: { '#55ff99': 135 } },
    { name: 'Owned', owner: '#55ff99', colors: {} },
    { name: 'Other player', owner: '#55ff99', colors: { '#fa66aa': 90 } },
    { name: 'Same ID new color', owner: '#55ff99', colors: { '#88aaff': 90 }, local: '#88aaff' },
    { name: 'Contested', owner: '#55ff99', colors: { '#fa66aa': 90, '#88aaff': 45 }, contested: true },
    { name: 'Recaptured', owner: '#88aaff', colors: {} }
  ];
  return cases.map((scenario, i) => {
    const zone = CAPTURE_ZONES[0]; zone.x = 12 + i * 109;
    game.loadout.color = scenario.local || '#55ff99';
    game.captureProgressByColor.set('test', scenario.colors);
    game.capturedZones.clear();
    if (scenario.owner) game.capturedZones.set('test', { color: scenario.owner, contributors: [{ id: 'same-user', name: 'Owner' }] });
    game.captureContested = new Set(scenario.contested ? ['test'] : []);
    const fills = [], labels = [], borders = [];
    const oldFill = ctx.fillRect, oldText = ctx.fillText, oldStroke = ctx.strokeRect;
    ctx.fillRect = function(...rect) { fills.push({ color: this.fillStyle, alpha: this.globalAlpha, rect }); oldFill.apply(this, rect); };
    ctx.fillText = function(text, ...args) { labels.push(text); oldText.call(this, text, ...args); };
    ctx.strokeRect = function(...rect) { borders.push(this.strokeStyle); oldStroke.apply(this, rect); };
    render();
    ctx.fillRect = oldFill; ctx.fillText = oldText; ctx.strokeRect = oldStroke;
    ctx.fillStyle = '#fff'; ctx.font = '10px monospace'; ctx.textAlign = 'left'; ctx.fillText(scenario.name, zone.x, 70);
    return { name: scenario.name, fills: fills.filter(f => Math.abs(f.alpha - .72) < .01), labels, borders };
  });
}, draw);
for (const [index, height] of [[1, 14.5], [2, 29], [3, 43.5]]) {
  assert.equal(results[index].fills[0].rect[3], height);
  assert.equal(results[index].fills[0].rect[1] + height, 150, 'Fill remains anchored to bottom');
}
assert.equal(results[5].fills[0].color, '#fa66aa');
assert.equal(results[6].fills[0].color, '#88aaff');
assert.equal(results[5].borders[0], '#55ff99', 'Ownership remains until completion');
assert(results[6].labels.includes('50%'), 'Same-user color change shows recapture percent');
assert.equal(results[7].fills.length, 2);
assert(results[7].labels.includes('CONTESTED'));
assert.equal(results[8].borders[0], '#88aaff');
assert.equal(results[8].fills.length, 0);
assert.deepEqual(errors, []);
fs.mkdirSync('output/capture-marker', { recursive: true });
await page.screenshot({ path: 'output/capture-marker/scenarios.png' });
fs.writeFileSync('output/capture-marker/results.json', JSON.stringify(results, null, 2));
console.log('PASS: proportional fill, fixed bottom, ownership, remote color, same-user recolor, contest, completed recapture.');
await browser.close();
