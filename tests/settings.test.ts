import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, loadSettings, saveSettings } from '../src/settings';

const store = (v: string | null) => {
  const data: Record<string, string> = {};
  if (v !== null) data['retro-gorilla:settings'] = v;
  return { getItem: (k: string) => data[k] ?? null, setItem: (k: string, val: string) => void (data[k] = val), data };
};

describe('settings', () => {
  it('falls back to defaults when nothing or garbage is stored', () => {
    expect(loadSettings(store(null))).toEqual(DEFAULT_SETTINGS);
    expect(loadSettings(store('{not json'))).toEqual(DEFAULT_SETTINGS);
  });

  it('keeps valid stored values and repairs invalid ones', () => {
    const s = loadSettings(store(JSON.stringify({ preset: 'ultra', master: 0.3, killcam: false, aimPreview: 'banana', music: 7, names: ['Kong', 42] })));
    expect(s.preset).toBe('ultra');
    expect(s.master).toBe(0.3);
    expect(s.killcam).toBe(false);
    expect(s.aimPreview).toBe(DEFAULT_SETTINGS.aimPreview);
    expect(s.music).toBe(1);
    expect(s.names).toEqual(['Kong', DEFAULT_SETTINGS.names[1]]);
  });

  it('round-trips through storage', () => {
    const st = store(null);
    const s = { ...DEFAULT_SETTINGS, preset: 'low' as const, sfx: 0.2 };
    saveSettings(s, st);
    expect(loadSettings(st)).toEqual(s);
  });
});
