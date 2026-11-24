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
import { Rng } from '../sim/rng';
import type { City, GorillaState } from '../sim/types';
import { wx } from './palette';

type Kind = 'tower' | 'ac' | 'antenna' | 'flag';
interface Prop {
  kind: Kind;
  inst: number;
  supports: number[];
  pos: THREE.Vector3;
  alive: boolean;
}

function colored(g: THREE.BufferGeometry, hex: string): THREE.BufferGeometry {
  const geo = g.index ? g.toNonIndexed() : g;
  geo.deleteAttribute('uv');
  const c = new THREE.Color(hex);
  const n = geo.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) arr.set([c.r, c.g, c.b], i * 3);
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}

function towerGeometry(): THREE.BufferGeometry {
  const parts = [
    colored(new THREE.CylinderGeometry(1, 1, 1.7, 12).translate(0, 2.05, 0), '#7a4a2e'),
    colored(new THREE.ConeGeometry(1.08, 0.7, 12).translate(0, 3.25, 0), '#4a2c1c'),
    colored(new THREE.CylinderGeometry(1.02, 1.02, 0.08, 12).translate(0, 1.6, 0), '#2a1a12'),
    colored(new THREE.CylinderGeometry(1.02, 1.02, 0.08, 12).translate(0, 2.5, 0), '#2a1a12'),
  ];
  for (const [x, z] of [[-0.7, -0.7], [0.7, -0.7], [-0.7, 0.7], [0.7, 0.7]])
    parts.push(colored(new THREE.BoxGeometry(0.12, 1.2, 0.12).translate(x, 0.6, z), '#30333a'));
  return mergeGeometries(parts)!;
}

function acGeometry(): THREE.BufferGeometry {
  return mergeGeometries([
    colored(new THREE.BoxGeometry(1.3, 0.75, 1).translate(0, 0.375, 0), '#9aa0a8'),
    colored(new THREE.CylinderGeometry(0.34, 0.34, 0.06, 10).translate(0, 0.78, 0), '#3a3d44'),
  ])!;
}

function antennaGeometry(): THREE.BufferGeometry {
  return mergeGeometries([
    colored(new THREE.CylinderGeometry(0.05, 0.1, 1, 6).translate(0, 0.5, 0), '#6a6e78'),
    colored(new THREE.BoxGeometry(0.7, 0.04, 0.04).translate(0, 0.7, 0), '#6a6e78'),
    colored(new THREE.BoxGeometry(0.5, 0.04, 0.04).translate(0, 0.82, 0), '#6a6e78'),
  ])!;
}

/** Rooftop props. They vanish (and become debris) when the roof cells under them are destroyed. */
export class RoofProps {
  readonly group = new THREE.Group();
  private meshes: Record<Kind, THREE.InstancedMesh>;
  private lights: THREE.InstancedMesh;
  private poles: THREE.InstancedMesh;
  private props: Prop[] = [];
  private u = { uTime: { value: 0 }, uWind: { value: 0 } };
  private m = new THREE.Matrix4();

  constructor() {
    const vc = () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, metalness: 0.2 });
    const flagGeo = new THREE.PlaneGeometry(1.9, 1.1, 10, 3).translate(0.95, -0.55, 0);
    const flagMat = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.9 });
    flagMat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, this.u);
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime; uniform float uWind;').replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        {
          float s = uWind < 0.0 ? -1.0 : 1.0;
          float strength = clamp(abs(uWind) / 8.0, 0.0, 1.0);
          float droop = (1.0 - strength) * 1.3;
          float x = transformed.x;
          float u = x / 1.9;
          float y = transformed.y;
          transformed.x = (x * cos(droop) + y * sin(droop) * 0.3) * s;
          transformed.y = y * cos(droop * 0.5) - x * sin(droop);
          transformed.z += sin(u * 5.5 - uTime * (3.0 + strength * 9.0) + float(gl_InstanceID) * 1.7) * 0.22 * u * (0.35 + strength);
        }`,
      );
    };
    this.meshes = {
      tower: new THREE.InstancedMesh(towerGeometry(), vc(), 24),
      ac: new THREE.InstancedMesh(acGeometry(), vc(), 40),
      antenna: new THREE.InstancedMesh(antennaGeometry(), vc(), 24),
      flag: new THREE.InstancedMesh(flagGeo, flagMat, 12),
    };
    this.poles = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.05, 0.05, 3.4, 5).translate(0, 1.7, 0), new THREE.MeshStandardMaterial({ color: '#c8c8d0', metalness: 0.7, roughness: 0.3 }), 12);
    const lightMat = new THREE.MeshBasicMaterial({ color: '#ff2a2a' });
    lightMat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, this.u);
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;').replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nfloat on = step(0.55, fract(uTime * 0.7 + float(gl_InstanceID) * 0.37));\ntransformed *= mix(0.3, 1.0, on);',
      );
    };
    lightMat.color.multiplyScalar(4);
    this.lights = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.16, 1), lightMat, 24);
    for (const mesh of [...Object.values(this.meshes), this.poles, this.lights]) {
      mesh.count = 0;
      mesh.castShadow = mesh !== this.lights;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      this.group.add(mesh);
    }
  }

  build(city: City, seed: number, gorillas: GorillaState[]): void {
    const rng = new Rng(seed ^ 0x5eed);
    this.props = [];
    for (const mesh of [...Object.values(this.meshes), this.poles, this.lights]) mesh.count = 0;
    const add = (kind: Kind, bx: number, w: number, height: number, z: number, scaleY = 1) => {
      const mesh = this.meshes[kind];
      if (mesh.count >= mesh.instanceMatrix.count) return;
      const inst = mesh.count++;
      const x = wx(bx + w / 2);
      const pos = new THREE.Vector3(x, height, z);
      this.m.compose(pos, new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), kind === 'tower' ? rng.range(0, 6) : 0), new THREE.Vector3(1, scaleY, 1));
      mesh.setMatrixAt(inst, this.m);
      const supports: number[] = [];
      for (let cx = Math.floor(bx); cx < Math.ceil(bx + w); cx++) supports.push((height - 1) * city.w + cx);
      this.props.push({ kind, inst, supports, pos, alive: true });
      if (kind === 'antenna') {
        const li = this.lights.count++;
        this.lights.setMatrixAt(li, this.m.makeTranslation(x, height + scaleY * 1.02, z));
      }
      if (kind === 'flag') {
        const pi = this.poles.count++;
        this.poles.setMatrixAt(pi, this.m.makeTranslation(x, height, z));
        this.m.makeTranslation(x, height + 3.3, z);
        mesh.setMatrixAt(inst, this.m);
        mesh.setColorAt(inst, new THREE.Color(rng.pick(['#ffd23f', '#ef476f', '#06d6a0', '#118ab2', '#f78c6b'])));
      }
    };
    let flags = 0;
    city.buildings.forEach((b, i) => {
      const blocked = gorillas.some((g) => g.x > b.x0 - 1 && g.x < b.x0 + b.width + 1);
      const lo = b.x0 + 0.3;
      const hi = b.x0 + b.width - 0.3;
      if (!blocked && rng.next() < 0.35 && b.width >= 7) add('tower', rng.range(lo, hi - 2.2), 2.2, b.height, rng.range(-3.6, -2.2));
      const acs = rng.int(0, 2);
      for (let k = 0; k < acs; k++) add('ac', rng.range(lo, hi - 1.4), 1.4, b.height, rng.range(-3.8, blocked ? -2.5 : 2.5));
      if (rng.next() < 0.35) add('antenna', rng.range(lo, hi - 0.4), 0.4, b.height, rng.range(-4, -2.8), rng.range(3, 7));
      if ((i % 3 === 1 || rng.next() < 0.15) && flags < 12) {
        flags++;
        add('flag', rng.next() < 0.5 ? lo : hi - 0.4, 0.4, b.height, -4.2);
      }
    });
    for (const mesh of [...Object.values(this.meshes), this.poles, this.lights]) {
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }

  /** Hides props whose roof was destroyed; returns their world positions for debris. */
  removeCells(indices: number[]): THREE.Vector3[] {
    if (!indices.length) return [];
    const gone = new Set(indices);
    const out: THREE.Vector3[] = [];
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (const p of this.props) {
      if (!p.alive || !p.supports.some((s) => gone.has(s))) continue;
      p.alive = false;
      this.meshes[p.kind].setMatrixAt(p.inst, zero);
      this.meshes[p.kind].instanceMatrix.needsUpdate = true;
      out.push(p.pos.clone());
    }
    // poles/lights follow their props by order
    let fi = 0;
    let ai = 0;
    for (const p of this.props) {
      if (p.kind === 'flag') {
        if (!p.alive) this.poles.setMatrixAt(fi, zero);
        fi++;
      } else if (p.kind === 'antenna') {
        if (!p.alive) this.lights.setMatrixAt(ai, zero);
        ai++;
      }
    }
    this.poles.instanceMatrix.needsUpdate = true;
    this.lights.instanceMatrix.needsUpdate = true;
    return out;
  }

  update(t: number, wind: number): void {
    this.u.uTime.value = t;
    this.u.uWind.value += (wind - this.u.uWind.value) * 0.03;
  }
}
