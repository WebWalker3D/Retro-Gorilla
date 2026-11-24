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
import * as THREE from 'three';
import { GRID_W } from '../sim/constants';
import type { TimeOfDay, Weather } from '../sim/match';

/** Sim plane (cells) → world units. The play plane is z = 0; one cell = one world unit. */
export const wx = (x: number): number => x - GRID_W / 2;
export const wy = (y: number): number => y;
/** Building depth (z extent) in world units. */
export const DEPTH = 10;

export interface Look {
  skyTop: THREE.Color;
  skyBottom: THREE.Color;
  horizon: THREE.Color;
  key: THREE.Color;
  keyIntensity: number;
  hemiSky: THREE.Color;
  hemiGround: THREE.Color;
  hemiIntensity: number;
  fog: THREE.Color;
  fogNear: number;
  fogFar: number;
  /** Fraction of windows lit (compared to the per-cell seed). */
  litFraction: number;
  stars: number;
  moon: boolean;
  cloudColor: THREE.Color;
  cloudCover: number;
  streetLights: number;
}

const c = (hex: string) => new THREE.Color(hex);

const BASE: Record<TimeOfDay, Look> = {
  night: {
    skyTop: c('#03050f'), skyBottom: c('#141a3c'), horizon: c('#3a2a63'), key: c('#9fb4ff'), keyIntensity: 1.7,
    hemiSky: c('#5666b8'), hemiGround: c('#1a1426'), hemiIntensity: 1.0, fog: c('#0d1030'), fogNear: 170, fogFar: 620,
    litFraction: 0.24, stars: 1, moon: true, cloudColor: c('#2a2f55'), cloudCover: 0.35, streetLights: 1,
  },
  dusk: {
    skyTop: c('#1b1446'), skyBottom: c('#ff7a50'), horizon: c('#ffc27a'), key: c('#ffae78'), keyIntensity: 2.2,
    hemiSky: c('#8a6cc0'), hemiGround: c('#2a1420'), hemiIntensity: 0.6, fog: c('#7a4a6a'), fogNear: 180, fogFar: 650,
    litFraction: 0.18, stars: 0.35, moon: false, cloudColor: c('#ff9a7a'), cloudCover: 0.45, streetLights: 0.8,
  },
  dawn: {
    skyTop: c('#26407c'), skyBottom: c('#f6a6a0'), horizon: c('#ffd6a8'), key: c('#ffd0aa'), keyIntensity: 2,
    hemiSky: c('#9cb0e8'), hemiGround: c('#2a2030'), hemiIntensity: 0.7, fog: c('#b48aa0'), fogNear: 180, fogFar: 650,
    litFraction: 0.18, stars: 0.12, moon: false, cloudColor: c('#ffc0b0'), cloudCover: 0.4, streetLights: 0.4,
  },
  day: {
    skyTop: c('#1f6fd6'), skyBottom: c('#7fbcff'), horizon: c('#d6ecff'), key: c('#fff1dc'), keyIntensity: 3,
    hemiSky: c('#bcd8ff'), hemiGround: c('#3a3530'), hemiIntensity: 0.9, fog: c('#a9c8e6'), fogNear: 200, fogFar: 800,
    litFraction: 0.04, stars: 0, moon: false, cloudColor: c('#ffffff'), cloudCover: 0.4, streetLights: 0,
  },
};

export function lookFor(tod: TimeOfDay, weather: Weather): Look {
  const b = BASE[tod];
  const l: Look = { ...b, skyTop: b.skyTop.clone(), skyBottom: b.skyBottom.clone(), horizon: b.horizon.clone(), fog: b.fog.clone(), key: b.key.clone(), cloudColor: b.cloudColor.clone() };
  const grey = c('#5a6070');
  if (weather === 'rain') {
    l.skyTop.lerp(grey, 0.45).multiplyScalar(0.6);
    l.skyBottom.lerp(grey, 0.55).multiplyScalar(0.7);
    l.horizon.lerp(grey, 0.5);
    l.fog.lerp(grey, 0.5).multiplyScalar(0.7);
    l.fogNear *= 0.85;
    l.fogFar *= 0.6;
    l.keyIntensity *= 0.55;
    l.cloudCover = 0.85;
    l.cloudColor.lerp(grey, 0.6);
    l.stars = 0;
    l.litFraction = Math.min(0.7, l.litFraction + 0.15);
    l.streetLights = Math.max(l.streetLights, 0.6);
  } else if (weather === 'fog') {
    l.fog.lerp(c('#9aa0b0'), 0.35);
    l.fogNear = 130;
    l.fogFar = 360;
    l.stars *= 0.3;
  } else if (weather === 'snow') {
    l.skyTop.lerp(c('#8890a8'), 0.3);
    l.skyBottom.lerp(c('#d8deea'), 0.4);
    l.fog.lerp(c('#c8d0e0'), 0.45);
    l.fogNear *= 0.9;
    l.fogFar *= 0.65;
    l.cloudCover = 0.75;
    l.stars *= 0.2;
  }
  return l;
}

/** Original building palette: wall colours (linear-ish sRGB hex). */
export const BUILDING_COLORS = ['#8a94a6', '#a4553f', '#3f8f94', '#c9b48a', '#4f5f8f', '#7fae9a', '#b87a52', '#6e5a8e'].map(c);

export const GORILLA_TINTS = [c('#5b6275'), c('#93512c')];
