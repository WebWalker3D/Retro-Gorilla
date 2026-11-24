import { describe, expect, it } from 'vitest';
import { PRESETS, nextRenderScale, presetForFrameTime } from '../src/render/quality';

describe('quality', () => {
  it('presets follow the spec table', () => {
    expect(PRESETS.low.shadows).toBe(0);
    expect(PRESETS.medium.shadows).toBe(1024);
    expect(PRESETS.high.shadows).toBe(2048);
    expect(PRESETS.ultra.ao).toBe(true);
    expect(PRESETS.high.ao).toBe(false);
    expect(PRESETS.low.renderScale).toBe(0.75);
    expect(PRESETS.medium.renderScale).toBe(0.85);
    expect(PRESETS.high.bloom && PRESETS.high.smaa).toBe(true);
  });

  it('auto-detect drops a preset when the High sample is slow', () => {
    expect(presetForFrameTime(12)).toBe('high');
    expect(presetForFrameTime(22)).toBe('medium');
    expect(presetForFrameTime(40)).toBe('low');
  });

  it('dynamic resolution steps down when slow, up when there is headroom, within bounds', () => {
    expect(nextRenderScale(1, 25, 1)).toBeCloseTo(0.95);
    expect(nextRenderScale(0.6, 40, 1)).toBe(0.6);
    expect(nextRenderScale(0.8, 10, 1)).toBeCloseTo(0.85);
    expect(nextRenderScale(1, 10, 1)).toBe(1);
    expect(nextRenderScale(0.9, 16.7, 1)).toBeCloseTo(0.95); // vsync-locked 60 Hz counts as headroom
    expect(nextRenderScale(0.9, 17.9, 1)).toBe(0.9);
  });
});
