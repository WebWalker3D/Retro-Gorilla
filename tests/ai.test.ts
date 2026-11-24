import { describe, expect, it } from 'vitest';
import { chooseShot, newAiMemory } from '../src/sim/ai';
import { canUse, newMatch, type MatchConfig } from '../src/sim/match';
import { Rng } from '../src/sim/rng';
import { simulateShot } from '../src/sim/shot';
import { fillRect } from './helpers';

const cfg = (seed: number, skill: 0 | 1 | 2 = 2): MatchConfig => ({
  names: ['A', 'B'], cpu: [true, true], skill: [skill, skill], target: 3, gravity: 9.8, seed,
});

describe('CPU opponent', () => {
  it('a noise-free Silverback finds a knockout in almost every city', { timeout: 30000 }, () => {
    let hits = 0;
    for (let seed = 1; seed <= 10; seed++) {
      const m = newMatch(cfg(seed));
      const s = chooseShot(m, 0, new Rng(seed), newAiMemory(), { noise: 0 });
      const r = simulateShot(m.world, s);
      if (r.ko[1] && !r.ko[0]) hits++;
    }
    expect(hits).toBeGreaterThanOrEqual(9);
  });

  it('always returns a legal throw, even when the target is walled off', () => {
    const m = newMatch(cfg(5, 1));
    fillRect(m.world.city, 58, 0, 4, 80);
    for (let i = 0; i < 5; i++) {
      const s = chooseShot(m, 0, new Rng(i), newAiMemory());
      expect(Number.isFinite(s.angle) && Number.isFinite(s.velocity)).toBe(true);
      expect(s.angle).toBeGreaterThanOrEqual(0);
      expect(s.angle).toBeLessThanOrEqual(180);
      expect(s.velocity).toBeGreaterThanOrEqual(1);
      expect(s.velocity).toBeLessThanOrEqual(200);
      expect(canUse(m, 0, s.weapon)).toBe(true);
    }
  });

  it('a Chimp only throws plain bananas and is not perfectly consistent', () => {
    const m = newMatch(cfg(3, 0));
    const shots = Array.from({ length: 8 }, (_, i) => chooseShot(m, 1, new Rng(100 + i), newAiMemory()));
    expect(shots.every((s) => s.weapon === 'banana')).toBe(true);
    expect(new Set(shots.map((s) => s.angle.toFixed(2))).size).toBeGreaterThan(1);
  });

  it('player 2 aims toward player 1', () => {
    const m = newMatch(cfg(8));
    const s = chooseShot(m, 1, new Rng(1), newAiMemory(), { noise: 0 });
    expect(s.player).toBe(1);
    expect(s.angle).toBeLessThan(90);
  });
});
