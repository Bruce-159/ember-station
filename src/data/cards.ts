// 卡牌定義（第 3.8 節）。所有數值集中在 values；
// play 與 describe 都從 values 讀取，確保「改數值只需要改資料」，且顯示文字永遠與效果一致。
// 增幅倍率 m 作用在 values 的數值上；不受增幅影響的例外在各卡註明。

import { resolveBet, nextBetChance } from '../engine/bet.ts';
import { BASE_LUCK_ON_LOSS, luckOnLoss } from '../engine/relics.ts';
import {
  addAllyBlock,
  aliveEnemies,
  applyPoison,
  checkBackwaterRelics,
  damageEnemy,
  drawCards,
  gainEnergy,
  getAlly,
  healAlly,
  isAlive,
  isBackwater,
} from '../engine/combat.ts';
import type { CardDef, CardId, CardValues, DescribeContext, Enemy, GameState, PlayContext, Ally } from '../engine/types.ts';

function defineCard<V extends CardValues>(def: CardDef<V>): CardDef<V> {
  return def;
}

function requireEnemy(ctx: PlayContext): Enemy {
  if (!ctx.enemy) throw new Error('這張牌需要敵人目標');
  return ctx.enemy;
}

function requireAlly(ctx: PlayContext): Ally {
  if (!ctx.ally) throw new Error('這張牌需要同伴目標');
  return ctx.ally;
}

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

function betLabel(state: GameState | null): string {
  if (!state) return '下注';
  const c = nextBetChance(state);
  return c >= 1 ? '下注（必定成功）' : `下注（成功率 ${pct(c)}）`;
}

/** 最後的衝鋒的基礎傷害：10 + 3 × floor(失去生命比例 × 10)（用整數計算避免浮點誤差） */
export function lastChargeBase(state: GameState, values: { base: number; perTenPercent: number }): number {
  const leon = getAlly(state, 'leon');
  const tenths = Math.floor(((leon.maxHp - leon.hp) * 10) / leon.maxHp);
  return values.base + values.perTenPercent * tenths;
}

function lucian() {
  return {
    pulse: defineCard({
      id: 'pulse',
      name: '脈衝',
      owner: 'lucian',
      cost: 1,
      type: 'attack',
      target: 'enemy',
      reward: false,
      values: { damage: 6 },
      play: (ctx, v) => {
        damageEnemy(ctx, requireEnemy(ctx), v.damage * ctx.m, 'lucian');
      },
      describe: ({ m }, v) => `造成 ${v.damage * m} 點傷害`,
    }),
    field: defineCard({
      id: 'field',
      name: '力場',
      owner: 'lucian',
      cost: 1,
      type: 'skill',
      target: 'ally',
      reward: false,
      values: { block: 5 },
      play: (ctx, v) => addAllyBlock(ctx, requireAlly(ctx), v.block * ctx.m),
      describe: ({ m }, v) => `為一名同伴提供 ${v.block * m} 點格擋`,
    }),
    amp: defineCard({
      id: 'amp',
      name: '增幅',
      owner: 'lucian',
      cost: 1,
      type: 'skill',
      target: 'none',
      isAmp: true,
      reward: false,
      values: { charges: 1 },
      // 增幅類：不吃增幅
      play: (ctx, v) => {
        ctx.state.ampCharges = Math.max(ctx.state.ampCharges, v.charges);
        ctx.events.push({ type: 'ampSet', charges: ctx.state.ampCharges });
      },
      describe: (_ctx, v) => (v.charges === 1 ? '下一張打出的牌效果加倍' : `接下來 ${v.charges} 張牌效果加倍`),
    }),
    analyze: defineCard({
      id: 'analyze',
      name: '解析',
      owner: 'lucian',
      cost: 0,
      type: 'skill',
      target: 'enemy',
      reward: false,
      values: { draw: 1 },
      play: (ctx, v) => {
        const e = requireEnemy(ctx);
        e.analyzed = true;
        ctx.events.push({ type: 'analyzed', targetId: e.id });
        drawCards(ctx, v.draw * ctx.m);
      },
      describe: ({ m }, v) => `該敵人本回合受到的傷害提高 50%；抽 ${v.draw * m} 張牌`,
    }),
    chainAmp: defineCard({
      id: 'chainAmp',
      name: '連鎖增幅',
      owner: 'lucian',
      cost: 1,
      type: 'skill',
      target: 'none',
      isAmp: true,
      reward: true,
      values: { charges: 2 },
      play: (ctx, v) => {
        ctx.state.ampCharges = v.charges;
        ctx.events.push({ type: 'ampSet', charges: ctx.state.ampCharges });
      },
      describe: (_ctx, v) => `接下來 ${v.charges} 張牌效果加倍`,
    }),
    overload: defineCard({
      id: 'overload',
      name: '過載',
      owner: 'lucian',
      cost: 2,
      type: 'attack',
      target: 'enemy',
      exhaust: true,
      reward: true,
      values: { damage: 20 },
      play: (ctx, v) => {
        damageEnemy(ctx, requireEnemy(ctx), v.damage * ctx.m, 'lucian');
      },
      describe: ({ m }, v) => `造成 ${v.damage * m} 點傷害。打出後從本場移除`,
    }),
    calibrate: defineCard({
      id: 'calibrate',
      name: '校準',
      owner: 'lucian',
      cost: 0,
      type: 'skill',
      target: 'none',
      reward: true,
      values: {},
      // 例外：不受增幅影響
      play: (ctx) => {
        const { state } = ctx;
        const n = state.hand.length;
        if (n > 0) ctx.events.push({ type: 'discardHand', uids: state.hand.map((c) => c.uid) });
        state.discard.push(...state.hand);
        state.hand = [];
        drawCards(ctx, n);
      },
      describe: () => '棄掉其餘手牌，抽同樣數量的牌',
    }),
  };
}

function leon() {
  return {
    phalanx: defineCard({
      id: 'phalanx',
      name: '方陣',
      owner: 'leon',
      cost: 1,
      type: 'skill',
      target: 'none',
      reward: false,
      values: { block: 8, backwaterBlock: 12 },
      play: (ctx, v) => {
        const amount = (isBackwater(ctx.state) ? v.backwaterBlock : v.block) * ctx.m;
        addAllyBlock(ctx, getAlly(ctx.state, 'leon'), amount);
      },
      describe: ({ state, m }, v) => {
        if (state && isBackwater(state)) return `雷翁獲得 ${v.backwaterBlock * m} 點格擋（背水）`;
        return `雷翁獲得 ${v.block * m} 點格擋；背水時改為 ${v.backwaterBlock * m}`;
      },
    }),
    thrust: defineCard({
      id: 'thrust',
      name: '突刺',
      owner: 'leon',
      cost: 1,
      type: 'attack',
      target: 'enemy',
      reward: false,
      values: { damage: 8 },
      play: (ctx, v) => {
        const e = requireEnemy(ctx);
        damageEnemy(ctx, e, v.damage * ctx.m, 'leon');
        if (isBackwater(ctx.state)) damageEnemy(ctx, e, v.damage * ctx.m, 'leon');
      },
      describe: ({ state, m }, v) =>
        state && isBackwater(state)
          ? `造成 ${v.damage * m} 點傷害兩次（背水）`
          : `造成 ${v.damage * m} 點傷害；背水時再造成一次`,
    }),
    bloodOath: defineCard({
      id: 'bloodOath',
      name: '血誓',
      owner: 'leon',
      cost: 0,
      type: 'skill',
      target: 'none',
      reward: false,
      values: { hpCost: 3, energy: 1 },
      // 例外：失去的生命不受增幅影響
      play: (ctx, v) => {
        const leonAlly = getAlly(ctx.state, 'leon');
        const before = leonAlly.hp;
        leonAlly.hp = Math.max(1, leonAlly.hp - v.hpCost);
        ctx.events.push({ type: 'hpLoss', targetId: 'leon', amount: before - leonAlly.hp });
        gainEnergy(ctx, v.energy * ctx.m);
        checkBackwaterRelics(ctx);
      },
      describe: ({ m }, v) => `雷翁失去 ${v.hpCost} 點生命（最低保留 1），獲得 ${v.energy * m} 點能量`,
    }),
    shieldBash: defineCard({
      id: 'shieldBash',
      name: '盾擊',
      owner: 'leon',
      cost: 1,
      type: 'attack',
      target: 'enemy',
      reward: true,
      values: { blockRatio: 1 },
      play: (ctx, v) => {
        const block = getAlly(ctx.state, 'leon').block;
        damageEnemy(ctx, requireEnemy(ctx), block * v.blockRatio * ctx.m, 'leon');
      },
      describe: ({ state, m }, v) => {
        const base = '造成等同雷翁目前格擋的傷害';
        if (!state) return m > 1 ? `${base}（×${m}）` : base;
        return `${base}（目前 ${getAlly(state, 'leon').block * v.blockRatio * m}）`;
      },
    }),
    holdFirm: defineCard({
      id: 'holdFirm',
      name: '堅守反擊',
      owner: 'leon',
      cost: 1,
      type: 'skill',
      target: 'none',
      reward: true,
      values: { thorns: 5 },
      play: (ctx, v) => {
        const l = getAlly(ctx.state, 'leon');
        l.thorns += v.thorns * ctx.m;
        ctx.events.push({ type: 'thorns', amount: v.thorns * ctx.m, total: l.thorns });
      },
      describe: ({ m }, v) => `本回合雷翁每次受到攻擊，對攻擊者造成 ${v.thorns * m} 點傷害`,
    }),
    noRetreat: defineCard({
      id: 'noRetreat',
      name: '不退',
      owner: 'leon',
      cost: 1,
      type: 'power',
      target: 'none',
      reward: true,
      values: { bonus: 4 },
      play: (ctx) => {
        ctx.state.powers.noRetreat = true;
        ctx.events.push({ type: 'powerGained', power: 'noRetreat' });
      },
      describe: (_ctx, v) => `能力：本場戰鬥中，背水時雷翁的攻擊傷害 +${v.bonus}`,
    }),
    lastCharge: defineCard({
      id: 'lastCharge',
      name: '最後的衝鋒',
      owner: 'leon',
      cost: 2,
      type: 'attack',
      target: 'enemy',
      reward: true,
      values: { base: 10, perTenPercent: 3 },
      play: (ctx, v) => {
        damageEnemy(ctx, requireEnemy(ctx), lastChargeBase(ctx.state, v) * ctx.m, 'leon');
      },
      describe: ({ state, m }, v) => {
        const now = state ? `（目前 ${lastChargeBase(state, v) * m}）` : '';
        return `造成 ${v.base * m} 點傷害，雷翁每失去 10% 生命 +${v.perTenPercent * m}${now}`;
      },
    }),
  };
}

function agnes() {
  return {
    herb: defineCard({
      id: 'herb',
      name: '毒草',
      owner: 'agnes',
      cost: 1,
      type: 'skill',
      target: 'enemy',
      reward: false,
      values: { poison: 4 },
      play: (ctx, v) => applyPoison(ctx, requireEnemy(ctx), v.poison * ctx.m),
      describe: ({ m }, v) => `施加 ${v.poison * m} 層中毒`,
    }),
    poultice: defineCard({
      id: 'poultice',
      name: '草藥敷料',
      owner: 'agnes',
      cost: 1,
      type: 'skill',
      target: 'ally',
      reward: false,
      values: { heal: 6 },
      play: (ctx, v) => {
        healAlly(ctx, requireAlly(ctx), v.heal * ctx.m);
      },
      describe: ({ m }, v) => `為一名同伴回復 ${v.heal * m} 點生命`,
    }),
    spark: defineCard({
      id: 'spark',
      name: '火種',
      owner: 'agnes',
      cost: 1,
      type: 'attack',
      target: 'enemy',
      reward: false,
      values: { damage: 5 },
      play: (ctx, v) => {
        const e = requireEnemy(ctx);
        damageEnemy(ctx, e, (v.damage + e.poison) * ctx.m, 'agnes');
      },
      describe: ({ m, enemy }, v) => {
        const now = enemy ? `（目前 ${(v.damage + enemy.poison) * m}）` : '';
        return `造成 ${v.damage} 點傷害，再加上目標的中毒層數${m > 1 ? `，總和 ×${m}` : ''}${now}`;
      },
    }),
    miasma: defineCard({
      id: 'miasma',
      name: '瘴氣',
      owner: 'agnes',
      cost: 1,
      type: 'skill',
      target: 'none',
      reward: true,
      values: { poison: 3 },
      play: (ctx, v) => {
        for (const e of aliveEnemies(ctx.state)) applyPoison(ctx, e, v.poison * ctx.m);
      },
      describe: ({ m }, v) => `對所有敵人施加 ${v.poison * m} 層中毒`,
    }),
    corrode: defineCard({
      id: 'corrode',
      name: '腐蝕',
      owner: 'agnes',
      cost: 1,
      type: 'skill',
      target: 'enemy',
      reward: true,
      values: { factor: 2 },
      play: (ctx, v) => {
        const e = requireEnemy(ctx);
        const add = e.poison * (v.factor * ctx.m - 1);
        if (add > 0) applyPoison(ctx, e, add);
      },
      describe: ({ m }, v) => `目標的中毒層數變為 ${v.factor * m} 倍`,
    }),
    consume: defineCard({
      id: 'consume',
      name: '焚盡',
      owner: 'agnes',
      cost: 2,
      type: 'attack',
      target: 'enemy',
      reward: true,
      values: { perStack: 2 },
      play: (ctx, v) => {
        const e = requireEnemy(ctx);
        const stacks = e.poison;
        e.poison = 0;
        damageEnemy(ctx, e, stacks * v.perStack * ctx.m, 'agnes');
      },
      describe: ({ m, enemy }, v) => {
        const now = enemy ? `（目前 ${enemy.poison * v.perStack * m}）` : '';
        return `消耗目標所有中毒，每層造成 ${v.perStack * m} 點傷害${now}`;
      },
    }),
    soothe: defineCard({
      id: 'soothe',
      name: '緩和',
      owner: 'agnes',
      cost: 1,
      type: 'skill',
      target: 'ally',
      reward: true,
      values: { heal: 15, capPercent: 50 },
      // 例外：上限（生命一半）不受增幅影響
      play: (ctx, v) => {
        const a = requireAlly(ctx);
        const cap = Math.floor((a.maxHp * v.capPercent) / 100);
        if (a.hp >= cap) return;
        healAlly(ctx, a, Math.min(v.heal * ctx.m, cap - a.hp));
      },
      describe: ({ m }, v) => `為一名同伴回復 ${v.heal * m} 點生命，最多回復到生命上限的 ${v.capPercent}%`,
    }),
    wildfire: defineCard({
      id: 'wildfire',
      name: '野火',
      owner: 'agnes',
      cost: 2,
      type: 'attack',
      target: 'none',
      reward: true,
      values: { damage: 6, poisonedBonus: 4 },
      play: (ctx, v) => {
        for (const e of aliveEnemies(ctx.state)) {
          const base = v.damage + (e.poison > 0 ? v.poisonedBonus : 0);
          damageEnemy(ctx, e, base * ctx.m, 'agnes');
        }
      },
      describe: ({ m }, v) => `對所有敵人造成 ${v.damage * m} 點傷害，中毒的敵人額外受到 ${v.poisonedBonus * m} 點`,
    }),
    lingeringPoison: defineCard({
      id: 'lingeringPoison',
      name: '餘毒',
      owner: 'agnes',
      cost: 2,
      type: 'power',
      target: 'none',
      reward: true,
      values: {},
      play: (ctx) => {
        ctx.state.powers.lingeringPoison = true;
        ctx.events.push({ type: 'powerGained', power: 'lingeringPoison' });
      },
      describe: () => '能力：本場戰鬥中，敵人的中毒層數不再減少',
    }),
  };
}

function ace() {
  return {
    allIn: defineCard({
      id: 'allIn',
      name: '孤注一擲',
      owner: 'ace',
      cost: 1,
      type: 'attack',
      target: 'enemy',
      reward: false,
      values: { damage: 16 },
      play: (ctx, v) => {
        if (resolveBet(ctx)) damageEnemy(ctx, requireEnemy(ctx), v.damage * ctx.m, 'ace');
      },
      describe: ({ state, m }, v) =>
        `${betLabel(state)}：成功造成 ${v.damage * m} 點傷害；失敗則手氣 +${state ? luckOnLoss(state) : BASE_LUCK_ON_LOSS}`,
    }),
    sleeve: defineCard({
      id: 'sleeve',
      name: '袖裡藏牌',
      owner: 'ace',
      cost: 0,
      type: 'skill',
      target: 'none',
      oncePerTurn: true,
      reward: false,
      values: {},
      play: (ctx) => {
        ctx.state.rigged = true;
        ctx.state.sleeveUsed = true;
        ctx.events.push({ type: 'rigged' });
      },
      describe: () => '出千：下一次下注必定成功。每回合限用一次',
    }),
    bulletRain: defineCard({
      id: 'bulletRain',
      name: '槍林彈雨',
      owner: 'ace',
      cost: 1,
      type: 'attack',
      target: 'none',
      reward: false,
      values: { damage: 4 },
      play: (ctx, v) => {
        for (const e of aliveEnemies(ctx.state)) damageEnemy(ctx, e, v.damage * ctx.m, 'ace');
      },
      describe: ({ m }, v) => `對所有敵人造成 ${v.damage * m} 點傷害`,
    }),
    goAllIn: defineCard({
      id: 'goAllIn',
      name: '全押',
      owner: 'ace',
      cost: 2,
      type: 'attack',
      target: 'enemy',
      reward: true,
      values: { damage: 12, hits: 3 },
      // 例外：次數不受增幅影響
      play: (ctx, v) => {
        if (!resolveBet(ctx)) return;
        const e = requireEnemy(ctx);
        for (let i = 0; i < v.hits; i++) damageEnemy(ctx, e, v.damage * ctx.m, 'ace');
      },
      describe: ({ state, m }, v) => `${betLabel(state)}：成功時連開 ${v.hits} 槍，每槍 ${v.damage * m} 點傷害`,
    }),
    loadedDice: defineCard({
      id: 'loadedDice',
      name: '灌鉛骰子',
      owner: 'ace',
      cost: 1,
      type: 'power',
      target: 'none',
      reward: true,
      values: {},
      play: (ctx) => {
        ctx.state.powers.loadedDice = true;
        ctx.events.push({ type: 'powerGained', power: 'loadedDice' });
      },
      describe: () => '能力：本場戰鬥中，每回合第一次下注必定成功',
    }),
    losersRevenge: defineCard({
      id: 'losersRevenge',
      name: '輸家的反擊',
      owner: 'ace',
      cost: 1,
      type: 'attack',
      target: 'enemy',
      reward: true,
      values: { perLuck: 5 },
      play: (ctx, v) => {
        const luck = ctx.state.luck;
        ctx.state.luck = 0;
        ctx.events.push({ type: 'luckSpent', amount: luck });
        damageEnemy(ctx, requireEnemy(ctx), luck * v.perLuck * ctx.m, 'ace');
      },
      describe: ({ state, m }, v) => {
        const now = state ? `（目前手氣 ${state.luck}，共 ${state.luck * v.perLuck * m} 點）` : '';
        return `手氣歸零，每層手氣造成 ${v.perLuck * m} 點傷害${now}`;
      },
    }),
    notForYou: defineCard({
      id: 'notForYou',
      name: '才不是為了你',
      owner: 'ace',
      cost: 1,
      type: 'skill',
      target: 'ally',
      reward: true,
      values: { block: 8 },
      play: (ctx, v) => addAllyBlock(ctx, requireAlly(ctx), v.block * ctx.m),
      describe: ({ m }, v) => `為一名同伴提供 ${v.block * m} 點格擋`,
    }),
    coverFire: defineCard({
      id: 'coverFire',
      name: '掩護射擊',
      owner: 'ace',
      cost: 1,
      type: 'attack',
      target: 'enemy',
      reward: true,
      values: { damage: 6, reduce: 4 },
      play: (ctx, v) => {
        const e = requireEnemy(ctx);
        damageEnemy(ctx, e, v.damage * ctx.m, 'ace');
        const it = e.intent;
        if (isAlive(e) && it && (it.kind === 'attack' || it.kind === 'aoe')) {
          const before = it.damage;
          it.damage = Math.max(0, it.damage - v.reduce * ctx.m);
          ctx.events.push({ type: 'intentReduced', enemyId: e.id, amount: before - it.damage, damage: it.damage });
        }
      },
      describe: ({ m }, v) => `造成 ${v.damage * m} 點傷害；若目標正要攻擊，其攻擊傷害降低 ${v.reduce * m}`,
    }),
  };
}

export const CARDS: Readonly<Record<CardId, CardDef>> = {
  ...lucian(),
  ...leon(),
  ...agnes(),
  ...ace(),
};

export const ALL_CARD_IDS = Object.keys(CARDS) as CardId[];

/** 獎勵卡池 */
export const REWARD_POOL: readonly CardId[] = ALL_CARD_IDS.filter((id) => CARDS[id].reward);

export function getCard(id: CardId): CardDef {
  return CARDS[id];
}

/** 卡牌說明文字（m 預設 1） */
export function describeCard(id: CardId, ctx: Partial<DescribeContext> = {}): string {
  const def = CARDS[id];
  return def.describe({ state: ctx.state ?? null, m: ctx.m ?? 1, enemy: ctx.enemy ?? null }, def.values);
}
