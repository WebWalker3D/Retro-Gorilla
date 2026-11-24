/*
 * The contents of this file are subject to the Common Public Attribution License
 * Version 1.0 (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 * https://github.com/WebWalker3D/Retro-Gorilla/blob/main/LICENSE. The License is
 * based on the Mozilla Public License Version 1.1 but Sections 14 and 15 have been
 * added to cover use of software over a computer network and provide for limited
 * attribution for the Original Developer. In addition, Exhibit A has been modified
 * to be consistent with Exhibit B.
 *
 * Software distributed under the License is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License for the
 * specific language governing rights and limitations under the License.
 *
 * The Original Code is Retro Gorilla.
 * The Initial Developer of the Original Code is Blaine Bouvier. All portions of the
 * code written by Blaine Bouvier are Copyright (c) 2026. All Rights Reserved.
 */
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
