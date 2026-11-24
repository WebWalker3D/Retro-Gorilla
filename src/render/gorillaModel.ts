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

export type GorillaAnim = 'idle' | 'aim' | 'throw' | 'flinch' | 'ko' | 'fall' | 'victory' | 'taunt';

enum B { root, hips, chest, head, shL, elL, shR, elR, hipL, hipR }
const BONE_POS: [B, B | -1, number, number, number][] = [
  [B.root, -1, 0, 0, 0],
  [B.hips, B.root, 0, 1.1, 0],
  [B.chest, B.hips, 0, 0.9, 0],
  [B.head, B.chest, 0, 0.95, 0.15],
  [B.shL, B.chest, -1.0, 0.55, 0],
  [B.elL, B.shL, 0, -1.0, 0],
  [B.shR, B.chest, 1.0, 0.55, 0],
  [B.elR, B.shR, 0, -1.0, 0],
  [B.hipL, B.hips, -0.48, 0, 0],
  [B.hipR, B.hips, 0.48, 0, 0],
];

type Part = [B, 'fur' | 'skin' | 'dark' | 'eye' | 'pupil' | 'chest', number, number, number, number, number, number];
const PARTS: Part[] = [
  [B.hips, 'fur', 0, 1.15, 0, 0.95, 0.72, 0.78],
  [B.chest, 'fur', 0, 2.15, -0.05, 1.32, 1.08, 0.95],
  [B.chest, 'chest', 0, 2.05, 0.55, 0.85, 0.78, 0.42],
  [B.chest, 'fur', -0.92, 2.6, 0, 0.66, 0.58, 0.6],
  [B.chest, 'fur', 0.92, 2.6, 0, 0.66, 0.58, 0.6],
  [B.head, 'fur', 0, 3.05, 0.18, 0.62, 0.62, 0.6],
  [B.head, 'fur', 0, 3.52, 0.02, 0.34, 0.32, 0.42],
  [B.head, 'skin', 0, 2.97, 0.58, 0.47, 0.42, 0.3],
  [B.head, 'dark', 0, 3.2, 0.7, 0.5, 0.12, 0.2],
  [B.head, 'skin', 0, 2.8, 0.78, 0.33, 0.23, 0.22],
  [B.head, 'dark', -0.08, 2.86, 0.98, 0.05, 0.04, 0.03],
  [B.head, 'dark', 0.08, 2.86, 0.98, 0.05, 0.04, 0.03],
  [B.head, 'eye', -0.18, 3.06, 0.8, 0.085, 0.085, 0.06],
  [B.head, 'eye', 0.18, 3.06, 0.8, 0.085, 0.085, 0.06],
  [B.head, 'pupil', -0.18, 3.06, 0.855, 0.045, 0.05, 0.03],
  [B.head, 'pupil', 0.18, 3.06, 0.855, 0.045, 0.05, 0.03],
  [B.shL, 'fur', -1.05, 2.05, 0, 0.4, 0.62, 0.4],
  [B.elL, 'fur', -1.05, 1.05, 0.05, 0.36, 0.56, 0.36],
  [B.elL, 'skin', -1.05, 0.45, 0.12, 0.31, 0.22, 0.34],
  [B.shR, 'fur', 1.05, 2.05, 0, 0.4, 0.62, 0.4],
  [B.elR, 'fur', 1.05, 1.05, 0.05, 0.36, 0.56, 0.36],
  [B.elR, 'skin', 1.05, 0.45, 0.12, 0.31, 0.22, 0.34],
  [B.hipL, 'fur', -0.5, 0.66, 0, 0.38, 0.52, 0.38],
  [B.hipL, 'skin', -0.5, 0.12, 0.18, 0.33, 0.15, 0.46],
  [B.hipR, 'fur', 0.5, 0.66, 0, 0.38, 0.52, 0.38],
  [B.hipR, 'skin', 0.5, 0.12, 0.18, 0.33, 0.15, 0.46],
];

const damp = (a: number, b: number, k: number, dt: number) => a + (b - a) * (1 - Math.exp(-k * dt));

/** Direction (vx, vy) in the gorilla's local x/y plane → shoulder z-rotation for an arm hanging along -y. */
const armAngle = (vx: number, vy: number) => Math.atan2(vx, -vy);

/** An original low-poly gorilla: one skinned mesh (one draw call), animated procedurally. */
export class GorillaModel {
  readonly group = new THREE.Group();
  private bones: THREE.Bone[] = [];
  private mesh: THREE.SkinnedMesh;
  private anim: GorillaAnim = 'idle';
  private t = 0;
  private animT = 0;
  private facing: 1 | -1 = 1;
  private aimAngle = 45;
  private power = 0.5;
  private koDir = 1;
  private seed = Math.random() * 100;
  readonly rim = { value: new THREE.Color('#6f86ff').multiplyScalar(0.55) };

  constructor(tint: THREE.Color) {
    const colors: Record<Part[1], THREE.Color> = {
      fur: tint,
      skin: new THREE.Color('#2e2826'),
      chest: tint.clone().lerp(new THREE.Color('#3a3330'), 0.65),
      dark: new THREE.Color('#151212'),
      eye: new THREE.Color('#f4efe6'),
      pupil: new THREE.Color('#120d0a'),
    };
    const geos = PARTS.map(([bone, mat, x, y, z, sx, sy, sz]) => {
      const g = new THREE.IcosahedronGeometry(1, mat === 'eye' || mat === 'pupil' ? 1 : 1);
      g.deleteAttribute('uv');
      g.scale(sx, sy, sz);
      g.translate(x, y, z);
      const n = g.attributes.position.count;
      const col = new Float32Array(n * 3);
      const si = new Uint16Array(n * 4);
      const sw = new Float32Array(n * 4);
      const c = colors[mat];
      for (let i = 0; i < n; i++) {
        col.set([c.r, c.g, c.b], i * 3);
        si[i * 4] = bone;
        sw[i * 4] = 1;
      }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
      g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
      return g;
    });
    const geo = mergeGeometries(geos)!;
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.88, metalness: 0 });
    // rim light keeps the silhouette readable against a dark skyline
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uRim = this.rim;
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform vec3 uRim;')
        .replace(
          '#include <emissivemap_fragment>',
          '#include <emissivemap_fragment>\nfloat rimF = pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), 2.5);\ntotalEmissiveRadiance += uRim * rimF;',
        );
    };
    this.mesh = new THREE.SkinnedMesh(geo, mat);
    for (const [b, parent, x, y, z] of BONE_POS) {
      const bone = new THREE.Bone();
      bone.position.set(x, y, z);
      this.bones[b] = bone;
      if (parent === -1) this.mesh.add(bone);
      else this.bones[parent].add(bone);
    }
    this.mesh.updateMatrixWorld(true);
    this.mesh.bind(new THREE.Skeleton(this.bones));
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false;
    this.mesh.scale.setScalar(1.3);
    this.group.add(this.mesh);
  }

  setFacing(dir: 1 | -1): void {
    this.facing = dir;
  }

  play(anim: GorillaAnim, koDir = 1): void {
    if (anim === this.anim && anim !== 'throw' && anim !== 'flinch') return;
    this.anim = anim;
    this.animT = 0;
    this.koDir = koDir;
  }

  get current(): GorillaAnim {
    return this.anim;
  }

  setAim(angleDeg: number, power01: number): void {
    this.aimAngle = angleDeg;
    this.power = power01;
  }

  /** World position of the throwing hand (for spawning the banana visual). */
  handPosition(out: THREE.Vector3): THREE.Vector3 {
    const el = this.bones[this.facing > 0 ? B.elR : B.elL];
    return el.localToWorld(out.set(0, -0.6, 0.1));
  }

  update(dt: number): void {
    this.t += dt;
    this.animT += dt;
    const b = this.bones;
    const t = this.t + this.seed;
    const f = this.facing;
    const at = this.animT;
    const throwArm = f > 0 ? B.shR : B.shL;
    const otherArm = f > 0 ? B.shL : B.shR;
    const throwEl = f > 0 ? B.elR : B.elL;
    const otherEl = f > 0 ? B.elL : B.elR;
    const k = 14;

    // defaults: idle breathing, arms hanging, head looking toward the opponent
    let rootY = 0;
    let rootRotZ = 0;
    let yaw = f * 0.38;
    let chestX = Math.sin(t * 1.6) * 0.03;
    let headY = f * 0.35 + Math.sin(t * 0.35) * 0.25;
    let headX = Math.sin(t * 0.5) * 0.05;
    let shTz = -f * 0.14;
    let shOz = f * 0.14;
    let shTx = Math.sin(t * 1.6) * 0.04;
    let shOx = Math.sin(t * 1.6 + 1) * 0.04;
    let elT = -0.15;
    let elO = -0.15;
    let squash = 1 + Math.sin(t * 1.6) * 0.015;

    const a = (this.aimAngle * Math.PI) / 180;
    const tx = f * Math.cos(a);
    const ty = Math.sin(a);
    if (this.anim === 'aim' || this.anim === 'throw') {
      // wind-up: hand behind the head, pulled further back with more power
      const back = 0.6 + this.power * 0.9;
      const wx = -tx * back * 0.7;
      const wy = 0.75 + ty * 0.25;
      let ang = armAngle(wx, wy);
      if (this.anim === 'throw') {
        const s = Math.min(1, at / 0.16);
        const release = armAngle(tx, ty);
        ang = ang + (release - ang + (release - ang > Math.PI ? -2 * Math.PI : release - ang < -Math.PI ? 2 * Math.PI : 0)) * (1 - Math.pow(1 - s, 3));
        if (at > 0.55) this.play('idle');
        chestX = 0.15 * Math.sin(Math.min(1, at / 0.2) * Math.PI);
      }
      shTz = ang;
      elT = -0.5;
      shOz = f * 0.35;
      headY = f * 0.55;
      yaw = f * 0.55;
    } else if (this.anim === 'flinch') {
      const s = Math.sin(Math.min(1, at / 0.6) * Math.PI);
      rootY = -0.35 * s;
      squash = 1 - 0.12 * s;
      shTz = -f * 2.7 * s;
      shOz = f * 2.7 * s;
      elT = elO = -1.2 * s;
      headX = 0.4 * s;
      if (at > 0.7) this.play('idle');
    } else if (this.anim === 'victory') {
      const hop = Math.abs(Math.sin(at * 4.2));
      rootY = hop * 0.35;
      shTx = shOx = -1.25;
      shTz = -f * 0.35;
      shOz = f * 0.35;
      const beat = Math.sin(at * 16);
      elT = -1.9 - 0.4 * Math.max(0, beat);
      elO = -1.9 - 0.4 * Math.max(0, -beat);
      shTx += 0.3 * Math.max(0, beat);
      shOx += 0.3 * Math.max(0, -beat);
      headX = -0.35;
      yaw = Math.sin(at * 1.3) * 0.3;
      chestX = -0.15;
    } else if (this.anim === 'taunt') {
      shTz = armAngle(f * 0.3, 1) + Math.sin(at * 9) * 0.4;
      elT = -0.6 - Math.sin(at * 9) * 0.4;
      headY = f * 0.6;
      headX = Math.sin(at * 9) * 0.1;
      if (at > 1.6) this.play('idle');
    } else if (this.anim === 'fall') {
      shTz = -f * (2.6 + 0.4 * Math.sin(at * 22));
      shOz = f * (2.6 + 0.4 * Math.sin(at * 22 + 1.5));
      elT = elO = -0.4;
      headX = -0.3;
    } else if (this.anim === 'ko') {
      const s = Math.min(1, at / 0.45);
      rootRotZ = -this.koDir * 1.45 * (1 - Math.pow(1 - s, 3));
      if (s >= 1) rootRotZ += Math.sin(at * 18) * 0.05 * Math.exp(-(at - 0.45) * 5);
      shTz = -f * 1.2;
      shOz = f * 1.2;
      elT = elO = -0.3;
      headX = 0.4;
      headY = Math.sin(at * 2.5) * 0.25;
      squash = 1;
    }

    const ks = this.anim === 'throw' ? 60 : k;
    b[B.root].position.y = damp(b[B.root].position.y, rootY, k, dt);
    b[B.root].rotation.z = damp(b[B.root].rotation.z, rootRotZ, this.anim === 'ko' ? 60 : k, dt);
    b[B.root].rotation.y = damp(b[B.root].rotation.y, yaw, 6, dt);
    b[B.chest].rotation.x = damp(b[B.chest].rotation.x, chestX, k, dt);
    b[B.chest].scale.y = squash;
    b[B.head].rotation.y = damp(b[B.head].rotation.y, headY, 5, dt);
    b[B.head].rotation.x = damp(b[B.head].rotation.x, headX, 8, dt);
    b[throwArm].rotation.z = damp(b[throwArm].rotation.z, shTz, ks, dt);
    b[throwArm].rotation.x = damp(b[throwArm].rotation.x, shTx, k, dt);
    b[otherArm].rotation.z = damp(b[otherArm].rotation.z, shOz, k, dt);
    b[otherArm].rotation.x = damp(b[otherArm].rotation.x, shOx, k, dt);
    b[throwEl].rotation.x = damp(b[throwEl].rotation.x, elT, k, dt);
    b[otherEl].rotation.x = damp(b[otherEl].rotation.x, elO, k, dt);
  }
}
