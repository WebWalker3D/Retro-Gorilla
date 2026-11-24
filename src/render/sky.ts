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
import type { Look } from './palette';

const VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}`;

const FRAG = /* glsl */ `
uniform vec3 uTop, uBottom, uHorizon, uCloud;
uniform float uStars, uCloudCover, uTime, uFlash;
varying vec3 vDir;
float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float hash2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash2(i), hash2(i + vec2(1, 0)), u.x), mix(hash2(i + vec2(0, 1)), hash2(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; } return v; }
void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 col = mix(uBottom, uTop, smoothstep(-0.02, 0.55, h));
  col = mix(col, uHorizon, exp(-abs(h - 0.03) * 12.0) * 0.75);
  if (uStars > 0.0) {
    vec3 s = d * 420.0;
    vec3 cell = floor(s);
    float r = hash(cell);
    if (r > 0.996) {
      float tw = 0.55 + 0.45 * sin(uTime * (2.0 + r * 5.0) + r * 91.0);
      float st = smoothstep(0.42, 0.0, length(fract(s) - 0.5));
      col += vec3(0.9, 0.95, 1.0) * st * tw * uStars * smoothstep(0.04, 0.35, h) * (r > 0.9993 ? 3.0 : 1.2);
    }
  }
  vec2 uv = d.xz / (h + 0.18);
  float cl = fbm(uv * 1.6 + vec2(uTime * 0.008, uTime * 0.002));
  cl = smoothstep(1.0 - uCloudCover, 1.05 - uCloudCover * 0.4, cl) * smoothstep(-0.02, 0.2, h);
  col = mix(col, uCloud * (0.75 + 0.35 * h), cl * 0.85);
  col += uFlash * vec3(0.8, 0.85, 1.0) * (0.6 + 0.4 * cl);
  gl_FragColor = vec4(col, 1.0);
}`;

type Face = 'smile' | 'gasp';

function faceTexture(moon: boolean, face: Face): THREE.CanvasTexture {
  const s = 256;
  const cv = document.createElement('canvas');
  cv.width = cv.height = s;
  const g = cv.getContext('2d')!;
  const R = s * 0.46;
  const grad = g.createRadialGradient(s * 0.42, s * 0.4, R * 0.1, s / 2, s / 2, R);
  if (moon) {
    grad.addColorStop(0, '#fbfbf2');
    grad.addColorStop(1, '#c9cbd8');
  } else {
    grad.addColorStop(0, '#fff7b0');
    grad.addColorStop(0.7, '#ffd23f');
    grad.addColorStop(1, '#ff9f1c');
  }
  g.fillStyle = grad;
  g.beginPath();
  g.arc(s / 2, s / 2, R, 0, Math.PI * 2);
  g.fill();
  if (moon) {
    g.fillStyle = 'rgba(120,125,150,0.25)';
    for (const [x, y, r] of [[0.3, 0.28, 0.07], [0.7, 0.35, 0.05], [0.62, 0.72, 0.08], [0.25, 0.62, 0.04], [0.5, 0.18, 0.035]])
      g.beginPath(), g.arc(s * x, s * y, s * r, 0, Math.PI * 2), g.fill();
  }
  const ink = moon ? '#4a4e66' : '#a3430b';
  g.strokeStyle = ink;
  g.fillStyle = ink;
  g.lineCap = 'round';
  g.lineWidth = s * 0.035;
  const ey = s * 0.42;
  for (const ex of [s * 0.36, s * 0.64]) {
    g.beginPath();
    if (face === 'gasp') {
      g.fillStyle = '#fff';
      g.arc(ex, ey, s * 0.07, 0, Math.PI * 2);
      g.fill();
      g.stroke();
      g.fillStyle = ink;
      g.beginPath();
      g.arc(ex, ey, s * 0.03, 0, Math.PI * 2);
      g.fill();
    } else if (moon) {
      g.arc(ex, ey - s * 0.01, s * 0.05, 0.15 * Math.PI, 0.85 * Math.PI); // sleepy
      g.stroke();
    } else {
      g.arc(ex, ey + s * 0.02, s * 0.05, 1.15 * Math.PI, 1.85 * Math.PI); // happy
      g.stroke();
    }
  }
  g.beginPath();
  if (face === 'gasp') {
    g.ellipse(s / 2, s * 0.66, s * 0.075, s * 0.1, 0, 0, Math.PI * 2);
    g.fill();
  } else {
    g.arc(s / 2, s * 0.55, s * 0.15, 0.2 * Math.PI, 0.8 * Math.PI);
    g.stroke();
  }
  if (!moon) {
    g.fillStyle = 'rgba(255,120,80,0.35)';
    for (const cx of [s * 0.27, s * 0.73]) g.beginPath(), g.arc(cx, s * 0.56, s * 0.055, 0, Math.PI * 2), g.fill();
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function glowTexture(): THREE.CanvasTexture {
  const s = 128;
  const cv = document.createElement('canvas');
  cv.width = cv.height = s;
  const g = cv.getContext('2d')!;
  const grad = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.25, 'rgba(255,255,255,0.35)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, s, s);
  return new THREE.CanvasTexture(cv);
}

/** Gradient sky dome with stars and clouds, plus the sun/moon with a face that gasps when hit. */
export class Sky {
  readonly group = new THREE.Group();
  private uniforms = {
    uTop: { value: new THREE.Color() }, uBottom: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() },
    uCloud: { value: new THREE.Color() }, uStars: { value: 0 }, uCloudCover: { value: 0.4 }, uTime: { value: 0 }, uFlash: { value: 0 },
  };
  private dome: THREE.Mesh;
  private face: THREE.Sprite;
  private glow: THREE.Sprite;
  private tex: Record<string, THREE.CanvasTexture> = {};
  private moon = false;
  private gaspFor = 0;
  private baseScale = 9;

  constructor() {
    this.dome = new THREE.Mesh(
      new THREE.SphereGeometry(900, 32, 16),
      new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms: this.uniforms, side: THREE.BackSide, depthWrite: false, fog: false }),
    );
    this.dome.frustumCulled = false;
    this.dome.renderOrder = -10;
    this.group.add(this.dome);
    for (const moon of [false, true]) for (const f of ['smile', 'gasp'] as Face[]) this.tex[`${moon}${f}`] = faceTexture(moon, f);
    this.glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), blending: THREE.AdditiveBlending, depthWrite: false, fog: false, transparent: true }));
    this.face = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.tex.falsesmile, fog: false, transparent: true, depthWrite: false }));
    this.group.add(this.glow, this.face);
  }

  /** A scene holding just the sky dome, for baking a matching environment map. */
  envScene(): THREE.Scene {
    const sc = new THREE.Scene();
    const m = new THREE.Mesh(this.dome.geometry, this.dome.material);
    sc.add(m);
    return sc;
  }

  /** Place the sun on the play plane at the sim's sun collider (world coords), slightly behind it. */
  placeSun(x: number, y: number, r: number): void {
    this.baseScale = r * 2.3;
    this.face.position.set(x, y, -4);
    this.glow.position.set(x, y, -4.5);
    this.face.scale.setScalar(this.baseScale);
    this.glow.scale.setScalar(this.baseScale * 3.2);
  }

  setLook(l: Look): void {
    const u = this.uniforms;
    u.uTop.value.copy(l.skyTop);
    u.uBottom.value.copy(l.skyBottom);
    u.uHorizon.value.copy(l.horizon);
    u.uCloud.value.copy(l.cloudColor);
    u.uStars.value = l.stars;
    u.uCloudCover.value = l.cloudCover;
    this.moon = l.moon;
    this.face.material.map = this.tex[`${this.moon}smile`];
    const fm = this.face.material;
    fm.color.setScalar(this.moon ? 1.25 : 1.6);
    this.glow.material.color.set(this.moon ? '#8fa6ff' : '#ffb347').multiplyScalar(this.moon ? 0.5 : 0.9);
    this.face.visible = this.glow.visible = l.cloudCover < 0.8;
  }

  gasp(): void {
    this.gaspFor = 2.2;
    this.face.material.map = this.tex[`${this.moon}gasp`];
  }

  flash(amount: number): void {
    this.uniforms.uFlash.value = Math.max(this.uniforms.uFlash.value, amount);
  }

  update(dt: number, t: number, camera: THREE.Camera): void {
    this.uniforms.uTime.value = t;
    this.uniforms.uFlash.value *= Math.exp(-dt * 7);
    this.dome.position.copy(camera.position);
    if (this.gaspFor > 0) {
      this.gaspFor -= dt;
      const wob = 1 + 0.08 * Math.sin(t * 30) * Math.min(1, this.gaspFor);
      this.face.scale.setScalar(this.baseScale * wob);
      if (this.gaspFor <= 0) {
        this.face.material.map = this.tex[`${this.moon}smile`];
        this.face.scale.setScalar(this.baseScale);
      }
    } else {
      this.face.material.rotation = Math.sin(t * 0.6) * 0.05;
    }
  }
}
