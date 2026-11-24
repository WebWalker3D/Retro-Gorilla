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
/** Quality presets and frame-time policies. Pure data/functions: no three.js, unit-tested. */
export type Preset = 'low' | 'medium' | 'high' | 'ultra';
export const PRESET_ORDER: Preset[] = ['low', 'medium', 'high', 'ultra'];

export interface QualitySettings {
  preset: Preset;
  shadows: 0 | 1024 | 2048;
  softShadows: boolean;
  bloom: boolean;
  smaa: boolean;
  ao: boolean;
  /** Fraction of the particle/debris pools used. */
  particleScale: number;
  /** Starting (and maximum) dynamic-resolution scale. */
  renderScale: number;
  maxDpr: number;
  backdropRows: number;
}

export const PRESETS: Record<Preset, QualitySettings> = {
  low: { preset: 'low', shadows: 0, softShadows: false, bloom: false, smaa: false, ao: false, particleScale: 0.25, renderScale: 0.75, maxDpr: 1, backdropRows: 1 },
  medium: { preset: 'medium', shadows: 1024, softShadows: false, bloom: true, smaa: false, ao: false, particleScale: 0.6, renderScale: 0.85, maxDpr: 1, backdropRows: 2 },
  high: { preset: 'high', shadows: 2048, softShadows: false, bloom: true, smaa: true, ao: false, particleScale: 1, renderScale: 1, maxDpr: 1, backdropRows: 2 },
  ultra: { preset: 'ultra', shadows: 2048, softShadows: true, bloom: true, smaa: true, ao: true, particleScale: 1, renderScale: 1, maxDpr: 2, backdropRows: 3 },
};

/** Auto-detect: pick a preset from the mean frame time measured while running High. */
export function presetForFrameTime(meanMs: number): Preset {
  if (meanMs <= 18) return 'high';
  if (meanMs <= 30) return 'medium';
  return 'low';
}

const SLOW_MS = 1000 / 55;
const FAST_MS = 1000 / 57;
export const MIN_RENDER_SCALE = 0.6;

/** One dynamic-resolution step from the rolling mean frame time. */
export function nextRenderScale(current: number, meanMs: number, max: number): number {
  if (meanMs > SLOW_MS) return Math.max(MIN_RENDER_SCALE, Math.round((current - 0.05) * 100) / 100);
  if (meanMs < FAST_MS) return Math.min(max, Math.round((current + 0.05) * 100) / 100);
  return current;
}
