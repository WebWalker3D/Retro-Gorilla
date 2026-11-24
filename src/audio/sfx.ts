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
import type { Weather } from '../sim/match';

/** Every sound is synthesized at runtime with WebAudio: no sample files. */
export class Sfx {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfxBus!: GainNode;
  private musicBus!: GainNode;
  private ambBus!: GainNode;
  private noise!: AudioBuffer;
  private whistleOsc: OscillatorNode | null = null;
  private whistleGain: GainNode | null = null;
  private ambSrc: AudioBufferSourceNode | null = null;
  private windFilter!: BiquadFilterNode;
  private windGain!: GainNode;
  private rainGain!: GainNode;
  private musicTimer: number | null = null;
  private musicStep = 0;
  private nextNote = 0;
  private vol = { master: 0.8, music: 0.5, sfx: 0.9 };
  muted = false;

  /** Must be called from a user gesture (browsers block audio until then). */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const ctx = new AudioContext();
    this.ctx = ctx;
    this.master = ctx.createGain();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    this.master.connect(comp).connect(ctx.destination);
    this.sfxBus = ctx.createGain();
    this.musicBus = ctx.createGain();
    this.ambBus = ctx.createGain();
    this.sfxBus.connect(this.master);
    this.musicBus.connect(this.master);
    this.ambBus.connect(this.master);
    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    // ambience: one looping noise source split into wind + rain beds
    this.ambSrc = ctx.createBufferSource();
    this.ambSrc.buffer = this.noise;
    this.ambSrc.loop = true;
    this.windFilter = ctx.createBiquadFilter();
    this.windFilter.type = 'lowpass';
    this.windFilter.frequency.value = 400;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0;
    const rainHp = ctx.createBiquadFilter();
    rainHp.type = 'highpass';
    rainHp.frequency.value = 2500;
    this.rainGain = ctx.createGain();
    this.rainGain.gain.value = 0;
    this.ambSrc.connect(this.windFilter).connect(this.windGain).connect(this.ambBus);
    this.ambSrc.connect(rainHp).connect(this.rainGain).connect(this.ambBus);
    this.ambSrc.start();
    this.applyVolumes();
  }

  setVolumes(master: number, music: number, sfx: number): void {
    this.vol = { master, music, sfx };
    this.applyVolumes();
  }

  private applyVolumes(): void {
    if (!this.ctx) return;
    this.master.gain.value = this.muted ? 0 : this.vol.master;
    this.musicBus.gain.value = this.vol.music * 0.35;
    this.sfxBus.gain.value = this.vol.sfx;
    this.ambBus.gain.value = this.vol.sfx * 0.6;
  }

  setMuted(m: boolean): void {
    this.muted = m;
    this.applyVolumes();
  }

  private get t(): number {
    return this.ctx!.currentTime;
  }

  private noiseBurst(dur: number, filter: BiquadFilterType, freq: number, q: number, gain: number, freqEnd?: number, at = 0): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = ctx.createBiquadFilter();
    f.type = filter;
    f.Q.value = q;
    const t0 = this.t + at;
    f.frequency.setValueAtTime(freq, t0);
    if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f).connect(g).connect(this.sfxBus);
    src.start(t0, Math.random() * 1.5);
    src.stop(t0 + dur + 0.05);
  }

  private tone(type: OscillatorType, f0: number, f1: number, dur: number, gain: number, at = 0, bus?: GainNode): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = type;
    const t0 = this.t + at;
    o.frequency.setValueAtTime(f0, t0);
    o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(bus ?? this.sfxBus);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  }

  click(): void {
    if (!this.ctx) return;
    this.tone('square', 880, 1320, 0.06, 0.08);
  }

  throwWhoosh(power01: number): void {
    if (!this.ctx) return;
    this.noiseBurst(0.35, 'bandpass', 500, 2, 0.5 + power01 * 0.4, 2400);
    this.grunt(0.6);
    this.startWhistle();
  }

  private startWhistle(): void {
    this.stopWhistle();
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = 900;
    const g = ctx.createGain();
    g.gain.value = 0;
    o.connect(g).connect(this.sfxBus);
    o.start();
    this.whistleOsc = o;
    this.whistleGain = g;
  }

  /** Banana whistle while flying: pitch follows height, louder when fast. */
  whistle(height01: number, speed01: number): void {
    if (!this.whistleOsc || !this.ctx) return;
    this.whistleOsc.frequency.setTargetAtTime(500 + height01 * 900, this.t, 0.05);
    this.whistleGain!.gain.setTargetAtTime(0.025 + speed01 * 0.03, this.t, 0.05);
  }

  stopWhistle(): void {
    if (!this.whistleOsc || !this.ctx) return;
    this.whistleGain!.gain.setTargetAtTime(0, this.t, 0.03);
    this.whistleOsc.stop(this.t + 0.2);
    this.whistleOsc = null;
    this.whistleGain = null;
  }

  explode(radius: number): void {
    if (!this.ctx) return;
    this.stopWhistle();
    const k = radius / 3.5;
    this.noiseBurst(1.1 + k * 0.6, 'lowpass', 2600, 0.7, 0.9, 120);
    this.tone('sine', 110, 28, 0.9 + k * 0.4, 0.9);
    this.tone('triangle', 70, 30, 0.5, 0.5);
    for (let i = 0; i < 6; i++) this.noiseBurst(0.06, 'highpass', 3000, 1, 0.15, undefined, 0.15 + Math.random() * 0.8);
  }

  rumble(cells: number): void {
    if (!this.ctx) return;
    const k = Math.min(1, cells / 120);
    this.noiseBurst(1.8 + k, 'lowpass', 300, 1, 0.5 + k * 0.4, 60, 0.1);
    for (let i = 0; i < 8; i++) this.noiseBurst(0.08, 'bandpass', 900 + Math.random() * 900, 3, 0.18, undefined, 0.3 + Math.random() * 1.6);
  }

  bounce(): void {
    if (!this.ctx) return;
    this.tone('sine', 180, 520, 0.18, 0.4);
    this.tone('sine', 520, 260, 0.2, 0.25, 0.12);
  }

  pop(): void {
    if (!this.ctx) return;
    this.tone('square', 600, 200, 0.12, 0.15);
    this.noiseBurst(0.1, 'bandpass', 1500, 2, 0.3);
  }

  grunt(level = 1): void {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    const t0 = this.t;
    o.frequency.setValueAtTime(130 + Math.random() * 30, t0);
    o.frequency.exponentialRampToValueAtTime(80, t0 + 0.25);
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 520;
    f.Q.value = 3;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.35 * level, t0 + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.28);
    o.connect(f).connect(g).connect(this.sfxBus);
    o.start(t0);
    o.stop(t0 + 0.3);
  }

  ouch(): void {
    if (!this.ctx) return;
    this.grunt(1.2);
    this.tone('sawtooth', 220, 90, 0.5, 0.12, 0.08);
    this.tone('sine', 1400, 2200, 0.12, 0.06, 0.3);
    this.tone('sine', 1700, 2600, 0.12, 0.05, 0.45);
  }

  thud(): void {
    if (!this.ctx) return;
    this.tone('sine', 90, 35, 0.35, 0.8);
    this.noiseBurst(0.25, 'lowpass', 600, 1, 0.5, 100);
  }

  chestBeat(): void {
    if (!this.ctx) return;
    for (let i = 0; i < 10; i++) {
      const at = i * 0.13;
      this.tone('sine', 95 - (i % 2) * 12, 45, 0.16, 0.7, at);
      this.noiseBurst(0.04, 'bandpass', 800, 1, 0.12, undefined, at);
    }
    this.grunt(1);
  }

  sunGasp(): void {
    if (!this.ctx) return;
    this.tone('sine', 400, 1200, 0.35, 0.15);
    this.tone('triangle', 600, 1500, 0.3, 0.08, 0.05);
  }

  thunder(): void {
    if (!this.ctx) return;
    this.noiseBurst(3, 'lowpass', 500, 0.8, 0.7, 40, 0.4);
    this.noiseBurst(0.2, 'highpass', 1500, 1, 0.3, undefined, 0.35);
  }

  setAmbience(weather: Weather, wind: number): void {
    if (!this.ctx) return;
    const w = Math.min(1, Math.abs(wind) / 10);
    this.windGain.gain.setTargetAtTime(0.03 + w * 0.12, this.t, 0.5);
    this.windFilter.frequency.setTargetAtTime(250 + w * 600, this.t, 0.5);
    this.rainGain.gain.setTargetAtTime(weather === 'rain' ? 0.12 : 0, this.t, 0.5);
  }

  /** A short procedural loop for the title screen. */
  music(on: boolean): void {
    if (!this.ctx) return;
    if (!on) {
      if (this.musicTimer !== null) clearInterval(this.musicTimer);
      this.musicTimer = null;
      return;
    }
    if (this.musicTimer !== null) return;
    const bpm = 112;
    const step = 60 / bpm / 2;
    const bass = [45, 45, 52, 45, 48, 48, 55, 50];
    const arp = [0, 7, 12, 15, 12, 7, 3, 7];
    const chords = [0, 0, 3, 5];
    const hz = (n: number) => 440 * Math.pow(2, (n - 69) / 12);
    this.nextNote = this.t + 0.1;
    this.musicTimer = window.setInterval(() => {
      while (this.nextNote < this.t + 0.25) {
        const s = this.musicStep++;
        const bar = Math.floor(s / 8) % 4;
        const at = this.nextNote - this.t;
        const root = 57 + chords[bar];
        if (s % 2 === 0) this.tone('triangle', hz(bass[(s / 2) % 8] + chords[bar] - 12), hz(bass[(s / 2) % 8] + chords[bar] - 12) * 0.99, step * 1.8, 0.35, at, this.musicBus);
        this.tone('square', hz(root + arp[s % 8]), hz(root + arp[s % 8]), step * 0.9, 0.06, at, this.musicBus);
        if (s % 4 === 2) {
          const ctx = this.ctx!;
          const src = ctx.createBufferSource();
          src.buffer = this.noise;
          const g = ctx.createGain();
          const f = ctx.createBiquadFilter();
          f.type = 'highpass';
          f.frequency.value = 6000;
          g.gain.setValueAtTime(0.06, this.nextNote);
          g.gain.exponentialRampToValueAtTime(0.0001, this.nextNote + 0.05);
          src.connect(f).connect(g).connect(this.musicBus);
          src.start(this.nextNote, Math.random());
          src.stop(this.nextNote + 0.06);
        }
        if (s % 8 === 0) this.tone('sine', 120, 40, 0.18, 0.5, at, this.musicBus);
        this.nextNote += step;
      }
    }, 60);
  }
}
