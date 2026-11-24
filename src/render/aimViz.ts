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
import { wx } from './palette';

const MAX_DOTS = 120;

/** Dotted aim-assist arc plus a direction arrow at the thrower's hand. */
export class AimViz {
  readonly group = new THREE.Group();
  private dots: THREE.InstancedMesh;
  private arrow: THREE.Group;
  private shaft: THREE.Mesh;
  private head: THREE.Mesh;
  private mat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.85, depthWrite: false });
  private m = new THREE.Matrix4();
  private t = 0;

  constructor() {
    this.dots = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.42, 1), this.mat, MAX_DOTS);
    this.dots.frustumCulled = false;
    this.dots.count = 0;
    const arrowMat = new THREE.MeshBasicMaterial({ color: '#ffffff' });
    this.shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 1, 8).translate(0, 0.5, 0), arrowMat);
    this.head = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.8, 10).translate(0, 0.4, 0), arrowMat);
    this.arrow = new THREE.Group();
    this.arrow.add(this.shaft, this.head);
    this.group.add(this.dots, this.arrow);
    this.hide();
  }

  setColor(c: THREE.Color): void {
    this.mat.color.copy(c).multiplyScalar(1.8);
    (this.shaft.material as THREE.MeshBasicMaterial).color.copy(c).multiplyScalar(2.2);
  }

  /** `path` in sim coords (x,y pairs); `angle` world-space radians from +x; `power01` arrow length. */
  set(origin: THREE.Vector3, angle: number, power01: number, path: Float32Array | null): void {
    this.group.visible = true;
    const len = 1.2 + power01 * 4.5;
    this.arrow.position.copy(origin);
    this.arrow.rotation.set(0, 0, angle - Math.PI / 2);
    this.shaft.scale.set(1, len, 1);
    this.head.position.set(0, len, 0);
    const n = path ? Math.min(MAX_DOTS, path.length / 2) : 0;
    let k = 0;
    for (let i = 2; i < n; i += 2) {
      const s = 0.55 + 0.45 * (1 - i / n) * (0.8 + 0.2 * Math.sin(this.t * 8 - i * 0.5));
      this.m.makeScale(s, s, s).setPosition(wx(path![i * 2]), path![i * 2 + 1], 0.3);
      this.dots.setMatrixAt(k++, this.m);
    }
    this.dots.count = k;
    this.dots.instanceMatrix.needsUpdate = true;
  }

  hide(): void {
    this.group.visible = false;
  }

  update(dt: number): void {
    this.t += dt;
  }
}
