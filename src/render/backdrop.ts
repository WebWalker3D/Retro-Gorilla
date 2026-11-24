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
import { Rng } from '../sim/rng';
import type { Look } from './palette';

/** Far skyline: instanced towers with world-space window grids, faded by fog. */
function farTowerMaterial(uniforms: { uLit: { value: number }; uTime: { value: number } }, bright: number): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.9, metalness: 0 });
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vW; varying vec3 vN; varying float vId;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvW = (modelMatrix * instanceMatrix * vec4(position, 1.0)).xyz; vN = normal; vId = float(gl_InstanceID);');
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>\nuniform float uLit; uniform float uTime; varying vec3 vW; varying vec3 vN; varying float vId;\nfloat fh(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,37.719))) * 43758.5453); }`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        {
          vec2 g = abs(vN.z) > 0.5 ? vW.xy : vW.zy;
          vec2 cell = g / vec2(1.3, 1.6);
          vec2 f = fract(cell);
          float win = step(0.22, f.x) * step(f.x, 0.78) * step(0.25, f.y) * step(f.y, 0.75) * step(abs(vN.y), 0.5);
          float lit = step(fh(vec3(floor(cell), vId)), uLit * 0.6);
          vec3 c = mix(vec3(1.0, 0.75, 0.42), vec3(0.65, 0.82, 1.0), step(0.7, fh(vec3(floor(cell), vId + 7.0))));
          totalEmissiveRadiance += c * win * lit * ${bright.toFixed(2)};
          diffuseColor.rgb *= 1.0 - 0.5 * win;
        }`,
      );
  };
  return mat;
}

function laneTexture(): THREE.CanvasTexture {
  const cv = document.createElement('canvas');
  cv.width = 256;
  cv.height = 64;
  const g = cv.getContext('2d')!;
  g.fillStyle = '#2a2b31';
  g.fillRect(0, 0, 256, 64);
  for (let i = 0; i < 600; i++) {
    g.fillStyle = `rgba(${Math.random() < 0.5 ? '0,0,0' : '255,255,255'},${Math.random() * 0.06})`;
    g.fillRect(Math.random() * 256, Math.random() * 64, 2, 2);
  }
  g.fillStyle = '#d8c46a';
  g.fillRect(0, 30, 120, 4);
  g.fillStyle = '#cfcfcf';
  g.fillRect(0, 2, 256, 2);
  g.fillRect(0, 60, 256, 2);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

function poolTexture(): THREE.CanvasTexture {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 128;
  const g = cv.getContext('2d')!;
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,0.9)');
  grad.addColorStop(0.5, 'rgba(255,255,255,0.25)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(cv);
}

const ROAD_Z = 10;

/** Everything that frames the duel but never takes part: far skyline, street, lamps, traffic. */
export class Backdrop {
  readonly group = new THREE.Group();
  private uniforms = { uLit: { value: 0.5 }, uTime: { value: 0 } };
  private rows: THREE.InstancedMesh[] = [];
  private bulbs: THREE.InstancedMesh;
  private pools: THREE.InstancedMesh;
  private cars: THREE.InstancedMesh;
  private carUniforms = { uTime: { value: 0 } };

  constructor(rowCount: number) {
    const box = new THREE.BoxGeometry(1, 1, 1);
    box.translate(0, 0.5, 0);
    const specs = [
      { z0: -70, z1: -100, x: 210, h0: 8, h1: 42, w0: 7, w1: 15, n: 48, color: '#2e3348', bright: 0.9 },
      { z0: -160, z1: -230, x: 340, h0: 22, h1: 80, w0: 12, w1: 24, n: 52, color: '#262b40', bright: 0.6 },
      { z0: -320, z1: -400, x: 520, h0: 40, h1: 125, w0: 16, w1: 32, n: 52, color: '#20263c', bright: 0.45 },
    ].slice(0, rowCount);
    const rng = new Rng(77);
    const m = new THREE.Matrix4();
    const col = new THREE.Color();
    for (const s of specs) {
      const mesh = new THREE.InstancedMesh(box, farTowerMaterial(this.uniforms, s.bright), s.n);
      for (let i = 0; i < s.n; i++) {
        const w = rng.range(s.w0, s.w1);
        const h = rng.range(s.h0, s.h1);
        const d = rng.range(6, 14);
        m.compose(
          new THREE.Vector3(rng.range(-s.x, s.x), 0, rng.range(s.z1, s.z0)),
          new THREE.Quaternion(),
          new THREE.Vector3(w, h, d),
        );
        mesh.setMatrixAt(i, m);
        mesh.setColorAt(i, col.set(s.color).multiplyScalar(rng.range(0.7, 1.2)));
      }
      mesh.receiveShadow = false;
      mesh.castShadow = false;
      this.rows.push(mesh);
      this.group.add(mesh);
    }

    const ground = new THREE.Mesh(new THREE.PlaneGeometry(3000, 3000), new THREE.MeshStandardMaterial({ color: '#16171d', roughness: 0.95 }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.02;
    ground.receiveShadow = true;
    const lanes = laneTexture();
    lanes.repeat.set(40, 1);
    const road = new THREE.Mesh(new THREE.PlaneGeometry(400, 8), new THREE.MeshStandardMaterial({ map: lanes, roughness: 0.7, metalness: 0.1 }));
    road.rotation.x = -Math.PI / 2;
    road.position.set(0, 0.01, ROAD_Z);
    road.receiveShadow = true;
    const walk = new THREE.Mesh(new THREE.BoxGeometry(400, 0.3, 1.6), new THREE.MeshStandardMaterial({ color: '#4a4a52', roughness: 0.9 }));
    walk.position.set(0, 0.15, 5.6);
    walk.receiveShadow = true;
    this.group.add(ground, road, walk);

    // street lamps
    const lampXs: number[] = [];
    for (let x = -84; x <= 84; x += 14) lampXs.push(x);
    const poleGeo = new THREE.CylinderGeometry(0.08, 0.12, 5, 6);
    poleGeo.translate(0, 2.5, 0);
    const poles = new THREE.InstancedMesh(poleGeo, new THREE.MeshStandardMaterial({ color: '#2b2d35', roughness: 0.6, metalness: 0.6 }), lampXs.length);
    this.bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.28, 8, 6), new THREE.MeshBasicMaterial({ color: '#ffd9a0' }), lampXs.length);
    this.pools = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(9, 9).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ map: poolTexture(), color: '#ffcf8a', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
      lampXs.length,
    );
    lampXs.forEach((x, i) => {
      poles.setMatrixAt(i, m.makeTranslation(x, 0, 6.6));
      this.bulbs.setMatrixAt(i, m.makeTranslation(x, 5.05, 6.6));
      this.pools.setMatrixAt(i, m.makeTranslation(x, 0.04, 7.5));
    });
    poles.castShadow = true;
    this.group.add(poles, this.bulbs, this.pools);

    // traffic: light streaks animated entirely in the vertex shader
    const carCount = 22;
    const carGeo = new THREE.BoxGeometry(1.6, 0.5, 0.8);
    carGeo.translate(0, 0.45, 0);
    const carMat = new THREE.MeshBasicMaterial({ color: '#ffffff' });
    carMat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, this.carUniforms);
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime;')
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          float id = float(gl_InstanceID);
          float dir = mod(id, 2.0) < 1.0 ? 1.0 : -1.0;
          float speed = 9.0 + fract(id * 0.618) * 8.0;
          float x = mod(fract(id * 0.371) * 360.0 + uTime * speed, 360.0) - 180.0;
          transformed.x += x * dir;`,
        );
    };
    this.cars = new THREE.InstancedMesh(carGeo, carMat, carCount);
    for (let i = 0; i < carCount; i++) {
      const dir = i % 2 === 0 ? 1 : -1;
      this.cars.setMatrixAt(i, m.makeTranslation(0, 0, ROAD_Z + (dir > 0 ? 1.8 : -1.8)));
      // drivers see headlights coming toward the camera lane, tail lights going away
      this.cars.setColorAt(i, col.set(dir > 0 ? '#ff3b30' : '#fff2c8').multiplyScalar(2.2));
    }
    this.cars.frustumCulled = false;
    this.group.add(this.cars);
  }

  setLook(l: Look): void {
    this.uniforms.uLit.value = l.litFraction;
    const s = l.streetLights;
    (this.bulbs.material as THREE.MeshBasicMaterial).color.set('#ffd9a0').multiplyScalar(0.4 + s * 3);
    (this.pools.material as THREE.MeshBasicMaterial).opacity = s * 0.55;
    this.pools.visible = s > 0.05;
    this.cars.visible = s > 0.2;
  }

  update(t: number): void {
    this.uniforms.uTime.value = t;
    this.carUniforms.uTime.value = t;
  }
}
