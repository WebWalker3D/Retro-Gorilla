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
// Fires each special weapon in a 2-player match and screenshots the result.
import { chromium } from 'playwright';
const [url = 'http://localhost:5173/', out = 'shots'] = process.argv.slice(2);
const browser = await chromium.launch({ args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=vulkan'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.stack));
await page.goto(url);
await page.waitForFunction(() => window.__ready === true, null, { timeout: 60000 });
await page.getByRole('button', { name: 'Two players, one keyboard' }).click();
await page.getByRole('button', { name: 'Start match' }).click();
const shots = [
  { weapon: 'plantain', angle: 20, velocity: 30, at: [700, 2600] },
  { weapon: 'bunch', angle: 55, velocity: 52, at: [1500, 3000] },
  { weapon: 'rubber', angle: 35, velocity: 45, at: [1200, 3200] },
];
for (const [i, s] of shots.entries()) {
  await page.waitForFunction(() => window.__app.aiming !== null, null, { timeout: 60000 });
  await page.waitForTimeout(400);
  await page.evaluate((s) => window.__app.editAim(s), { weapon: s.weapon, angle: s.angle, velocity: s.velocity });
  await page.keyboard.press('Enter');
  let last = 0;
  for (const t of s.at) {
    await page.waitForTimeout(t - last);
    last = t;
    await page.screenshot({ path: `${out}/w${i}-${s.weapon}-${t}.png` });
  }
  await page.keyboard.press('s');
}
console.log(errors.length ? 'ERRORS:\n' + [...new Set(errors)].join('\n') : 'no errors');
await browser.close();
