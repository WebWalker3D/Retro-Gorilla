// Usage: node scripts/play.mjs <url> <outPrefix> <js-to-run> <ms,ms,...>
// Runs JS in the page after __ready, then screenshots at each offset (ms after running it).
import { chromium } from 'playwright';

const [url, prefix, js, offsets = '500', size = '1600x900'] = process.argv.slice(2);
const [width, height] = size.split('x').map(Number);
const browser = await chromium.launch({ args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=vulkan'] });
const page = await browser.newPage({ viewport: { width, height } });
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on("pageerror", (e) => logs.push(`[pageerror] ${e.stack}`));
await page.goto(url);
await page.waitForFunction(() => window.__ready === true, null, { timeout: 60000 });
const res = await page.evaluate(js);
console.log('result:', JSON.stringify(res));
let last = 0;
for (const o of offsets.split(',').map(Number)) {
  await page.waitForTimeout(o - last);
  last = o;
  await page.screenshot({ path: `${prefix}-${o}.png` });
}
console.log('info:', JSON.stringify(await page.evaluate(() => window.__info?.())));
const seen = new Set(); for (const l of logs) { const k = l.slice(0, 160); if (!seen.has(k)) { seen.add(k); console.log(l.slice(0, 2500)); } }
await browser.close();
