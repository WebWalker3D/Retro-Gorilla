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
import { generateCity } from './city';
import { WEAPONS, WEAPON_ORDER } from './constants';
import { Rng } from './rng';
import type { Player, Shot, ShotResult, WeaponId, World } from './types';

export type TimeOfDay = 'dawn' | 'day' | 'dusk' | 'night';
export type Weather = 'clear' | 'rain' | 'fog' | 'snow';

export interface MatchConfig {
  names: [string, string];
  cpu: [boolean, boolean];
  skill: [0 | 1 | 2, 0 | 1 | 2];
  target: number;
  gravity: number;
  seed: number;
}

export interface RoundConditions {
  seed: number;
  baseWind: number;
  timeOfDay: TimeOfDay;
  weather: Weather;
}

export interface PlayerStats {
  shots: number;
  hits: number;
  biggestCrater: number;
  longestThrow: number;
}

export type Ammo = Record<WeaponId, number>;

export interface MatchState {
  cfg: MatchConfig;
  rng: Rng;
  scores: [number, number];
  round: number;
  turn: Player;
  world: World;
  cond: RoundConditions;
  ammo: [Ammo, Ammo];
  stats: [PlayerStats, PlayerStats];
  lastRoundWinner: Player | null;
  over: boolean;
  winner: Player | null;
}

export type RoundOutcome =
  | { kind: 'continue' }
  | { kind: 'roundWon'; winner: Player; reason: 'hit' | 'fell' | 'self' }
  | { kind: 'draw' }
  | { kind: 'matchWon'; winner: Player };

const TIMES: TimeOfDay[] = ['dawn', 'day', 'dusk', 'night', 'night', 'dusk'];
const WEATHERS: Weather[] = ['clear', 'clear', 'clear', 'clear', 'rain', 'rain', 'fog', 'snow'];
const MAX_WIND = 12;
const GUST = 1.5;
const GUST_SPAN = 3;

const fullAmmo = (): Ammo =>
  Object.fromEntries(WEAPON_ORDER.map((w) => [w, WEAPONS[w].ammo])) as Ammo;
const zeroStats = (): PlayerStats => ({ shots: 0, hits: 0, biggestCrater: 0, longestThrow: 0 });

export function newMatch(cfg: MatchConfig): MatchState {
  const m = {
    cfg,
    rng: new Rng(cfg.seed),
    scores: [0, 0],
    round: 0,
    turn: 0,
    ammo: [fullAmmo(), fullAmmo()],
    stats: [zeroStats(), zeroStats()],
    lastRoundWinner: null,
    over: false,
    winner: null,
  } as unknown as MatchState;
  startRound(m);
  return m;
}

/** New skyline, conditions and ammo. The loser of the previous round throws first. */
export function startRound(m: MatchState): void {
  m.round++;
  const seed = Math.floor(m.rng.next() * 0x7fffffff);
  const r = new Rng(seed);
  const baseWind = Math.max(-10, Math.min(10, Math.round(r.gauss() * 4 * 10) / 10));
  m.cond = { seed, baseWind, timeOfDay: r.pick(TIMES), weather: r.pick(WEATHERS) };
  const { city, gorillas } = generateCity(seed);
  m.world = { city, gorillas, gravity: m.cfg.gravity, wind: baseWind, sun: { x: city.w / 2, y: city.h * 0.85, r: 4 } };
  m.ammo = [fullAmmo(), fullAmmo()];
  m.turn = m.lastRoundWinner === null ? 0 : ((1 - m.lastRoundWinner) as Player);
}

export function canUse(m: MatchState, p: Player, w: WeaponId): boolean {
  return m.ammo[p][w] > 0;
}

/** Commits a simulated throw: world, ammo, stats, scores, turn and the next gust. */
export function applyShot(m: MatchState, shot: Shot, r: ShotResult): RoundOutcome {
  const p = shot.player;
  const o = (1 - p) as Player;
  m.world = r.world;
  if (Number.isFinite(m.ammo[p][shot.weapon])) m.ammo[p][shot.weapon] = Math.max(0, m.ammo[p][shot.weapon] - 1);
  const st = m.stats[p];
  st.shots++;
  st.biggestCrater = Math.max(st.biggestCrater, r.cellsDestroyed);
  st.longestThrow = Math.max(st.longestThrow, Math.round(r.maxDistance));

  const [k0, k1] = r.ko;
  const selfKo = r.ko[p];
  const oppKo = r.ko[o];
  if (k0 && k1) return { kind: 'draw' };
  if (oppKo || selfKo) {
    const winner = oppKo ? p : o;
    if (oppKo) st.hits++;
    const direct = r.events.some((e) => e.type === 'gorillaHit' && e.player === o);
    const reason = selfKo ? 'self' : direct ? 'hit' : 'fell';
    m.scores[winner]++;
    m.lastRoundWinner = winner;
    if (m.scores[winner] >= m.cfg.target) {
      m.over = true;
      m.winner = winner;
      return { kind: 'matchWon', winner };
    }
    return { kind: 'roundWon', winner, reason };
  }
  m.turn = o;
  const base = m.cond.baseWind;
  const gust = m.world.wind + m.rng.range(-GUST, GUST);
  m.world.wind = Math.max(-MAX_WIND, Math.min(MAX_WIND, Math.max(base - GUST_SPAN, Math.min(base + GUST_SPAN, gust))));
  return { kind: 'continue' };
}
