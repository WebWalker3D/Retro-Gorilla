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
import { Engine } from './render/engine';
import { Stage } from './render/stage';
import { applyShot, newMatch, startRound, type TimeOfDay, type Weather } from './sim/match';
import { chooseShot, newAiMemory } from './sim/ai';
import { Rng } from './sim/rng';
import { simulateShot } from './sim/shot';
import type { Player, Shot, WeaponId } from './sim/types';

const q = new URLSearchParams(location.search);
const engine = new Engine(document.getElementById('view') as HTMLCanvasElement, (q.get('q') as 'high') ?? 'high');
const stage = new Stage(engine);
const m = newMatch({ names: ['P1', 'P2'], cpu: [false, false], skill: [2, 2], target: 3, gravity: 9.8, seed: Number(q.get('seed') ?? 5) });
if (q.get('tod')) m.cond.timeOfDay = q.get('tod') as TimeOfDay;
if (q.get('wx')) m.cond.weather = q.get('wx') as Weather;
stage.loadRound(m);
engine.onFrame((dt, t) => stage.update(dt, t));
engine.start();
let frames = 0;
engine.onFrame(() => {
  if (++frames === 30) (window as any).__ready = true;
});
(window as any).__info = () => engine.info();
(window as any).__game = {
  fire(angle: number, velocity: number, weapon: WeaponId = 'banana') {
    const shot: Shot = { player: m.turn, angle, velocity, weapon };
    const r = simulateShot(m.world, shot);
    stage.playShot(shot, r).then(() => {
      const o = applyShot(m, shot, r);
      (window as any).__last = o;
      if (o.kind !== 'continue') startRound(m), stage.loadRound(m);
    });
    return r.ko;
  },
  best(p: Player = m.turn) {
    return chooseShot(m, p, new Rng(1), newAiMemory(), { noise: 0 });
  },
  aim(angle: number, power: number) {
    stage.setAiming(m.turn, angle, power, null);
  },
  m,
};
