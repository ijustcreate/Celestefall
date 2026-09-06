// Real launcher + embedded game regression; no BCD credentials or visible windows.
import { createRequire } from 'node:module';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const require = createRequire('C:/Users/17148/.codex/skills/develop-web-game/package.json');
const { chromium } = require('playwright');
const root = path.resolve('docs');
const launcher = 'C:/Users/17148/Desktop/BCD Karaokoe Site/behind-closed-doors-codex-handoff/encore-royale-launcher.js';
const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  if (pathname === '/parent') {
    res.setHeader('Content-Type', 'text/html');
    res.end(`<html class="pwa-standalone"><body><div class="shell"></div><script>
      window.account={id:'test-account',name:'Felix'}; window.currentUser=()=>window.account;
      window.state={history:[]}; window.ENCORE_ROYALE_URL='/index.html?embed=1';
      </script><script src="/launcher.js"></script></body></html>`); return;
  }
  const file = pathname === '/launcher.js' ? launcher : path.join(root, pathname === '/' ? 'index.html' : pathname);
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); res.end(); return; }
  res.setHeader('Content-Type', ({'.html':'text/html','.js':'text/javascript','.json':'application/json','.png':'image/png','.css':'text/css'})[path.extname(file)] || 'application/octet-stream');
  res.end(fs.readFileSync(file));
});
await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
const url = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({headless:true});
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => { errors.push(e.message); console.error('PAGE ERROR:', e.message); });
  // Observe production room profile calls without opening a live room.
  await page.addInitScript(() => {
    if (window.parent === window) return;
    let Room;
    Object.defineProperty(window,'EncoreRoom',{configurable:true,get:()=>Room,set:value=>{
      Room=class extends value {
        constructor(...args){super(...args); window.testRoom=this; this.trackedNames=[];}
        async connect(){return false;}
        async track(){this.trackedNames.push(this.player.name);}
      };
    }});
  });
  await page.goto(`${url}/parent`);
  await page.evaluate(()=>window.openEncoreRoyale());
  await page.waitForSelector('iframe');
  const frame = page.frames().find(f=>f.parentFrame());
  await frame.waitForFunction(()=>window.render_game_to_text && JSON.parse(window.render_game_to_text()).player.name==='Felix');
  assert.equal(await frame.evaluate(()=>window.testRoom.player.name),'Felix');
  await page.evaluate(()=>window.account={id:'another-account',name:'  Zoë Chen  '});
  await frame.waitForFunction(()=>JSON.parse(window.render_game_to_text()).player.name==='Zoë Chen');
  assert.equal(await frame.evaluate(()=>window.testRoom.player.name),'Zoë Chen');
  assert.ok(await frame.evaluate(()=>window.testRoom.trackedNames.includes('Zoë Chen')));
  // A message from an unrelated sender must not override the parent identity.
  await frame.evaluate(()=>window.dispatchEvent(new MessageEvent('message',{data:{type:'bcd:encore:init',payload:{playerName:'Imposter'}},source:window,origin:location.origin})));
  assert.equal(await frame.evaluate(()=>JSON.parse(window.render_game_to_text()).player.name),'Zoë Chen');
  await page.evaluate(()=>window.account=null);
  await frame.waitForFunction(()=>JSON.parse(window.render_game_to_text()).player.name==='Climber');
  assert.deepEqual(errors,[]);
  console.log('PASS: real launcher -> embedded game, account change/rename -> room profile, guest fallback, rejected non-parent message; no page errors.');
} finally { await browser.close(); server.close(); }
