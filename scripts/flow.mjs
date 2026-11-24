// End-to-end smoke run of the real UI: title → setup → match → drag-aim → throw → CPU turn.
// Usage: node scripts/flow.mjs <url> <outDir>
import { chromium } from 'playwright';

const [url = 'http://localhost:5199/', out = 'shots'] = process.argv.slice(2);
const browser = await chromium.launch({ args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=vulkan', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.stack));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.goto(url);
await page.waitForFunction(() => window.__ready === true, null, { timeout: 60000 });
await page.waitForTimeout(3500);
await page.screenshot({ path: `${out}/f1-title.png` });
await page.getByRole('button', { name: 'Play against the CPU' }).click();
await page.waitForTimeout(400);
await page.screenshot({ path: `${out}/f2-setup.png` });
await page.getByRole('button', { name: 'Start match' }).click();
await page.waitForTimeout(1800);
await page.screenshot({ path: `${out}/f3-aim.png` });
// slingshot drag: pull down-left from the centre
await page.mouse.move(800, 450);
await page.mouse.down();
await page.mouse.move(700, 520, { steps: 8 });
await page.mouse.move(640, 560, { steps: 8 });
await page.waitForTimeout(300);
await page.screenshot({ path: `${out}/f4-drag.png` });
const aim = await page.evaluate(() => ({ ...window.__app.aim[0] }));
await page.mouse.up();
await page.waitForTimeout(900);
await page.screenshot({ path: `${out}/f5-flight.png` });
await page.waitForTimeout(5000);
await page.screenshot({ path: `${out}/f6-cpu.png` });
await page.waitForTimeout(6000);
await page.screenshot({ path: `${out}/f7-later.png` });
console.log('aim after drag:', JSON.stringify(aim));
console.log('state:', JSON.stringify(await page.evaluate(() => ({ turn: window.__app.match.turn, scores: window.__app.match.scores, round: window.__app.match.round, stats: window.__app.match.stats }))));
console.log('info:', JSON.stringify(await page.evaluate(() => window.__info())));
console.log(errors.length ? 'ERRORS:\n' + [...new Set(errors)].join('\n') : 'no errors');
await browser.close();
