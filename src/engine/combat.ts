// 戰鬥規則：傷害、格擋、回復、中毒、抽牌、洗牌。
// 所有函式都只修改 reducer 傳進來的草稿狀態，並把發生的事寫進 events。

import { shuffle } from './rng.ts';
import type { Ally, AllyId, CharacterId, Ctx, Enemy, GameState } from './types.ts';

export const HAND_LIMIT = 10;
export const ANALYZED_MULTIPLIER = 1.5;
export const NO_RETREAT_BONUS = 4;

// ───────────── 查詢 ─────────────

export function getAlly(state: GameState, id: AllyId): Ally {
  const a = state.allies.find((x) => x.id === id);
  if (!a) throw new Error(`找不到同伴 ${id}`);
  return a;
}

export function isAlive(unit: { hp: number }): boolean {
  return unit.hp > 0;
}

/** 角色是否能行動：盧西安永遠可以，其他人要活著 */
export function isCharacterAvailable(state: GameState, id: CharacterId): boolean {
  if (id === 'lucian') return true;
  return isAlive(getAlly(state, id));
}

export function aliveAllies(state: GameState): Ally[] {
  return state.allies.filter(isAlive);
}

export function aliveEnemies(state: GameState): Enemy[] {
  return state.enemies.filter(isAlive);
}

/** 背水：雷翁未倒下且生命 <= 上限的一半 */
export function isBackwater(state: GameState): boolean {
  const leon = getAlly(state, 'leon');
  return leon.hp > 0 && leon.hp <= leon.maxHp / 2;
}

export function allEnemiesDead(state: GameState): boolean {
  return state.enemies.every((e) => !isAlive(e));
}

export function allAlliesDead(state: GameState): boolean {
  return state.allies.every((a) => !isAlive(a));
}

// ───────────── 對敵人 ─────────────

/**
 * 對敵人造成傷害（第 3.3 節）。base 應該已經乘上增幅倍率。
 * 回傳實際扣除的生命。
 */
export function damageEnemy(ctx: Ctx, enemy: Enemy, base: number, source: CharacterId): number {
  if (!isAlive(enemy)) return 0;
  const { state } = ctx;
  let d = Math.max(0, Math.floor(base));
  if (source === 'leon' && state.powers.noRetreat && isBackwater(state)) d += NO_RETREAT_BONUS;
  if (enemy.analyzed) d = Math.floor(d * ANALYZED_MULTIPLIER);
  return applyDamageToEnemy(ctx, enemy, d, source, source);
}

/** 不經過任何加成、直接套用格擋後扣血（反擊、中毒以外的通用尾段） */
function applyDamageToEnemy(
  ctx: Ctx,
  enemy: Enemy,
  d: number,
  source: CharacterId | 'thorns',
  sourceId: string | null,
): number {
  const blocked = Math.min(enemy.block, d);
  enemy.block -= blocked;
  const amount = Math.min(enemy.hp, d - blocked);
  enemy.hp -= amount;
  ctx.events.push({ type: 'damage', targetId: enemy.id, amount, blocked, source, sourceId });
  if (enemy.hp === 0) ctx.events.push({ type: 'enemyDefeated', enemyId: enemy.id });
  return amount;
}

export function addEnemyBlock(ctx: Ctx, enemy: Enemy, amount: number): void {
  enemy.block += amount;
  ctx.events.push({ type: 'block', targetId: enemy.id, amount });
}

export function applyPoison(ctx: Ctx, enemy: Enemy, amount: number): void {
  if (!isAlive(enemy)) return;
  enemy.poison += amount;
  ctx.events.push({ type: 'poison', targetId: enemy.id, amount, total: enemy.poison });
}

/**
 * 中毒結算：受到等同層數的傷害（無視格擋），之後層數 −1（餘毒時不減）。
 * 回傳敵人是否因此死亡。
 */
export function tickPoison(ctx: Ctx, enemy: Enemy): boolean {
  if (enemy.poison <= 0 || !isAlive(enemy)) return false;
  const amount = Math.min(enemy.hp, enemy.poison);
  enemy.hp -= amount;
  ctx.events.push({ type: 'damage', targetId: enemy.id, amount, blocked: 0, source: 'poison', sourceId: null });
  if (!ctx.state.powers.lingeringPoison) enemy.poison -= 1;
  if (enemy.hp === 0) {
    ctx.events.push({ type: 'enemyDefeated', enemyId: enemy.id });
    return true;
  }
  return false;
}

// ───────────── 對同伴 ─────────────

/**
 * 敵人攻擊同伴：格擋先吸收，剩餘扣生命。
 * 若受擊的是雷翁且反擊值 > 0，攻擊者立刻受到等同反擊值的傷害（不受解析影響）。
 */
export function damageAlly(ctx: Ctx, ally: Ally, d: number, attacker: Enemy): number {
  if (!isAlive(ally)) return 0;
  const blocked = Math.min(ally.block, d);
  ally.block -= blocked;
  const amount = Math.min(ally.hp, d - blocked);
  ally.hp -= amount;
  ctx.events.push({ type: 'damage', targetId: ally.id, amount, blocked, source: 'enemy', sourceId: attacker.id });

  if (ally.id === 'leon' && ally.thorns > 0 && isAlive(attacker)) {
    // 反擊：直接扣血，不受解析與格擋影響
    const th = Math.min(attacker.hp, ally.thorns);
    attacker.hp -= th;
    ctx.events.push({ type: 'damage', targetId: attacker.id, amount: th, blocked: 0, source: 'thorns', sourceId: 'leon' });
    if (attacker.hp === 0) ctx.events.push({ type: 'enemyDefeated', enemyId: attacker.id });
  }

  if (ally.hp === 0) ctx.events.push({ type: 'allyDown', allyId: ally.id });
  return amount;
}

export function addAllyBlock(ctx: Ctx, ally: Ally, amount: number): void {
  if (!isAlive(ally)) return;
  ally.block += amount;
  ctx.events.push({ type: 'block', targetId: ally.id, amount });
}

/** 回復生命，不超過上限；倒下的同伴不能被回復。回傳實際回復量 */
export function healAlly(ctx: Ctx, ally: Ally, amount: number): number {
  if (!isAlive(ally)) return 0;
  const healed = Math.max(0, Math.min(ally.maxHp - ally.hp, amount));
  ally.hp += healed;
  ctx.events.push({ type: 'heal', targetId: ally.id, amount: healed });
  return healed;
}

// ───────────── 牌堆 ─────────────

/**
 * 抽 n 張牌：抽牌堆空了就把棄牌堆洗勻成新的抽牌堆；兩者都空就停止。
 * 手牌上限 10 張。回傳實際抽到的張數。
 */
export function drawCards(ctx: Ctx, n: number): number {
  const { state } = ctx;
  const drawn: number[] = [];
  for (let i = 0; i < n; i++) {
    if (state.hand.length >= HAND_LIMIT) break;
    if (state.drawPile.length === 0) {
      if (state.discard.length === 0) break;
      state.drawPile = shuffle(state, state.discard);
      state.discard = [];
      ctx.events.push({ type: 'shuffle', count: state.drawPile.length });
    }
    // 抽牌堆頂 = 陣列第 0 個
    const card = state.drawPile.shift();
    if (!card) break;
    state.hand.push(card);
    drawn.push(card.uid);
  }
  if (drawn.length > 0) ctx.events.push({ type: 'draw', uids: drawn });
  return drawn.length;
}

export function gainEnergy(ctx: Ctx, amount: number): void {
  ctx.state.energy += amount;
  ctx.events.push({ type: 'energy', amount, total: ctx.state.energy });
}

// ───────────── 回合 ─────────────

export const ENERGY_PER_TURN = 3;
export const DRAW_PER_TURN = 5;

/** 玩家回合開始（第 3.2 節） */
export function startPlayerTurn(ctx: Ctx): void {
  const { state } = ctx;
  state.turn += 1;
  state.energy = ENERGY_PER_TURN;
  for (const a of state.allies) {
    a.block = 0;
    a.thorns = 0;
  }
  for (const e of state.enemies) e.analyzed = false;
  state.sleeveUsed = false;
  state.firstBetDone = false;
  ctx.events.push({ type: 'turnStarted', turn: state.turn });
  drawCards(ctx, DRAW_PER_TURN);
}
