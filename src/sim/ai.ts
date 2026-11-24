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
import { BLAST_KO_FRACTION } from './constants';
import { canUse, type MatchState } from './match';
import type { Rng } from './rng';
import { distToGorilla, simulateShot } from './shot';
import type { Player, Shot, WeaponId } from './types';

export interface AiMemory {
  shotsAtTarget: number;
}
export const newAiMemory = (): AiMemory => ({ shotsAtTarget: 0 });

const ANGLE_SD = [7, 3.5, 1.2];
const VEL_SD = [9, 4.5, 1.5];

/** Lower is better. Negative = knocks the opponent out without hurting the thrower. */
function score(m: MatchState, shot: Shot): number {
  const p = shot.player;
  const o = (1 - p) as Player;
  const r = simulateShot(m.world, shot);
  if (r.ko[p]) return 1000;
  const target = m.world.gorillas[o];
  if (r.ko[o]) return -10;
  let best = 500;
  for (const e of r.events)
    if (e.type === 'explode') best = Math.min(best, distToGorilla(target, e.x, e.y) - e.radius * BLAST_KO_FRACTION);
  return best;
}

function search(m: MatchState, p: Player, weapon: WeaponId): { angle: number; velocity: number; score: number } {
  let best = { angle: 45, velocity: 60, score: Infinity };
  const test = (angle: number, velocity: number) => {
    const s = score(m, { player: p, angle, velocity, weapon });
    if (s < best.score) best = { angle, velocity, score: s };
  };
  for (let a = 10; a <= 82; a += 4) for (let v = 15; v <= 129; v += 3) test(a, v);
  // two refinement passes around the best candidate
  for (const [da, dv, n] of [[1, 0.75, 4], [0.25, 0.2, 4]] as const) {
    const { angle: a0, velocity: v0 } = best;
    for (let i = -n; i <= n; i++)
      for (let j = -n; j <= n; j++) test(Math.max(0, Math.min(90, a0 + i * da)), Math.max(1, v0 + j * dv));
  }
  return best;
}

/**
 * Finds a good throw with the same simulator the game uses, then adds human-like error
 * that shrinks as the CPU keeps shooting at the same target.
 */
export function chooseShot(m: MatchState, p: Player, rng: Rng, mem: AiMemory, opts: { noise?: number } = {}): Shot {
  const skill = m.cfg.skill[p];
  const weapons: WeaponId[] = ['banana'];
  if (skill >= 1 && canUse(m, p, 'plantain') && (skill === 2 || mem.shotsAtTarget >= 2)) weapons.push('plantain');
  if (skill === 2 && canUse(m, p, 'bunch')) weapons.push('bunch');

  let pick = { weapon: 'banana' as WeaponId, ...search(m, p, 'banana') };
  for (const w of weapons.slice(1)) {
    const s = search(m, p, w);
    // only spend special ammo when it clearly helps
    if (s.score < pick.score - 1 || (s.score < 0 && pick.score >= 0)) pick = { weapon: w, ...s };
  }

  const mult = Math.max(0.25, Math.pow(0.65, mem.shotsAtTarget)) * (opts.noise ?? 1);
  mem.shotsAtTarget++;
  const angle = Math.max(0, Math.min(180, pick.angle + rng.gauss() * ANGLE_SD[skill] * mult));
  const velocity = Math.max(1, Math.min(200, pick.velocity + rng.gauss() * VEL_SD[skill] * mult));
  return { player: p, angle, velocity, weapon: pick.weapon };
}
