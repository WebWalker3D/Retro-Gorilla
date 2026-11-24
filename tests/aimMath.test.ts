import { describe, expect, it } from 'vitest';
import { dragToAim, MAX_DRAG_VELOCITY } from '../src/ui/aimMath';

describe('dragToAim (slingshot)', () => {
  it('pulling straight back throws flat toward the opponent', () => {
    const a = dragToAim(-200, 0, 1, 1000);
    expect(a.angle).toBeCloseTo(0, 5);
    const b = dragToAim(200, 0, -1, 1000);
    expect(b.angle).toBeCloseTo(0, 5);
  });

  it('pulling down and back throws up at the matching angle (screen y grows downward)', () => {
    expect(dragToAim(-100, 100, 1, 1000).angle).toBeCloseTo(45, 5);
    expect(dragToAim(100, 100, -1, 1000).angle).toBeCloseTo(45, 5);
    expect(dragToAim(0, 100, 1, 1000).angle).toBeCloseTo(90, 5);
  });

  it('pulling forward throws backward over the head; pulling up clamps to the horizon', () => {
    expect(dragToAim(100, 100, 1, 1000).angle).toBeCloseTo(135, 5);
    expect(dragToAim(-100, -50, 1, 1000).angle).toBe(0);
    expect(dragToAim(100, -50, 1, 1000).angle).toBe(180);
  });

  it('power grows with drag length and is capped', () => {
    const short = dragToAim(-50, 0, 1, 1000).velocity;
    const long = dragToAim(-300, 0, 1, 1000).velocity;
    expect(long).toBeGreaterThan(short);
    expect(dragToAim(-5000, 0, 1, 1000).velocity).toBe(MAX_DRAG_VELOCITY);
    expect(dragToAim(-1, 0, 1, 1000).velocity).toBeGreaterThanOrEqual(1);
  });
});
