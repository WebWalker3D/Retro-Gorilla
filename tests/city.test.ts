import { describe, expect, it } from 'vitest';
import { carve, cellAt, createCity, detachUnsupported, generateCity, settleGorilla } from '../src/sim/city';
import { fillRect } from './helpers';

describe('generateCity', () => {
  it('is deterministic for a seed', () => {
    const a = generateCity(42);
    const b = generateCity(42);
    expect(Array.from(a.city.cells)).toEqual(Array.from(b.city.cells));
    expect(a.gorillas).toEqual(b.gorillas);
    const c = generateCity(43);
    expect(Array.from(c.city.cells)).not.toEqual(Array.from(a.city.cells));
  });

  it('builds solid columns from the street to each building height', () => {
    for (const seed of [1, 2, 3, 99]) {
      const { city } = generateCity(seed);
      city.buildings.forEach((b, i) => {
        for (let x = b.x0; x < b.x0 + b.width; x++) {
          for (let y = 0; y < b.height; y++) expect(cellAt(city, x, y)).toBe(i + 1);
          expect(cellAt(city, x, b.height)).toBe(0);
        }
      });
    }
  });

  it('puts each gorilla on a solid roof on its own side', () => {
    for (let seed = 0; seed < 20; seed++) {
      const { city, gorillas } = generateCity(seed);
      const [p0, p1] = gorillas;
      expect(p0.x).toBeLessThan(city.w / 2);
      expect(p1.x).toBeGreaterThan(city.w / 2);
      for (const g of gorillas) {
        expect(cellAt(city, Math.floor(g.x), g.y - 1)).toBeGreaterThan(0);
        expect(cellAt(city, Math.floor(g.x), g.y)).toBe(0);
      }
    }
  });
});

describe('carve', () => {
  it('removes a disc of cells', () => {
    const c = createCity(40, 40);
    fillRect(c, 0, 0, 40, 40);
    const removed = carve(c, 20, 20, 3);
    expect(removed.length).toBeGreaterThan(Math.PI * 9 - 8);
    expect(removed.length).toBeLessThan(Math.PI * 9 + 8);
    expect(cellAt(c, 20, 20)).toBe(0);
    expect(cellAt(c, 20, 25)).toBe(1);
  });
});

describe('detachUnsupported', () => {
  it('drops floating blocks and keeps grounded ones', () => {
    const c = createCity(30, 30);
    fillRect(c, 2, 0, 2, 10); // grounded column
    fillRect(c, 10, 12, 3, 3); // floating block
    const gone = detachUnsupported(c);
    expect(gone.length).toBe(9);
    expect(cellAt(c, 11, 13)).toBe(0);
    expect(cellAt(c, 2, 9)).toBe(1);
  });
});

describe('settleGorilla', () => {
  it('stays on a supported roof', () => {
    const c = createCity(30, 30);
    fillRect(c, 5, 0, 8, 10);
    expect(settleGorilla(c, { x: 9, y: 10, ko: false })).toEqual({ toY: 10, ko: false });
  });
  it('drops to a lower surface', () => {
    const c = createCity(30, 30);
    fillRect(c, 5, 0, 8, 4);
    expect(settleGorilla(c, { x: 9, y: 10, ko: false })).toEqual({ toY: 4, ko: false });
  });
  it('falls into the street and is knocked out', () => {
    const c = createCity(30, 30);
    expect(settleGorilla(c, { x: 9, y: 10, ko: false })).toEqual({ toY: 0, ko: true });
  });
  it('a gorilla already on the street is fine', () => {
    const c = createCity(30, 30);
    expect(settleGorilla(c, { x: 9, y: 0, ko: false })).toEqual({ toY: 0, ko: false });
  });
});
