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
// Regression checks for app-level behaviour (needs the dev server). Exits non-zero on failure.
import { chromium } from 'playwright';
const [url = 'http://localhost:5173/'] = process.argv.slice(2);
const browser = await chromium.launch({ args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=vulkan', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const failures = [];
const check = (name, ok) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`); if (!ok) failures.push(name); };
await page.goto(url);
await page.waitForFunction(() => window.__ready === true && window.__best, null, { timeout: 60000 });

// 0. starting a match while the title-screen banana is mid-flight must still allow aiming
await page.waitForFunction(() => window.__app.inFlight === true, null, { timeout: 60000 });
await page.getByRole('button', { name: 'Play against the CPU' }).click();
await page.getByRole('button', { name: 'Start match' }).click();
await page.waitForFunction(() => window.__app.aiming === 0, null, { timeout: 30000 });
await page.mouse.move(640, 360);
await page.mouse.down();
await page.mouse.move(560, 420, { steps: 6 });
check('drag aims after starting mid-attract-flight', await page.evaluate(() => window.__app.aim[0].angle !== 45));
await page.waitForTimeout(100);
const guide = await page.evaluate(() => {
  const svg = document.getElementById('aimfx');
  const a = window.__app.aim[0];
  return {
    visible: !!svg && getComputedStyle(svg).display !== 'none',
    arrows: svg ? svg.querySelectorAll('.arrow:not(.off)').length : 0,
    band: !!svg && !svg.querySelector('.band')?.classList.contains('off'),
    label: svg?.querySelector('.hand-label')?.textContent ?? '',
    want: `${Math.round(a.angle)}°`,
  };
});
check('aim guide shows arrows at the hand and the pointer while dragging', guide.visible && guide.arrows >= 2 && guide.band);
check('aim guide labels the current angle', guide.label.includes(guide.want));
await page.mouse.move(640, 360, { steps: 6 }); // back to the start: no throw
await page.mouse.up();
await page.keyboard.press('Escape');
await page.getByRole('button', { name: 'Quit to title' }).click();
await page.waitForTimeout(300);

// 1. a banana that leaves the map must stop the flight whistle
await page.getByRole('button', { name: 'Two players, one keyboard' }).click();
await page.getByRole('button', { name: 'Start match' }).click();
await page.waitForFunction(() => window.__app.aiming === 0, null, { timeout: 30000 });
await page.evaluate(() => window.__app.editAim({ angle: 100, velocity: 200, weapon: 'banana' }));
await page.keyboard.press('Enter');
await page.waitForFunction(() => window.__app.aiming === 1, null, { timeout: 30000 });
check('whistle stops after a banana leaves the map', await page.evaluate(() => window.__app.sfx.whistleOsc === null));

// 1b. after a throw, that player's next turn shows a trace of the last throw
await page.evaluate(() => window.__app.editAim({ angle: 100, velocity: 200, weapon: 'banana' }));
await page.keyboard.press('Enter');
await page.waitForFunction(() => window.__app.aiming === 0, null, { timeout: 30000 });
await page.waitForTimeout(200);
check('last-throw trace is shown on the next turn', await page.evaluate(() => !document.querySelector('#aimfx .ghost')?.classList.contains('off') && document.querySelector('#aimfx .ghost')?.getAttribute('points')?.length > 10));

// 2. rematch clears the results panel
await page.evaluate(() => (window.__app.match.cfg.target = 1));
await page.evaluate(() => { const s = window.__best(); window.__app.editAim({ angle: s.angle, velocity: s.velocity, weapon: s.weapon }); });
await page.keyboard.press('Enter');
await page.waitForSelector('#results', { timeout: 30000 });
await page.getByRole('button', { name: 'Rematch' }).click();
await page.waitForTimeout(500);
check('rematch hides the results panel', (await page.locator('#results').count()) === 0);
check('rematch shows the HUD', await page.locator('#hud').isVisible());

await browser.close();
process.exit(failures.length ? 1 : 0);
