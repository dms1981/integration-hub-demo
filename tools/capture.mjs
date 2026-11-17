import { chromium } from 'playwright';
import fs from 'node:fs';

const url = process.env.URL || 'http://localhost:5173/';
const out = process.argv[2] || 'shots';
const times = (process.argv[3] || '6,12,19,27,34,42,50,57,64,72,80,87,95,102,110,117').split(',').map(Number);
const W = 1280, H = 720;
fs.mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: W, height: H } });
const errors = [];
page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) errors.push(m.type() + ': ' + m.text()); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
await page.goto(url);
await page.waitForFunction(() => window.__setClock, null, { timeout: 60000 });
for (const t of times) {
  await page.evaluate((c) => window.__setClock(c), t);
  await page.waitForTimeout(150);
  await page.screenshot({ path: `${out}/t${String(t).padStart(3, '0')}.png` });
  console.log('shot', t);
}
console.log('errors:', errors.length ? errors.slice(0, 10) : 'none');
await browser.close();
