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
import { Engine } from './render/engine';
import { Sky } from './render/sky';
import { CityMesh } from './render/cityMesh';
import { GORILLA_TINTS, lookFor, wx } from './render/palette';
import { Backdrop } from './render/backdrop';
import { RoofProps } from './render/roofProps';
import { GorillaModel } from './render/gorillaModel';
import { Weather } from './render/weather';
import { generateCity } from './sim/city';
import type { TimeOfDay, Weather as WK } from './sim/match';

const q = new URLSearchParams(location.search);
const engine = new Engine(document.getElementById('view') as HTMLCanvasElement, (q.get('q') as 'high') ?? 'high');
const look = lookFor((q.get('tod') as TimeOfDay) ?? 'night', (q.get('wx') as WK) ?? 'clear');
const sky = new Sky();
sky.setLook(look);
sky.placeSun(0, 68, 4);
engine.scene.add(sky.group);
const city = new CityMesh(120 * 80);
const { city: c, gorillas } = generateCity(Number(q.get('seed') ?? 3));
city.build(c);
const back = new Backdrop(2); back.setLook(look); engine.scene.add(back.group);
const props = new RoofProps(); props.build(c, 3, gorillas); engine.scene.add(props.group);
const gs = gorillas.map((g, i) => { const m = new GorillaModel(GORILLA_TINTS[i]); m.setFacing(i === 0 ? 1 : -1); m.group.position.set(wx(g.x), g.y, 0); engine.scene.add(m.group); return m; });
const anim = q.get('anim'); if (anim) gs[0].play(anim as 'idle');
const weather = new Weather(2500); weather.set((q.get('wx') as WK) ?? 'clear', 6); engine.scene.add(weather.group);
weather.onLightning = (v) => sky.flash(v);
city.setLit(look.litFraction);
engine.scene.add(city.mesh);
const hemi = new THREE.HemisphereLight(look.hemiSky, look.hemiGround, look.hemiIntensity);
const key = new THREE.DirectionalLight(look.key, look.keyIntensity);
key.position.set(-50, 90, 80);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
Object.assign(key.shadow.camera, { left: -75, right: 75, top: 95, bottom: -5, near: 1, far: 300 });
engine.scene.add(hemi, key);
engine.scene.fog = new THREE.Fog(look.fog, look.fogNear, look.fogFar);
const cz = Number(q.get('cz') ?? 150); const focus = q.get('focus');
if (focus !== null) { const g = gorillas[Number(focus)]; engine.camera.position.set(wx(g.x) + 3, g.y + 3, 14); engine.camera.lookAt(wx(g.x), g.y + 1.8, 0); } else { engine.camera.position.set(0, 44, cz); engine.camera.lookAt(0, 34, 0); }
engine.onFrame((dt, t) => {
  sky.update(dt, t, engine.camera);
  city.update(t);
  back.update(t);
  props.update(t, 6);
  gs.forEach((g) => g.update(dt));
  weather.update(dt, t);
});
engine.start();
let frames = 0;
engine.onFrame(() => {
  if (++frames === 30) (window as any).__ready = true;
});
(window as any).__info = () => engine.info();
