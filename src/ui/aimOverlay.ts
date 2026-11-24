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
import { arrowShape, guideLength, powerColor } from './aimGeometry';

export interface AimView {
  /** Screen position of the throwing hand. */
  hand: { x: number; y: number };
  /** Unit screen direction of the throw. */
  dir: { x: number; y: number };
  power01: number;
  angle: number;
  velocity: number;
  /** Player colour for the preview dots. */
  color: string;
  /** Screen x,y pairs of the aim-assist arc, or null. */
  preview: number[] | null;
  /** Screen x,y pairs of this player's previous throw, or null. */
  ghost: number[] | null;
  ghostLabel: string;
  /** Slingshot drag in screen pixels, or null when not dragging. */
  drag: { x0: number; y0: number; x1: number; y1: number } | null;
}

const NS = 'http://www.w3.org/2000/svg';
const MAX_DOTS = 64;

function make<K extends keyof SVGElementTagNameMap>(tag: K, cls: string, parent: Element): SVGElementTagNameMap[K] {
  const e = document.createElementNS(NS, tag);
  e.setAttribute('class', cls);
  parent.appendChild(e);
  return e;
}

/**
 * Screen-space aim guide drawn over the 3D view: always the same size and contrast whatever the
 * camera distance or sky. Arrow at the hand, slingshot band at the pointer, preview dots, last throw.
 */
export class AimOverlay {
  readonly svg: SVGSVGElement;
  private ghost: SVGPolylineElement;
  private ghostEnd: SVGGElement;
  private ghostText: SVGTextElement;
  private dots: SVGCircleElement[] = [];
  private handArrow: SVGPolygonElement;
  private handLabel: SVGTextElement;
  private band: SVGLineElement;
  private anchor: SVGCircleElement;
  private knob: SVGCircleElement;
  private dragArrow: SVGPolygonElement;
  private dragLabel: SVGTextElement;

  constructor(root: HTMLElement) {
    this.svg = document.createElementNS(NS, 'svg');
    this.svg.id = 'aimfx';
    this.svg.setAttribute('aria-hidden', 'true');
    root.prepend(this.svg);
    this.ghost = make('polyline', 'ghost off', this.svg);
    this.ghostEnd = make('g', 'ghost-end off', this.svg);
    const x = make('path', '', this.ghostEnd);
    x.setAttribute('d', 'M-7,-7 L7,7 M-7,7 L7,-7');
    this.ghostText = make('text', '', this.ghostEnd);
    this.ghostText.setAttribute('y', '26');
    const dotsG = make('g', 'dots', this.svg);
    for (let i = 0; i < MAX_DOTS; i++) this.dots.push(make('circle', 'dot off', dotsG));
    this.handArrow = make('polygon', 'arrow hand-arrow', this.svg);
    this.handLabel = make('text', 'hand-label', this.svg);
    this.band = make('line', 'band off', this.svg);
    this.anchor = make('circle', 'anchor off', this.svg);
    this.anchor.setAttribute('r', '9');
    this.knob = make('circle', 'knob off', this.svg);
    this.knob.setAttribute('r', '14');
    this.dragArrow = make('polygon', 'arrow drag-arrow off', this.svg);
    this.dragLabel = make('text', 'drag-label off', this.svg);
    this.hide();
  }

  hide(): void {
    this.svg.style.display = 'none';
  }

  show(v: AimView): void {
    this.svg.style.display = '';
    const col = powerColor(v.power01);
    const len = guideLength(v.power01);
    const label = `${Math.round(v.angle)}°  speed ${Math.round(v.velocity)}`;

    // arrow + numbers at the thrower's hand
    const a = arrowShape(v.hand.x, v.hand.y, v.dir.x, v.dir.y, len, 9);
    this.handArrow.setAttribute('points', a.points);
    this.handArrow.style.fill = col;
    this.placeLabel(this.handLabel, a.tipX, a.tipY, v.dir, label);

    // preview dots
    const pts = v.preview;
    const n = pts ? Math.min(MAX_DOTS, Math.floor(pts.length / 2)) : 0;
    for (let i = 0; i < MAX_DOTS; i++) {
      const d = this.dots[i];
      if (i < n && pts) {
        d.setAttribute('cx', pts[i * 2].toFixed(1));
        d.setAttribute('cy', pts[i * 2 + 1].toFixed(1));
        d.setAttribute('r', (5.5 - (3 * i) / Math.max(1, n)).toFixed(1));
        d.style.fill = v.color;
        d.classList.remove('off');
      } else d.classList.add('off');
    }

    // previous throw
    const g = v.ghost;
    const hasGhost = !!g && g.length >= 4;
    this.ghost.classList.toggle('off', !hasGhost);
    this.ghostEnd.classList.toggle('off', !hasGhost);
    if (hasGhost && g) {
      let s = '';
      for (let i = 0; i < g.length; i += 2) s += `${g[i].toFixed(1)},${g[i + 1].toFixed(1)} `;
      this.ghost.setAttribute('points', s);
      this.ghostEnd.setAttribute('transform', `translate(${g[g.length - 2].toFixed(1)} ${g[g.length - 1].toFixed(1)})`);
      this.ghostText.textContent = v.ghostLabel;
    }

    // slingshot band under the pointer
    const d = v.drag;
    for (const e of [this.band, this.anchor, this.knob, this.dragArrow, this.dragLabel]) e.classList.toggle('off', !d);
    if (d) {
      this.band.setAttribute('x1', String(d.x0));
      this.band.setAttribute('y1', String(d.y0));
      this.band.setAttribute('x2', String(d.x1));
      this.band.setAttribute('y2', String(d.y1));
      this.anchor.setAttribute('cx', String(d.x0));
      this.anchor.setAttribute('cy', String(d.y0));
      this.knob.setAttribute('cx', String(d.x1));
      this.knob.setAttribute('cy', String(d.y1));
      this.knob.style.stroke = col;
      const b = arrowShape(d.x0, d.y0, v.dir.x, v.dir.y, len, 11);
      this.dragArrow.setAttribute('points', b.points);
      this.dragArrow.style.fill = col;
      this.placeLabel(this.dragLabel, b.tipX, b.tipY, v.dir, label);
    }
  }

  private placeLabel(t: SVGTextElement, x: number, y: number, dir: { x: number; y: number }, text: string): void {
    t.textContent = text;
    t.setAttribute('x', (x + dir.x * 16).toFixed(1));
    t.setAttribute('y', (y + dir.y * 16 + 6).toFixed(1));
    t.setAttribute('text-anchor', dir.x < -0.3 ? 'end' : dir.x > 0.3 ? 'start' : 'middle');
  }
}
