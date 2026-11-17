import { chromium } from 'playwright';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import ffmpeg from 'ffmpeg-static';

const [out, start, dur, fps = '12'] = process.argv.slice(2);
const dir = '/tmp/vframes';
fs.rmSync(dir, { recursive: true, force: true });
fs.mkdirSync(dir, { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto(process.env.URL || 'http://localhost:5173/');
await page.waitForFunction(() => window.__setClock);
const n = Math.round(Number(dur) * Number(fps));
for (let i = 0; i < n; i++) {
  await page.evaluate((c) => window.__setClock(c), Number(start) + i / Number(fps));
  await page.screenshot({ path: `${dir}/f${String(i).padStart(4, '0')}.jpg`, type: 'jpeg', quality: 92 });
}
await browser.close();
execFileSync(ffmpeg, ['-y', '-framerate', fps, '-i', `${dir}/f%04d.jpg`, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', out]);
