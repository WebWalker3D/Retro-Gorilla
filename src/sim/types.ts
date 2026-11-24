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
export type WeaponId = 'banana' | 'bunch' | 'rubber' | 'plantain';
export type Player = 0 | 1;

export interface Building {
  x0: number;
  width: number;
  height: number;
  palette: number;
  style: number;
}

export interface City {
  w: number;
  h: number;
  /** 0 = empty, otherwise buildingIndex + 1. index = y * w + x. */
  cells: Uint8Array;
  buildings: Building[];
  /** Random byte per cell; the renderer lights a window when it is below a time-of-day threshold. */
  windowSeed: Uint8Array;
}

export interface GorillaState {
  /** Centre x, in cells. */
  x: number;
  /** Feet y, in cells (top of the roof it stands on). */
  y: number;
  ko: boolean;
}

export interface Shot {
  player: Player;
  /** Degrees from horizontal toward the opponent, 0..180. */
  angle: number;
  /** 1..200. */
  velocity: number;
  weapon: WeaponId;
}

export interface World {
  city: City;
  gorillas: [GorillaState, GorillaState];
  /** m/s² before GRAVITY_SCALE. */
  gravity: number;
  /** Positive blows toward +x. */
  wind: number;
  sun: { x: number; y: number; r: number };
}

export type SimEvent = { t: number } & (
  | { type: 'launch'; id: number }
  | { type: 'split'; id: number; children: number[] }
  | { type: 'bounce'; id: number; x: number; y: number }
  | { type: 'explode'; id: number; x: number; y: number; radius: number; destroyed: number[]; collapsed: number[] }
  | { type: 'sun'; id: number }
  | { type: 'gorillaHit'; player: Player; id: number }
  | { type: 'gorillaFall'; player: Player; fromY: number; toY: number; ko: boolean }
  | { type: 'gone'; id: number }
  | { type: 'end' }
);

export interface ProjectilePath {
  id: number;
  weapon: WeaponId;
  t0: number;
  t1: number;
  /** Interleaved x,y samples every PATH_DT from t0; the last sample is the position at t1. */
  xy: Float32Array;
}

export interface ShotResult {
  events: SimEvent[];
  paths: ProjectilePath[];
  world: World;
  ko: [boolean, boolean];
  maxDistance: number;
  cellsDestroyed: number;
}
