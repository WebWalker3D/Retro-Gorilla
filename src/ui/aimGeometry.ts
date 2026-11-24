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
/** Pure geometry for the on-screen aim guide (screen pixels). Unit-tested. */

/** Arrow from (x, y) along unit (dx, dy), `len` long, shaft `w` wide. Returns SVG polygon points and the tip. */
export function arrowShape(x: number, y: number, dx: number, dy: number, len: number, w: number): { points: string; tipX: number; tipY: number } {
  const nx = -dy;
  const ny = dx;
  const head = Math.min(len * 0.45, w * 2.6);
  const shaft = len - head;
  const hw = w / 2;
  const hh = w * 1.35;
  const p = (a: number, b: number) => `${(x + dx * a + nx * b).toFixed(1)},${(y + dy * a + ny * b).toFixed(1)}`;
  return {
    points: [p(0, hw), p(shaft, hw), p(shaft, hh), p(len, 0), p(shaft, -hh), p(shaft, -hw), p(0, -hw)].join(' '),
    tipX: x + dx * len,
    tipY: y + dy * len,
  };
}

/** Arrow length in pixels for a throw strength 0..1. */
export function guideLength(power01: number): number {
  const p = Math.max(0, Math.min(1, power01));
  return 34 + p * 150;
}

/** Green for a soft throw through yellow to red for a hard one. */
export function powerColor(power01: number): string {
  const p = Math.max(0, Math.min(1, power01));
  return `hsl(${Math.round(120 * (1 - p))} 85% 55%)`;
}
