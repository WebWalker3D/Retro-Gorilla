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
import * as THREE from 'three';
import { GORILLA_H } from '../sim/constants';
import type { MatchState } from '../sim/match';
import type { Player, Shot, ShotResult, SimEvent } from '../sim/types';
import { Backdrop } from './backdrop';
import { CameraDirector } from './camera';
import { CityMesh } from './cityMesh';
import { Effects } from './effects';
import type { Engine } from './engine';
import { GorillaModel } from './gorillaModel';
import { DEPTH, GORILLA_TINTS, lookFor, wx } from './palette';
import { Projectiles } from './projectiles';
import { RoofProps } from './roofProps';
import { Sky } from './sky';
import { Weather } from './weather';

export type StageEvent =
  | { type: 'launch'; player: Player; weapon: Shot['weapon']; velocity: number }
  | { type: 'explode'; radius: number; cells: number; x: number }
  | { type: 'bounce' }
  | { type: 'split' }
  | { type: 'sun' }
  | { type: 'gorillaHit'; player: Player }
  | { type: 'fall'; player: Player }
  | { type: 'land'; player: Player; ko: boolean }
  | { type: 'collapse'; cells: number }
  | { type: 'lightning'; amount: number };

interface Fall {
  player: Player;
  y: number;
  toY: number;
  vy: number;
  ko: boolean;
}

interface Playback {
  shot: Shot;
  r: ShotResult;
  simTime: number;
  cursor: number;
  delay: number;
  endT: number;
  hitT: number | null;
  post: number;
  ended: boolean;
  focusFor: number;
  resolve: () => void;
}

const tmpV = new THREE.Vector3();
const SLOWMO = 0.2;

/** The 3D world for one match: builds each round, replays shots, directs the camera. */
export class Stage {
  readonly sky = new Sky();
  readonly city = new CityMesh(120 * 80);
  readonly props = new RoofProps();
  readonly backdrop: Backdrop;
  readonly weather: Weather;
  readonly effects: Effects;
  readonly projectiles = new Projectiles();
  readonly cam: CameraDirector;
  readonly gorillas: [GorillaModel, GorillaModel];
  killcam = true;
  fastForward = false;
  private hemi = new THREE.HemisphereLight();
  private key = new THREE.DirectionalLight();
  private marker: THREE.Mesh;
  private markerFor: Player | null = null;
  private play: Playback | null = null;
  private falls: Fall[] = [];
  private listeners: ((e: StageEvent) => void)[] = [];
  private envRT: THREE.WebGLRenderTarget | null = null;
  private pmrem: THREE.PMREMGenerator;
  private wind = 0;
  private gorillaY: [number, number] = [0, 0];
  private gorillaX: [number, number] = [0, 0];
  private celebrateFor = 0;
  private celebrateResolve: (() => void) | null = null;

  constructor(private engine: Engine) {
    const q = engine.q;
    this.backdrop = new Backdrop(q.backdropRows);
    this.weather = new Weather(Math.round(2600 * q.particleScale) + 400);
    this.effects = new Effects(q.particleScale);
    this.cam = new CameraDirector(engine.camera);
    this.gorillas = [new GorillaModel(GORILLA_TINTS[0]), new GorillaModel(GORILLA_TINTS[1])];
    this.gorillas[0].setFacing(1);
    this.gorillas[1].setFacing(-1);
    this.pmrem = new THREE.PMREMGenerator(engine.renderer);
    this.key.castShadow = true;
    this.key.shadow.bias = -0.0004;
    this.key.shadow.normalBias = 0.04;
    Object.assign(this.key.shadow.camera, { left: -72, right: 72, top: 70, bottom: -30, near: 10, far: 400 });
    this.key.target.position.set(0, 22, 0);
    this.marker = new THREE.Mesh(
      new THREE.RingGeometry(2.1, 2.6, 40).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    this.marker.visible = false;
    const s = engine.scene;
    s.add(this.sky.group, this.city.mesh, this.props.group, this.backdrop.group, this.weather.group, this.effects.group, this.projectiles.group);
    s.add(this.hemi, this.key, this.key.target, this.marker, this.gorillas[0].group, this.gorillas[1].group);
    this.weather.onLightning = (a) => {
      this.sky.flash(a * 0.7);
      this.hemi.intensity = this.baseHemi + a * 2.5;
      if (a > 0.9) this.emit({ type: 'lightning', amount: a });
    };
    this.applyShadowSize();
  }

  private baseHemi = 1;

  on(fn: (e: StageEvent) => void): void {
    this.listeners.push(fn);
  }

  private emit(e: StageEvent): void {
    for (const f of this.listeners) f(e);
  }

  applyShadowSize(): void {
    const sz = this.engine.q.shadows || 1024;
    this.key.castShadow = this.engine.q.shadows > 0;
    if (this.key.shadow.mapSize.x !== sz) {
      this.key.shadow.mapSize.set(sz, sz);
      this.key.shadow.map?.dispose();
      this.key.shadow.map = null as unknown as THREE.WebGLRenderTarget;
    }
  }

  loadRound(m: MatchState): void {
    const w = m.world;
    this.play = null;
    this.falls = [];
    this.effects.clear();
    this.projectiles.clear();
    this.city.build(w.city);
    this.props.build(w.city, m.cond.seed, w.gorillas);
    w.gorillas.forEach((g, i) => {
      this.gorillaX[i] = wx(g.x);
      this.gorillaY[i] = g.y;
      this.gorillas[i].group.position.set(wx(g.x), g.y, 0);
      this.gorillas[i].group.rotation.set(0, 0, 0);
      this.gorillas[i].play('idle');
    });
    const look = lookFor(m.cond.timeOfDay, m.cond.weather);
    this.sky.setLook(look);
    this.sky.placeSun(wx(w.sun.x), w.sun.y, w.sun.r);
    this.hemi.color.copy(look.hemiSky);
    this.hemi.groundColor.copy(look.hemiGround);
    this.hemi.intensity = this.baseHemi = look.hemiIntensity;
    this.key.color.copy(look.key);
    this.key.intensity = look.keyIntensity;
    const low = m.cond.timeOfDay === 'dusk' || m.cond.timeOfDay === 'dawn';
    this.key.position.set(low ? -110 : -50, low ? 55 : 100, 90);
    this.engine.scene.fog = new THREE.Fog(look.fog, look.fogNear, look.fogFar);
    this.backdrop.setLook(look);
    this.city.setLit(look.litFraction);
    this.weather.set(m.cond.weather, w.wind);
    this.setWind(w.wind);
    this.envRT?.dispose();
    this.envRT = this.pmrem.fromScene(this.sky.envScene(), 0.02, 1, 1000);
    this.engine.scene.environment = this.envRT.texture;
    this.engine.scene.environmentIntensity = m.cond.timeOfDay === 'night' ? 0.5 : 0.9;
    let top = 0;
    for (const b of w.city.buildings) top = Math.max(top, b.height);
    this.cam.setOverviewBox(wx(0) - 3, wx(w.city.w) + 3, -2, Math.max(top + 16, w.sun.y + w.sun.r + 10));
    this.cam.overview();
    this.cam.snap();
  }

  setWind(w: number): void {
    this.wind = w;
    this.weather.setWind(w);
    this.effects.setWind(w);
  }

  /** Aiming pose + marker for the active player (the on-screen guide is drawn by the UI). */
  setAiming(p: Player, angle: number, power01: number): void {
    const g = this.gorillas[p];
    g.setAim(angle, power01);
    if (g.current !== 'aim') g.play('aim');
    this.showMarker(p);
  }

  stopAiming(p?: Player): void {
    if (p !== undefined && this.gorillas[p].current === 'aim') this.gorillas[p].play('idle');
  }

  /** Projects a sim-plane point to CSS pixels. */
  toScreen(simX: number, simY: number, out: { x: number; y: number }): { x: number; y: number } {
    tmpV.set(wx(simX), simY, 0).project(this.engine.camera);
    out.x = ((tmpV.x + 1) / 2) * innerWidth;
    out.y = ((1 - tmpV.y) / 2) * innerHeight;
    return out;
  }

  showMarker(p: Player | null): void {
    this.markerFor = p;
    this.marker.visible = p !== null;
    if (p === null) return;
    (this.marker.material as THREE.MeshBasicMaterial).color.copy(GORILLA_TINTS[p]).lerp(new THREE.Color('#ffffff'), 0.4).multiplyScalar(2);
  }

  playShot(shot: Shot, r: ShotResult): Promise<void> {
    this.showMarker(null);
    this.gorillas[shot.player].play('throw');
    this.projectiles.show(r.paths);
    const hit = r.events.find((e) => e.type === 'gorillaHit');
    return new Promise((resolve) => {
      this.play = {
        shot, r, simTime: 0, cursor: 0, delay: 0.16, endT: r.events.at(-1)!.t, hitT: hit ? hit.t : null,
        post: 0, ended: false, focusFor: 0, resolve,
      };
      this.emit({ type: 'launch', player: shot.player, weapon: shot.weapon, velocity: shot.velocity });
    });
  }

  /** Jump to the end of the current shot: every remaining event applied immediately. */
  skip(): void {
    const p = this.play;
    if (!p) return;
    p.delay = 0;
    p.simTime = p.endT + 0.001;
    this.applyEvents(p);
    for (const f of this.falls) f.y = f.toY + 0.001;
    p.post = Math.max(p.post, 1.2);
    this.cam.overview(4);
  }

  get busy(): boolean {
    return this.play !== null || this.celebrateFor > 0;
  }

  /** Winner beats its chest while the camera moves in. */
  celebrate(winner: Player): Promise<void> {
    this.gorillas[winner].play('victory');
    tmpV.set(this.gorillaX[winner], this.gorillaY[winner] + 2.6, 0);
    this.cam.focus(tmpV, 17, 2.2);
    this.celebrateFor = 2.8;
    return new Promise((r) => (this.celebrateResolve = r));
  }

  private applyEvents(p: Playback): void {
    const evs = p.r.events;
    while (p.cursor < evs.length && evs[p.cursor].t <= p.simTime) this.applyEvent(evs[p.cursor++], p);
  }

  private applyEvent(e: SimEvent, p: Playback): void {
    switch (e.type) {
      case 'explode': {
        const pos = new THREE.Vector3(wx(e.x), e.y, 0);
        const maxChunks = Math.round(48 * this.engine.q.particleScale) + 8;
        const step = Math.max(1, Math.ceil(e.destroyed.length / maxChunks));
        const cpos = new THREE.Vector3();
        const col = new THREE.Color();
        for (let i = 0; i < e.destroyed.length; i += step) {
          this.city.cellInfo(e.destroyed[i], cpos, col);
          cpos.z = (Math.random() - 0.3) * DEPTH * 0.8;
          const s = 0.35 + Math.random() * 0.55;
          this.effects.debris(cpos, col, tmpV.set(s, s * (0.6 + Math.random() * 0.6), s), pos, 1 + e.radius / 8);
        }
        const cstep = Math.max(1, Math.ceil(e.collapsed.length / 260));
        for (let i = 0; i < e.collapsed.length; i += cstep) {
          this.city.cellInfo(e.collapsed[i], cpos, col);
          this.effects.debris(cpos, col, tmpV.set(1, 1, DEPTH * 0.92), null);
        }
        const all = e.collapsed.length ? e.destroyed.concat(e.collapsed) : e.destroyed;
        this.city.scorch(e.x, e.y, e.radius);
        this.city.removeCells(all);
        for (const pp of this.props.removeCells(all)) {
          for (let k = 0; k < 4; k++) this.effects.debris(tmpV.copy(pp).add(new THREE.Vector3(Math.random() - 0.5, 1 + Math.random(), Math.random() - 0.5)), col.set('#7a4a2e'), new THREE.Vector3(0.5, 0.4, 0.5), pos, 0.7);
        }
        this.effects.explode(pos.x, pos.y, 0.5, e.radius);
        this.cam.shake(0.28 + e.radius * 0.06);
        this.sky.flash(0.04 + e.radius * 0.01);
        if (e.collapsed.length) this.emit({ type: 'collapse', cells: e.collapsed.length });
        this.gorillas.forEach((g, i) => {
          const d = Math.hypot(this.gorillaX[i] - pos.x, this.gorillaY[i] + 2 - pos.y);
          if (d < e.radius * 3 && !p.r.ko[i]) g.play('flinch');
        });
        if (!this.projectilesStillFlying(p)) {
          this.cam.focus(pos, 26 + e.radius * 2, 2.6);
          p.focusFor = 0.9;
        }
        this.emit({ type: 'explode', radius: e.radius, cells: e.destroyed.length + e.collapsed.length, x: pos.x });
        break;
      }
      case 'gorillaHit': {
        const g = this.gorillas[e.player];
        g.play('ko', e.player === p.shot.player ? -1 : p.shot.player === 0 ? -1 : 1);
        this.effects.showDizzy(tmpV.set(this.gorillaX[e.player], this.gorillaY[e.player] + GORILLA_H + 0.9, 0), 30);
        this.effects.sparks(this.gorillaX[e.player], this.gorillaY[e.player] + 3, 1, 30);
        if (this.killcam) {
          this.cam.orbit(tmpV.set(this.gorillaX[e.player], this.gorillaY[e.player] + 1, 0), 15);
          p.focusFor = 99;
        }
        this.emit({ type: 'gorillaHit', player: e.player });
        break;
      }
      case 'gorillaFall':
        this.falls.push({ player: e.player, y: e.fromY, toY: e.toY, vy: 0, ko: e.ko });
        this.gorillas[e.player].play('fall');
        this.effects.hideDizzy();
        this.emit({ type: 'fall', player: e.player });
        break;
      case 'sun':
        this.sky.gasp();
        this.emit({ type: 'sun' });
        break;
      case 'bounce':
        this.effects.sparks(wx(e.x), e.y, 0.5, 24);
        this.cam.shake(0.12);
        this.emit({ type: 'bounce' });
        break;
      case 'split':
        this.emit({ type: 'split' });
        break;
      case 'end':
        p.ended = true;
        break;
    }
  }

  private projectilesStillFlying(p: Playback): boolean {
    return p.r.paths.some((pp) => pp.t1 > p.simTime + 0.02);
  }

  update(dt: number, t: number): void {
    const p = this.play;
    let simDt = dt;
    if (p) {
      if (p.delay > 0) {
        p.delay -= dt;
      } else {
        let ts = this.fastForward ? 3.5 : 1;
        if (this.killcam && p.hitT !== null && p.simTime > p.hitT - 0.28 && p.simTime < p.hitT + 0.3) ts = SLOWMO;
        simDt = dt * ts;
        p.simTime += simDt;
        this.applyEvents(p);
        this.projectiles.update(p.simTime, simDt, this.engine.camera);
        if (p.focusFor > 0) p.focusFor -= dt;
        if (this.projectiles.leadActive && p.focusFor <= 0 && p.simTime > 0.25 && p.endT > 0.9) {
          this.cam.follow(this.projectiles.lead, this.projectiles.leadVel);
        } else if (p.focusFor <= 0 && this.cam.mode !== 'overview') this.cam.overview();
        if (p.ended && !this.falls.length) {
          p.post += dt * (this.fastForward ? 2.5 : 1);
          const hold = p.r.ko[0] || p.r.ko[1] ? (this.killcam ? 2.2 : 1.2) : 0.9;
          if (p.post >= hold) {
            this.play = null;
            this.projectiles.clear();
            this.cam.overview();
            p.resolve();
          }
        }
      }
    }
    // falling gorillas
    for (const f of this.falls) {
      f.vy -= 40 * dt;
      f.y += f.vy * dt;
      if (f.y <= f.toY) {
        f.y = f.toY;
        const g = this.gorillas[f.player];
        g.play(f.ko ? 'ko' : 'flinch');
        this.effects.dust(this.gorillaX[f.player], f.toY, 0, 14);
        this.cam.shake(0.3);
        if (f.ko) this.effects.showDizzy(tmpV.set(this.gorillaX[f.player], f.toY + GORILLA_H + 0.9, 0), 30);
        this.emit({ type: 'land', player: f.player, ko: f.ko });
        f.vy = NaN;
      }
      this.gorillaY[f.player] = f.y;
      this.gorillas[f.player].group.position.y = f.y;
    }
    this.falls = this.falls.filter((f) => !Number.isNaN(f.vy));
    if (this.celebrateFor > 0) {
      this.celebrateFor -= dt;
      if (this.celebrateFor <= 0) {
        this.cam.overview();
        this.celebrateResolve?.();
        this.celebrateResolve = null;
      }
    }
    if (this.markerFor !== null) {
      const i = this.markerFor;
      this.marker.position.set(this.gorillaX[i], this.gorillaY[i] + 0.06, 0);
      this.marker.scale.setScalar(1 + 0.08 * Math.sin(t * 5));
    }
    const camera = this.engine.camera;
    this.cam.update(simDt, dt);
    this.sky.update(dt, t, camera);
    this.city.update(t);
    this.backdrop.update(t);
    this.props.update(t, this.wind);
    this.weather.update(dt, t);
    this.effects.setViewport(this.engine.renderer.domElement.height, camera.fov);
    this.effects.update(simDt, t, camera);
    for (const g of this.gorillas) g.update(simDt);
  }
}
