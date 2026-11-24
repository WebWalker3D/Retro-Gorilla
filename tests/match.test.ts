import { describe, expect, it } from 'vitest';
import { cloneWorld } from '../src/sim/city';
import { applyShot, canUse, newMatch, startRound, type MatchConfig, type MatchState } from '../src/sim/match';
import { simulateShot } from '../src/sim/shot';
import type { Player, Shot, ShotResult } from '../src/sim/types';
import { emptyWorld } from './helpers';

const cfg = (over: Partial<MatchConfig> = {}): MatchConfig => ({
  names: ['A', 'B'], cpu: [false, false], skill: [1, 1], target: 3, gravity: 9.8, seed: 1234, ...over,
});

/** Synthetic result: which gorillas end up KO'd and whether by a direct hit or a fall. */
function fake(m: MatchState, ko: [boolean, boolean], how: 'hit' | 'fall' = 'hit', dist = 30, crater = 12): ShotResult {
  const world = cloneWorld(m.world);
  const events: ShotResult['events'] = [{ t: 0, type: 'launch', id: 0 }];
  ko.forEach((k, i) => {
    if (!k) return;
    world.gorillas[i].ko = true;
    if (how === 'hit') events.push({ t: 1, type: 'gorillaHit', player: i as Player, id: 0 });
    else events.push({ t: 1, type: 'gorillaFall', player: i as Player, fromY: 20, toY: 0, ko: true });
  });
  events.push({ t: 1, type: 'end' });
  return { events, paths: [], world, ko, maxDistance: dist, cellsDestroyed: crater };
}
const shot = (player: Player, weapon: Shot['weapon'] = 'banana'): Shot => ({ player, angle: 45, velocity: 50, weapon });

describe('match rules', () => {
  it('starts round 1 with player 1 to throw and full ammo', () => {
    const m = newMatch(cfg());
    expect(m.round).toBe(1);
    expect(m.turn).toBe(0);
    expect(m.scores).toEqual([0, 0]);
    expect(m.ammo[0].bunch).toBe(1);
    expect(m.ammo[1].rubber).toBe(2);
    expect(Math.abs(m.world.wind)).toBeLessThanOrEqual(10);
  });

  it('a miss passes the turn', () => {
    const m = newMatch(cfg());
    expect(applyShot(m, shot(0), fake(m, [false, false]))).toEqual({ kind: 'continue' });
    expect(m.turn).toBe(1);
  });

  it('special weapons use ammo; bananas never run out', () => {
    const m = newMatch(cfg());
    applyShot(m, shot(0, 'bunch'), fake(m, [false, false]));
    expect(canUse(m, 0, 'bunch')).toBe(false);
    expect(canUse(m, 0, 'banana')).toBe(true);
    expect(canUse(m, 1, 'bunch')).toBe(true);
  });

  it('hitting the opponent scores for the thrower', () => {
    const m = newMatch(cfg());
    expect(applyShot(m, shot(0), fake(m, [false, true]))).toEqual({ kind: 'roundWon', winner: 0, reason: 'hit' });
    expect(m.scores).toEqual([1, 0]);
  });

  it('knocking the opponent off their roof scores as a fall', () => {
    const m = newMatch(cfg());
    expect(applyShot(m, shot(0), fake(m, [false, true], 'fall'))).toEqual({ kind: 'roundWon', winner: 0, reason: 'fell' });
  });

  it('knocking yourself out scores for the opponent', () => {
    const m = newMatch(cfg());
    m.turn = 1;
    expect(applyShot(m, shot(1), fake(m, [false, true], 'fall'))).toEqual({ kind: 'roundWon', winner: 0, reason: 'self' });
    expect(m.scores).toEqual([1, 0]);
  });

  it('both knocked out is a draw with no points', () => {
    const m = newMatch(cfg());
    expect(applyShot(m, shot(0), fake(m, [true, true]))).toEqual({ kind: 'draw' });
    expect(m.scores).toEqual([0, 0]);
  });

  it('the match ends at the target score', () => {
    const m = newMatch(cfg({ target: 1 }));
    expect(applyShot(m, shot(0), fake(m, [false, true]))).toEqual({ kind: 'matchWon', winner: 0 });
    expect(m.over).toBe(true);
    expect(m.winner).toBe(0);
  });

  it('a new round gives a new city and the loser throws first', () => {
    const m = newMatch(cfg());
    const before = Array.from(m.world.city.cells);
    applyShot(m, shot(0), fake(m, [false, true]));
    startRound(m);
    expect(m.round).toBe(2);
    expect(m.turn).toBe(1);
    expect(Array.from(m.world.city.cells)).not.toEqual(before);
    expect(m.world.gorillas.every((g) => !g.ko)).toBe(true);
    expect(m.ammo[0].bunch).toBe(1);
  });

  it('wind gusts stay near the round base wind', () => {
    const m = newMatch(cfg());
    const base = m.cond.baseWind;
    for (let i = 0; i < 100; i++) {
      applyShot(m, shot(m.turn), fake(m, [false, false]));
      expect(Math.abs(m.world.wind - base)).toBeLessThanOrEqual(3 + 1e-9);
      expect(Math.abs(m.world.wind)).toBeLessThanOrEqual(12);
    }
  });

  it('tracks per-player stats', () => {
    const m = newMatch(cfg());
    applyShot(m, shot(0), fake(m, [false, false], 'hit', 40, 20));
    applyShot(m, shot(1), fake(m, [false, false], 'hit', 10, 5));
    applyShot(m, shot(0), fake(m, [false, true], 'hit', 55, 9));
    expect(m.stats[0]).toEqual({ shots: 2, hits: 1, biggestCrater: 20, longestThrow: 55 });
    expect(m.stats[1].shots).toBe(1);
  });

  it('works end to end with a real throw', () => {
    const m = newMatch(cfg());
    m.world = emptyWorld();
    let hit: ShotResult | null = null;
    let s: Shot = shot(0);
    for (let v = 40; v <= 70 && !hit; v += 0.5) {
      s = { player: 0, angle: 45, velocity: v, weapon: 'banana' };
      const r = simulateShot(m.world, s);
      if (r.ko[1] && !r.ko[0]) hit = r;
    }
    expect(applyShot(m, s, hit!)).toEqual({ kind: 'roundWon', winner: 0, reason: 'hit' });
  });
});
