// node tools/wake.mjs <outdir> [startClock]: 1s straight drag vs no-pointer reference, frames at +0.05/1/2/4/6s, diffs + metrics
import { chromium } from 'playwright';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const out = process.argv[2] || 'wake';
const start = parseFloat(process.argv[3] || '80');
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
await page.goto(process.env.URL || 'http://localhost:5173/');
await page.waitForFunction(() => window.__setClock, null, { timeout: 60000 });
const adv = (dt, r = false) => page.evaluate(([d, rr]) => window.__advance(d, rr), [dt, r]);
const OFFS = [0.05, 1, 2, 4, 6];
const X0 = 300, X1 = 980, Y = 360, N = 40;

async function run(label, drag) {
  await page.evaluate((c) => window.__setClock(c), start);
  if (drag) await page.mouse.move(X0, Y);
  await adv(0.025);
  for (let i = 0; i <= N; i++) {
    if (drag) await page.mouse.move(X0 + (X1 - X0) * (i / N), Y);
    await adv(1 / N);
  }
  let t = 0;
  for (const o of OFFS) {
    await adv(o - t); t = o;
    await adv(0, true);
    await page.screenshot({ path: `${out}/${label}-${o}s.png` });
  }
}
await run('ref', false);
await run('drag', !process.env.NODRAG);
await browser.close();
console.log('errors:', errors.length ? errors.slice(0, 5) : 'none');
const r = spawnSync('python3', ['tools/wake_diff.py', out, OFFS.join(','), String(X1)], { stdio: 'inherit' });
