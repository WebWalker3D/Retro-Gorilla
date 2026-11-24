import { describe, expect, it } from 'vitest';
import { WEAPONS } from '../src/sim/constants';
import { simulateShot } from '../src/sim/shot';
import { emptyWorld } from './helpers';

describe('weapons', () => {
  it('a banana bunch splits at the apex into three bomblets', () => {
    const r = simulateShot(emptyWorld(), { player: 0, angle: 45, velocity: 50, weapon: 'bunch' });
    const splits = r.events.filter((e) => e.type === 'split');
    expect(splits.length).toBe(1);
    expect(r.events.filter((e) => e.type === 'explode').length).toBe(3);
    expect(r.paths.length).toBe(4);
  });

  it('a rubber banana bounces twice, then explodes', () => {
    const r = simulateShot(emptyWorld(), { player: 0, angle: 30, velocity: 30, weapon: 'rubber' });
    const types = r.events.map((e) => e.type).filter((t) => t === 'bounce' || t === 'explode');
    expect(types).toEqual(['bounce', 'bounce', 'explode']);
  });

  it('a plantain bomb has a bigger blast and feels the wind less', () => {
    expect(WEAPONS.plantain.radius).toBeGreaterThan(WEAPONS.banana.radius);
    expect(WEAPONS.plantain.windFactor).toBeLessThan(WEAPONS.banana.windFactor);
    const r = simulateShot(emptyWorld(), { player: 0, angle: 45, velocity: 45, weapon: 'plantain' });
    const e = r.events.find((x) => x.type === 'explode');
    expect(e && e.type === 'explode' && e.radius).toBe(WEAPONS.plantain.radius);
  });
});
