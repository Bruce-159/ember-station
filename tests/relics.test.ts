// 媒介物品（追加規格 v2 第 4 節）

import { describe, expect, it } from 'vitest';
import { ALL_RELIC_IDS, describeRelic, RELICS } from '../src/data/relics.ts';
import { cloneState } from '../src/engine/reducer.ts';
import {
  ampMultiplier,
  backwaterPercent,
  firstTurnExtraDraw,
  luckOnLoss,
  onBattleStart,
  onLeonBackwater,
  overloadCoilDraw,
  poisonBonus,
  restHealPercent,
  spendResonance,
  transferPoisonOnDeath,
  turnStartEnergyBonus,
} from '../src/engine/relics.ts';
import type { GameEvent, GameState, RelicId } from '../src/engine/types.ts';
import { ally, battleState, enemy, ofType, type BattleSpec } from './helpers.ts';

/** 持有指定遺物的戰鬥狀態 */
function withRelics(relics: RelicId[], spec: BattleSpec = {}): GameState {
  return battleState({
    ...spec,
    patch: (s) => {
      s.relics = [...relics];
      spec.patch?.(s);
    },
  });
}

/** 在狀態副本上建立引擎工作區 */
function ctxOf(s: GameState): { state: GameState; events: GameEvent[] } {
  return { state: cloneState(s), events: [] };
}

describe('媒介物品資料', () => {
  it('共 12 個，id 與鍵一致，都有名稱與說明', () => {
    expect(ALL_RELIC_IDS).toHaveLength(12);
    for (const id of ALL_RELIC_IDS) {
      const def = RELICS[id];
      expect(def.id).toBe(id);
      expect(def.name.length).toBeGreaterThan(0);
      expect(describeRelic(id).length).toBeGreaterThan(0);
    }
  });

  it('方向分配：增幅 3、雷翁 2、阿格妮絲 2、艾斯 2、通用 3', () => {
    const count = (t: string) => ALL_RELIC_IDS.filter((id) => RELICS[id].theme === t).length;
    expect(['amp', 'leon', 'agnes', 'ace', 'general'].map(count)).toEqual([3, 2, 2, 2, 3]);
  });

  it('說明文字讀取 values', () => {
    expect(RELICS.sacredOath.describe(RELICS.sacredOath.values)).toContain('60%');
    expect(RELICS.brokenCrest.describe(RELICS.brokenCrest.values)).toContain('10');
  });
});

describe('數值修正', () => {
  it('增幅倍率：一般 ×2；共鳴水晶本場未用過 ×3', () => {
    expect(ampMultiplier(withRelics([]))).toBe(2);
    expect(ampMultiplier(withRelics(['resonanceCrystal']))).toBe(3);
    expect(ampMultiplier(withRelics(['resonanceCrystal'], { patch: (s) => (s.relicFlags.resonanceUsed = true) }))).toBe(2);
  });

  it('背水門檻、下注失敗手氣、休息回復、中毒加成', () => {
    expect(backwaterPercent(withRelics([]))).toBe(50);
    expect(backwaterPercent(withRelics(['sacredOath']))).toBe(60);
    expect(luckOnLoss(withRelics([]))).toBe(1);
    expect(luckOnLoss(withRelics(['cheatersWatch']))).toBe(2);
    expect(restHealPercent(withRelics([]), 25)).toBe(25);
    expect(restHealPercent(withRelics(['travelersFlask']), 25)).toBe(40);
    expect(poisonBonus(withRelics([]))).toBe(0);
    expect(poisonBonus(withRelics(['charredPouch']))).toBe(1);
  });

  it('隕石碎片只在第 3、6、9…回合；褪色的時刻表只在第 1 回合', () => {
    const at = (turn: number, relics: RelicId[]) => withRelics(relics, { patch: (s) => (s.turn = turn) });
    expect([1, 2, 3, 4, 6].map((t) => turnStartEnergyBonus(at(t, ['meteorShard'])))).toEqual([0, 0, 1, 0, 1]);
    expect(turnStartEnergyBonus(at(3, []))).toBe(0);
    expect([1, 2].map((t) => firstTurnExtraDraw(at(t, ['fadedTimetable'])))).toEqual([2, 0]);
    expect(firstTurnExtraDraw(at(1, []))).toBe(0);
  });
});

describe('效果函式', () => {
  it('戰鬥開始：重置旗標；預熱的增幅器帶 1 次增幅；缺角的撲克牌出千', () => {
    const ctx = ctxOf(
      withRelics(['warmAmp', 'chippedCard'], {
        patch: (s) => {
          s.relicFlags.crestUsed = true;
          s.ampCharges = 0;
          s.rigged = false;
        },
      }),
    );
    onBattleStart(ctx);
    expect(ctx.state.relicFlags).toEqual({ resonanceUsed: false, coilUsed: false, crestUsed: false, oathShown: false });
    expect(ctx.state.ampCharges).toBe(1);
    expect(ctx.state.rigged).toBe(true);
    expect(ofType(ctx.events, 'relicTriggered').map((e) => e.relicId)).toEqual(['warmAmp', 'chippedCard']);

    const none = ctxOf(withRelics([], { patch: (s) => (s.ampCharges = 0) }));
    onBattleStart(none);
    expect(none.state.ampCharges).toBe(0);
    expect(none.events).toEqual([]);
  });

  it('spendResonance 記錄本場已用並送出事件', () => {
    const ctx = ctxOf(withRelics(['resonanceCrystal']));
    spendResonance(ctx);
    expect(ctx.state.relicFlags.resonanceUsed).toBe(true);
    expect(ampMultiplier(ctx.state)).toBe(2);
    expect(ofType(ctx.events, 'relicTriggered')[0]?.relicId).toBe('resonanceCrystal');
  });

  it('過載線圈每回合只抽一次', () => {
    const ctx = ctxOf(withRelics(['overloadCoil']));
    expect(overloadCoilDraw(ctx)).toBe(1);
    expect(overloadCoilDraw(ctx)).toBe(0);
    expect(overloadCoilDraw(ctxOf(withRelics([])))).toBe(0);
  });

  it('斷裂的盾徽每場一次給 10 格擋；誓約只在「只因誓約才背水」時提示一次', () => {
    const ctx = ctxOf(withRelics(['brokenCrest', 'sacredOath']));
    const leon = ally(ctx.state, 'leon');
    onLeonBackwater(ctx, leon, true);
    onLeonBackwater(ctx, leon, true);
    expect(leon.block).toBe(10);
    expect(ofType(ctx.events, 'relicTriggered').map((e) => e.relicId)).toEqual(['sacredOath', 'brokenCrest']);

    const deep = ctxOf(withRelics(['sacredOath']));
    onLeonBackwater(deep, ally(deep.state, 'leon'), false);
    expect(deep.events).toEqual([]);
  });

  it('火刑柱的餘燼：轉給存活的敵人；沒有其他存活敵人或沒有遺物時不轉', () => {
    const ctx = ctxOf(withRelics(['pyreEmber'], { enemies: [{ hp: 0, poison: 4 }, { hp: 30 }] }));
    transferPoisonOnDeath(ctx, enemy(ctx.state, 'e0'));
    expect(enemy(ctx.state, 'e1').poison).toBe(4);
    expect(enemy(ctx.state, 'e0').poison).toBe(0);

    const alone = ctxOf(withRelics(['pyreEmber'], { enemies: [{ hp: 0, poison: 4 }, { hp: 0 }] }));
    const rngBefore = alone.state.rngState;
    transferPoisonOnDeath(alone, enemy(alone.state, 'e0'));
    expect(alone.events).toEqual([]);
    expect(alone.state.rngState).toBe(rngBefore);

    const without = ctxOf(withRelics([], { enemies: [{ hp: 0, poison: 4 }, { hp: 30 }] }));
    transferPoisonOnDeath(without, enemy(without.state, 'e0'));
    expect(enemy(without.state, 'e1').poison).toBe(0);
  });
});
