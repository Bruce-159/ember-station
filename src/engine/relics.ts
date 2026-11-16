// 媒介物品的效果（追加規格 v2 第 4 節）。
// 這個模組只 import 型別、遺物資料與亂數，不 import combat／bet／run，
// 所以那些模組都能呼叫這裡而不形成循環 import。需要改狀態時直接在草稿上改，並送出事件。

import { RELICS } from '../data/relics.ts';
import { nextInt } from './rng.ts';
import type { Ally, Ctx, Enemy, GameState, Multiplier, RelicFlags, RelicId } from './types.ts';

export const BASE_BACKWATER_PERCENT = 50;
export const BASE_LUCK_ON_LOSS = 1;

export function emptyRelicFlags(): RelicFlags {
  return { resonanceUsed: false, coilUsed: false, crestUsed: false, oathShown: false };
}

export function hasRelic(state: GameState, id: RelicId): boolean {
  return state.relics.includes(id);
}

export function relicTriggered(ctx: Ctx, relicId: RelicId): void {
  ctx.events.push({ type: 'relicTriggered', relicId });
}

// ───────────── 數值修正（只讀，不送事件） ─────────────

/** 被增幅時的倍率 */
export function ampMultiplier(state: GameState): Multiplier {
  return hasRelic(state, 'resonanceCrystal') && !state.relicFlags.resonanceUsed ? RELICS.resonanceCrystal.values.multiplier : 2;
}

/** 背水門檻（生命百分比） */
export function backwaterPercent(state: GameState): number {
  return hasRelic(state, 'sacredOath') ? RELICS.sacredOath.values.percent : BASE_BACKWATER_PERCENT;
}

/** 下注失敗時增加的手氣 */
export function luckOnLoss(state: GameState): number {
  return hasRelic(state, 'cheatersWatch') ? RELICS.cheatersWatch.values.luck : BASE_LUCK_ON_LOSS;
}

/** 休息時存活同伴的回復百分比 */
export function restHealPercent(state: GameState, base: number): number {
  return hasRelic(state, 'travelersFlask') ? RELICS.travelersFlask.values.percent : base;
}

/** 回合開始（turn 已遞增）時額外獲得的能量 */
export function turnStartEnergyBonus(state: GameState): number {
  if (!hasRelic(state, 'meteorShard')) return 0;
  const v = RELICS.meteorShard.values;
  return state.turn % v.every === 0 ? v.energy : 0;
}

/** 回合開始（turn 已遞增）時額外抽的張數 */
export function firstTurnExtraDraw(state: GameState): number {
  return hasRelic(state, 'fadedTimetable') && state.turn === 1 ? RELICS.fadedTimetable.values.draw : 0;
}

/** 卡牌施加中毒時額外的層數 */
export function poisonBonus(state: GameState): number {
  return hasRelic(state, 'charredPouch') ? RELICS.charredPouch.values.bonus : 0;
}

// ───────────── 會改變狀態的效果 ─────────────

/** 戰鬥開始：在 startBattle 重置完狀態之後、第一個玩家回合之前呼叫 */
export function onBattleStart(ctx: Ctx): void {
  const { state } = ctx;
  state.relicFlags = emptyRelicFlags();
  if (hasRelic(state, 'warmAmp')) {
    relicTriggered(ctx, 'warmAmp');
    state.ampCharges = Math.max(state.ampCharges, RELICS.warmAmp.values.charges);
    ctx.events.push({ type: 'ampSet', charges: state.ampCharges });
  }
  if (hasRelic(state, 'chippedCard')) {
    relicTriggered(ctx, 'chippedCard');
    state.rigged = true;
    ctx.events.push({ type: 'rigged' });
  }
}

/** 共鳴水晶的 ×3 已用掉（倍率為 3 的那張牌打出時呼叫） */
export function spendResonance(ctx: Ctx): void {
  ctx.state.relicFlags.resonanceUsed = true;
  relicTriggered(ctx, 'resonanceCrystal');
}

/** 打出增幅類的牌之後：回傳過載線圈要抽的張數（每回合一次，沒有遺物為 0） */
export function overloadCoilDraw(ctx: Ctx): number {
  const { state } = ctx;
  if (!hasRelic(state, 'overloadCoil') || state.relicFlags.coilUsed) return 0;
  state.relicFlags.coilUsed = true;
  relicTriggered(ctx, 'overloadCoil');
  return RELICS.overloadCoil.values.draw;
}

/**
 * 雷翁處於背水時呼叫（失去生命之後、回合開始清空格擋之後）。
 * onlyByOath：生命高於原本的 50%，只是因為聖隊的誓約才算背水。
 */
export function onLeonBackwater(ctx: Ctx, leon: Ally, onlyByOath: boolean): void {
  const flags = ctx.state.relicFlags;
  if (onlyByOath && hasRelic(ctx.state, 'sacredOath') && !flags.oathShown) {
    flags.oathShown = true;
    relicTriggered(ctx, 'sacredOath');
  }
  if (hasRelic(ctx.state, 'brokenCrest') && !flags.crestUsed && leon.hp > 0) {
    flags.crestUsed = true;
    relicTriggered(ctx, 'brokenCrest');
    const amount = RELICS.brokenCrest.values.block;
    leon.block += amount;
    ctx.events.push({ type: 'block', targetId: leon.id, amount });
  }
}

/** 敵人死亡時：火刑柱的餘燼把中毒轉給隨機一個存活的敵人（不吃藥草袋加成） */
export function transferPoisonOnDeath(ctx: Ctx, dead: Enemy): void {
  const { state } = ctx;
  if (!hasRelic(state, 'pyreEmber') || dead.poison <= 0) return;
  const others = state.enemies.filter((e) => e.hp > 0 && e.id !== dead.id);
  if (others.length === 0) return;
  const target = others[nextInt(state, others.length)];
  if (!target) return;
  relicTriggered(ctx, 'pyreEmber');
  const amount = dead.poison;
  dead.poison = 0;
  target.poison += amount;
  ctx.events.push({ type: 'poison', targetId: target.id, amount, total: target.poison });
}
