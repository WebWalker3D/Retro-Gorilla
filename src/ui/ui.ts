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
import { WEAPONS, WEAPON_ORDER } from '../sim/constants';
import type { Ammo, MatchState, RoundOutcome } from '../sim/match';
import type { Player, WeaponId } from '../sim/types';
import type { Preset } from '../render/quality';
import type { AimPreview, Settings } from '../settings';

export const ATTRIBUTION = {
  copyright: '© 2026 Blaine Bouvier',
  phrase: 'Originally created by Blaine Bouvier',
  url: 'https://github.com/WebWalker3D/Retro-Gorilla',
};
const creditHtml = () =>
  `<p class="credit"><span>${ATTRIBUTION.copyright}</span><span>${ATTRIBUTION.phrase}</span><a class="live" href="${ATTRIBUTION.url}" target="_blank" rel="noopener">${ATTRIBUTION.url.replace('https://', '')}</a></p>`;

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

const BANANA = 'M5 25c7 6 21 4 26-12 1-3 0-6-1-7-1 9-8 16-21 15-2 0-4 1-4 4z';
const ICONS: Record<WeaponId, string> = {
  banana: `<svg viewBox="0 0 36 36"><path d="${BANANA}" fill="#ffd84a" stroke="#5a3a1a" stroke-width="1.2"/></svg>`,
  bunch: `<svg viewBox="0 0 36 36"><g stroke="#5a3a1a" stroke-width="1.1"><path d="${BANANA}" fill="#f2c53a" transform="rotate(-18 18 18) translate(-2 -3)"/><path d="${BANANA}" fill="#ffe066" transform="translate(1 1)"/><path d="${BANANA}" fill="#ffd84a" transform="rotate(16 18 18) translate(3 4)"/></g></svg>`,
  rubber: `<svg viewBox="0 0 36 36"><path d="${BANANA}" fill="#ff4fd8" stroke="#7a1f6a" stroke-width="1.2"/><path d="M8 31q3 3 6 0q3-3 6 0" fill="none" stroke="#ff9ff0" stroke-width="1.6"/></svg>`,
  plantain: `<svg viewBox="0 0 36 36"><path d="M3 27c9 7 26 4 30-15 1-3 0-7-2-8-1 11-10 19-25 17-2 0-4 2-3 6z" fill="#8fae3e" stroke="#3a2a12" stroke-width="1.2"/></svg>`,
};

type Mode = 'cpu' | 'pvp';

export interface SetupResult {
  mode: Mode;
  names: [string, string];
  skill: 0 | 1 | 2;
  target: number;
  gravity: number;
}

function el<T extends HTMLElement = HTMLElement>(html: string): T {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild as T;
}

function seg<T extends string | number>(host: HTMLElement, options: [T, string][], value: T, onPick: (v: T) => void): void {
  host.innerHTML = '';
  for (const [v, label] of options) {
    const b = el<HTMLButtonElement>(`<button type="button" aria-pressed="${v === value}">${label}</button>`);
    b.onclick = () => {
      host.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', 'false'));
      b.setAttribute('aria-pressed', 'true');
      onPick(v);
    };
    host.appendChild(b);
  }
}

export interface AimState {
  angle: number;
  velocity: number;
  weapon: WeaponId;
}

/** All DOM overlays: title, setup, HUD, aim console, banners, pause, settings, results. */
export class UI {
  readonly root: HTMLElement;
  private hud: HTMLElement;
  private consoleEl: HTMLElement;
  private flight: HTMLElement;
  private banner: HTMLElement;
  private pauseBtn: HTMLElement;
  private angleIn!: HTMLInputElement;
  private velIn!: HTMLInputElement;
  private weaponBtns = new Map<WeaponId, HTMLButtonElement>();
  private bannerTimer = 0;
  click: () => void = () => {};
  /** Fired when the player edits the aim through the console. */
  onAimEdit: (a: Partial<AimState>) => void = () => {};
  onThrow: () => void = () => {};
  onPause: () => void = () => {};

  constructor(root: HTMLElement) {
    this.root = root;
    this.hud = el(`<div id="hud" class="hidden">
      <div class="player p1"><span class="score">0</span><span class="name"></span></div>
      <div id="wind"><div class="gauge"><div class="bar"></div></div><div class="val"></div><div class="round"></div></div>
      <div class="player p2"><span class="score">0</span><span class="name"></span></div>
    </div>`);
    this.consoleEl = el(`<div id="console" class="live hidden">
      <div class="weapons" role="group" aria-label="Weapon"></div>
      <div class="num"><label for="aim-angle">Angle</label><input id="aim-angle" type="number" min="0" max="180" step="1"></div>
      <div class="num"><label for="aim-vel">Speed</label><input id="aim-vel" type="number" min="1" max="200" step="1"></div>
      <button class="btn primary throw" type="button">Throw</button>
      <p class="hint">Drag anywhere to aim: pull back like a slingshot and let go to throw. Arrow keys fine-tune, Enter throws.</p>
    </div>`);
    this.flight = el(`<div id="flight" class="hidden">Hold Space or the mouse button to fast-forward. Press S to skip.</div>`);
    this.banner = el(`<div id="banner" class="hidden"></div>`);
    this.pauseBtn = el(`<button id="pausebtn" class="live hidden" type="button" aria-label="Pause">❚❚</button>`);
    this.pauseBtn.onclick = () => this.onPause();
    root.append(this.hud, this.banner, this.consoleEl, this.flight, this.pauseBtn);
    const weapons = this.consoleEl.querySelector('.weapons')!;
    WEAPON_ORDER.forEach((w, i) => {
      const b = el<HTMLButtonElement>(`<button class="weapon" type="button" aria-pressed="false" title="${WEAPONS[w].name}" aria-label="${WEAPONS[w].name}"><span class="key">${i + 1}</span>${ICONS[w]}<span class="ammo"></span></button>`);
      b.onclick = () => {
        this.click();
        this.onAimEdit({ weapon: w });
      };
      this.weaponBtns.set(w, b);
      weapons.appendChild(b);
    });
    this.angleIn = this.consoleEl.querySelector('#aim-angle')!;
    this.velIn = this.consoleEl.querySelector('#aim-vel')!;
    const clampNum = (v: string, lo: number, hi: number) => Math.max(lo, Math.min(hi, Number(v) || lo));
    this.angleIn.oninput = () => this.onAimEdit({ angle: clampNum(this.angleIn.value, 0, 180) });
    this.velIn.oninput = () => this.onAimEdit({ velocity: clampNum(this.velIn.value, 1, 200) });
    for (const inp of [this.angleIn, this.velIn])
      inp.onkeydown = (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          this.onThrow();
        }
        e.stopPropagation(); // arrow keys edit the field instead of the global aim
      };
    this.consoleEl.querySelector<HTMLButtonElement>('.throw')!.onclick = () => this.onThrow();
  }

  // ——— title ———
  showTitle(onPick: (m: Mode | 'settings') => void, audioLocked: boolean): void {
    this.clearPanels();
    const t = el(`<section id="title" class="panelset">
      <div>
        <h1 class="neon flicker-on">Retro<span class="second">Gorilla</span></h1>
        <p class="pitch">Two gorillas, one skyline, explosive bananas. Pick your angle, feel the wind, and knock your rival off the roof.</p>
      </div>
      <nav class="live">
        <button class="btn primary" data-m="cpu" type="button">Play against the CPU</button>
        <button class="btn" data-m="pvp" type="button">Two players, one keyboard</button>
        <button class="btn" data-m="settings" type="button">Settings</button>
      </nav>
      ${creditHtml()}
      ${audioLocked ? '<p class="unmute">Sound starts after your first click.</p>' : ''}
    </section>`);
    t.querySelectorAll<HTMLButtonElement>('nav button').forEach((b) => (b.onclick = () => (this.click(), onPick(b.dataset.m as Mode))));
    this.root.appendChild(t);
    t.querySelector<HTMLButtonElement>('nav .primary')!.focus({ preventScroll: true });
  }

  // ——— match setup ———
  showSetup(mode: Mode, s: Settings, onStart: (r: SetupResult) => void, onBack: () => void): void {
    this.clearPanels();
    const r: SetupResult = { mode, names: [...s.names], skill: s.skill, target: s.target, gravity: s.gravity };
    const cpu = mode === 'cpu';
    const p = el(`<section class="panel live panelset" role="dialog" aria-labelledby="setup-h">
      <h2 id="setup-h">${cpu ? 'Match against the CPU' : 'Two-player match'}</h2>
      <div class="row"><label for="n1">${cpu ? 'Your name' : 'Player 1'}</label><input id="n1" type="text" maxlength="14"></div>
      ${cpu ? '' : '<div class="row"><label for="n2">Player 2</label><input id="n2" type="text" maxlength="14"></div>'}
      ${cpu ? '<div class="row"><span class="lbl">CPU skill</span><div class="seg" id="skill"></div></div>' : ''}
      <div class="row"><span class="lbl">Points to win</span><div class="stepper"><button type="button" data-d="-1" aria-label="Fewer points">−</button><output id="target"></output><button type="button" data-d="1" aria-label="More points">+</button></div></div>
      <div class="row"><span class="lbl">Gravity</span><div class="seg" id="grav"></div></div>
      <div class="actions"><button class="btn" type="button" data-a="back">Back</button><button class="btn primary" type="button" data-a="go">Start match</button></div>
    </section>`);
    const n1 = p.querySelector<HTMLInputElement>('#n1')!;
    n1.value = r.names[0];
    const n2 = p.querySelector<HTMLInputElement>('#n2');
    if (n2) n2.value = r.names[1] === 'CPU' ? 'Player 2' : r.names[1];
    const skill = p.querySelector<HTMLElement>('#skill');
    if (skill) seg(skill, [[0, 'Chimp'], [1, 'Ape'], [2, 'Silverback']], r.skill, (v) => (r.skill = v));
    const out = p.querySelector('output')!;
    out.textContent = String(r.target);
    p.querySelectorAll<HTMLButtonElement>('.stepper button').forEach(
      (b) => (b.onclick = () => ((r.target = Math.max(1, Math.min(20, r.target + Number(b.dataset.d)))), (out.textContent = String(r.target)))),
    );
    seg(p.querySelector<HTMLElement>('#grav')!, [[9.8, 'Earth'], [3.7, 'Mars'], [1.6, 'Moon'], [24.8, 'Jupiter']], r.gravity, (v) => (r.gravity = v));
    p.querySelector<HTMLButtonElement>('[data-a="back"]')!.onclick = () => (this.click(), onBack());
    p.querySelector<HTMLButtonElement>('[data-a="go"]')!.onclick = () => {
      this.click();
      r.names = [n1.value.trim() || 'Player 1', cpu ? ['Kong-bot', 'Bonobot', 'Gorillatron'][r.skill] : n2!.value.trim() || 'Player 2'];
      onStart(r);
    };
    this.root.appendChild(p);
    n1.focus();
  }

  // ——— settings ———
  showSettings(s: Settings, onChange: (s: Settings) => void, onClose: () => void, info: () => string): void {
    this.clearPanels();
    const p = el(`<section class="panel live panelset" role="dialog" aria-labelledby="set-h">
      <h2 id="set-h">Settings</h2>
      <div class="row"><span class="lbl">Graphics</span><div class="seg" id="q"></div></div>
      <div class="row"><label for="v-master">Volume</label><input id="v-master" type="range" min="0" max="1" step="0.05"></div>
      <div class="row"><label for="v-music">Music</label><input id="v-music" type="range" min="0" max="1" step="0.05"></div>
      <div class="row"><label for="v-sfx">Effects</label><input id="v-sfx" type="range" min="0" max="1" step="0.05"></div>
      <div class="row"><span class="lbl">Hit replays</span><div class="seg" id="kc"></div></div>
      <div class="row"><span class="lbl">Aim preview</span><div class="seg" id="ap"></div></div>
      <p class="note" id="perf"></p>
      ${creditHtml()}
      <div class="actions"><button class="btn primary" type="button">Done</button></div>
    </section>`);
    const cur: Settings = { ...s };
    const push = () => onChange({ ...cur });
    seg<Preset | 'auto'>(p.querySelector('#q')!, [['auto', 'Auto'], ['low', 'Low'], ['medium', 'Medium'], ['high', 'High'], ['ultra', 'Ultra']], cur.preset ?? 'auto', (v) => ((cur.preset = v === 'auto' ? null : v), push()));
    for (const k of ['master', 'music', 'sfx'] as const) {
      const inp = p.querySelector<HTMLInputElement>(`#v-${k}`)!;
      inp.value = String(cur[k]);
      inp.oninput = () => ((cur[k] = Number(inp.value)), push());
    }
    seg(p.querySelector('#kc')!, [[1, 'Slow-motion replays'], [0, 'Off']], cur.killcam ? 1 : 0, (v) => ((cur.killcam = v === 1), push()));
    seg<AimPreview>(p.querySelector('#ap')!, [['full', 'Whole arc'], ['short', 'First third'], ['off', 'Off (classic)']], cur.aimPreview, (v) => ((cur.aimPreview = v), push()));
    const perf = p.querySelector('#perf')!;
    const tick = () => {
      if (!p.isConnected) return;
      perf.textContent = info();
      setTimeout(tick, 500);
    };
    tick();
    p.querySelector<HTMLButtonElement>('.actions .btn')!.onclick = () => (this.click(), onClose());
    this.root.appendChild(p);
  }

  // ——— pause ———
  showPause(onResume: () => void, onSettings: () => void, onQuit: () => void): void {
    this.clearPanels();
    const p = el(`<section class="panel live panelset" role="dialog" aria-labelledby="pause-h">
      <h2 id="pause-h">Paused</h2>
      <div class="actions" style="justify-content:flex-start;flex-wrap:wrap">
        <button class="btn primary" data-a="r" type="button">Resume</button>
        <button class="btn" data-a="s" type="button">Settings</button>
        <button class="btn" data-a="q" type="button">Quit to title</button>
      </div>
    </section>`);
    p.querySelector<HTMLButtonElement>('[data-a="r"]')!.onclick = () => (this.click(), onResume());
    p.querySelector<HTMLButtonElement>('[data-a="s"]')!.onclick = () => (this.click(), onSettings());
    p.querySelector<HTMLButtonElement>('[data-a="q"]')!.onclick = () => (this.click(), onQuit());
    this.root.appendChild(p);
    p.querySelector<HTMLButtonElement>('.primary')!.focus();
  }

  // ——— results ———
  showResults(m: MatchState, onRematch: () => void, onMenu: () => void): void {
    this.clearPanels();
    const w = m.winner ?? 0;
    const n = m.cfg.names.map(esc);
    const acc = (p: 0 | 1) => (m.stats[p].shots ? `${Math.round((m.stats[p].hits / m.stats[p].shots) * 100)}%` : '–');
    const row = (label: string, f: (p: 0 | 1) => string | number) => `<tr><td>${label}</td><td>${f(0)}</td><td>${f(1)}</td></tr>`;
    const p = el(`<section id="results" class="panel live panelset" role="dialog" aria-labelledby="res-h">
      <h2 id="res-h" class="neon flicker-on">${n[w]} wins</h2>
      <p class="note">Final score ${m.scores[0]}–${m.scores[1]} after ${m.round} round${m.round === 1 ? '' : 's'}.</p>
      <table>
        <thead><tr><th></th><th class="p1">${n[0]}</th><th class="p2">${n[1]}</th></tr></thead>
        <tbody>
          ${row('Bananas thrown', (p) => m.stats[p].shots)}
          ${row('Knockouts', (p) => m.stats[p].hits)}
          ${row('Accuracy', acc)}
          ${row('Biggest crater', (p) => `${m.stats[p].biggestCrater} blocks`)}
          ${row('Longest throw', (p) => `${m.stats[p].longestThrow} m`)}
        </tbody>
      </table>
      <div class="actions"><button class="btn" data-a="m" type="button">Main menu</button><button class="btn primary" data-a="r" type="button">Rematch</button></div>
    </section>`);
    p.querySelector<HTMLButtonElement>('[data-a="r"]')!.onclick = () => (this.click(), onRematch());
    p.querySelector<HTMLButtonElement>('[data-a="m"]')!.onclick = () => (this.click(), onMenu());
    this.root.appendChild(p);
    p.querySelector<HTMLButtonElement>('.primary')!.focus();
  }

  clearPanels(): void {
    this.root.querySelectorAll('.panelset').forEach((e) => e.remove());
  }

  // ——— HUD ———
  showHud(on: boolean): void {
    this.hud.classList.toggle('hidden', !on);
    this.pauseBtn.classList.toggle('hidden', !on);
  }

  private tags: [string, string] = ['', ''];

  setPlayers(names: [string, string], cpu: [boolean, boolean]): void {
    this.hud.querySelectorAll<HTMLElement>('.player').forEach((e, i) => {
      const label = i === 0 ? 'Player 1' : 'Player 2';
      this.tags[i] = cpu[i] ? 'CPU' : names[i] === label ? '' : label;
      e.querySelector('.name')!.innerHTML = `<span>${esc(names[i])}<span class="tag">${this.tags[i]}</span></span>`;
    });
  }

  setScores(s: [number, number]): void {
    this.hud.querySelectorAll('.score').forEach((e, i) => (e.textContent = String(s[i])));
  }

  setTurn(p: Player | null): void {
    this.hud.querySelectorAll('.player').forEach((e, i) => {
      e.classList.toggle('turn', i === p);
      e.querySelector('.tag')!.textContent = i === p ? 'Throwing' : this.tags[i];
    });
  }

  setWind(w: number, round: number): void {
    const bar = this.hud.querySelector<HTMLElement>('#wind .bar')!;
    const k = Math.min(1, Math.abs(w) / 12) * 50;
    bar.style.left = w >= 0 ? '50%' : `${50 - k}%`;
    bar.style.width = `${k}%`;
    const v = Math.abs(w);
    this.hud.querySelector('#wind .val')!.textContent = v < 0.3 ? 'No wind' : `Wind ${v.toFixed(1)} ${w > 0 ? '→' : '←'}`;
    this.hud.querySelector('#wind .round')!.textContent = `Round ${round}`;
  }

  // ——— aim console ———
  showConsole(on: boolean, cpu = false): void {
    this.consoleEl.classList.toggle('hidden', !on);
    this.consoleEl.classList.toggle('cpu', cpu);
  }

  showFlightHint(on: boolean): void {
    this.flight.classList.toggle('hidden', !on);
  }

  setAim(a: AimState, ammo: Ammo): void {
    if (document.activeElement !== this.angleIn) this.angleIn.value = String(Math.round(a.angle));
    if (document.activeElement !== this.velIn) this.velIn.value = String(Math.round(a.velocity));
    for (const [w, b] of this.weaponBtns) {
      b.setAttribute('aria-pressed', String(w === a.weapon));
      const n = ammo[w];
      b.querySelector('.ammo')!.textContent = Number.isFinite(n) ? `×${n}` : '∞';
      b.disabled = n <= 0;
    }
  }

  // ——— banners ———
  /** Neon announcement; resolves after `ms`. */
  announce(title: string, sub = '', ms = 2200): Promise<void> {
    clearTimeout(this.bannerTimer);
    this.banner.className = '';
    this.banner.innerHTML = `<h2 class="neon flicker-on">${esc(title)}</h2>${sub ? `<p class="sub">${esc(sub)}</p>` : ''}`;
    return new Promise((r) => {
      this.bannerTimer = window.setTimeout(() => {
        this.banner.className = 'hidden';
        r();
      }, ms);
    });
  }

  turnBanner(name: string, p: Player): void {
    clearTimeout(this.bannerTimer);
    this.banner.className = 'turn';
    this.banner.innerHTML = `<p class="msg p${p + 1}">${esc(name)} to throw</p>`;
    this.bannerTimer = window.setTimeout(() => (this.banner.className = 'hidden'), 1300);
  }

  hideBanner(): void {
    clearTimeout(this.bannerTimer);
    this.banner.className = 'hidden';
  }

  outcomeText(o: RoundOutcome, names: [string, string], thrower: Player): [string, string] {
    const other = (p: Player) => names[1 - p];
    switch (o.kind) {
      case 'roundWon':
        if (o.reason === 'hit') return ['Knockout!', `${names[o.winner]} flattens ${other(o.winner)}.`];
        if (o.reason === 'fell') return ['Timber!', `${other(o.winner)} falls off the roof.`];
        return ['Oops!', `${names[thrower]} knocked themselves out.`];
      case 'draw':
        return ['Double knockout', 'Nobody scores this round.'];
      case 'matchWon':
        return [`${names[o.winner]} wins!`, ''];
      default:
        return ['', ''];
    }
  }
}
