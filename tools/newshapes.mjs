// node tools/newshapes.mjs <outdir>: sunflower + breathing block, loop settles and click-reached
import { chromium } from 'playwright';
import fs from 'node:fs';
const out = process.argv[2] || 'shots';
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
await page.goto(process.env.URL || 'http://localhost:5173/');
await page.waitForFunction(() => window.__setClock, null, { timeout: 60000 });
const adv = (dt, r = false) => page.evaluate(([d, rr]) => window.__advance(d, rr), [dt, r]);
const shot = async (n) => { await adv(0, true); await page.screenshot({ path: `${out}/${n}.png` }); console.log('shot', n); };
const at = async (c, n) => { await page.evaluate((x) => window.__setClock(x), c); await adv(0.05); await shot(n); };
await page.evaluate(() => window.__setClock(66)); for (let k = 0; k < 14; k++) await adv(0.5); await shot('loop-galaxy2');
await at(173, 'loop-block-contracted');
await at(169.5, 'loop-block-expanded');
await at(58, 'loop-trans-into-galaxy2');
await at(155, 'loop-trans-into-block');
// click chain: 4th click -> sunflower, 5th -> block
await page.evaluate((x) => window.__setClock(x), 20);
for (let n = 1; n <= 5; n++) {
  await page.mouse.click(640, 360);
  await adv(2.5); if (n === 4) await shot('click-galaxy2-reform');
  await adv(4.7);
  if (n >= 4) await shot('click-' + (n === 4 ? 'galaxy2' : 'block'));
  if (n === 5) { await adv(1.75); await shot('click-block-expanded'); }
  await adv(22);
}
await browser.close();
console.log('errors:', errors.length ? errors.slice(0, 5) : 'none');
