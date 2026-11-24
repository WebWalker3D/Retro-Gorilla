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
import '@fontsource/bungee/400.css';
import '@fontsource/bungee-inline/400.css';
import '@fontsource/barlow-semi-condensed/400.css';
import '@fontsource/barlow-semi-condensed/500.css';
import '@fontsource/barlow-semi-condensed/600.css';
import '@fontsource/barlow-semi-condensed/700.css';
import './ui/style.css';
import { App } from './app/app';

const app = new App(document.getElementById('view') as HTMLCanvasElement, document.getElementById('ui') as HTMLElement);
app.start();

// hooks for the Playwright visual/perf scripts in scripts/
let frames = 0;
app.engine.onFrame(() => {
  if (++frames === 30) (window as unknown as { __ready: boolean }).__ready = true;
});
Object.assign(window, { __app: app, __info: () => app.engine.info() });
if (import.meta.env.DEV) {
  // dev-only: let scripts compute a perfect throw for the current player
  void Promise.all([import('./sim/ai'), import('./sim/rng')]).then(([ai, rng]) =>
    Object.assign(window, { __best: () => ai.chooseShot(app.match!, app.match!.turn, new rng.Rng(1), ai.newAiMemory(), { noise: 0 }) }),
  );
}
