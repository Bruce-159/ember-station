// 路線：開局時用種子亂數一次排好整輪的 10 場（追加規格 v2 第 3.2 節）

import { ENCOUNTERS, STAGES, type EncounterDef } from '../data/encounters.ts';
import { shuffle } from './rng.ts';
import type { EncounterId, GameState } from './types.ts';

/** 每一段：洗牌 → 取前 N 組 → 依難度排序（同難度維持洗牌後的順序） */
export function buildRoute(state: GameState): EncounterId[] {
  return STAGES.flatMap((stage) =>
    shuffle(state, stage.pool)
      .slice(0, stage.count)
      .map((id, order) => ({ id, order }))
      .sort((a, b) => ENCOUNTERS[a.id].difficulty - ENCOUNTERS[b.id].difficulty || a.order - b.order)
      .map((x) => x.id),
  );
}

/** 路線上第 index 場的遭遇（預設為目前這場）；超出範圍時為 undefined */
export function encounterAt(state: GameState, index: number = state.battleIndex): EncounterDef | undefined {
  const id = state.route[index];
  return id === undefined ? undefined : ENCOUNTERS[id];
}
