/*
 * The contents of this file are subject to the Common Public Attribution License
 * Version 1.0 (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 * https://github.com/WebWalker3D/Retro-Gorilla/blob/main/LICENSE. The License is
 * based on the Mozilla Public License Version 1.1 but Sections 14 and 15 have been
 * added to cover use of software over a computer network and provide for limited
 * attribution for the Original Developer. In addition, Exhibit A has been modified
 * to be consistent with Exhibit B.
 *
 * Software distributed under the License is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License for the
 * specific language governing rights and limitations under the License.
 *
 * The Original Code is Retro Gorilla.
 * The Initial Developer of the Original Code is Blaine Bouvier. All portions of the
 * code written by Blaine Bouvier are Copyright (c) 2026. All Rights Reserved.
 */
import { PRESET_ORDER, type Preset } from './render/quality';

export type AimPreview = 'full' | 'short' | 'off';

export interface Settings {
  /** null = auto-detect on first run. */
  preset: Preset | null;
  master: number;
  music: number;
  sfx: number;
  killcam: boolean;
  aimPreview: AimPreview;
  names: [string, string];
  target: number;
  gravity: number;
  skill: 0 | 1 | 2;
}

export const DEFAULT_SETTINGS: Settings = {
  preset: null, master: 0.8, music: 0.5, sfx: 0.9, killcam: true, aimPreview: 'short',
  names: ['Player 1', 'Player 2'], target: 3, gravity: 9.8, skill: 1,
};

const KEY = 'retro-gorilla:settings';
type Store = Pick<Storage, 'getItem' | 'setItem'>;

const num = (v: unknown, d: number, lo: number, hi: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d);
const name = (v: unknown, d: string) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 14) : d);

export function loadSettings(store: Store = localStorage): Settings {
  let raw: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(store.getItem(KEY) ?? '{}');
    if (parsed && typeof parsed === 'object') raw = parsed;
  } catch {
    /* corrupted: use defaults */
  }
  const d = DEFAULT_SETTINGS;
  const names = Array.isArray(raw.names) ? raw.names : [];
  return {
    preset: PRESET_ORDER.includes(raw.preset as Preset) ? (raw.preset as Preset) : d.preset,
    master: num(raw.master, d.master, 0, 1),
    music: num(raw.music, d.music, 0, 1),
    sfx: num(raw.sfx, d.sfx, 0, 1),
    killcam: typeof raw.killcam === 'boolean' ? raw.killcam : d.killcam,
    aimPreview: ['full', 'short', 'off'].includes(raw.aimPreview as string) ? (raw.aimPreview as AimPreview) : d.aimPreview,
    names: [name(names[0], d.names[0]), name(names[1], d.names[1])],
    target: Math.round(num(raw.target, d.target, 1, 20)),
    gravity: num(raw.gravity, d.gravity, 0.5, 30),
    skill: ([0, 1, 2] as const).includes(raw.skill as 0) ? (raw.skill as 0 | 1 | 2) : d.skill,
  };
}

export function saveSettings(s: Settings, store: Store = localStorage): void {
  try {
    store.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage full or blocked: settings just won't persist */
  }
}
