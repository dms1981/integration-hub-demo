// Deterministic interaction capture: node tools/interact.mjs <outdir> [startClock]
import { chromium } from 'playwright';
import fs from 'node:fs';

const url = process.env.URL || 'http://localhost:5173/';
const out = process.argv[2] || 'shots';
const start = parseFloat(process.argv[3] || '80');
const W = 1280, H = 720;
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: W, height: H } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
await page.goto(url);
await page.waitForFunction(() => window.__setClock, null, { timeout: 60000 });
await page.evaluate((c) => window.__setClock(c), start);
const adv = (dt, r = false) => page.evaluate(([d, rr]) => window.__advance(d, rr), [dt, r]);
const shot = async (name) => { await adv(0, true); await page.screenshot({ path: `${out}/${name}.png` }); console.log('shot', name); };

await shot('base');
// drag a fingertip path across the sculpture
const path = [];
for (let i = 0; i <= 24; i++) { const u = i / 24; path.push([300 + u * 680, 420 - Math.sin(u * Math.PI) * 170 + Math.sin(u * 9) * 18]); }
await page.mouse.move(path[0][0], path[0][1]);
for (const [x, y] of path) { await page.mouse.move(x, y); await adv(0.025); }
await adv(0.1); await shot('drag-0.1s');
await adv(0.4); await shot('drag-0.5s');
await adv(1.5); await shot('drag-2s');
await adv(1.5); await shot('drag-3.5s');

// click: shatter, mid-reform, settled shape(s)
await page.mouse.click(640, 360);
await adv(0.15); await shot('click-shatter-0.15s');
await adv(0.45); await shot('click-shatter-0.6s');
await adv(1.2); await shot('click-reform-1.8s');
await adv(1.2); await shot('click-reform-3.0s');
await adv(2.6); await shot('click-shape-1-icosahedron');
await adv(1.5);
await page.mouse.click(760, 330); // chain: next shape
await adv(0.4); await shot('click2-shatter');
await adv(5.4); await shot('click2-shape-urchin');
await adv(0.5);
await page.mouse.click(500, 400);
await adv(6.0); await shot('click3-shape-moebius');
console.log('errors:', errors.length ? errors.slice(0, 10) : 'none');
await browser.close();
