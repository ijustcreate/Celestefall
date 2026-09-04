/*
 * Repeatable local benchmark for BCD Encore Royale.
 *
 * Usage (PowerShell):
 *   python -m http.server 4180 --bind ::1 --directory docs
 *   node tests/mobile-performance.mjs http://[::1]:4180/ output/performance
 *
 * The run emulates common portrait/landscape phone viewports, records startup
 * resources, heap (where Chromium exposes it), long tasks, and a five-second
 * active arena sample. It also exercises iframe embedding and verifies that
 * Player2 source assets are shared while individual rigs still render.
 */
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

const require = createRequire('C:/Users/17148/.codex/skills/develop-web-game/package.json');
const { chromium } = require('playwright');
const baseUrl = process.argv[2] || 'http://[::1]:4180/';
const outputDir = process.argv[3] || 'output/performance';
const sampleMs = Number(process.env.BENCH_SAMPLE_MS || 5000);
const selectedProfiles = new Set((process.env.BENCH_PROFILES || '').split(',').filter(Boolean));
fs.mkdirSync(outputDir, { recursive: true });

const profiles = [
  { id: 'phone-portrait-60', width: 390, height: 844, dpr: 3, refreshHz: 60 },
  { id: 'phone-landscape-60', width: 844, height: 390, dpr: 3, refreshHz: 60 },
  { id: 'phone-portrait-120', width: 390, height: 844, dpr: 3, refreshHz: 120 },
  { id: 'phone-landscape-120', width: 844, height: 390, dpr: 3, refreshHz: 120 }
];

const percentile = (values, p) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p))];
};

async function sample(page, profile, embedded) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Performance.enable');
  await page.addInitScript(() => {
    const startedAt = performance.now();
    const benchmark = window.__encoreBenchmark = { startedAt, readyAt: null, completedLoads: 0, expectedLoads: 7 };
    let characterClass;
    Object.defineProperty(window, 'BulletAgeCharacter', {
      configurable: true,
      get: () => characterClass,
      set: value => {
        characterClass = value;
        const originalLoad = value.prototype.load;
        value.prototype.load = async function measuredLoad(...args) {
          try {
            return await originalLoad.apply(this, args);
          } finally {
            benchmark.completedLoads += 1;
            if (benchmark.completedLoads === benchmark.expectedLoads) benchmark.readyAt = performance.now();
          }
        };
        Object.defineProperty(window, 'BulletAgeCharacter', { configurable: true, writable: true, value });
      }
    });
  });
  const errors = [];
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', error => errors.push(String(error)));
  const url = embedded ? new URL('iframe-harness.html', baseUrl).toString() : baseUrl;
  const startedAt = Date.now();
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  if (embedded) await page.locator('iframe').waitFor({ state: 'attached' });
  const target = embedded
    ? await (async () => {
      for (let attempt = 0; attempt < 20; attempt += 1) {
        const frame = page.frames().find(candidate => candidate !== page.mainFrame() && candidate.url().startsWith(baseUrl));
        if (frame) return frame;
        await page.waitForTimeout(100);
      }
      return null;
    })()
    : page.mainFrame();
  if (!target) throw new Error(`Embedded game frame was not available: ${page.frames().map(frame => frame.url()).join(', ')}`);
  await target.waitForFunction(() => window.__encoreBenchmark?.completedLoads === window.__encoreBenchmark?.expectedLoads);
  const startupMs = Date.now() - startedAt;
  const result = await target.evaluate(async ({ profile, embedded, sampleMs }) => {
    const longTasks = [];
    const observer = new PerformanceObserver(list => longTasks.push(...list.getEntries().map(entry => entry.duration)));
    observer.observe({ type: 'longtask', buffered: true });
    const frames = [];
    let previous = performance.now();
    const until = previous + sampleMs;
    await new Promise(resolve => {
      const tick = now => {
        frames.push(now - previous); previous = now;
        if (now < until) requestAnimationFrame(tick); else resolve();
      };
      requestAnimationFrame(tick);
    });
    observer.disconnect();
    const navigation = performance.getEntriesByType('navigation')[0];
    const resources = performance.getEntriesByType('resource').map(entry => ({
      name: entry.name.split('/').pop(), transferSize: entry.transferSize, decodedBodySize: entry.decodedBodySize, duration: entry.duration
    }));
    const state = JSON.parse(window.render_game_to_text());
    return {
      expectedFrameMs: 1000 / profile.refreshHz,
      frameMs: frames.slice(1), longTasks, navigation: navigation && {
        domContentLoaded: navigation.domContentLoadedEventEnd,
        load: navigation.loadEventEnd
      }, resources, state,
      embedded: document.body.classList.contains('is-embedded'),
      readyAt: window.__encoreBenchmark.readyAt - window.__encoreBenchmark.startedAt,
      assetCache: window.BulletAgeCharacter?.getAssetCacheStats?.() || null,
      heap: performance.memory ? { used: performance.memory.usedJSHeapSize, total: performance.memory.totalJSHeapSize } : null
    };
  }, { profile, embedded, sampleMs });
  const metrics = await cdp.send('Performance.getMetrics');
  const byName = Object.fromEntries(metrics.metrics.map(item => [item.name, item.value]));
  return {
    profile: profile.id, embeddedRequested: embedded, startupMs, errors,
    ...result,
    cdp: { jsHeapUsed: byName.JSHeapUsedSize || null, nodes: byName.Nodes || null }
  };
}

const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader'] });
const results = [];
try {
  for (const profile of profiles.filter(profile => !selectedProfiles.size || selectedProfiles.has(profile.id))) {
    for (const embedded of [false, true]) {
      const context = await browser.newContext({ viewport: profile, deviceScaleFactor: profile.dpr, isMobile: true, hasTouch: true });
      const page = await context.newPage();
      const data = await sample(page, profile, embedded);
      data.frame = {
        count: data.frameMs.length,
        average: data.frameMs.reduce((sum, value) => sum + value, 0) / data.frameMs.length,
        p95: percentile(data.frameMs, .95),
        worst: Math.max(...data.frameMs),
        overTargetBudget: data.frameMs.filter(value => value > data.expectedFrameMs * 1.2).length,
        targetRefreshHz: profile.refreshHz,
        observedRefreshHz: 1000 / (data.frameMs.reduce((sum, value) => sum + value, 0) / data.frameMs.length)
      };
      delete data.frameMs;
      results.push(data);
      await page.screenshot({ path: path.join(outputDir, `${profile.id}-${embedded ? 'iframe' : 'standalone'}.png`) });
      await context.close();
    }
  }
} finally {
  await browser.close();
}

fs.writeFileSync(path.join(outputDir, 'mobile-performance.json'), JSON.stringify(results, null, 2));
console.log(JSON.stringify(results.map(result => ({ profile: result.profile, embedded: result.embeddedRequested, startupMs: result.startupMs, frame: result.frame, errors: result.errors.length, assetCache: result.assetCache })), null, 2));
