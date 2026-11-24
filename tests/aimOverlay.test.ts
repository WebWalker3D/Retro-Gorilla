import { describe, expect, it } from 'vitest';
import { arrowShape, guideLength, powerColor } from '../src/ui/aimGeometry';

describe('aim guide geometry', () => {
  it('the arrow tip sits `len` pixels along the direction from the hand', () => {
    const a = arrowShape(100, 200, 1, 0, 80, 10);
    expect(a.tipX).toBeCloseTo(180);
    expect(a.tipY).toBeCloseTo(200);
    const b = arrowShape(100, 200, 0, -1, 50, 10);
    expect(b.tipX).toBeCloseTo(100);
    expect(b.tipY).toBeCloseTo(150);
    expect(a.points.split(' ').length).toBe(7);
  });

  it('a stronger throw draws a longer arrow, within sane bounds', () => {
    expect(guideLength(1)).toBeGreaterThan(guideLength(0.5));
    expect(guideLength(0)).toBeGreaterThanOrEqual(30);
    expect(guideLength(1)).toBeLessThanOrEqual(200);
  });

  it('power colour runs from green (soft) to red (hard)', () => {
    expect(powerColor(0)).toBe('hsl(120 85% 55%)');
    expect(powerColor(1)).toBe('hsl(0 85% 55%)');
    expect(powerColor(5)).toBe('hsl(0 85% 55%)');
  });
});
