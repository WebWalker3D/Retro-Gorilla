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
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { samplePath } from '../sim/shot';
import type { ProjectilePath, WeaponId } from '../sim/types';
import { wx } from './palette';

const TRAIL = 36;

function bananaGeometry(body: string, tip: string, scale: number): THREE.BufferGeometry {
  const color = (g: THREE.BufferGeometry, hex: string) => {
    const geo = g.index ? g.toNonIndexed() : g;
    geo.deleteAttribute('uv');
    const c = new THREE.Color(hex);
    const a = new Float32Array(geo.attributes.position.count * 3);
    for (let i = 0; i < a.length; i += 3) a.set([c.r, c.g, c.b], i);
    geo.setAttribute('color', new THREE.BufferAttribute(a, 3));
    return geo;
  };
  const arc = 2.2;
  const g = new THREE.TorusGeometry(0.55, 0.17, 8, 14, arc);
  g.rotateZ(-arc / 2 - Math.PI / 2);
  // taper the ends a little
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const k = 1 - Math.min(1, Math.abs(x) / 0.6) * 0.45;
    const cx = Math.sin(Math.atan2(x, -p.getY(i))) * 0.55;
    const cy = -Math.cos(Math.atan2(x, -p.getY(i))) * 0.55;
    p.setXYZ(i, cx + (x - cx) * k, cy + (p.getY(i) - cy) * k, p.getZ(i) * k);
  }
  g.computeVertexNormals();
  const tipA = new THREE.CylinderGeometry(0.05, 0.07, 0.16, 6);
  tipA.rotateZ(Math.PI / 2 - 0.55).translate(-0.5, -0.34, 0);
  const tipB = new THREE.SphereGeometry(0.06, 6, 4).translate(0.47, -0.3, 0);
  const geo = mergeGeometries([color(g, body), color(tipA, tip), color(tipB, tip)])!;
  geo.scale(scale, scale, scale);
  return geo;
}

const STYLE: Record<WeaponId, { body: string; tip: string; scale: number; glow: string }> = {
  banana: { body: '#ffd84a', tip: '#5a3a1a', scale: 1.5, glow: '#ffd23f' },
  bunch: { body: '#ffe066', tip: '#5a3a1a', scale: 1.5, glow: '#ffe066' },
  rubber: { body: '#ff4fd8', tip: '#7a1f6a', scale: 1.5, glow: '#ff6ae0' },
  plantain: { body: '#7f9a3a', tip: '#3a2a12', scale: 2.3, glow: '#c6ff6a' },
};

interface Slot {
  mesh: THREE.Mesh;
  glow: THREE.Sprite;
  trail: THREE.Mesh;
  trailPos: Float32Array;
  history: THREE.Vector3[];
  path: ProjectilePath | null;
  spin: number;
}

function glowTex(): THREE.Texture {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 64;
  const g = cv.getContext('2d')!;
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.3, 'rgba(255,255,255,0.35)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(cv);
}

/** Banana meshes with glow and ribbon trails, replaying recorded sim paths. */
export class Projectiles {
  readonly group = new THREE.Group();
  private geos: Record<WeaponId, THREE.BufferGeometry>;
  private bunchGeo: THREE.BufferGeometry;
  private slots: Slot[] = [];
  private mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0, emissive: '#ffffff', emissiveIntensity: 0.12 });
  private tmp = { x: 0, y: 0 };
  readonly lead = new THREE.Vector3();
  readonly leadVel = new THREE.Vector3();
  leadActive = false;

  constructor() {
    this.geos = {
      banana: bananaGeometry(STYLE.banana.body, STYLE.banana.tip, STYLE.banana.scale),
      bunch: bananaGeometry(STYLE.bunch.body, STYLE.bunch.tip, 1.2),
      rubber: bananaGeometry(STYLE.rubber.body, STYLE.rubber.tip, STYLE.rubber.scale),
      plantain: bananaGeometry(STYLE.plantain.body, STYLE.plantain.tip, STYLE.plantain.scale),
    };
    const b = bananaGeometry(STYLE.bunch.body, STYLE.bunch.tip, 1.5);
    this.bunchGeo = mergeGeometries([b.clone().rotateZ(0.5).translate(-0.25, 0, 0.1), b.clone(), b.clone().rotateZ(-0.5).translate(0.25, 0, -0.1)])!;
    const gt = glowTex();
    for (let i = 0; i < 6; i++) {
      const mesh = new THREE.Mesh(this.geos.banana, this.mat);
      mesh.castShadow = true;
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: gt, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
      glow.scale.setScalar(2.6);
      const trailPos = new Float32Array(TRAIL * 2 * 3);
      const tg = new THREE.BufferGeometry();
      tg.setAttribute('position', new THREE.BufferAttribute(trailPos, 3).setUsage(THREE.DynamicDrawUsage));
      const alpha = new Float32Array(TRAIL * 2);
      for (let k = 0; k < TRAIL; k++) alpha[k * 2] = alpha[k * 2 + 1] = 1 - k / (TRAIL - 1);
      tg.setAttribute('aA', new THREE.BufferAttribute(alpha, 1));
      const idx: number[] = [];
      for (let k = 0; k < TRAIL - 1; k++) idx.push(k * 2, k * 2 + 1, k * 2 + 2, k * 2 + 1, k * 2 + 3, k * 2 + 2);
      tg.setIndex(idx);
      const trail = new THREE.Mesh(
        tg,
        new THREE.ShaderMaterial({
          uniforms: { uColor: { value: new THREE.Color() } },
          vertexShader: 'attribute float aA; varying float vA; void main(){ vA = aA; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
          fragmentShader: 'uniform vec3 uColor; varying float vA; void main(){ gl_FragColor = vec4(uColor * vA * vA, 1.0); }',
          transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
        }),
      );
      trail.frustumCulled = false;
      const slot: Slot = { mesh, glow, trail, trailPos, history: [], path: null, spin: Math.random() * 6 };
      for (const o of [mesh, glow, trail]) {
        o.visible = false;
        this.group.add(o);
      }
      this.slots.push(slot);
    }
  }

  show(paths: ProjectilePath[]): void {
    this.clear();
    paths.slice(0, this.slots.length).forEach((p, i) => {
      const s = this.slots[i];
      s.path = p;
      s.history.length = 0;
      const unsplitBunch = p.weapon === 'bunch' && p.id === 0;
      s.mesh.geometry = unsplitBunch ? this.bunchGeo : this.geos[p.weapon];
      const st = STYLE[p.weapon];
      s.glow.material.color.set(st.glow).multiplyScalar(1.4);
      (s.trail.material as THREE.ShaderMaterial).uniforms.uColor.value.set(st.glow).multiplyScalar(1.6);
    });
  }

  clear(): void {
    for (const s of this.slots) {
      s.path = null;
      s.mesh.visible = s.glow.visible = s.trail.visible = false;
    }
    this.leadActive = false;
  }

  /** Positions every banana at sim time `t`. The lead is the newest projectile still flying. */
  update(t: number, dt: number, camera: THREE.Camera): void {
    this.leadActive = false;
    let leadT0 = -1;
    for (const s of this.slots) {
      const p = s.path;
      if (!p) continue;
      const flying = t >= p.t0 && t <= p.t1;
      s.mesh.visible = s.glow.visible = flying;
      if (flying) {
        samplePath(p, t, this.tmp);
        const x = wx(this.tmp.x);
        const y = this.tmp.y;
        s.spin += dt * 16;
        s.mesh.position.set(x, y, 0);
        s.mesh.rotation.set(0.3, 0.4, s.spin);
        s.glow.position.set(x, y, 0.2);
        const h = s.history;
        if (!h.length || h[0].distanceToSquared(s.mesh.position) > 0.04) {
          const v = h.length >= TRAIL ? h.pop()! : new THREE.Vector3();
          h.unshift(v.copy(s.mesh.position));
        }
        if (p.t0 >= leadT0) {
          leadT0 = p.t0;
          samplePath(p, t + 0.05, this.tmp);
          this.leadVel.set(wx(this.tmp.x) - x, this.tmp.y - y, 0).multiplyScalar(20);
          this.lead.set(x, y, 0);
          this.leadActive = true;
        }
      } else if (t > p.t1 && s.history.length) {
        s.history.pop(); // trail drains after impact
      }
      this.buildTrail(s, camera);
    }
  }

  private buildTrail(s: Slot, camera: THREE.Camera): void {
    const h = s.history;
    s.trail.visible = h.length > 1;
    if (h.length < 2) return;
    const a = s.trailPos;
    const view = camera.position;
    for (let k = 0; k < TRAIL; k++) {
      const p = h[Math.min(k, h.length - 1)];
      const q = h[Math.min(k + 1, h.length - 1)];
      const r = h[Math.min(Math.max(0, k - 1), h.length - 1)];
      dir.subVectors(r, q);
      if (dir.lengthSq() < 1e-6) dir.set(1, 0, 0);
      side.subVectors(view, p).cross(dir).normalize();
      const w = 0.3 * (1 - k / TRAIL);
      a[k * 6] = p.x + side.x * w;
      a[k * 6 + 1] = p.y + side.y * w;
      a[k * 6 + 2] = p.z + side.z * w;
      a[k * 6 + 3] = p.x - side.x * w;
      a[k * 6 + 4] = p.y - side.y * w;
      a[k * 6 + 5] = p.z - side.z * w;
    }
    s.trail.geometry.attributes.position.needsUpdate = true;
  }
}
const dir = new THREE.Vector3();
const side = new THREE.Vector3();
