// node tools/interact-video.mjs <out.mp4> [startClock]  (~16s: drag, then click -> shatter -> reform)
import { chromium } from 'playwright';
import ffmpeg from 'ffmpeg-static';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';

const out = process.argv[2] || 'interaction.mp4';
const start = parseFloat(process.argv[3] || '80');
const FPS = 15, dir = '/tmp/ixv';
fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto(process.env.URL || 'http://localhost:5173/');
await page.waitForFunction(() => window.__setClock, null, { timeout: 60000 });
await page.evaluate((c) => window.__setClock(c), start);
let n = 0;
const frame = async () => {
  await page.evaluate((d) => window.__advance(d, true), 1 / FPS);
  await page.screenshot({ path: `${dir}/f${String(n++).padStart(4, '0')}.png` });
};
const T = 16 * FPS;
for (let f = 0; f < T; f++) {
  const t = f / FPS;
  if (t >= 0.8 && t < 3.4) { // two slow fingertip sweeps
    const u = (t - 0.8) / 2.6;
    const [a, b] = u < 0.5 ? [u * 2, 0] : [(u - 0.5) * 2, 1];
    const x = b ? 980 - a * 680 : 300 + a * 680;
    const y = (b ? 470 : 330) - Math.sin(a * Math.PI) * 120;
    await page.mouse.move(x, y, { steps: 2 });
  }
  if (Math.abs(t - 4.4) < 0.5 / FPS) await page.mouse.click(660, 360);
  await frame();
}
await browser.close();
spawnSync(ffmpeg, ['-y', '-framerate', String(FPS), '-i', `${dir}/f%04d.png`, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', out], { stdio: 'ignore' });
fs.rmSync(dir, { recursive: true, force: true });
console.log('wrote', out);
