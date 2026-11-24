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
import type { City } from '../sim/types';
import { BUILDING_COLORS, DEPTH, wx } from './palette';

const VERT_PARS = /* glsl */ `
attribute vec3 aColor;
attribute vec4 aInfo;
varying vec3 vCol;
varying vec4 vInfo;
varying vec3 vLocal;
varying vec3 vNrm;
varying float vWorldY;
`;
const FRAG_PARS = /* glsl */ `
uniform float uLit;
uniform float uTime;
uniform float uWinBright;
varying vec3 vCol;
varying vec4 vInfo;
varying vec3 vLocal;
varying vec3 vNrm;
varying float vWorldY;
float rgHash(float n) { return fract(sin(n * 12.9898) * 43758.5453); }
float rgBox(vec2 uv, vec2 a, vec2 b) {
  vec2 aa = fwidth(uv) * 0.8 + 0.002;
  vec2 s = smoothstep(a - aa, a + aa, uv) * (1.0 - smoothstep(b - aa, b + aa, uv));
  return s.x * s.y;
}
`;

const FRAG_COLOR = /* glsl */ `
  vec3 n = vNrm;
  float isFront = step(0.5, abs(n.z));
  float isSide = step(0.5, abs(n.x));
  float isTop = step(0.5, n.y);
  float roofCell = step(3.5, vInfo.y);
  float style = mod(vInfo.y, 4.0);
  vec2 uv = vLocal.xy + 0.5;
  float bay = vInfo.w * 31.0;
  if (isSide > 0.5) {
    float zz = vLocal.z + ${(DEPTH / 2).toFixed(1)};
    uv = vec2(fract(zz), vLocal.y + 0.5);
    bay = vInfo.w * 31.0 + floor(zz) * 1.7 + n.x * 5.0;
  }
  float win = 0.0;
  if (style < 0.5) win = rgBox(uv, vec2(0.16, 0.24), vec2(0.84, 0.8));
  else if (style < 1.5) win = max(rgBox(uv, vec2(0.13, 0.18), vec2(0.43, 0.84)), rgBox(uv, vec2(0.57, 0.18), vec2(0.87, 0.84)));
  else if (style < 2.5) win = rgBox(uv, vec2(-0.1, 0.3), vec2(1.1, 0.86)) * (1.0 - rgBox(uv, vec2(0.47, -0.1), vec2(0.53, 1.1)));
  else win = rgBox(uv, vec2(0.3, 0.28), vec2(0.7, 0.76));
  float cornice = roofCell * step(0.82, uv.y) * (1.0 - isTop);
  win *= (1.0 - isTop) * (1.0 - cornice);
  float seed = isSide > 0.5 ? rgHash(bay) : vInfo.x;
  float burn = vInfo.z;
  float lit = step(seed, uLit) * step(burn, 0.25);
  float h = rgHash(bay + 3.1);
  float flick = h > 0.985 ? 0.55 + 0.45 * sin(uTime * (9.0 + h * 20.0) + h * 40.0) : 1.0;
  vec3 wall = vCol * (0.86 + 0.14 * rgHash(bay + 9.0));
  wall *= 1.0 - 0.35 * (1.0 - smoothstep(0.0, 0.07, uv.y)) * (1.0 - isTop); // floor ledge shadow line
  if (style > 2.5) wall *= 0.92 + 0.08 * step(0.5, fract(uv.y * 4.0 + step(0.5, fract(uv.y * 2.0)) * 0.5 + uv.x * 2.0)); // brick courses
  wall = mix(wall, vCol * 1.25 + 0.05, cornice);
  wall *= mix(1.0, 0.5, isTop);
  wall *= 0.55 + 0.45 * smoothstep(0.0, 10.0, vWorldY); // darker toward the street
  vec3 glass = vec3(0.025, 0.035, 0.05);
  diffuseColor.rgb = mix(wall, glass, win) * mix(1.0, 0.16, burn);
  vec3 warm = vec3(1.0, 0.72, 0.38), cool = vec3(0.62, 0.82, 1.0), white = vec3(1.0, 0.93, 0.8);
  vec3 litCol = h < 0.55 ? warm : (h < 0.8 ? white : cool);
  float glowGrad = 0.7 + 0.3 * (1.0 - uv.y);
  vec3 rgWinEmit = litCol * win * lit * flick * glowGrad * uWinBright;
  float rgWin = win;
`;

/**
 * Every solid sim cell is one instanced box (1 × 1 × DEPTH), so the whole city is one draw call.
 * Windows, cornices, bricks and scorch marks are drawn procedurally in the shader.
 */
export class CityMesh {
  readonly mesh: THREE.InstancedMesh;
  readonly uniforms = { uLit: { value: 0.5 }, uTime: { value: 0 }, uWinBright: { value: 1.5 } };
  private aColor: THREE.InstancedBufferAttribute;
  private aInfo: THREE.InstancedBufferAttribute;
  private cellToInst = new Int32Array(0);
  private instToCell = new Int32Array(0);
  private cellBuilding = new Uint8Array(0);
  private w = 0;
  private colorOf: THREE.Color[] = [];

  constructor(maxCells: number) {
    const geo = new THREE.BoxGeometry(1, 1, DEPTH);
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.82, metalness: 0.05 });
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, this.uniforms);
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', `#include <common>\n${VERT_PARS}`)
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>\nvCol = aColor; vInfo = aInfo; vLocal = position; vNrm = normal; vWorldY = (instanceMatrix * vec4(position, 1.0)).y;`,
        );
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>\n${FRAG_PARS}`)
        .replace('#include <color_fragment>', `#include <color_fragment>\n${FRAG_COLOR}`)
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.1, rgWin);')
        .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = mix(metalnessFactor, 0.8, rgWin);')
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += rgWinEmit;');
    };
    this.mesh = new THREE.InstancedMesh(geo, mat, maxCells);
    this.aColor = new THREE.InstancedBufferAttribute(new Float32Array(maxCells * 3), 3);
    this.aInfo = new THREE.InstancedBufferAttribute(new Float32Array(maxCells * 4), 4);
    geo.setAttribute('aColor', this.aColor);
    geo.setAttribute('aInfo', this.aInfo);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
  }

  build(city: City): void {
    this.w = city.w;
    const n = city.cells.length;
    this.cellToInst = new Int32Array(n).fill(-1);
    this.instToCell = new Int32Array(this.mesh.instanceMatrix.count);
    this.cellBuilding = city.cells.slice();
    this.colorOf = city.buildings.map((b, i) => {
      const c = BUILDING_COLORS[b.palette].clone();
      const hsl = { h: 0, s: 0, l: 0 };
      c.getHSL(hsl);
      return c.setHSL(hsl.h + ((i * 0.013) % 0.03), hsl.s, hsl.l * (0.85 + ((i * 37) % 10) / 40));
    });
    const m = new THREE.Matrix4();
    let k = 0;
    for (let i = 0; i < n; i++) {
      const b = city.cells[i];
      if (!b) continue;
      const x = i % city.w;
      const y = (i / city.w) | 0;
      const bld = city.buildings[b - 1];
      m.makeTranslation(wx(x) + 0.5, y + 0.5, 0);
      this.mesh.setMatrixAt(k, m);
      const c = this.colorOf[b - 1];
      this.aColor.setXYZ(k, c.r, c.g, c.b);
      const roof = y === bld.height - 1 ? 4 : 0;
      this.aInfo.setXYZW(k, city.windowSeed[i] / 255, bld.style + roof, 0, ((i * 2654435761) >>> 0) / 4294967296);
      this.cellToInst[i] = k;
      this.instToCell[k] = i;
      k++;
    }
    this.mesh.count = k;
    this.flush();
  }

  private flush(): void {
    this.mesh.instanceMatrix.needsUpdate = true;
    this.aColor.needsUpdate = true;
    this.aInfo.needsUpdate = true;
  }

  /** World-space centre and colour of a cell (valid before or after removal). */
  cellInfo(i: number, outPos: THREE.Vector3, outColor: THREE.Color): void {
    const x = i % this.w;
    const y = (i / this.w) | 0;
    outPos.set(wx(x) + 0.5, y + 0.5, 0);
    const b = this.cellBuilding[i];
    outColor.copy(b ? this.colorOf[b - 1] : BUILDING_COLORS[0]);
    const inst = this.cellToInst[i];
    if (inst >= 0) outColor.multiplyScalar(1 - 0.84 * this.aInfo.getZ(inst));
  }

  removeCells(indices: number[]): void {
    const mat = this.mesh.instanceMatrix.array as Float32Array;
    const col = this.aColor.array as Float32Array;
    const inf = this.aInfo.array as Float32Array;
    for (const i of indices) {
      const inst = this.cellToInst[i];
      if (inst < 0) continue;
      const last = this.mesh.count - 1;
      if (inst !== last) {
        mat.copyWithin(inst * 16, last * 16, last * 16 + 16);
        col.copyWithin(inst * 3, last * 3, last * 3 + 3);
        inf.copyWithin(inst * 4, last * 4, last * 4 + 4);
        const moved = this.instToCell[last];
        this.instToCell[inst] = moved;
        this.cellToInst[moved] = inst;
      }
      this.cellToInst[i] = -1;
      this.mesh.count = last;
    }
    this.flush();
  }

  /** Char the facade around a blast; lit windows inside the scorch go dark. */
  scorch(cx: number, cy: number, r: number): void {
    const R = r * 1.8;
    const inf = this.aInfo.array as Float32Array;
    const h = this.cellToInst.length / this.w;
    for (let y = Math.max(0, Math.floor(cy - R)); y <= Math.min(h - 1, Math.ceil(cy + R)); y++)
      for (let x = Math.max(0, Math.floor(cx - R)); x <= Math.min(this.w - 1, Math.ceil(cx + R)); x++) {
        const inst = this.cellToInst[y * this.w + x];
        if (inst < 0) continue;
        const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy) / R;
        if (d >= 1) continue;
        const burn = Math.min(1, (1 - d) * 1.4);
        inf[inst * 4 + 2] = Math.max(inf[inst * 4 + 2], burn);
      }
    this.aInfo.needsUpdate = true;
  }

  setLit(fraction: number): void {
    this.uniforms.uLit.value = fraction;
  }

  update(t: number): void {
    this.uniforms.uTime.value = t;
  }
}
