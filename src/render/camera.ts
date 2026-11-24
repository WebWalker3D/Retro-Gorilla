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

export type CamMode = 'overview' | 'follow' | 'focus' | 'orbit';

const damp = (k: number, dt: number) => 1 - Math.exp(-k * dt);

/** Cinematic camera: overview while aiming, follow-cam in flight, focus/orbit on impacts, trauma shake. */
export class CameraDirector {
  mode: CamMode = 'overview';
  private pos = new THREE.Vector3(0, 40, 150);
  private look = new THREE.Vector3(0, 30, 0);
  private goalPos = new THREE.Vector3(0, 40, 150);
  private goalLook = new THREE.Vector3(0, 30, 0);
  private box = { x0: -60, x1: 60, y0: 0, y1: 60 };
  private trauma = 0;
  private orbitA = 0;
  private orbitPoint = new THREE.Vector3();
  private orbitDist = 14;
  private kPos = 3;
  private kLook = 5;
  private t = 0;

  constructor(private camera: THREE.PerspectiveCamera) {}

  setOverviewBox(x0: number, x1: number, y0: number, y1: number): void {
    this.box = { x0, x1, y0, y1 };
  }

  private overviewGoal(): void {
    const { x0, x1, y0, y1 } = this.box;
    const half = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    const cx = (x0 + x1) / 2;
    const cy = (y0 + y1) / 2;
    const hw = (x1 - x0) / 2;
    const hh = (y1 - y0) / 2;
    const d = Math.max(hh / half, hw / (half * this.camera.aspect)) * 1.02;
    const drift = Math.sin(this.t * 0.07) * d * 0.012;
    this.goalPos.set(cx + drift, cy + d * 0.07, d);
    this.goalLook.set(cx + drift * 0.5, cy - d * 0.015, 0);
  }

  overview(speed = 2.2): void {
    this.mode = 'overview';
    this.kPos = speed;
    this.kLook = speed * 1.6;
  }

  follow(target: THREE.Vector3, vel: THREE.Vector3): void {
    this.mode = 'follow';
    this.kPos = 3.2;
    this.kLook = 7;
    const sx = Math.sign(vel.x) || 1;
    this.goalLook.set(target.x + vel.x * 0.22, target.y + THREE.MathUtils.clamp(vel.y * 0.1, -5, 5), 0);
    this.goalPos.set(target.x - sx * 12, Math.max(5, target.y + 2.5), 46);
  }

  focus(point: THREE.Vector3, dist = 22, k = 3): void {
    this.mode = 'focus';
    this.kPos = k;
    this.kLook = k * 1.8;
    this.goalLook.copy(point);
    this.goalPos.set(point.x * 0.92, point.y + dist * 0.18, point.z + dist);
  }

  orbit(point: THREE.Vector3, dist = 13): void {
    this.mode = 'orbit';
    this.kPos = 4;
    this.kLook = 8;
    this.orbitPoint.copy(point);
    this.orbitDist = dist;
    this.orbitA = -0.5 * Math.sign(point.x || 1);
  }

  shake(amount: number): void {
    this.trauma = Math.min(1, this.trauma + amount);
  }

  snap(): void {
    if (this.mode === 'overview') this.overviewGoal();
    this.pos.copy(this.goalPos);
    this.look.copy(this.goalLook);
  }

  update(dt: number, realDt: number): void {
    this.t += realDt;
    if (this.mode === 'overview') this.overviewGoal();
    if (this.mode === 'orbit') {
      this.orbitA += dt * 0.6;
      const p = this.orbitPoint;
      this.goalLook.set(p.x, p.y + 2, p.z);
      this.goalPos.set(p.x + Math.sin(this.orbitA) * this.orbitDist, p.y + 4, p.z + Math.cos(this.orbitA) * this.orbitDist);
    }
    this.pos.lerp(this.goalPos, damp(this.kPos, realDt));
    this.look.lerp(this.goalLook, damp(this.kLook, realDt));
    this.trauma = Math.max(0, this.trauma - realDt * 1.4);
    const s = this.trauma * this.trauma;
    const n = (f: number, o: number) => Math.sin(this.t * f + o) * 0.6 + Math.sin(this.t * f * 2.3 + o * 1.7) * 0.4;
    this.camera.position.set(this.pos.x + n(37, 1) * s * 2.2, this.pos.y + n(41, 2) * s * 2.2, this.pos.z);
    this.camera.lookAt(this.look.x + n(29, 3) * s * 0.8, this.look.y + n(31, 4) * s * 0.8, this.look.z);
    this.camera.rotateZ(n(23, 5) * s * 0.035);
  }
}
