// Plays a vs-CPU match where the human always throws the perfect shot, screenshotting the KO flow.
import { chromium } from 'playwright';
const [url = 'http://localhost:5199/', out = 'shots'] = process.argv.slice(2);
const browser = await chromium.launch({ args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=vulkan'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.stack));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.goto(url);
await page.waitForFunction(() => window.__ready === true && window.__best, null, { timeout: 60000 });
await page.getByRole('button', { name: 'Play against the CPU' }).click();
await page.getByRole('button', { name: 'Start match' }).click();
await page.waitForTimeout(1500);
for (let i = 0; i < 3; i++) {
  await page.waitForFunction(() => window.__app.aiming === 0, null, { timeout: 60000 });
  await page.evaluate(() => { const s = window.__best(); window.__app.editAim({ angle: s.angle, velocity: s.velocity, weapon: s.weapon }); });
  await page.waitForTimeout(300);
  if (i === 0) await page.screenshot({ path: `${out}/k0-aim.png` });
  await page.keyboard.press('Enter');
  await page.waitForTimeout(i === 0 ? 3300 : 1500);
  if (i === 0) await page.screenshot({ path: `${out}/k1-hit.png` });
  if (i === 0) { await page.waitForTimeout(2600); await page.screenshot({ path: `${out}/k2-celebrate.png` }); }
}
await page.waitForSelector('#results', { timeout: 60000 });
await page.waitForTimeout(800);
await page.screenshot({ path: `${out}/k3-results.png` });
console.log('state:', JSON.stringify(await page.evaluate(() => ({ scores: window.__app.match.scores, round: window.__app.match.round, over: window.__app.match.over }))));
console.log(errors.length ? 'ERRORS:\n' + [...new Set(errors)].join('\n') : 'no errors');
await browser.close();
