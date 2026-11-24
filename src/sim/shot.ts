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
import { carve, cellAt, cloneWorld, detachUnsupported, settleGorilla } from './city';
import {
  BLAST_KO_FRACTION, BUNCH_SPREAD, GORILLA_H, GORILLA_HALF_W, GRAVITY_SCALE, MAX_SHOT_TIME, MAX_STEP, OUT_MARGIN,
  PATH_DT, RUBBER_RESTITUTION, SIM_DT, WEAPONS, WIND_SCALE,
} from './constants';
import type { GorillaState, Player, ProjectilePath, Shot, ShotResult, SimEvent, WeaponId, World } from './types';

const SAMPLE_EVERY = Math.round(PATH_DT / SIM_DT);

export function facing(player: Player): 1 | -1 {
  return player === 0 ? 1 : -1;
}

/** Where the banana leaves the gorilla's raised hand. */
export function launchPoint(w: World, player: Player): { x: number; y: number } {
  const g = w.gorillas[player];
  return { x: g.x + facing(player) * 1.2, y: g.y + GORILLA_H * 0.95 };
}

export function launchVector(shot: Shot): { vx: number; vy: number } {
  const a = (shot.angle * Math.PI) / 180;
  const v = shot.velocity * WEAPONS[shot.weapon].speed;
  return { vx: Math.cos(a) * v * facing(shot.player), vy: Math.sin(a) * v };
}

export function inGorillaBox(g: GorillaState, x: number, y: number): boolean {
  return Math.abs(x - g.x) <= GORILLA_HALF_W && y >= g.y && y <= g.y + GORILLA_H;
}

export function distToGorilla(g: GorillaState, x: number, y: number): number {
  const dx = Math.max(g.x - GORILLA_HALF_W - x, 0, x - (g.x + GORILLA_HALF_W));
  const dy = Math.max(g.y - y, 0, y - (g.y + GORILLA_H));
  return Math.hypot(dx, dy);
}

interface Proj {
  id: number;
  weapon: WeaponId;
  bomblet: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  t0: number;
  steps: number;
  contacts: number;
  leftOwner: boolean;
  sunSeen: boolean;
  samples: number[];
  alive: boolean;
}

/**
 * Runs a whole throw to completion on a copy of the world. Pure and deterministic:
 * the renderer replays `paths` + `events`, the AI calls it to test candidate throws.
 */
export function simulateShot(world: World, shot: Shot): ShotResult {
  const w = cloneWorld(world);
  const city = w.city;
  const owner = w.gorillas[shot.player];
  const g = w.gravity * GRAVITY_SCALE;
  const events: SimEvent[] = [];
  const paths: ProjectilePath[] = [];
  const projs: Proj[] = [];
  const start = launchPoint(w, shot.player);
  let maxDistance = 0;
  let cellsDestroyed = 0;
  let t = 0;
  const sunR2 = w.sun.r * w.sun.r;

  const spawn = (weapon: WeaponId, x: number, y: number, vx: number, vy: number, bomblet: boolean): Proj => {
    const p: Proj = {
      id: projs.length, weapon, bomblet, x, y, vx, vy, t0: t, steps: 0, contacts: 0,
      leftOwner: bomblet, sunSeen: false, samples: [x, y], alive: true,
    };
    projs.push(p);
    return p;
  };

  const finish = (p: Proj) => {
    p.alive = false;
    p.samples.push(p.x, p.y);
    paths.push({ id: p.id, weapon: p.weapon, t0: p.t0, t1: t, xy: new Float32Array(p.samples) });
  };

  const explode = (p: Proj, x: number, y: number, direct: GorillaState | null) => {
    const radius = WEAPONS[p.weapon].radius;
    const destroyed = carve(city, x, y, radius);
    const collapsed = detachUnsupported(city);
    cellsDestroyed += destroyed.length + collapsed.length;
    maxDistance = Math.max(maxDistance, Math.abs(x - start.x));
    events.push({ t, type: 'explode', id: p.id, x, y, radius, destroyed, collapsed });
    w.gorillas.forEach((gor, i) => {
      if (gor.ko) return;
      if (gor === direct || distToGorilla(gor, x, y) <= radius * BLAST_KO_FRACTION) {
        gor.ko = true;
        events.push({ t, type: 'gorillaHit', player: i as Player, id: p.id });
      }
    });
    w.gorillas.forEach((gor, i) => {
      const s = settleGorilla(city, gor);
      if (s.toY !== gor.y) {
        events.push({ t, type: 'gorillaFall', player: i as Player, fromY: gor.y, toY: s.toY, ko: s.ko || gor.ko });
        gor.y = s.toY;
        if (s.ko) gor.ko = true;
      }
    });
    p.x = x;
    p.y = y;
    finish(p);
  };

  /** Rubber bananas bounce off the first contacts; returns true if it bounced. */
  const tryBounce = (p: Proj, px: number, py: number, hitSide: boolean): boolean => {
    if (p.contacts >= WEAPONS[p.weapon].bounces) return false;
    p.contacts++;
    p.x = px;
    p.y = Math.max(py, 0);
    if (hitSide) p.vx = -p.vx * RUBBER_RESTITUTION;
    else {
      p.vy = -p.vy * RUBBER_RESTITUTION;
      p.vx *= 0.85;
    }
    events.push({ t, type: 'bounce', id: p.id, x: p.x, y: p.y });
    return true;
  };

  const step = (p: Proj) => {
    const ax = w.wind * WIND_SCALE * WEAPONS[p.weapon].windFactor;
    p.vx += ax * SIM_DT;
    const vyPrev = p.vy;
    p.vy -= g * SIM_DT;

    if (p.weapon === 'bunch' && !p.bomblet && vyPrev > 0 && p.vy <= 0) {
      const children = BUNCH_SPREAD.map((dvx) => spawn('bunch', p.x, p.y, p.vx + dvx, p.vy, true).id);
      events.push({ t, type: 'split', id: p.id, children });
      finish(p);
      return;
    }

    const n = Math.max(1, Math.ceil((Math.sqrt(p.vx * p.vx + p.vy * p.vy) * SIM_DT) / MAX_STEP));
    const h = SIM_DT / n;
    for (let k = 0; k < n; k++) {
      const px = p.x;
      const py = p.y;
      p.x += p.vx * h;
      p.y += p.vy * h;

      if (p.x < -OUT_MARGIN || p.x > city.w + OUT_MARGIN) {
        events.push({ t, type: 'gone', id: p.id });
        finish(p);
        return;
      }
      if (!p.leftOwner && !inGorillaBox(owner, p.x, p.y)) p.leftOwner = true;
      for (let gi = 0; gi < 2; gi++) {
        const gor = w.gorillas[gi];
        if (gor.ko || (gor === owner && !p.leftOwner)) continue;
        if (inGorillaBox(gor, p.x, p.y)) {
          explode(p, p.x, p.y, gor);
          return;
        }
      }
      if (p.y <= 0) {
        if (tryBounce(p, px, 0, false)) break;
        explode(p, p.x, 0, null);
        return;
      }
      const cx = Math.floor(p.x);
      const cy = Math.floor(p.y);
      if (cellAt(city, cx, cy)) {
        const hitSide = Math.floor(px) !== cx && cellAt(city, cx, Math.floor(py)) !== 0;
        if (tryBounce(p, px, py, hitSide)) break;
        explode(p, p.x, p.y, null);
        return;
      }
      const sx = p.x - w.sun.x;
      const sy = p.y - w.sun.y;
      if (!p.sunSeen && sx * sx + sy * sy <= sunR2) {
        p.sunSeen = true;
        events.push({ t, type: 'sun', id: p.id });
      }
    }
    p.steps++;
    if (p.steps % SAMPLE_EVERY === 0) p.samples.push(p.x, p.y);
  };

  const v = launchVector(shot);
  spawn(shot.weapon, start.x, start.y, v.vx, v.vy, false);
  events.push({ t: 0, type: 'launch', id: 0 });

  while (t < MAX_SHOT_TIME - 1e-9) {
    const count = projs.length; // bomblets spawned this step start moving next step
    let any = false;
    for (let i = 0; i < count; i++) if (projs[i].alive) any = true;
    if (!any) break;
    t += SIM_DT;
    for (let i = 0; i < count; i++) if (projs[i].alive) step(projs[i]);
  }
  for (const p of projs)
    if (p.alive) {
      events.push({ t, type: 'gone', id: p.id });
      finish(p);
    }
  const endT = events.reduce((m, e) => Math.max(m, e.t), 0);
  events.push({ t: endT, type: 'end' });
  paths.sort((a, b) => a.id - b.id);
  return { events, paths, world: w, ko: [w.gorillas[0].ko, w.gorillas[1].ko], maxDistance, cellsDestroyed };
}

/** Position on a recorded path at sim time t (clamped to the path's lifetime). */
export function samplePath(path: ProjectilePath, t: number, out: { x: number; y: number }): { x: number; y: number } {
  const n = path.xy.length / 2;
  const tt = Math.min(Math.max(t, path.t0), path.t1);
  let f = (tt - path.t0) / PATH_DT;
  let i = Math.floor(f);
  if (i >= n - 2) {
    // last segment runs from sample n-2 (regular grid) to the final sample at t1
    i = Math.max(0, n - 2);
    const ta = path.t0 + i * PATH_DT;
    const span = path.t1 - ta;
    f = span > 1e-9 ? i + Math.min(1, Math.max(0, (tt - ta) / span)) : i + 1;
  }
  const a = Math.min(1, f - i);
  const j = Math.min(n - 1, i + 1);
  out.x = path.xy[i * 2] + (path.xy[j * 2] - path.xy[i * 2]) * a;
  out.y = path.xy[i * 2 + 1] + (path.xy[j * 2 + 1] - path.xy[i * 2 + 1]) * a;
  return out;
}

/** Aim-assist arc: gravity only (no wind, no collisions), the first `fraction` of the flight to street level. */
export function previewPath(world: World, shot: Shot, fraction: number): Float32Array {
  const p = launchPoint(world, shot.player);
  const v = launchVector(shot);
  const g = world.gravity * GRAVITY_SCALE;
  const tFull = (v.vy + Math.sqrt(v.vy * v.vy + 2 * g * p.y)) / g;
  const T = Math.min(tFull * fraction, 8);
  const n = Math.max(2, Math.min(120, Math.ceil(T * 20)));
  const out = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    const tt = (T * i) / (n - 1);
    out[i * 2] = p.x + v.vx * tt;
    out[i * 2 + 1] = p.y + v.vy * tt - 0.5 * g * tt * tt;
  }
  return out;
}
