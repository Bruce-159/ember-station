// 媒介物品（遺物，追加規格 v2 第 4.2 節）。
// 和卡牌一樣，數值集中在 values，describe 從 values 讀取；效果實作在 engine/relics.ts。

import type { RelicId } from '../engine/types.ts';

export type RelicTheme = 'amp' | 'leon' | 'agnes' | 'ace' | 'general';
export type RelicValues = Readonly<Record<string, number>>;

export interface RelicDef<V extends RelicValues = RelicValues> {
  readonly id: RelicId;
  readonly name: string;
  readonly theme: RelicTheme;
  readonly values: V;
  describe(values: V): string;
}

function defineRelic<V extends RelicValues>(def: RelicDef<V>): RelicDef<V> {
  return def;
}

const defs = {
  resonanceCrystal: defineRelic({
    id: 'resonanceCrystal',
    name: '共鳴水晶',
    theme: 'amp',
    values: { multiplier: 3 as const },
    describe: (v) => `每場戰鬥第一次被增幅的牌，效果改為 ×${v.multiplier}（之後恢復 ×2）`,
  }),
  overloadCoil: defineRelic({
    id: 'overloadCoil',
    name: '過載線圈',
    theme: 'amp',
    values: { draw: 1 },
    describe: (v) => `每回合第一次打出增幅類的牌後，抽 ${v.draw} 張牌`,
  }),
  warmAmp: defineRelic({
    id: 'warmAmp',
    name: '預熱的增幅器',
    theme: 'amp',
    values: { charges: 1 },
    describe: (v) => `每場戰鬥開始時帶有 ${v.charges} 次增幅`,
  }),
  sacredOath: defineRelic({
    id: 'sacredOath',
    name: '聖隊的誓約',
    theme: 'leon',
    values: { percent: 60 },
    describe: (v) => `雷翁生命在 ${v.percent}% 以下就進入背水（原本是 50%）`,
  }),
  brokenCrest: defineRelic({
    id: 'brokenCrest',
    name: '斷裂的盾徽',
    theme: 'leon',
    values: { block: 10 },
    describe: (v) => `每場戰鬥雷翁第一次進入背水時，獲得 ${v.block} 點格擋`,
  }),
  charredPouch: defineRelic({
    id: 'charredPouch',
    name: '焦黑的藥草袋',
    theme: 'agnes',
    values: { bonus: 1 },
    describe: (v) => `卡牌每次施加中毒時，多施加 ${v.bonus} 層`,
  }),
  pyreEmber: defineRelic({
    id: 'pyreEmber',
    name: '火刑柱的餘燼',
    theme: 'agnes',
    values: {},
    describe: () => '有中毒的敵人死亡時，把它的中毒層數轉給隨機一個存活的敵人',
  }),
  cheatersWatch: defineRelic({
    id: 'cheatersWatch',
    name: '老千的懷錶',
    theme: 'ace',
    values: { luck: 2 },
    describe: (v) => `下注失敗時，手氣 +${v.luck}（原本是 +1）`,
  }),
  chippedCard: defineRelic({
    id: 'chippedCard',
    name: '缺角的撲克牌',
    theme: 'ace',
    values: {},
    describe: () => '每場戰鬥開始時處於出千狀態：第一次下注必定成功',
  }),
  fadedTimetable: defineRelic({
    id: 'fadedTimetable',
    name: '褪色的時刻表',
    theme: 'general',
    values: { draw: 2 },
    describe: (v) => `每場戰鬥第一回合多抽 ${v.draw} 張牌`,
  }),
  travelersFlask: defineRelic({
    id: 'travelersFlask',
    name: '旅人的水壺',
    theme: 'general',
    values: { percent: 40 },
    describe: (v) => `休息時回復 ${v.percent}% 生命（原本是 25%；復活仍為 30%）`,
  }),
  meteorShard: defineRelic({
    id: 'meteorShard',
    name: '隕石碎片',
    theme: 'general',
    values: { every: 3, energy: 1 },
    describe: (v) => `每 ${v.every} 回合（第 ${v.every}、${v.every * 2}…回合）開始時多獲得 ${v.energy} 點能量`,
  }),
};

/** 保留每個遺物 values 的具體型別，同時保證 12 個 RelicId 都有定義 */
export const RELICS: typeof defs & Readonly<Record<RelicId, RelicDef>> = defs;

export const ALL_RELIC_IDS = Object.keys(RELICS) as RelicId[];

/** 遺物說明文字（以 id 動態查詢時用這個，避免對聯合型別直接呼叫 describe） */
export function describeRelic(id: RelicId): string {
  const def: RelicDef = RELICS[id];
  return def.describe(def.values);
}
