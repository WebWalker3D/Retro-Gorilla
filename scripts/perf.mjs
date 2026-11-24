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
// Per quality preset, while the attract-mode match plays (explosions included):
//  1. uncapped mean frame time (vsync off) = what the GPU can do;
//  2. with vsync on, how many frames took longer than 25 ms = visible hitches.
// (Uncapped percentiles are dominated by frame queueing, so hitches are counted with vsync.)
// Usage: node scripts/perf.mjs <url> [WxH] [secondsPerPreset] [presets]
import { chromium } from 'playwright';

const [url = 'http://localhost:5173/', size = '1920x1080', secs = '12', presets = 'low,medium,high,ultra'] = process.argv.slice(2);
const [width, height] = size.split('x').map(Number);
const base = ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=vulkan'];
for (const vsync of [false, true]) {
const browser = await chromium.launch({ args: vsync ? base : [...base, '--disable-gpu-vsync', '--disable-frame-rate-limit'] });
const page = await browser.newPage({ viewport: { width, height } });
await page.goto(url);
await page.waitForFunction(() => window.__ready === true, null, { timeout: 60000 });
for (const preset of presets.split(',')) {
  const r = await page.evaluate(
    async ([preset, secs]) => {
      const app = window.__app;
      const eng = app.engine;
      app.applyPreset(preset);
      eng.autoRes = false;
      eng.renderScale = eng.q.renderScale;
      eng.resize();
      await new Promise((r) => setTimeout(r, 1500));
      const times = [];
      let calls = 0;
      let tris = 0;
      let last = performance.now();
      const t0 = last;
      await new Promise((res) => {
        const f = (now) => {
          times.push(now - last);
          last = now;
          const info = eng.renderer.info.render;
          calls = Math.max(calls, info.calls);
          tris = Math.max(tris, info.triangles);
          if (now - t0 < secs * 1000) requestAnimationFrame(f);
          else res();
        };
        requestAnimationFrame(f);
      });
      times.sort((a, b) => a - b);
      const mean = times.reduce((a, b) => a + b, 0) / times.length;
      return { preset, fps: +(1000 / mean).toFixed(1), meanMs: +mean.toFixed(2), over25ms: times.filter((t) => t > 25).length, frames: times.length, maxCalls: calls, maxTris: tris };
    },
    [preset, Number(secs)],
  );
  console.log(size, vsync ? 'vsync  ' : 'uncapped', JSON.stringify(r));
}
await browser.close();
}
