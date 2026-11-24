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
import {
  BlendFunction, BloomEffect, EffectComposer, EffectPass, FXAAEffect, NoiseEffect, RenderPass, SMAAEffect, SMAAPreset,
  ToneMappingEffect, ToneMappingMode, VignetteEffect, type Effect,
} from 'postprocessing';
// @ts-expect-error n8ao ships without type declarations
import { N8AOPostPass } from 'n8ao';
import { MIN_RENDER_SCALE, PRESETS, nextRenderScale, type Preset, type QualitySettings } from './quality';

type FrameFn = (dt: number, t: number) => void;

/** Renderer, post-processing chain, quality presets, dynamic resolution and the frame loop. */
export class Engine {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(32, 16 / 9, 0.5, 2000);
  q: QualitySettings;
  renderScale: number;
  autoRes = true;
  /** Rolling mean frame time (ms) and fps over the last ~60 frames. */
  frameMs = 16.7;
  fps = 60;
  bloom: BloomEffect | null = null;
  private composer!: EffectComposer;
  private frameFns: FrameFn[] = [];
  private last = 0;
  private time = 0;
  private window: number[] = [];
  private slowFor = 0;
  private fastFor = 0;
  private frameNo = 0;
  readonly gpuName: string;

  constructor(readonly canvas: HTMLCanvasElement, preset: Preset) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.info.autoReset = false; // the composer renders several passes per frame
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    const gl = this.renderer.getContext();
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    this.gpuName = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unknown');
    this.q = PRESETS[preset];
    this.renderScale = this.q.renderScale;
    this.applyQuality();
    window.addEventListener('resize', () => this.resize());
  }

  setQuality(preset: Preset): void {
    if (preset === this.q.preset) return;
    this.q = PRESETS[preset];
    this.renderScale = this.q.renderScale;
    this.applyQuality();
    this.scene.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
      if (m) for (const mm of Array.isArray(m) ? m : [m]) mm.needsUpdate = true;
    });
  }

  private applyQuality(): void {
    this.renderer.shadowMap.enabled = this.q.shadows > 0;
    this.renderer.shadowMap.type = this.q.softShadows ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
    this.composer?.dispose();
    const c = new EffectComposer(this.renderer, { frameBufferType: THREE.HalfFloatType, multisampling: 0 });
    c.addPass(new RenderPass(this.scene, this.camera));
    if (this.q.ao) {
      const ao = new N8AOPostPass(this.scene, this.camera, innerWidth, innerHeight);
      Object.assign(ao.configuration, { aoRadius: 2.5, distanceFalloff: 1, intensity: 2.2, halfRes: true, depthAwareUpsampling: true, gammaCorrection: false });
      ao.setQualityMode('Medium');
      c.addPass(ao);
    }
    const fx: Effect[] = [];
    this.bloom = null;
    if (this.q.bloom) {
      this.bloom = new BloomEffect({ mipmapBlur: true, luminanceThreshold: 0.9, luminanceSmoothing: 0.3, intensity: 1.15, radius: 0.72, levels: this.q.preset === 'ultra' ? 7 : 5 });
      fx.push(this.bloom);
    }
    fx.push(new ToneMappingEffect({ mode: ToneMappingMode.AGX }));
    const vig = new VignetteEffect({ darkness: 0.5, offset: 0.3 });
    const noise = new NoiseEffect({ blendFunction: BlendFunction.OVERLAY, premultiply: false });
    noise.blendMode.opacity.value = 0.045;
    fx.push(vig, noise);
    c.addPass(new EffectPass(this.camera, ...fx));
    c.addPass(new EffectPass(this.camera, this.q.smaa ? new SMAAEffect({ preset: SMAAPreset.MEDIUM }) : new FXAAEffect()));
    this.composer = c;
    this.resize();
  }

  resize(): void {
    const w = innerWidth;
    const h = innerHeight;
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, this.q.maxDpr) * this.renderScale);
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  onFrame(fn: FrameFn): void {
    this.frameFns.push(fn);
  }

  start(): void {
    // compile every material up front so the first seconds don't stutter
    void this.renderer.compileAsync(this.scene, this.camera).catch(() => {});
    const tick = (now: number) => {
      requestAnimationFrame(tick);
      const raw = this.last ? (now - this.last) / 1000 : 1 / 60;
      this.last = now;
      const dt = Math.min(raw, 1 / 20);
      this.time += dt;
      this.measure(raw * 1000);
      this.renderer.info.reset();
      for (const f of this.frameFns) f(dt, this.time);
      const sm = this.renderer.shadowMap;
      sm.autoUpdate = false;
      // below Ultra the shadow map refreshes at 30 Hz; the key light never moves fast
      sm.needsUpdate = this.q.preset === 'ultra' || this.frameNo++ % 2 === 0;
      this.composer.render(dt);
    };
    requestAnimationFrame(tick);
  }

  private measure(ms: number): void {
    if (document.hidden || ms > 250) return; // tab switches are not slow frames
    this.window.push(ms);
    if (this.window.length > 60) this.window.shift();
    this.frameMs = this.window.reduce((a, b) => a + b, 0) / this.window.length;
    this.fps = 1000 / this.frameMs;
    if (!this.autoRes || this.window.length < 60) return;
    const next = nextRenderScale(this.renderScale, this.frameMs, this.q.renderScale);
    if (next < this.renderScale) this.slowFor += ms;
    else this.slowFor = 0;
    if (next > this.renderScale) this.fastFor += ms;
    else this.fastFor = 0;
    if (this.slowFor > 1000 || this.fastFor > 3000) {
      this.renderScale = Math.max(MIN_RENDER_SCALE, next);
      this.slowFor = this.fastFor = 0;
      this.window.length = 0;
      this.resize();
    }
  }

  info() {
    const r = this.renderer.info.render;
    return { preset: this.q.preset, fps: Math.round(this.fps), frameMs: +this.frameMs.toFixed(2), renderScale: this.renderScale, calls: r.calls, triangles: r.triangles, gpu: this.gpuName };
  }
}
