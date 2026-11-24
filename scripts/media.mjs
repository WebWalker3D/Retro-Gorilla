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
// Captures the README screenshots into media/ (PNG; convert as you like). Needs the dev server.
import { chromium } from 'playwright';
const [url = 'http://localhost:5173/', out = 'media'] = process.argv.slice(2);
const browser = await chromium.launch({ args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=vulkan'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
await page.goto(url);
await page.waitForFunction(() => window.__ready === true && window.__best, null, { timeout: 60000 });
await page.evaluate(() => { const a = window.__app; a.match.cond.timeOfDay = 'night'; a.match.cond.weather = 'clear'; a.stage.loadRound(a.match); });
await page.waitForTimeout(4000);
await page.screenshot({ path: `${out}/title.png` });
await page.getByRole('button', { name: 'Play against the CPU' }).click();
await page.getByRole('button', { name: 'Start match' }).click();
await page.waitForFunction(() => window.__app.aiming === 0, null, { timeout: 30000 });
await page.evaluate(() => { const a = window.__app; a.match.cond.timeOfDay = 'dusk'; a.match.cond.weather = 'clear'; a.stage.loadRound(a.match); });
await page.evaluate(() => { const s = window.__best(); window.__app.editAim({ angle: s.angle + 1, velocity: s.velocity, weapon: s.weapon }); });
await page.evaluate(() => (window.__app.settings.aimPreview = 'full'));
await page.evaluate(() => window.__app.editAim({}));
await page.waitForTimeout(800);
await page.screenshot({ path: `${out}/aim.png` });
await page.evaluate(() => { const s = window.__best(); window.__app.editAim({ angle: s.angle, velocity: s.velocity, weapon: s.weapon }); });
await page.keyboard.press('Enter');
await page.waitForFunction(() => window.__app.stage.cam.mode === 'orbit', null, { timeout: 30000 });
await page.waitForTimeout(450);
await page.screenshot({ path: `${out}/knockout.png` });
await page.waitForTimeout(2600);
await page.screenshot({ path: `${out}/victory.png` });
await browser.close();
