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
import { AiClient } from './aiClient';
import { Sfx } from '../audio/sfx';
import { Engine } from '../render/engine';
import { presetForFrameTime, type Preset } from '../render/quality';
import { Stage } from '../render/stage';
import { loadSettings, saveSettings, type Settings } from '../settings';
import { newAiMemory, type AiMemory } from '../sim/ai';
import { WEAPON_ORDER } from '../sim/constants';
import { applyShot, canUse, newMatch, startRound, type MatchConfig, type MatchState } from '../sim/match';
import { previewPath, simulateShot } from '../sim/shot';
import type { Player, Shot, ShotResult } from '../sim/types';
import { dragToAim } from '../ui/aimMath';
import { UI, type AimState, type SetupResult } from '../ui/ui';

interface Timer {
  left: number;
  total: number;
  tick?: (k: number) => void;
  resolve: () => void;
}

const PREVIEW = { full: 1, short: 0.33, off: 0 } as const;
const ease = (k: number) => 1 - Math.pow(1 - k, 3);

/** Game flow: title + attract mode, match setup, the turn loop, input, audio and settings. */
export class App {
  readonly engine: Engine;
  readonly stage: Stage;
  readonly sfx = new Sfx();
  readonly ui: UI;
  private ai = new AiClient();
  settings: Settings;
  private detected: Preset = 'high';
  match: MatchState | null = null;
  private token = 0;
  private attract = false;
  private paused = false;
  private aim: [AimState, AimState] = [
    { angle: 45, velocity: 60, weapon: 'banana' },
    { angle: 45, velocity: 60, weapon: 'banana' },
  ];
  private memory: [AiMemory, AiMemory] = [newAiMemory(), newAiMemory()];
  private aiming: Player | null = null;
  private humanResolve: ((s: Shot) => void) | null = null;
  private drag: { x: number; y: number; moved: boolean } | null = null;
  private inFlight = false;
  private timers: Timer[] = [];
  private audioOn = false;
  private screen: 'title' | 'setup' | 'settings' | 'match' | 'results' = 'title';

  constructor(canvas: HTMLCanvasElement, uiRoot: HTMLElement) {
    this.settings = loadSettings();
    this.engine = new Engine(canvas, this.settings.preset ?? 'high');
    this.stage = new Stage(this.engine);
    this.ui = new UI(uiRoot);
    this.ui.click = () => this.sfx.click();
    this.ui.onAimEdit = (a) => this.editAim(a);
    this.ui.onThrow = () => this.throwNow();
    this.ui.onPause = () => this.pause();
    this.sfx.setVolumes(this.settings.master, this.settings.music, this.settings.sfx);
    this.stage.on((e) => this.onStageEvent(e));
    this.engine.onFrame((dt, t) => this.frame(dt, t));
    this.bindInput(canvas);
  }

  start(): void {
    this.engine.start();
    this.goTitle();
    if (this.settings.preset === null) {
      // auto-detect: sample the attract mode at High, then settle on a preset
      void this.sleep(4).then(() => {
        this.detected = presetForFrameTime(this.engine.frameMs);
        if (this.settings.preset === null) this.applyPreset(this.detected);
      });
    }
  }

  applyPreset(p: Preset): void {
    this.engine.setQuality(p);
    this.stage.applyShadowSize();
    this.stage.effects.setScale(this.engine.q.particleScale);
  }

  // ——— screens ———
  goTitle(): void {
    this.paused = false;
    this.screen = 'title';
    this.ui.hideBanner();
    this.ui.showHud(false);
    this.ui.showConsole(false);
    this.ui.showFlightHint(false);
    void this.runMatch(
      { names: ['Kong-bot', 'Bonobot'], cpu: [true, true], skill: [1, 1], target: 999, gravity: 9.8, seed: (Math.random() * 1e9) | 0 },
      true,
    );
    this.showTitleMenu();
    this.sfx.music(this.audioOn);
  }

  private showTitleMenu(): void {
    this.screen = 'title';
    this.ui.showTitle((pick) => {
      if (pick === 'settings') this.openSettings(() => this.showTitleMenu());
      else {
        this.screen = 'setup';
        this.ui.showSetup(pick, this.settings, (r) => this.startMatch(r), () => this.showTitleMenu());
      }
    }, !this.audioOn);
  }

  private openSettings(onClose: () => void): void {
    this.screen = this.screen === 'match' ? 'match' : 'settings';
    this.ui.showSettings(
      this.settings,
      (s) => {
        const presetChanged = s.preset !== this.settings.preset;
        this.settings = s;
        saveSettings(s);
        this.sfx.setVolumes(s.master, s.music, s.sfx);
        if (!this.attract) this.stage.killcam = s.killcam;
        if (presetChanged) this.applyPreset(s.preset ?? this.detected);
        if (this.aiming !== null) this.refreshAim();
      },
      onClose,
      () => {
        const i = this.engine.info();
        return `${i.fps} fps on ${i.preset} quality at ${Math.round(i.renderScale * 100)}% resolution. ${i.gpu}`;
      },
    );
  }

  private startMatch(r: SetupResult): void {
    this.settings = { ...this.settings, names: r.mode === 'cpu' ? [r.names[0], this.settings.names[1]] : r.names, skill: r.skill, target: r.target, gravity: r.gravity };
    saveSettings(this.settings);
    this.sfx.music(false);
    this.ui.clearPanels();
    void this.runMatch({ names: r.names, cpu: [false, r.mode === 'cpu'], skill: [r.skill, r.skill], target: r.target, gravity: r.gravity, seed: (Math.random() * 1e9) | 0 }, false);
  }

  // ——— the match loop ———
  private async runMatch(cfg: MatchConfig, attract: boolean): Promise<void> {
    const token = ++this.token;
    this.ai.cancelAll();
    this.timers = [];
    this.endAiming();
    this.attract = attract;
    this.screen = attract ? this.screen : 'match';
    const m = newMatch(cfg);
    this.match = m;
    this.memory = [newAiMemory(), newAiMemory()];
    this.aim = [
      { angle: 45, velocity: 60, weapon: 'banana' },
      { angle: 45, velocity: 60, weapon: 'banana' },
    ];
    this.stage.killcam = attract || this.settings.killcam;
    this.stage.loadRound(m);
    this.ui.showHud(!attract);
    this.ui.setPlayers(cfg.names, cfg.cpu);
    this.ui.setScores(m.scores);
    this.ui.setWind(m.world.wind, m.round);
    this.sfx.setAmbience(m.cond.weather, m.world.wind);
    const live = () => token === this.token;

    while (live()) {
      const p = m.turn;
      if (!attract) {
        this.ui.setTurn(p);
        this.ui.turnBanner(cfg.names[p], p);
      }
      this.stage.showMarker(p);
      const shot = cfg.cpu[p] ? await this.cpuTurn(m, p, token) : await this.humanTurn(m, p);
      if (!shot || !live()) return;
      const r = simulateShot(m.world, shot);
      this.inFlight = true;
      this.ui.showFlightHint(!attract);
      this.ui.setTurn(null);
      await this.stage.playShot(shot, r);
      this.sfx.stopWhistle(); // a banana that leaves the map never explodes
      this.inFlight = false;
      this.stage.fastForward = false;
      this.ui.showFlightHint(false);
      if (!live()) return;
      const o = applyShot(m, shot, r);
      if (!canUse(m, p, this.aim[p].weapon)) this.aim[p].weapon = 'banana';
      if (o.kind === 'continue') {
        this.maybeTaunt(r, (1 - p) as Player);
        this.stage.setWind(m.world.wind);
        this.ui.setWind(m.world.wind, m.round);
        this.sfx.setAmbience(m.cond.weather, m.world.wind);
        continue;
      }
      this.ui.setScores(m.scores);
      const [title, sub] = this.ui.outcomeText(o, cfg.names, p);
      if (o.kind === 'draw') {
        if (!attract) await this.ui.announce(title, sub, 2200);
        else await this.sleep(1.2);
      } else {
        if (!attract) this.sfx.chestBeat();
        const celebration = this.stage.celebrate(o.winner);
        if (!attract && o.kind !== 'matchWon') void this.ui.announce(title, sub, 2600);
        await celebration;
      }
      if (!live()) return;
      if (o.kind === 'matchWon' && !attract) {
        this.screen = 'results';
        this.ui.showHud(false);
        this.ui.showResults(
          m,
          () => {
            this.ui.clearPanels();
            void this.runMatch({ ...cfg, seed: (Math.random() * 1e9) | 0 }, false);
          },
          () => this.goTitle(),
        );
        return;
      }
      startRound(m);
      this.memory = [newAiMemory(), newAiMemory()];
      this.stage.loadRound(m);
      this.ui.setWind(m.world.wind, m.round);
      this.sfx.setAmbience(m.cond.weather, m.world.wind);
    }
  }

  /** The target jeers at a throw that missed it by a mile. */
  private maybeTaunt(r: ShotResult, target: Player): void {
    const g = r.world.gorillas[target];
    let nearest = Infinity;
    for (const e of r.events) if (e.type === 'explode') nearest = Math.min(nearest, Math.hypot(e.x - g.x, e.y - g.y));
    if (nearest > 14 && Math.random() < 0.6) this.stage.gorillas[target].play('taunt');
  }

  private humanTurn(m: MatchState, p: Player): Promise<Shot> {
    return new Promise((resolve) => {
      if (!canUse(m, p, this.aim[p].weapon)) this.aim[p].weapon = 'banana';
      this.aiming = p;
      this.humanResolve = resolve;
      this.ui.showConsole(true, false);
      this.refreshAim();
    });
  }

  private async cpuTurn(m: MatchState, p: Player, token: number): Promise<Shot | null> {
    const show = !this.attract;
    this.ui.showConsole(show, true);
    if (show) this.ui.setAim(this.aim[p], m.ammo[p]);
    const think = this.ai.choose(m, p, this.memory[p]);
    await this.sleep(0.6 + Math.random() * 0.5);
    const res = await think;
    if (token !== this.token) return null;
    this.memory[p] = res.memory;
    const from = { ...this.aim[p] };
    const to = res.shot;
    this.aim[p].weapon = to.weapon;
    await this.tween(0.85, (k) => {
      const e = ease(k);
      this.aim[p].angle = from.angle + (to.angle - from.angle) * e;
      this.aim[p].velocity = from.velocity + (to.velocity - from.velocity) * e;
      if (show) this.ui.setAim(this.aim[p], m.ammo[p]);
      this.stage.setAiming(p, this.aim[p].angle, Math.min(1, this.aim[p].velocity / 120), null);
    });
    await this.sleep(0.25);
    if (token !== this.token) return null;
    this.aim[p].angle = to.angle;
    this.aim[p].velocity = to.velocity;
    this.stage.stopAiming();
    this.ui.showConsole(false);
    return to;
  }

  private refreshAim(): void {
    const p = this.aiming;
    const m = this.match;
    if (p === null || !m) return;
    const a = this.aim[p];
    this.ui.setAim(a, m.ammo[p]);
    const frac = PREVIEW[this.settings.aimPreview];
    const preview = frac > 0 ? previewPath(m.world, { player: p, ...a }, frac) : null;
    this.stage.setAiming(p, a.angle, Math.min(1, a.velocity / 120), preview);
  }

  private editAim(patch: Partial<AimState>): void {
    const p = this.aiming;
    if (p === null || !this.match) return;
    if (patch.weapon && !canUse(this.match, p, patch.weapon)) return;
    Object.assign(this.aim[p], patch);
    this.refreshAim();
  }

  private throwNow(): void {
    const p = this.aiming;
    if (p === null || !this.humanResolve || this.paused) return;
    const a = this.aim[p];
    const shot: Shot = { player: p, angle: Math.round(a.angle * 10) / 10, velocity: Math.round(a.velocity * 10) / 10, weapon: a.weapon };
    const resolve = this.humanResolve;
    this.endAiming();
    resolve(shot);
  }

  private endAiming(): void {
    if (this.aiming !== null) this.stage.stopAiming();
    this.aiming = null;
    this.humanResolve = null;
    this.drag = null;
    this.ui.showConsole(false);
  }

  // ——— pause ———
  pause(): void {
    if (this.attract || this.paused || this.screen !== 'match') return;
    this.paused = true;
    const showPause = () =>
      this.ui.showPause(
        () => this.resume(),
        () => this.openSettings(showPause),
        () => this.goTitle(),
      );
    showPause();
  }

  private resume(): void {
    this.paused = false;
    this.ui.clearPanels();
  }

  // ——— time ———
  private sleep(seconds: number): Promise<void> {
    return new Promise((resolve) => this.timers.push({ left: seconds, total: seconds, resolve }));
  }

  private tween(seconds: number, tick: (k: number) => void): Promise<void> {
    return new Promise((resolve) => this.timers.push({ left: seconds, total: seconds, tick, resolve }));
  }

  private frame(dt: number, t: number): void {
    const d = this.paused ? 0 : dt;
    if (d > 0 && this.timers.length) {
      const done: Timer[] = [];
      for (const tm of this.timers) {
        tm.left -= d;
        tm.tick?.(Math.min(1, 1 - tm.left / tm.total));
        if (tm.left <= 0) done.push(tm);
      }
      if (done.length) {
        this.timers = this.timers.filter((x) => !done.includes(x));
        for (const tm of done) tm.resolve();
      }
    }
    this.stage.update(d, t);
    if (this.inFlight && !this.attract && this.stage.projectiles.leadActive) {
      const v = this.stage.projectiles.leadVel.length();
      this.sfx.whistle(Math.min(1, this.stage.projectiles.lead.y / 80), Math.min(1, v / 90));
    }
  }

  // ——— input ———
  private unlockAudio(): void {
    if (this.audioOn) return;
    this.audioOn = true;
    this.sfx.unlock();
    this.sfx.setVolumes(this.settings.master, this.settings.music, this.settings.sfx);
    if (this.match) this.sfx.setAmbience(this.match.cond.weather, this.match.world.wind);
    if (this.screen === 'title' || this.screen === 'setup' || this.screen === 'settings') this.sfx.music(true);
    document.querySelector('.unmute')?.remove();
  }

  private bindInput(canvas: HTMLCanvasElement): void {
    window.addEventListener('pointerdown', () => this.unlockAudio(), { capture: true });
    window.addEventListener('keydown', (e) => {
      this.unlockAudio();
      this.onKey(e, true);
    });
    window.addEventListener('keyup', (e) => this.onKey(e, false));
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.pause();
    });
    canvas.addEventListener('pointerdown', (e) => {
      if (this.paused) return;
      if (this.inFlight) {
        this.stage.fastForward = true;
        return;
      }
      if (this.aiming === null) return;
      canvas.setPointerCapture(e.pointerId);
      this.drag = { x: e.clientX, y: e.clientY, moved: false };
    });
    canvas.addEventListener('pointermove', (e) => {
      const d = this.drag;
      const p = this.aiming;
      if (!d || p === null) return;
      const dx = e.clientX - d.x;
      const dy = e.clientY - d.y;
      if (Math.hypot(dx, dy) < 10 && !d.moved) return;
      d.moved = true;
      const a = dragToAim(dx, dy, p === 0 ? 1 : -1, Math.min(innerWidth, innerHeight));
      this.aim[p].angle = a.angle;
      this.aim[p].velocity = a.velocity;
      this.refreshAim();
    });
    const up = () => {
      this.stage.fastForward = false;
      const d = this.drag;
      this.drag = null;
      if (d?.moved) this.throwNow();
    };
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', () => {
      this.drag = null;
      this.stage.fastForward = false;
    });
  }

  private onKey(e: KeyboardEvent, down: boolean): void {
    if (e.key === 'Escape' && down) {
      if (this.paused) this.resume();
      else this.pause();
      return;
    }
    if (this.paused || (e.target instanceof HTMLInputElement && e.target.type === 'text')) return;
    if (this.inFlight && !this.attract) {
      if (e.key === ' ') {
        e.preventDefault();
        this.stage.fastForward = down;
      }
      if ((e.key === 's' || e.key === 'S') && down) this.stage.skip();
      return;
    }
    const p = this.aiming;
    if (p === null || !down) return;
    const step = e.shiftKey ? 5 : 1;
    const a = this.aim[p];
    switch (e.key) {
      case 'ArrowLeft':
        a.angle = Math.min(180, Math.max(0, a.angle + (p === 0 ? step : -step)));
        break;
      case 'ArrowRight':
        a.angle = Math.min(180, Math.max(0, a.angle - (p === 0 ? step : -step)));
        break;
      case 'ArrowUp':
        a.velocity = Math.min(200, a.velocity + step);
        break;
      case 'ArrowDown':
        a.velocity = Math.max(1, a.velocity - step);
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        this.throwNow();
        return;
      default: {
        const n = Number(e.key);
        if (n >= 1 && n <= 4) this.editAim({ weapon: WEAPON_ORDER[n - 1] });
        return;
      }
    }
    e.preventDefault();
    this.refreshAim();
  }

  private onStageEvent(e: Parameters<Parameters<Stage['on']>[0]>[0]): void {
    if (this.attract) return;
    const s = this.sfx;
    switch (e.type) {
      case 'launch':
        s.throwWhoosh(Math.min(1, e.velocity / 120));
        break;
      case 'explode':
        s.explode(e.radius);
        break;
      case 'collapse':
        s.rumble(e.cells);
        break;
      case 'bounce':
        s.bounce();
        break;
      case 'split':
        s.pop();
        break;
      case 'sun':
        s.sunGasp();
        break;
      case 'gorillaHit':
        s.ouch();
        break;
      case 'fall':
        s.grunt(1.2);
        break;
      case 'land':
        s.thud();
        break;
      case 'lightning':
        s.thunder();
        break;
    }
  }
}
