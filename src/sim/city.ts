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
import { GORILLA_HALF_W, GRID_H, GRID_W } from './constants';
import { Rng } from './rng';
import type { Building, City, GorillaState, World } from './types';

export function createCity(w: number, h: number): City {
  return { w, h, cells: new Uint8Array(w * h), buildings: [], windowSeed: new Uint8Array(w * h) };
}

export function cellAt(c: City, x: number, y: number): number {
  if (x < 0 || y < 0 || x >= c.w || y >= c.h) return 0;
  return c.cells[y * c.w + x];
}

/** Random skyline: buildings separated by 1-cell alleys, gorillas on the 2nd/3rd roof from each edge. */
export function generateCity(seed: number): { city: City; gorillas: [GorillaState, GorillaState] } {
  const rng = new Rng(seed);
  const city = createCity(GRID_W, GRID_H);
  const buildings: Building[] = [];
  let x = 0;
  while (x < city.w) {
    let width = rng.int(7, 12);
    const remaining = city.w - x;
    if (remaining - width < 6) width = remaining; // avoid a sliver at the edge
    const height = rng.int(12, 55);
    buildings.push({ x0: x, width, height, palette: rng.int(0, 7), style: rng.int(0, 3) });
    x += width + 1;
  }
  buildings.forEach((b, i) => {
    for (let yy = 0; yy < b.height; yy++)
      for (let xx = b.x0; xx < b.x0 + b.width; xx++) city.cells[yy * city.w + xx] = i + 1;
  });
  for (let i = 0; i < city.windowSeed.length; i++) city.windowSeed[i] = Math.floor(rng.next() * 256);
  city.buildings = buildings;
  const n = buildings.length;
  const left = buildings[rng.int(1, 2)];
  const right = buildings[n - 1 - rng.int(1, 2)];
  const place = (b: Building): GorillaState => ({ x: b.x0 + b.width / 2, y: b.height, ko: false });
  return { city, gorillas: [place(left), place(right)] };
}

/** Removes every cell whose centre lies within r of (cx, cy). Returns removed cell indices. */
export function carve(c: City, cx: number, cy: number, r: number): number[] {
  const out: number[] = [];
  const r2 = r * r;
  const x0 = Math.max(0, Math.floor(cx - r - 1));
  const x1 = Math.min(c.w - 1, Math.ceil(cx + r + 1));
  const y0 = Math.max(0, Math.floor(cy - r - 1));
  const y1 = Math.min(c.h - 1, Math.ceil(cy + r + 1));
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      const i = y * c.w + x;
      if (!c.cells[i]) continue;
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      if (dx * dx + dy * dy <= r2) {
        c.cells[i] = 0;
        out.push(i);
      }
    }
  return out;
}

/** Removes and returns every solid cell not 4-connected to the street (row 0). */
export function detachUnsupported(c: City): number[] {
  const seen = new Uint8Array(c.cells.length);
  const stack: number[] = [];
  for (let x = 0; x < c.w; x++)
    if (c.cells[x]) {
      seen[x] = 1;
      stack.push(x);
    }
  while (stack.length) {
    const i = stack.pop()!;
    const x = i % c.w;
    const visit = (j: number) => {
      if (c.cells[j] && !seen[j]) {
        seen[j] = 1;
        stack.push(j);
      }
    };
    if (x > 0) visit(i - 1);
    if (x < c.w - 1) visit(i + 1);
    if (i >= c.w) visit(i - c.w);
    if (i + c.w < c.cells.length) visit(i + c.w);
  }
  const out: number[] = [];
  for (let i = 0; i < c.cells.length; i++)
    if (c.cells[i] && !seen[i]) {
      c.cells[i] = 0;
      out.push(i);
    }
  return out;
}

function supportedAt(c: City, x: number, y: number): boolean {
  if (y <= 0) return true;
  const a = Math.floor(x - GORILLA_HALF_W + 0.3);
  const b = Math.floor(x + GORILLA_HALF_W - 0.3);
  for (let cx = a; cx <= b; cx++) if (cellAt(c, cx, y - 1)) return true;
  return false;
}

/** Where a gorilla ends up if the ground under it is gone. Falling into the street knocks it out. */
export function settleGorilla(c: City, g: GorillaState): { toY: number; ko: boolean } {
  for (let y = g.y; y > 0; y--) if (supportedAt(c, g.x, y)) return { toY: y, ko: false };
  return { toY: 0, ko: g.y > 0 };
}

export function cloneCity(c: City): City {
  return { ...c, cells: c.cells.slice(), buildings: c.buildings.map((b) => ({ ...b })), windowSeed: c.windowSeed };
}

export function cloneWorld(w: World): World {
  return {
    city: cloneCity(w.city),
    gorillas: [{ ...w.gorillas[0] }, { ...w.gorillas[1] }],
    gravity: w.gravity,
    wind: w.wind,
    sun: { ...w.sun },
  };
}
