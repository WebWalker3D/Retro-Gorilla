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
import type { WeaponId } from './types';

/** Play-plane grid size in cells. One cell = one window bay / storey. */
export const GRID_W = 120;
export const GRID_H = 80;
/** Gravity in the menu is in m/s²; the city is scaled so classic angle/velocity numbers feel right. */
export const GRAVITY_SCALE = 3;
export const WIND_SCALE = 0.5;
export const SIM_DT = 1 / 240;
export const PATH_DT = 1 / 60;
export const MAX_SHOT_TIME = 20;
/** Max travel per integration sub-step, in cells (prevents tunnelling through 1-cell walls). */
export const MAX_STEP = 0.45;
export const OUT_MARGIN = 20;

export const GORILLA_HALF_W = 1.8;
export const GORILLA_H = 4.7;

export interface WeaponSpec {
  name: string;
  radius: number;
  windFactor: number;
  bounces: number;
  ammo: number;
  /** Speed multiplier at launch. */
  speed: number;
}

export const WEAPONS: Record<WeaponId, WeaponSpec> = {
  banana: { name: 'Banana', radius: 3.5, windFactor: 1, bounces: 0, ammo: Infinity, speed: 1 },
  bunch: { name: 'Banana Bunch', radius: 2.6, windFactor: 1, bounces: 0, ammo: 1, speed: 1 },
  rubber: { name: 'Rubber Banana', radius: 3, windFactor: 1, bounces: 2, ammo: 2, speed: 1 },
  plantain: { name: 'Plantain Bomb', radius: 6.5, windFactor: 0.35, bounces: 0, ammo: 1, speed: 0.92 },
};
export const WEAPON_ORDER: WeaponId[] = ['banana', 'bunch', 'rubber', 'plantain'];

/** Horizontal speed offsets of the three bunch bomblets. */
export const BUNCH_SPREAD = [-6, 0, 6];
export const RUBBER_RESTITUTION = 0.65;
/** A blast knocks out a gorilla whose hitbox lies within this fraction of its radius. */
export const BLAST_KO_FRACTION = 0.5;
