// 媒介物品（追加規格 v2 第 4 節）

import { describe, expect, it } from 'vitest';
import { CARDS, describeCard } from '../src/data/cards.ts';
import { ALL_RELIC_IDS, describeRelic, RELICS } from '../src/data/relics.ts';
import { nextBetChance } from '../src/engine/bet.ts';
import { isBackwater } from '../src/engine/combat.ts';
import { cloneState, previewMultiplier } from '../src/engine/reducer.ts';
import { rest, startBattle } from '../src/engine/run.ts';
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
  settlePoisonTransfers,
  spendResonance,
  turnStartEnergyBonus,
} from '../src/engine/relics.ts';
import type { GameEvent, GameState, RelicId } from '../src/engine/types.ts';
import { ally, battleState, endTurn, enemy, newRun, ofType, play, rngStateWhere, type BattleSpec } from './helpers.ts';

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

  it('火刑柱的餘燼：結算時把已死亡敵人的中毒轉給存活的敵人；沒有其他存活敵人或沒有遺物時不轉', () => {
    const ctx = ctxOf(withRelics(['pyreEmber'], { enemies: [{ hp: 0, poison: 4 }, { hp: 30 }] }));
    settlePoisonTransfers(ctx);
    expect(enemy(ctx.state, 'e1').poison).toBe(4);
    expect(enemy(ctx.state, 'e0').poison).toBe(0);
    settlePoisonTransfers(ctx);
    expect(enemy(ctx.state, 'e1').poison).toBe(4);

    const alone = ctxOf(withRelics(['pyreEmber'], { enemies: [{ hp: 0, poison: 4 }, { hp: 0 }] }));
    const rngBefore = alone.state.rngState;
    settlePoisonTransfers(alone);
    expect(alone.events).toEqual([]);
    expect(alone.state.rngState).toBe(rngBefore);

    const without = ctxOf(withRelics([], { enemies: [{ hp: 0, poison: 4 }, { hp: 30 }] }));
    settlePoisonTransfers(without);
    expect(enemy(without.state, 'e1').poison).toBe(0);
  });
});

/** 從第 1 場開頭重新開戰（觸發戰鬥開始的遺物） */
function startedWith(relics: RelicId[], patch?: (s: GameState) => void): { state: GameState; events: GameEvent[] } {
  const state = cloneState(newRun(1));
  state.relics = [...relics];
  patch?.(state);
  const ctx = { state, events: [] as GameEvent[] };
  startBattle(ctx, 0);
  return ctx;
}

const relicEvents = (events: GameEvent[]) => ofType(events, 'relicTriggered').map((e) => e.relicId);

describe('接進戰鬥：增幅', () => {
  it('共鳴水晶：每場第一次增幅 ×3，之後恢復 ×2；預覽與實際一致', () => {
    let s = withRelics(['resonanceCrystal'], { hand: ['amp', 'pulse', 'amp', 'pulse'], energy: 10, enemies: [{ hp: 100 }] });
    s = play(s, 'amp').state;
    expect(previewMultiplier(s, CARDS.pulse)).toBe(3);
    const r1 = play(s, 'pulse');
    expect(ofType(r1.events, 'cardPlayed')[0]?.multiplier).toBe(3);
    expect(ofType(r1.events, 'damage')[0]?.amount).toBe(18);
    expect(relicEvents(r1.events)).toEqual(['resonanceCrystal']);
    s = play(r1.state, 'amp').state;
    expect(previewMultiplier(s, CARDS.pulse)).toBe(2);
    expect(ofType(play(s, 'pulse').events, 'damage')[0]?.amount).toBe(12);
  });

  it('共鳴水晶＋連鎖增幅：第一張 ×3、第二張 ×2', () => {
    let s = withRelics(['resonanceCrystal'], { hand: ['chainAmp', 'pulse', 'pulse'], energy: 10, enemies: [{ hp: 100 }] });
    s = play(s, 'chainAmp').state;
    const r1 = play(s, 'pulse');
    const r2 = play(r1.state, 'pulse');
    expect([ofType(r1.events, 'damage')[0]?.amount, ofType(r2.events, 'damage')[0]?.amount]).toEqual([18, 12]);
  });

  it('沒有共鳴水晶時一律 ×2；新的一場戰鬥會重置 ×3', () => {
    const s = play(withRelics([], { hand: ['amp', 'pulse'], enemies: [{ hp: 100 }] }), 'amp').state;
    expect(ofType(play(s, 'pulse').events, 'damage')[0]?.amount).toBe(12);
    const again = startedWith(['resonanceCrystal'], (st) => (st.relicFlags.resonanceUsed = true));
    expect(again.state.relicFlags.resonanceUsed).toBe(false);
  });

  it('過載線圈：每回合第一次打出增幅類的牌後抽 1 張；回合結束重置', () => {
    const s = withRelics(['overloadCoil'], { hand: ['amp', 'chainAmp'], drawPile: ['pulse', 'field', 'herb'], energy: 5, enemies: [{ hp: 100 }] });
    const r1 = play(s, 'amp');
    expect(r1.state.hand.map((c) => c.cardId)).toEqual(['chainAmp', 'pulse']);
    const r2 = play(r1.state, 'chainAmp');
    expect(r2.state.hand.map((c) => c.cardId)).toEqual(['pulse']);
    expect(endTurn(r2.state).state.relicFlags.coilUsed).toBe(false);
    const without = withRelics([], { hand: ['amp', 'chainAmp'], drawPile: ['pulse'], enemies: [{ hp: 100 }] });
    expect(play(without, 'amp').state.hand.map((c) => c.cardId)).toEqual(['chainAmp']);
  });

  it('預熱的增幅器：每場開始帶 1 次增幅', () => {
    const ctx = startedWith(['warmAmp']);
    expect(ctx.state.ampCharges).toBe(1);
    expect(relicEvents(ctx.events)).toEqual(['warmAmp']);
    expect(startedWith([]).state.ampCharges).toBe(0);
  });
});

describe('接進戰鬥：雷翁', () => {
  it('聖隊的誓約：背水門檻 60%', () => {
    const at = (hp: number, relics: RelicId[]) => isBackwater(withRelics(relics, { allyHp: { leon: hp } }));
    expect([at(30, ['sacredOath']), at(31, ['sacredOath']), at(30, []), at(25, [])]).toEqual([true, false, false, true]);
  });

  it('聖隊的誓約：只因誓約才背水時，每場提示一次', () => {
    const s = withRelics(['sacredOath'], { allyHp: { leon: 30 }, enemies: [{ hp: 100 }] });
    const r1 = endTurn(s);
    expect(relicEvents(r1.events)).toEqual(['sacredOath']);
    expect(relicEvents(endTurn(r1.state).events)).toEqual([]);
  });

  it('斷裂的盾徽：被打進背水的當下獲得 10 格擋，擋住同一次攻擊的後續傷害', () => {
    const spec: BattleSpec = { allyHp: { leon: 26 }, enemies: [{ hp: 100, intent: { kind: 'attack', damage: 2, hits: 3, targetId: 'leon' } }] };
    const r = endTurn(withRelics(['brokenCrest'], spec));
    const hits = ofType(r.events, 'damage').filter((e) => e.targetId === 'leon');
    expect(hits.map((h) => [h.amount, h.blocked])).toEqual([[2, 0], [0, 2], [0, 2]]);
    expect(ally(r.state, 'leon').hp).toBe(24);
    expect(relicEvents(r.events)).toEqual(['brokenCrest']);
    expect(relicEvents(endTurn(r.state).events)).toEqual([]);

    const without = endTurn(withRelics([], spec));
    const plain = ofType(without.events, 'damage').filter((e) => e.targetId === 'leon');
    expect(plain.map((h) => [h.amount, h.blocked])).toEqual([[2, 0], [2, 0], [2, 0]]);
  });

  it('斷裂的盾徽：開戰時已背水 → 第 1 回合開始獲得格擋；血誓進入背水也會觸發', () => {
    const started = startedWith(['brokenCrest'], (st) => (ally(st, 'leon').hp = 20));
    expect(ally(started.state, 'leon').block).toBe(10);
    const oath = play(withRelics(['brokenCrest'], { hand: ['bloodOath'], allyHp: { leon: 27 } }), 'bloodOath');
    expect(ally(oath.state, 'leon')).toMatchObject({ hp: 24, block: 10 });
  });
});

describe('接進戰鬥：阿格妮絲', () => {
  it('焦黑的藥草袋：卡牌施加中毒 +1（瘴氣每個敵人各 +1、腐蝕也 +1、增幅後再 +1）', () => {
    const one = (spec: BattleSpec) => withRelics(['charredPouch'], spec);
    expect(enemy(play(one({ hand: ['herb'], enemies: [{ hp: 50 }] }), 'herb').state).poison).toBe(5);
    const miasma = play(one({ hand: ['miasma'], enemies: [{ hp: 50 }, { hp: 50 }] }), 'miasma').state;
    expect(miasma.enemies.map((e) => e.poison)).toEqual([4, 4]);
    expect(enemy(play(one({ hand: ['corrode'], enemies: [{ hp: 50, poison: 3 }] }), 'corrode').state).poison).toBe(7);
    const amped = play(play(one({ hand: ['amp', 'herb'], enemies: [{ hp: 50 }] }), 'amp').state, 'herb').state;
    expect(enemy(amped).poison).toBe(9);
    expect(enemy(play(withRelics([], { hand: ['herb'], enemies: [{ hp: 50 }] }), 'herb').state).poison).toBe(4);
  });

  it('火刑柱的餘燼：擊殺帶毒敵人 → 中毒轉給存活的敵人', () => {
    const r = play(withRelics(['pyreEmber'], { hand: ['pulse'], enemies: [{ hp: 5, poison: 3 }, { hp: 50 }] }), 'pulse', 'e0');
    expect([enemy(r.state, 'e0').poison, enemy(r.state, 'e1').poison]).toEqual([0, 3]);
    const plain = play(withRelics([], { hand: ['pulse'], enemies: [{ hp: 5, poison: 3 }, { hp: 50 }] }), 'pulse', 'e0');
    expect(enemy(plain.state, 'e1').poison).toBe(0);
  });

  it('火刑柱的餘燼：被中毒打死也會轉移', () => {
    const r = endTurn(withRelics(['pyreEmber'], { enemies: [{ hp: 2, poison: 3 }, { hp: 50 }] }));
    expect(ofType(r.events, 'poison')).toEqual([{ type: 'poison', targetId: 'e1', amount: 2, total: 2 }]);
  });

  it('火刑柱的餘燼：野火同時打死多個 → 整張牌結算完才轉，只轉給存活者', () => {
    const r = play(
      withRelics(['pyreEmber'], { hand: ['wildfire'], enemies: [{ hp: 5, poison: 1 }, { hp: 5, poison: 1 }, { hp: 50 }] }),
      'wildfire',
    );
    // e2 被打時還沒中毒（6 點，不是 10 點），結算後才收到兩份中毒
    expect(r.state.enemies.map((e) => [e.hp, e.poison])).toEqual([[0, 0], [0, 0], [44, 2]]);
  });

  it('火刑柱的餘燼：轉移不會讓同一張範圍攻擊多打（野火的中毒加成不受影響）', () => {
    const spec: BattleSpec = { hand: ['wildfire'], enemies: [{ hp: 5, poison: 3 }, { hp: 9 }, { hp: 50 }] };
    for (let seed = 1; seed <= 20; seed++) {
      const r = play(withRelics(['pyreEmber'], { ...spec, seed }), 'wildfire');
      expect(r.state.enemies.map((e) => e.hp)).toEqual([0, 3, 44]);
      expect(enemy(r.state, 'e1').poison + enemy(r.state, 'e2').poison).toBe(3);
    }
  });

  it('火刑柱的餘燼：全部同時死亡 → 不轉移、不提示、直接勝利', () => {
    const r = play(withRelics(['pyreEmber'], { hand: ['wildfire'], enemies: [{ hp: 5, poison: 1 }, { hp: 5, poison: 1 }] }), 'wildfire');
    expect(r.state.phase).toBe('reward');
    expect(relicEvents(r.events)).toEqual([]);
    expect(ofType(r.events, 'poison')).toEqual([]);
  });
});

describe('接進戰鬥：艾斯與通用', () => {
  it('老千的懷錶：下注失敗手氣 +2', () => {
    const lose = rngStateWhere((v) => v >= 0.5);
    const spec = (relics: RelicId[]) => withRelics(relics, { hand: ['allIn'], enemies: [{ hp: 50 }], patch: (st) => (st.rngState = lose) });
    const r = play(spec(['cheatersWatch']), 'allIn');
    expect(r.state.luck).toBe(2);
    expect(relicEvents(r.events)).toEqual(['cheatersWatch']);
    expect(play(spec([]), 'allIn').state.luck).toBe(1);
  });

  it('老千的懷錶：孤注一擲的卡面寫出實際的手氣增加量', () => {
    expect(describeCard('allIn', { state: withRelics(['cheatersWatch']) })).toContain('手氣 +2');
    expect(describeCard('allIn', { state: withRelics([]) })).toContain('手氣 +1');
    expect(describeCard('allIn')).toContain('手氣 +1');
  });

  it('缺角的撲克牌：每場開始出千，下一次下注必定成功', () => {
    const ctx = startedWith(['chippedCard']);
    expect(ctx.state.rigged).toBe(true);
    expect(nextBetChance(ctx.state)).toBe(1);
  });

  it('褪色的時刻表：第一回合抽 7 張，之後 5 張', () => {
    const ctx = startedWith(['fadedTimetable']);
    expect(ctx.state.hand).toHaveLength(7);
    expect(endTurn(ctx.state).state.hand).toHaveLength(5);
    expect(startedWith([]).state.hand).toHaveLength(5);
  });

  it('旅人的水壺：休息回復 40%（阿格妮絲 36 → ceil(14.4) = 15）', () => {
    const healed = (relics: RelicId[]) => {
      const ctx = { state: cloneState(withRelics(relics, { allyHp: { agnes: 10 } })), events: [] as GameEvent[] };
      rest(ctx);
      return ally(ctx.state, 'agnes').hp;
    };
    expect(healed(['travelersFlask'])).toBe(25);
    expect(healed([])).toBe(19);
  });

  it('隕石碎片：第 3 回合能量 4，第 2 回合 3', () => {
    const t2 = endTurn(withRelics(['meteorShard'], { enemies: [{ hp: 100 }] })).state;
    expect(t2.energy).toBe(3);
    const r3 = endTurn(t2);
    expect(r3.state).toMatchObject({ turn: 3, energy: 4 });
    expect(relicEvents(r3.events)).toEqual(['meteorShard']);
  });
});
