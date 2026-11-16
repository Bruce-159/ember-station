// 敵人意圖選擇與執行（第 3.5 節）

import { aliveAllies, allAlliesDead, damageAlly, addEnemyBlock, getAlly, isAlive, tickPoison } from './combat.ts';
import { weightedPick } from './rng.ts';
import type { AllyId, Ctx, Enemy, GameState, Intent } from './types.ts';

/** 選攻擊目標時的權重：雷翁 2，其他人 1 */
export const TARGET_WEIGHTS: Readonly<Record<AllyId, number>> = { leon: 2, agnes: 1, ace: 1 };

/** 從存活同伴中加權隨機選一位；沒有存活者回傳 null */
export function pickAllyTarget(state: GameState): AllyId | null {
  const picked = weightedPick(state, aliveAllies(state), (a) => TARGET_WEIGHTS[a.id]);
  return picked ? picked.id : null;
}

/** 依行動模式循環決定下一個意圖 */
export function chooseIntent(ctx: Ctx, enemy: Enemy): void {
  const pattern = enemy.pattern[enemy.patternIndex % enemy.pattern.length];
  if (!pattern) throw new Error(`敵人 ${enemy.id} 沒有行動模式`);
  enemy.patternIndex += 1;
  let intent: Intent;
  if (pattern.kind === 'attack') {
    // 沒有存活同伴時，戰鬥其實已經結束；暫指雷翁，執行時會重新選
    const targetId = pickAllyTarget(ctx.state) ?? 'leon';
    intent = { kind: 'attack', damage: pattern.damage, hits: pattern.hits, targetId };
  } else if (pattern.kind === 'aoe') {
    intent = { kind: 'aoe', damage: pattern.damage };
  } else {
    intent = { kind: 'defend', block: pattern.block, strength: pattern.strength };
  }
  enemy.intent = intent;
  ctx.events.push({ type: 'intentChosen', enemyId: enemy.id, intent: { ...intent } });
}

/** 意圖的實際每下傷害（含攻擊力）；非攻擊意圖回傳 null */
export function intentDamage(enemy: Enemy): number | null {
  const it = enemy.intent;
  if (!it || it.kind === 'defend') return null;
  return Math.max(0, it.damage + enemy.strength);
}

function executeIntent(ctx: Ctx, enemy: Enemy): void {
  const { state } = ctx;
  const it = enemy.intent;
  if (!it) return;
  if (it.kind === 'attack') {
    const dmg = it.damage + enemy.strength;
    let targetId: AllyId | null = it.targetId;
    for (let i = 0; i < it.hits; i++) {
      if (!isAlive(enemy) || allAlliesDead(state)) break;
      // 目標已倒下：重新選一位存活同伴，之後的連擊也打這位
      if (targetId === null || !isAlive(getAlly(state, targetId))) targetId = pickAllyTarget(state);
      if (targetId === null) break;
      damageAlly(ctx, getAlly(state, targetId), dmg, enemy);
    }
  } else if (it.kind === 'aoe') {
    const dmg = it.damage + enemy.strength;
    for (const ally of aliveAllies(state)) {
      if (!isAlive(enemy)) break;
      damageAlly(ctx, ally, dmg, enemy);
    }
  } else {
    addEnemyBlock(ctx, enemy, it.block);
    if (it.strength !== 0) {
      enemy.strength += it.strength;
      ctx.events.push({ type: 'strength', enemyId: enemy.id, amount: it.strength, total: enemy.strength });
    }
  }
}

/**
 * 單一敵人的行動：先結算中毒 → 若死亡則跳過 → 格擋歸零 → 執行意圖 → 決定下一個意圖
 */
export function runEnemyAction(ctx: Ctx, enemy: Enemy): void {
  if (!isAlive(enemy)) return;
  ctx.events.push({ type: 'enemyTurn', enemyId: enemy.id });
  if (tickPoison(ctx, enemy)) return;
  enemy.block = 0;
  executeIntent(ctx, enemy);
  if (isAlive(enemy)) chooseIntent(ctx, enemy);
}
