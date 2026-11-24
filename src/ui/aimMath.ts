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
/** Slingshot aiming: pure maths, unit-tested. */
export const MAX_DRAG_VELOCITY = 120;

/**
 * Converts a drag vector (screen pixels, y grows downward) into a throw.
 * The banana flies opposite to the drag, like a slingshot. `facing` is +1 when the
 * opponent is to the right. Angle is measured from horizontal toward the opponent, 0..180.
 */
export function dragToAim(dx: number, dy: number, facing: 1 | -1, minViewport: number): { angle: number; velocity: number } {
  const fx = -dx * facing; // toward the opponent
  const fy = dy; // pulling down throws up
  let angle = (Math.atan2(fy, fx) * 180) / Math.PI;
  if (angle < 0) angle = fx >= 0 ? 0 : 180;
  const len = Math.hypot(dx, dy);
  const power = Math.min(1, len / (0.38 * minViewport));
  const velocity = Math.max(1, Math.round(power * MAX_DRAG_VELOCITY * 10) / 10);
  return { angle: Math.round(angle * 10) / 10, velocity };
}
