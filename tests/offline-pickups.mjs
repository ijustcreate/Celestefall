import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const require = createRequire('C:/Users/17148/.codex/skills/develop-web-game/package.json');
const { chromium } = require('playwright');
const browser = await chromium.launch({headless:true});
try {
  const page = await browser.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => { Math.random = () => .25; window.requestAnimationFrame = () => 1; });
  await page.goto(process.argv[2] || 'http://127.0.0.1:4197/?admin=1');
  await page.waitForFunction(() => window.__celestefallTest && JSON.parse(window.render_game_to_text()).creatures.every(c => c.rigAnimation));
  const result = await page.evaluate(() => {
    const read = () => JSON.parse(window.render_game_to_text());
    window.__celestefallTest.hitPlayer(2);
    window.__celestefallTest.damageCreature('slug-west',2);
    window.advanceTime(4*1000/60);
    return read();
  });
  assert.equal(result.player.health,1); assert.equal(result.hearts.length,1);
  assert.equal(result.room.connected,false); assert.equal(result.room.authoritative,false);
  fs.mkdirSync('output/offline-pickups',{recursive:true});
  await page.screenshot({path:'output/offline-pickups/heart.png'});
  const healed = await page.evaluate(() => {
    window.__celestefallTest.setPlayerPosition(420,336);
    window.advanceTime(36*1000/60);
    return JSON.parse(window.render_game_to_text());
  });
  assert.equal(healed.hearts.length,0); assert.equal(healed.player.health,2);
  assert.deepEqual(errors,[]);
  console.log('PASS: offline practice uses same drop/heal rules and restores actual health');
} finally { await browser.close(); }
