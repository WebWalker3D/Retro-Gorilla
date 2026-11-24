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
/// <reference lib="webworker" />
import { chooseShot, type AiMemory } from '../sim/ai';
import type { MatchState } from '../sim/match';
import { Rng } from '../sim/rng';
import type { Player } from '../sim/types';

export interface AiRequest {
  id: number;
  match: Pick<MatchState, 'cfg' | 'ammo' | 'world'>;
  player: Player;
  seed: number;
  memory: AiMemory;
}

// The CPU's search runs ~1–3k full shot simulations; keep it off the render thread.
self.onmessage = (ev: MessageEvent<AiRequest>) => {
  const { id, match, player, seed, memory } = ev.data;
  const shot = chooseShot(match as MatchState, player, new Rng(seed), memory);
  (self as unknown as Worker).postMessage({ id, shot, memory });
};
