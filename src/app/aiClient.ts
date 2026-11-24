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
import type { AiMemory } from '../sim/ai';
import type { MatchState } from '../sim/match';
import type { Player, Shot } from '../sim/types';
import type { AiRequest } from './aiWorker';

/** Promise wrapper around the AI worker. */
export class AiClient {
  private worker = new Worker(new URL('./aiWorker.ts', import.meta.url), { type: 'module' });
  private next = 1;
  private pending = new Map<number, (r: { shot: Shot; memory: AiMemory }) => void>();

  constructor() {
    this.worker.onmessage = (ev: MessageEvent<{ id: number; shot: Shot; memory: AiMemory }>) => {
      const cb = this.pending.get(ev.data.id);
      this.pending.delete(ev.data.id);
      cb?.(ev.data);
    };
  }

  choose(m: MatchState, p: Player, memory: AiMemory): Promise<{ shot: Shot; memory: AiMemory }> {
    const id = this.next++;
    const req: AiRequest = { id, match: { cfg: m.cfg, ammo: m.ammo, world: m.world }, player: p, seed: Math.floor(Math.random() * 1e9), memory };
    return new Promise((resolve) => {
      this.pending.set(id, resolve);
      this.worker.postMessage(req);
    });
  }

  /** Drop answers to requests made before a reset (e.g. leaving a match). */
  cancelAll(): void {
    this.pending.clear();
  }
}
