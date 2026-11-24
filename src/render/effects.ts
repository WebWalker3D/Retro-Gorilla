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

const PVERT = /* glsl */ `
attribute float aSize;
attribute vec4 aColor;
varying vec4 vColor;
uniform float uScale;
void main() {
  vColor = aColor;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = aSize * uScale / max(0.5, -mv.z);
}`;
const PFRAG_ADD = /* glsl */ `
varying vec4 vColor;
void main() {
  float d = length(gl_PointCoord - 0.5) * 2.0;
  float a = smoothstep(1.0, 0.0, d);
  gl_FragColor = vec4(vColor.rgb * a * a * vColor.a, 1.0);
}`;
const PFRAG_SMOKE = /* glsl */ `
varying vec4 vColor;
float h(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 15731.7); }
void main() {
  vec2 p = gl_PointCoord - 0.5;
  float d = length(p) * 2.0;
  float n = h(floor(gl_PointCoord * 6.0) + floor(vColor.a * 7.0));
  float a = smoothstep(1.0, 0.25, d + n * 0.18) * vColor.a;
  if (a < 0.01) discard;
  gl_FragColor = vec4(vColor.rgb, a);
}`;

/** A pooled CPU-simulated point system: one draw call regardless of particle count. */
class ParticlePool {
  readonly points: THREE.Points;
  private pos: Float32Array;
  private col: Float32Array;
  private size: Float32Array;
  private vel: Float32Array;
  private life: Float32Array;
  private maxLife: Float32Array;
  private s0: Float32Array;
  private s1: Float32Array;
  private c0: Float32Array;
  private c1: Float32Array;
  private drag: Float32Array;
  private grav: Float32Array;
  private alpha: Float32Array;
  private next = 0;
  private live = 0;
  readonly n: number;
  wind = 0;
  private uniforms = { uScale: { value: 600 } };

  constructor(n: number, additive: boolean) {
    this.n = n;
    this.pos = new Float32Array(n * 3);
    this.col = new Float32Array(n * 4);
    this.size = new Float32Array(n);
    this.vel = new Float32Array(n * 3);
    this.life = new Float32Array(n);
    this.maxLife = new Float32Array(n);
    this.s0 = new Float32Array(n);
    this.s1 = new Float32Array(n);
    this.c0 = new Float32Array(n * 3);
    this.c1 = new Float32Array(n * 3);
    this.drag = new Float32Array(n);
    this.grav = new Float32Array(n);
    this.alpha = new Float32Array(n);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aColor', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    const mat = new THREE.ShaderMaterial({
      vertexShader: PVERT,
      fragmentShader: additive ? PFRAG_ADD : PFRAG_SMOKE,
      uniforms: this.uniforms,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(g, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 3 : 2;
  }

  setViewportHeight(h: number, fovDeg: number): void {
    this.uniforms.uScale.value = h / (2 * Math.tan((fovDeg * Math.PI) / 360));
  }

  emit(
    x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number,
    size0: number, size1: number, c0: THREE.Color, c1: THREE.Color, drag: number, grav: number, alpha = 1,
  ): void {
    const i = this.next;
    this.next = (this.next + 1) % this.n;
    if (this.life[i] <= 0) this.live++;
    this.pos.set([x, y, z], i * 3);
    this.vel.set([vx, vy, vz], i * 3);
    this.life[i] = life;
    this.maxLife[i] = life;
    this.s0[i] = size0;
    this.s1[i] = size1;
    this.c0.set([c0.r, c0.g, c0.b], i * 3);
    this.c1.set([c1.r, c1.g, c1.b], i * 3);
    this.drag[i] = drag;
    this.grav[i] = grav;
    this.alpha[i] = alpha;
  }

  update(dt: number): void {
    if (this.live === 0) return;
    let live = 0;
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        this.size[i] = 0;
        this.col[i * 4 + 3] = 0;
        continue;
      }
      live++;
      const k = i * 3;
      const d = Math.exp(-this.drag[i] * dt);
      this.vel[k] = this.vel[k] * d + this.wind * dt * 0.6;
      this.vel[k + 1] = this.vel[k + 1] * d - this.grav[i] * dt;
      this.vel[k + 2] *= d;
      this.pos[k] += this.vel[k] * dt;
      this.pos[k + 1] += this.vel[k + 1] * dt;
      this.pos[k + 2] += this.vel[k + 2] * dt;
      if (this.pos[k + 1] < 0.05) {
        this.pos[k + 1] = 0.05;
        this.vel[k + 1] *= -0.3;
      }
      const t = 1 - this.life[i] / this.maxLife[i];
      this.size[i] = this.s0[i] + (this.s1[i] - this.s0[i]) * Math.sqrt(t);
      const c = i * 4;
      this.col[c] = this.c0[k] + (this.c1[k] - this.c0[k]) * t;
      this.col[c + 1] = this.c0[k + 1] + (this.c1[k + 1] - this.c0[k + 1]) * t;
      this.col[c + 2] = this.c0[k + 2] + (this.c1[k + 2] - this.c0[k + 2]) * t;
      const fadeIn = Math.min(1, (this.maxLife[i] - this.life[i]) / 0.08);
      this.col[c + 3] = this.alpha[i] * fadeIn * Math.min(1, this.life[i] / (this.maxLife[i] * 0.4));
    }
    this.live = live;
    const g = this.points.geometry;
    g.attributes.position.needsUpdate = true;
    g.attributes.aColor.needsUpdate = true;
    g.attributes.aSize.needsUpdate = true;
  }
}

interface Chunk {
  alive: boolean;
  p: THREE.Vector3;
  v: THREE.Vector3;
  r: THREE.Euler;
  w: THREE.Vector3;
  s: THREE.Vector3;
  life: number;
  bounces: number;
}

const tmpC = new THREE.Color();
const C = (hex: string, k = 1) => new THREE.Color(hex).multiplyScalar(k);
const FIRE0 = C('#ffd27a', 1.5);
const FIRE1 = C('#ff4a12', 0.9);
const FIRE2 = C('#5a1206', 0.25);
const SPARK0 = C('#fff4c8', 8);
const SPARK1 = C('#ff7a2a', 2);
const SMOKE0 = C('#4a4448');
const SMOKE1 = C('#1c1a1e');
const DUST0 = C('#8a8278');
const DUST1 = C('#4c4844');
const STAR = C('#ffe066', 5);

/** Explosions, debris, dust, fire, shockwaves and the impact light. All pooled. */
export class Effects {
  readonly group = new THREE.Group();
  private add: ParticlePool;
  private smoke: ParticlePool;
  private chunks: Chunk[] = [];
  private chunkMesh: THREE.InstancedMesh;
  private rings: { mesh: THREE.Mesh; t: number; r: number }[] = [];
  private light = new THREE.PointLight('#ffb070', 0, 70, 1.6);
  private fires: { x: number; y: number; z: number; t: number; acc: number }[] = [];
  private dizzy: { pos: THREE.Vector3; t: number; mesh: THREE.InstancedMesh } | null = null;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private scale: number;

  constructor(particleScale: number) {
    this.scale = particleScale;
    this.add = new ParticlePool(Math.round(3500 * particleScale) + 200, true);
    this.smoke = new ParticlePool(Math.round(1400 * particleScale) + 100, false);
    const nChunks = Math.round(500 * particleScale) + 80;
    this.chunkMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ roughness: 0.85 }), nChunks);
    this.chunkMesh.castShadow = particleScale > 0.5;
    this.chunkMesh.frustumCulled = false;
    for (let i = 0; i < nChunks; i++) {
      this.chunks.push({ alive: false, p: new THREE.Vector3(), v: new THREE.Vector3(), r: new THREE.Euler(), w: new THREE.Vector3(), s: new THREE.Vector3(), life: 0, bounces: 0 });
      this.chunkMesh.setMatrixAt(i, this.m.makeScale(0, 0, 0));
      this.chunkMesh.setColorAt(i, tmpC.set('#888'));
    }
    const ringGeo = new THREE.RingGeometry(0.85, 1, 48);
    for (let i = 0; i < 4; i++) {
      const mesh = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: '#ffd9a0', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      mesh.visible = false;
      this.rings.push({ mesh, t: 1, r: 1 });
      this.group.add(mesh);
    }
    // star "dizzy" ring for knocked-out gorillas
    const star = new THREE.Shape();
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 + Math.PI / 2;
      const r = i % 2 ? 0.16 : 0.38;
      if (i === 0) star.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      else star.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    const starMesh = new THREE.InstancedMesh(new THREE.ShapeGeometry(star), new THREE.MeshBasicMaterial({ color: STAR, side: THREE.DoubleSide }), 5);
    starMesh.visible = false;
    starMesh.frustumCulled = false;
    this.dizzy = { pos: new THREE.Vector3(), t: 0, mesh: starMesh };
    this.group.add(this.add.points, this.smoke.points, this.chunkMesh, this.light, starMesh);
  }

  setViewport(h: number, fov: number): void {
    this.add.setViewportHeight(h, fov);
    this.smoke.setViewportHeight(h, fov);
  }

  setWind(w: number): void {
    this.add.wind = w * 0.5;
    this.smoke.wind = w;
  }

  private rnd(a: number, b: number) {
    return a + Math.random() * (b - a);
  }

  explode(x: number, y: number, z: number, radius: number): void {
    const s = this.scale;
    const R = radius;
    this.add.emit(x, y, z, 0, 0, 0, 0.14, R * 2.2, R * 3, C('#fff6e0', 2.2), FIRE1, 0, 0);
    const nFire = Math.round(34 * s) + 8;
    for (let i = 0; i < nFire; i++) {
      const v = new THREE.Vector3().randomDirection().multiplyScalar(this.rnd(0.4, 1) * R * 3.2);
      const life = this.rnd(0.35, 0.85);
      this.add.emit(x, y, z + this.rnd(-1, 1), v.x, v.y + R * 0.6, v.z, life, R * 0.8, R * 1.5, FIRE0, this.rnd(0, 1) < 0.5 ? FIRE1 : FIRE2, 3.5, -2);
    }
    const nSpark = Math.round(70 * s) + 10;
    for (let i = 0; i < nSpark; i++) {
      const v = new THREE.Vector3().randomDirection().multiplyScalar(this.rnd(0.5, 1) * R * 9);
      this.add.emit(x, y, z, v.x, v.y + 6, v.z, this.rnd(0.5, 1.3), 0.55, 0.15, SPARK0, SPARK1, 0.8, 26);
    }
    const nSmoke = Math.round(30 * s) + 6;
    for (let i = 0; i < nSmoke; i++) {
      const v = new THREE.Vector3().randomDirection().multiplyScalar(this.rnd(0.2, 1) * R * 1.6);
      this.smoke.emit(x + v.x * 0.3, y + v.y * 0.3, z + v.z * 0.3, v.x, Math.abs(v.y) + 2.5, v.z, this.rnd(2.2, 4.2), R * 1.5, R * 4.2, SMOKE0, SMOKE1, 1.2, -1.2, 0.85);
    }
    const ring = this.rings.find((r) => r.t >= 1) ?? this.rings[0];
    ring.t = 0;
    ring.r = R * 3.2;
    ring.mesh.position.set(x, y, z + 0.5);
    ring.mesh.visible = true;
    this.light.position.set(x, y + 1, z + 6);
    this.light.intensity = 260 * (R / 3.5);
    this.addFire(x, y, z, 9 + R);
  }

  /** Lingering flames and smoke at a blast site. */
  addFire(x: number, y: number, z: number, seconds: number): void {
    if (this.fires.length >= 6) this.fires.shift();
    this.fires.push({ x, y, z, t: seconds, acc: 0 });
  }

  sparks(x: number, y: number, z: number, n = 18): void {
    for (let i = 0; i < Math.round(n * this.scale) + 3; i++) {
      const v = new THREE.Vector3().randomDirection().multiplyScalar(this.rnd(4, 12));
      this.add.emit(x, y, z, v.x, Math.abs(v.y) + 3, v.z, this.rnd(0.3, 0.7), 0.4, 0.1, SPARK0, SPARK1, 1, 24);
    }
  }

  dust(x: number, y: number, z: number, amount: number): void {
    const n = Math.round(amount * this.scale) + 2;
    for (let i = 0; i < n; i++) {
      this.smoke.emit(x + this.rnd(-1.5, 1.5), y + 0.3, z + this.rnd(-3, 3), this.rnd(-3, 3), this.rnd(0.5, 2.5), this.rnd(-1, 1), this.rnd(1.2, 2.4), 1.6, 4.5, DUST0, DUST1, 1.8, -0.4, 0.55);
    }
  }

  /** Flying chunks. `from` = blast centre (chunks fly away from it); null = they just drop (collapse). */
  debris(pos: THREE.Vector3, color: THREE.Color, size: THREE.Vector3, from: THREE.Vector3 | null, power = 1): void {
    const i = this.chunks.findIndex((c) => !c.alive);
    if (i < 0) return;
    const c = this.chunks[i];
    c.alive = true;
    c.bounces = 0;
    c.p.copy(pos);
    c.s.copy(size);
    if (from) {
      c.v.subVectors(pos, from).normalize().multiplyScalar(this.rnd(8, 22) * power);
      c.v.y += this.rnd(4, 12);
      c.v.z += this.rnd(-6, 10);
      c.w.set(this.rnd(-9, 9), this.rnd(-9, 9), this.rnd(-9, 9));
    } else {
      c.v.set(this.rnd(-1.5, 1.5), this.rnd(-1, 1), this.rnd(-0.5, 0.5));
      c.w.set(this.rnd(-1.5, 1.5), this.rnd(-0.5, 0.5), this.rnd(-1.5, 1.5));
    }
    c.r.set(0, 0, 0);
    c.life = this.rnd(4, 6);
    this.chunkMesh.setColorAt(i, color);
    this.chunkMesh.instanceColor!.needsUpdate = true;
  }

  showDizzy(pos: THREE.Vector3, seconds: number): void {
    if (!this.dizzy) return;
    this.dizzy.pos.copy(pos);
    this.dizzy.t = seconds;
    this.dizzy.mesh.visible = true;
  }

  hideDizzy(): void {
    if (this.dizzy) this.dizzy.mesh.visible = false;
  }

  clear(): void {
    for (const c of this.chunks) c.alive = false;
    this.fires.length = 0;
    this.hideDizzy();
    for (let i = 0; i < this.chunks.length; i++) this.chunkMesh.setMatrixAt(i, this.m.makeScale(0, 0, 0));
    this.chunkMesh.instanceMatrix.needsUpdate = true;
  }

  update(dt: number, t: number, camera: THREE.Camera): void {
    this.add.update(dt);
    this.smoke.update(dt);
    // lingering fires
    for (const f of this.fires) {
      f.t -= dt;
      f.acc += dt * this.scale;
      while (f.acc > 0.07) {
        f.acc -= 0.07;
        const k = Math.min(1, f.t / 4);
        this.add.emit(f.x + this.rnd(-1.2, 1.2), f.y + this.rnd(-0.5, 0.8), f.z + this.rnd(-2, 4), this.rnd(-0.5, 0.5), this.rnd(2, 4), 0, this.rnd(0.4, 0.8), 1.4 * k + 0.3, 0.3, FIRE1, FIRE2, 1, -3);
        if (Math.random() < 0.5) this.smoke.emit(f.x, f.y + 1, f.z + this.rnd(-2, 3), this.rnd(-0.4, 0.4), this.rnd(2, 3.5), 0, this.rnd(2.5, 4), 1.5, 5, SMOKE0, SMOKE1, 0.6, -0.6, 0.5 * k + 0.1);
      }
    }
    this.fires = this.fires.filter((f) => f.t > 0);
    // debris chunks
    let any = false;
    for (let i = 0; i < this.chunks.length; i++) {
      const c = this.chunks[i];
      if (!c.alive) continue;
      any = true;
      c.life -= dt;
      c.v.y -= 32 * dt;
      c.p.addScaledVector(c.v, dt);
      c.r.x += c.w.x * dt;
      c.r.y += c.w.y * dt;
      c.r.z += c.w.z * dt;
      const half = c.s.y * 0.5;
      if (c.p.y < half) {
        c.p.y = half;
        if (c.v.y < -6 && c.bounces < 2) {
          if (c.s.x > 0.8 && Math.random() < 0.35) this.dust(c.p.x, 0, c.p.z, 2);
          c.v.y *= -0.28;
          c.v.x *= 0.5;
          c.v.z *= 0.5;
          c.w.multiplyScalar(0.5);
          c.bounces++;
        } else {
          c.v.set(0, 0, 0);
          c.w.set(0, 0, 0);
        }
      }
      const fade = Math.min(1, c.life / 1.2);
      if (c.life <= 0) c.alive = false;
      this.q.setFromEuler(c.r);
      this.m.compose(c.p, this.q, tmpV.copy(c.s).multiplyScalar(c.alive ? fade : 0));
      this.chunkMesh.setMatrixAt(i, this.m);
    }
    if (any) this.chunkMesh.instanceMatrix.needsUpdate = true;
    // rings
    for (const r of this.rings) {
      if (r.t >= 1) continue;
      r.t = Math.min(1, r.t + dt * 2.2);
      const e = 1 - Math.pow(1 - r.t, 3);
      r.mesh.scale.setScalar(0.3 + e * r.r);
      (r.mesh.material as THREE.MeshBasicMaterial).opacity = (1 - r.t) * 0.5;
      (r.mesh.material as THREE.MeshBasicMaterial).color.setScalar(1.6 * (1 - r.t)).multiply(tmpC.set('#ffcf8a'));
      r.mesh.lookAt(camera.position);
      if (r.t >= 1) r.mesh.visible = false;
    }
    this.light.intensity *= Math.exp(-dt * 9);
    // dizzy stars
    if (this.dizzy && this.dizzy.mesh.visible) {
      const d = this.dizzy;
      d.t -= dt;
      for (let i = 0; i < 5; i++) {
        const a = t * 3 + (i / 5) * Math.PI * 2;
        this.m.compose(
          tmpV.set(d.pos.x + Math.cos(a) * 1.3, d.pos.y + Math.sin(a * 2) * 0.15, d.pos.z + Math.sin(a) * 1.3),
          this.q.setFromEuler(tmpE.set(0, 0, t * 4 + i)),
          tmpS.setScalar(0.9),
        );
        d.mesh.setMatrixAt(i, this.m);
      }
      d.mesh.instanceMatrix.needsUpdate = true;
      if (d.t <= 0) d.mesh.visible = false;
    }
  }
}
const tmpV = new THREE.Vector3();
const tmpS = new THREE.Vector3();
const tmpE = new THREE.Euler();
