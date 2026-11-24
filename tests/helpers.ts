import { createCity } from '../src/sim/city';
import type { City, World } from '../src/sim/types';

/** Empty city with both gorillas on the street, no wind, Earth gravity. */
export function emptyWorld(): World {
  const city = createCity(120, 80);
  return {
    city,
    gorillas: [
      { x: 10, y: 0, ko: false },
      { x: 110, y: 0, ko: false },
    ],
    gravity: 9.8,
    wind: 0,
    sun: { x: 60, y: 68, r: 4 },
  };
}

export function fillRect(c: City, x0: number, y0: number, w: number, h: number, id = 1): void {
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) c.cells[y * c.w + x] = id;
}

export function checksum(c: City): number {
  let s = 0;
  for (let i = 0; i < c.cells.length; i++) s = (s * 31 + c.cells[i] * (i + 1)) >>> 0;
  return s;
}
