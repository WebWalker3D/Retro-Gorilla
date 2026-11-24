import { describe, expect, it } from 'vitest';
import { GRAVITY_SCALE, MAX_SHOT_TIME } from '../src/sim/constants';
import { generateCity } from '../src/sim/city';
import { launchPoint, launchVector, simulateShot } from '../src/sim/shot';
import type { ShotResult, World } from '../src/sim/types';
import { checksum, emptyWorld, fillRect } from './helpers';

const firstExplosion = (r: ShotResult) => r.events.find((e) => e.type === 'explode') as Extract<ShotResult['events'][number], { type: 'explode' }> | undefined;

describe('launchVector', () => {
  it('splits velocity by angle and mirrors for player 2', () => {
    const a = launchVector({ player: 0, angle: 45, velocity: 50, weapon: 'banana' });
    expect(a.vx).toBeCloseTo(35.355, 2);
    expect(a.vy).toBeCloseTo(35.355, 2);
    const b = launchVector({ player: 1, angle: 45, velocity: 50, weapon: 'banana' });
    expect(b.vx).toBeCloseTo(-35.355, 2);
  });
});

describe('simulateShot', () => {
  it('follows a ballistic arc in an empty city', () => {
    const w = emptyWorld();
    const shot = { player: 0 as const, angle: 45, velocity: 50, weapon: 'banana' as const };
    const p = launchPoint(w, 0);
    const { vx, vy } = launchVector(shot);
    const g = w.gravity * GRAVITY_SCALE;
    const t = (vy + Math.sqrt(vy * vy + 2 * g * p.y)) / g;
    const expected = p.x + vx * t;
    const e = firstExplosion(simulateShot(w, shot));
    expect(e).toBeDefined();
    expect(Math.abs(e!.x - expected)).toBeLessThan(1);
  });

  it('cannot tunnel through a one-cell wall at top speed', () => {
    const w = emptyWorld();
    fillRect(w.city, 8, 0, 5, 20);
    w.gorillas[0] = { x: 10, y: 20, ko: false };
    fillRect(w.city, 60, 0, 1, 80);
    const e = firstExplosion(simulateShot(w, { player: 0, angle: 0, velocity: 200, weapon: 'banana' }));
    expect(e!.x).toBeGreaterThanOrEqual(59);
    expect(e!.x).toBeLessThanOrEqual(61);
  });

  it('does not hit the thrower at launch, but a banana thrown straight up comes back down on them', () => {
    const r = simulateShot(emptyWorld(), { player: 0, angle: 90, velocity: 30, weapon: 'banana' });
    const hit = r.events.find((e) => e.type === 'gorillaHit');
    expect(hit).toBeDefined();
    expect(hit!.t).toBeGreaterThan(1);
    expect(r.ko).toEqual([true, false]);
  });

  it('a very slow throw resolves without errors', () => {
    const r = simulateShot(emptyWorld(), { player: 0, angle: 30, velocity: 1, weapon: 'banana' });
    expect(r.events.at(-1)!.type).toBe('end');
  });

  it('can hit the opponent', () => {
    let hits = 0;
    for (let v = 40; v <= 70; v += 0.5) {
      const r = simulateShot(emptyWorld(), { player: 0, angle: 45, velocity: v, weapon: 'banana' });
      if (r.ko[1]) {
        hits++;
        expect(r.events.some((e) => e.type === 'gorillaHit' && e.player === 1)).toBe(true);
      }
    }
    expect(hits).toBeGreaterThan(0);
  });

  it('terminates a shot that never comes down (time cap) as gone', () => {
    const w = emptyWorld();
    w.gravity = 1.6;
    const r = simulateShot(w, { player: 0, angle: 90, velocity: 200, weapon: 'banana' });
    expect(r.events.some((e) => e.type === 'gone')).toBe(true);
    expect(r.events.at(-1)!.type).toBe('end');
    expect(r.events.at(-1)!.t).toBeLessThanOrEqual(MAX_SHOT_TIME + 0.01);
  });

  it('terminates a shot that leaves the city sideways as gone', () => {
    const w = emptyWorld();
    w.gravity = 1.6;
    const r = simulateShot(w, { player: 0, angle: 80, velocity: 200, weapon: 'banana' });
    expect(r.events.some((e) => e.type === 'gone')).toBe(true);
    expect(r.ko).toEqual([false, false]);
  });

  it('wind pushes the banana, and the heavy plantain less', () => {
    const land = (wind: number, weapon: 'banana' | 'plantain') => {
      const w: World = emptyWorld();
      w.wind = wind;
      return firstExplosion(simulateShot(w, { player: 0, angle: 45, velocity: 40, weapon }))!.x;
    };
    const dBanana = land(10, 'banana') - land(0, 'banana');
    const dPlantain = land(10, 'plantain') - land(0, 'plantain');
    expect(dBanana).toBeGreaterThan(5);
    expect(dPlantain).toBeGreaterThan(0);
    expect(dPlantain).toBeLessThan(dBanana);
  });

  it('is deterministic and does not mutate its input', () => {
    const { city, gorillas } = generateCity(7);
    const w: World = { city, gorillas, gravity: 9.8, wind: 3.3, sun: { x: 60, y: 68, r: 4 } };
    const before = checksum(w.city);
    const shot = { player: 0 as const, angle: 50, velocity: 62, weapon: 'banana' as const };
    const a = simulateShot(w, shot);
    const b = simulateShot(w, shot);
    expect(a.events).toEqual(b.events);
    expect(checksum(w.city)).toBe(before);
    expect(w.gorillas[0].ko).toBe(false);
  });

  it('records a path that starts at the launch point and carves the city', () => {
    const { city, gorillas } = generateCity(11);
    const w: World = { city, gorillas, gravity: 9.8, wind: 0, sun: { x: 60, y: 68, r: 4 } };
    const r = simulateShot(w, { player: 0, angle: 20, velocity: 40, weapon: 'banana' });
    const p = launchPoint(w, 0);
    expect(r.paths[0].xy[0]).toBeCloseTo(p.x, 5);
    expect(r.paths[0].xy[1]).toBeCloseTo(p.y, 5);
    expect(r.events[0].type).toBe('launch');
    expect(r.cellsDestroyed).toBeGreaterThan(0);
    expect(checksum(r.world.city)).not.toBe(checksum(w.city));
  });
});

describe('samplePath', () => {
  it('interpolates recorded positions and ends exactly at the final sample', async () => {
    const { samplePath } = await import('../src/sim/shot');
    const r = simulateShot(emptyWorld(), { player: 0, angle: 45, velocity: 50, weapon: 'banana' });
    const p = r.paths[0];
    const o = { x: 0, y: 0 };
    samplePath(p, 0, o);
    expect(o.x).toBeCloseTo(p.xy[0], 5);
    samplePath(p, p.t1 + 5, o);
    expect(o.x).toBeCloseTo(p.xy[p.xy.length - 2], 5);
    expect(o.y).toBeCloseTo(p.xy[p.xy.length - 1], 5);
    // monotonic x along a rightward throw
    let last = -Infinity;
    for (let t = 0; t <= p.t1; t += 0.01) {
      samplePath(p, t, o);
      expect(o.x).toBeGreaterThanOrEqual(last - 1e-6);
      last = o.x;
    }
  });
});
