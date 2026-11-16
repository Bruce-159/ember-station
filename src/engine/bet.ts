// 下注判定（艾斯，第 3.4 節）

import { nextFloat } from './rng.ts';
import type { BetReason, Ctx, GameState } from './types.ts';

export const BET_BASE_CHANCE = 0.5;
export const BET_LUCK_STEP = 0.1;
export const BET_MAX_CHANCE = 0.9;

/** 一般擲骰的成功率 = min(0.9, 0.5 + 0.1 × luck) */
export function betChance(luck: number): number {
  // 先以整數百分比計算，避免 0.1 累加的浮點誤差
  const pct = Math.min(BET_MAX_CHANCE * 100, BET_BASE_CHANCE * 100 + BET_LUCK_STEP * 100 * luck);
  return pct / 100;
}

/** 下一次下注是否必定成功；是的話回傳原因 */
export function guaranteedBet(state: GameState): BetReason | null {
  if (state.rigged) return 'rigged';
  if (state.powers.loadedDice && !state.firstBetDone) return 'loadedDice';
  return null;
}

/** 下一次下注的成功率（顯示用），必定成功時為 1 */
export function nextBetChance(state: GameState): number {
  return guaranteedBet(state) ? 1 : betChance(state.luck);
}

/** 進行一次下注，回傳是否成功 */
export function resolveBet(ctx: Ctx): boolean {
  const { state } = ctx;
  const guaranteed = guaranteedBet(state);
  let success: boolean;
  let chance: number;
  if (guaranteed === 'rigged') {
    state.rigged = false;
    success = true;
    chance = 1;
  } else if (guaranteed === 'loadedDice') {
    success = true;
    chance = 1;
  } else {
    chance = betChance(state.luck);
    success = nextFloat(state) < chance;
  }
  state.firstBetDone = true;
  if (success) state.luck = 0;
  else state.luck += 1;
  ctx.events.push({ type: 'bet', success, reason: guaranteed ?? 'roll', chance, luck: state.luck });
  return success;
}
