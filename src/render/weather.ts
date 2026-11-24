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
import type { Weather as WeatherKind } from '../sim/match';

const VERT = /* glsl */ `
uniform float uTime, uWind, uSpeed, uLen, uSway;
attribute vec3 aSeed;
attribute float aEnd;
varying float vA;
void main() {
  vec3 box = vec3(170.0, 95.0, 70.0);
  vec3 p = aSeed * box - vec3(box.x * 0.5, 0.0, box.z * 0.6);
  float fall = uTime * uSpeed * (0.8 + 0.4 * fract(aSeed.x * 91.0));
  p.y = mod(p.y - fall, box.y);
  p.x += uWind * (box.y - p.y) * 0.04 + sin(uTime * 1.3 + aSeed.z * 40.0) * uSway;
  p.x = mod(p.x + box.x * 0.5, box.x) - box.x * 0.5;
  vec3 dir = normalize(vec3(uWind * 0.04 * uSpeed, -uSpeed, 0.0));
  p -= dir * uLen * aEnd;
  vA = (1.0 - aEnd * 0.8) * smoothstep(0.0, 6.0, p.y);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = uSway > 0.0 ? clamp(260.0 / -mv.z, 1.5, 5.0) : 1.0;
}`;
const FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
varying float vA;
void main() {
  gl_FragColor = vec4(uColor, uOpacity * vA);
}`;

/** Rain streaks / snow flakes, animated entirely on the GPU (no per-frame CPU work). */
export class Weather {
  readonly group = new THREE.Group();
  private rain: THREE.LineSegments;
  private snow: THREE.Points;
  private ur = { uTime: { value: 0 }, uWind: { value: 0 }, uSpeed: { value: 55 }, uLen: { value: 1.6 }, uSway: { value: 0 }, uColor: { value: new THREE.Color('#a8c0ff') }, uOpacity: { value: 0.35 } };
  private us = { uTime: { value: 0 }, uWind: { value: 0 }, uSpeed: { value: 5 }, uLen: { value: 0 }, uSway: { value: 1.2 }, uColor: { value: new THREE.Color('#ffffff') }, uOpacity: { value: 0.85 } };
  private lightning = 0;
  private nextBolt = 4;
  kind: WeatherKind = 'clear';
  /** Called with a brightness 0..1 when lightning strikes (rain only). */
  onLightning: (amount: number) => void = () => {};

  constructor(count: number) {
    const rg = new THREE.BufferGeometry();
    const seeds = new Float32Array(count * 6);
    const ends = new Float32Array(count * 2);
    for (let i = 0; i < count; i++) {
      const s = [Math.random(), Math.random(), Math.random()];
      seeds.set(s, i * 6);
      seeds.set(s, i * 6 + 3);
      ends[i * 2 + 1] = 1;
    }
    rg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 6), 3));
    rg.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 3));
    rg.setAttribute('aEnd', new THREE.BufferAttribute(ends, 1));
    this.rain = new THREE.LineSegments(rg, new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms: this.ur, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    const sn = Math.floor(count * 0.6);
    const sg = new THREE.BufferGeometry();
    const ss = new Float32Array(sn * 3);
    for (let i = 0; i < ss.length; i++) ss[i] = Math.random();
    sg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(sn * 3), 3));
    sg.setAttribute('aSeed', new THREE.BufferAttribute(ss, 3));
    sg.setAttribute('aEnd', new THREE.BufferAttribute(new Float32Array(sn), 1));
    this.snow = new THREE.Points(sg, new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms: this.us, transparent: true, depthWrite: false }));
    for (const o of [this.rain, this.snow]) {
      o.frustumCulled = false;
      o.visible = false;
      this.group.add(o);
    }
  }

  set(kind: WeatherKind, wind: number): void {
    this.kind = kind;
    this.rain.visible = kind === 'rain';
    this.snow.visible = kind === 'snow';
    this.setWind(wind);
  }

  setWind(wind: number): void {
    this.ur.uWind.value = wind;
    this.us.uWind.value = wind * 0.8;
  }

  update(dt: number, t: number): void {
    this.ur.uTime.value = t;
    this.us.uTime.value = t;
    if (this.kind !== 'rain') return;
    this.nextBolt -= dt;
    if (this.nextBolt <= 0) {
      this.lightning = 1;
      this.nextBolt = 6 + Math.random() * 12;
    }
    if (this.lightning > 0) {
      // double flicker
      const v = this.lightning > 0.7 ? 1 : this.lightning > 0.5 ? 0.2 : this.lightning > 0.35 ? 0.8 : this.lightning * 0.6;
      this.onLightning(v);
      this.lightning -= dt * 2.5;
      if (this.lightning <= 0) this.onLightning(0);
    }
  }
}
