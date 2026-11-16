// 每張卡至少一個測試，涵蓋被增幅與未被增幅的結果（第 11 節）

import { describe, expect, it } from 'vitest';
import type { CardId, GameState } from '../src/engine/types.ts';
import { ally, battleState, enemy, ofType, play, type BattleSpec } from './helpers.ts';

/**
 * 準備手牌 [amp?, card]，若 amped 先打出增幅，再打出 card。
 * 回傳打出 card 之後的狀態與事件。
 */
function cast(card: CardId, amped: boolean, spec: BattleSpec = {}, targetId?: string) {
  const hand: CardId[] = amped ? ['amp', card, ...(spec.hand ?? [])] : [card, ...(spec.hand ?? [])];
  let s: GameState = battleState({ energy: 10, enemies: [{ hp: 100 }], ...spec, hand });
  if (amped) s = play(s, 'amp').state;
  const result = play(s, card, targetId);
  const played = ofType(result.events, 'cardPlayed')[0];
  expect(played?.multiplier).toBe(amped ? 2 : 1);
  return result;
}

const both = [
  ['未增幅', false, 1],
  ['增幅', true, 2],
] as const;

describe('盧西安的牌', () => {
  it.each(both)('脈衝（%s）', (_n, amped, m) => {
    const { state } = cast('pulse', amped);
    expect(enemy(state).hp).toBe(100 - 6 * m);
  });

  it.each(both)('力場（%s）', (_n, amped, m) => {
    const { state } = cast('field', amped, {}, 'agnes');
    expect(ally(state, 'agnes').block).toBe(5 * m);
  });

  it('增幅：ampCharges = max(ampCharges, 1)，不吃也不消耗增幅', () => {
    let s = battleState({ hand: ['amp', 'amp'], energy: 10 });
    s = play(s, 'amp').state;
    expect(s.ampCharges).toBe(1);
    const r = play(s, 'amp');
    expect(ofType(r.events, 'cardPlayed')[0]?.multiplier).toBe(1);
    expect(r.state.ampCharges).toBe(1);

    const withTwo = battleState({ hand: ['amp'], patch: (st) => (st.ampCharges = 2) });
    expect(play(withTwo, 'amp').state.ampCharges).toBe(2);
  });

  it.each(both)('解析（%s）：目標已解析並抽 m 張', (_n, amped, m) => {
    const { state } = cast('analyze', amped, { drawPile: ['pulse', 'pulse', 'pulse'] });
    expect(enemy(state).analyzed).toBe(true);
    expect(state.hand).toHaveLength(m);
  });

  it('連鎖增幅：ampCharges = 2，不消耗已有的增幅', () => {
    let s = battleState({ hand: ['amp', 'chainAmp'], energy: 10 });
    s = play(s, 'amp').state;
    const r = play(s, 'chainAmp');
    expect(ofType(r.events, 'cardPlayed')[0]?.multiplier).toBe(1);
    expect(r.state.ampCharges).toBe(2);
  });

  it.each(both)('過載（%s）：造成 20×m 並移除', (_n, amped, m) => {
    const { state } = cast('overload', amped);
    expect(enemy(state).hp).toBe(100 - 20 * m);
    expect(state.exhausted.map((c) => c.cardId)).toContain('overload');
    expect(state.discard.map((c) => c.cardId)).not.toContain('overload');
  });

  it.each(both)('校準（%s）：其餘手牌進棄牌堆，抽同樣張數（不受增幅影響）', (_n, amped) => {
    const { state } = cast('calibrate', amped, { hand: ['pulse', 'field'], drawPile: ['herb', 'herb', 'herb', 'herb'] });
    expect(state.hand.map((c) => c.cardId)).toEqual(['herb', 'herb']);
    const discarded = state.discard.map((c) => c.cardId).filter((id) => id !== 'amp');
    expect(discarded.sort()).toEqual(['calibrate', 'field', 'pulse']);
    // 增幅仍被消耗
    expect(state.ampCharges).toBe(0);
  });
});

describe('雷翁的牌', () => {
  it.each(both)('方陣（%s）：8×m 格擋', (_n, amped, m) => {
    const { state } = cast('phalanx', amped);
    expect(ally(state, 'leon').block).toBe(8 * m);
  });

  it.each(both)('方陣（%s，背水）：12×m 格擋', (_n, amped, m) => {
    const { state } = cast('phalanx', amped, { allyHp: { leon: 25 } });
    expect(ally(state, 'leon').block).toBe(12 * m);
  });

  it.each(both)('突刺（%s）：8×m 傷害', (_n, amped, m) => {
    const { state, events } = cast('thrust', amped);
    expect(enemy(state).hp).toBe(100 - 8 * m);
    expect(ofType(events, 'damage')).toHaveLength(1);
  });

  it.each(both)('突刺（%s，背水）：打兩次', (_n, amped, m) => {
    const { state, events } = cast('thrust', amped, { allyHp: { leon: 20 } });
    expect(enemy(state).hp).toBe(100 - 16 * m);
    expect(ofType(events, 'damage')).toHaveLength(2);
  });

  it.each(both)('血誓（%s）：失去 3 生命（不受增幅），獲得 m 能量', (_n, amped, m) => {
    const before = amped ? 10 - 1 : 10; // 增幅花了 1 點能量
    const { state } = cast('bloodOath', amped);
    expect(ally(state, 'leon').hp).toBe(47);
    expect(state.energy).toBe(before + m);
  });

  it('血誓：生命最低保留 1', () => {
    const s = battleState({ hand: ['bloodOath'], allyHp: { leon: 2 } });
    expect(ally(play(s, 'bloodOath').state, 'leon').hp).toBe(1);
  });

  it.each(both)('盾擊（%s）：造成雷翁格擋 × m', (_n, amped, m) => {
    const { state } = cast('shieldBash', amped, { patch: (s) => (ally(s, 'leon').block = 7) });
    expect(enemy(state).hp).toBe(100 - 7 * m);
  });

  it.each(both)('堅守反擊（%s）：反擊值 += 5×m', (_n, amped, m) => {
    const { state } = cast('holdFirm', amped);
    expect(ally(state, 'leon').thorns).toBe(5 * m);
  });

  it.each(both)('不退（%s）：取得能力並進入移除區', (_n, amped) => {
    const { state } = cast('noRetreat', amped);
    expect(state.powers.noRetreat).toBe(true);
    expect(state.exhausted.map((c) => c.cardId)).toEqual(['noRetreat']);
    expect(state.ampCharges).toBe(0);
  });

  it.each(both)('最後的衝鋒（%s，滿血）：10×m', (_n, amped, m) => {
    const { state } = cast('lastCharge', amped);
    expect(enemy(state).hp).toBe(100 - 10 * m);
  });

  it.each(both)('最後的衝鋒（%s，失去 60% 生命）：(10 + 18)×m', (_n, amped, m) => {
    const { state } = cast('lastCharge', amped, { allyHp: { leon: 20 } });
    expect(enemy(state).hp).toBe(100 - 28 * m);
  });

  it('最後的衝鋒：失去 20% 生命時正好 +6（不受浮點誤差影響）', () => {
    const { state } = cast('lastCharge', false, { allyHp: { leon: 40 } });
    expect(enemy(state).hp).toBe(100 - 16);
  });
});

describe('阿格妮絲的牌', () => {
  it.each(both)('毒草（%s）：4×m 層中毒', (_n, amped, m) => {
    const { state } = cast('herb', amped);
    expect(enemy(state).poison).toBe(4 * m);
  });

  it.each(both)('草藥敷料（%s）：回復 6×m', (_n, amped, m) => {
    const { state } = cast('poultice', amped, { allyHp: { agnes: 10 } }, 'agnes');
    expect(ally(state, 'agnes').hp).toBe(10 + 6 * m);
  });

  it('草藥敷料：不超過生命上限', () => {
    const { state } = cast('poultice', true, { allyHp: { agnes: 33 } }, 'agnes');
    expect(ally(state, 'agnes').hp).toBe(36);
  });

  it.each(both)('火種（%s）：(5 + 中毒層數)×m', (_n, amped, m) => {
    const { state } = cast('spark', amped, { enemies: [{ hp: 100, poison: 3 }] });
    expect(enemy(state).hp).toBe(100 - 8 * m);
  });

  it.each(both)('瘴氣（%s）：所有敵人 3×m 層中毒', (_n, amped, m) => {
    const { state } = cast('miasma', amped, { enemies: [{ hp: 50 }, { hp: 50 }, { hp: 0 }] });
    expect(state.enemies.map((e) => e.poison)).toEqual([3 * m, 3 * m, 0]);
  });

  it.each(both)('腐蝕（%s）：中毒層數變為 2×m 倍', (_n, amped, m) => {
    const { state } = cast('corrode', amped, { enemies: [{ hp: 100, poison: 3 }] });
    expect(enemy(state).poison).toBe(3 * 2 * m);
  });

  it.each(both)('焚盡（%s）：消耗全部中毒，每層 2×m 傷害（一次結算）', (_n, amped, m) => {
    const { state, events } = cast('consume', amped, { enemies: [{ hp: 100, poison: 5 }] });
    expect(enemy(state).poison).toBe(0);
    expect(enemy(state).hp).toBe(100 - 5 * 2 * m);
    expect(ofType(events, 'damage')).toHaveLength(1);
  });

  it.each([
    ['未增幅，上限內', false, 2, 17],
    ['未增幅，被一半上限截斷', false, 5, 18],
    ['增幅，被一半上限截斷', true, 1, 18],
    ['已超過一半則無效', false, 20, 20],
  ] as const)('緩和（%s）', (_n, amped, hp, expected) => {
    const { state } = cast('soothe', amped, { allyHp: { agnes: hp } }, 'agnes');
    expect(ally(state, 'agnes').hp).toBe(expected);
  });

  it('緩和（增幅，上限內）：回復 30', () => {
    const { state } = cast('soothe', true, { allyHp: { leon: 1 }, patch: (s) => (ally(s, 'leon').maxHp = 80) }, 'leon');
    expect(ally(state, 'leon').hp).toBe(31);
  });

  it.each(both)('野火（%s）：所有敵人 6×m，中毒者額外 4×m', (_n, amped, m) => {
    const { state } = cast('wildfire', amped, { enemies: [{ hp: 100, poison: 2 }, { hp: 100 }] });
    expect(state.enemies.map((e) => e.hp)).toEqual([100 - 10 * m, 100 - 6 * m]);
  });

  it.each(both)('餘毒（%s）：取得能力並進入移除區', (_n, amped) => {
    const { state } = cast('lingeringPoison', amped);
    expect(state.powers.lingeringPoison).toBe(true);
    expect(state.exhausted.map((c) => c.cardId)).toEqual(['lingeringPoison']);
  });
});

describe('艾斯的牌', () => {
  const rigged = { patch: (s: GameState) => (s.rigged = true) };

  it.each(both)('孤注一擲（%s，出千）：成功造成 16×m', (_n, amped, m) => {
    const { state } = cast('allIn', amped, rigged);
    expect(enemy(state).hp).toBe(100 - 16 * m);
  });

  it('袖裡藏牌：rigged = true，標記本回合已使用', () => {
    const { state } = cast('sleeve', false);
    expect(state.rigged).toBe(true);
    expect(state.sleeveUsed).toBe(true);
  });

  it('袖裡藏牌（增幅）：效果相同並消耗增幅', () => {
    const { state } = cast('sleeve', true);
    expect(state.rigged).toBe(true);
    expect(state.ampCharges).toBe(0);
  });

  it.each(both)('槍林彈雨（%s）：所有敵人 4×m', (_n, amped, m) => {
    const { state } = cast('bulletRain', amped, { enemies: [{ hp: 30 }, { hp: 30 }] });
    expect(state.enemies.map((e) => e.hp)).toEqual([30 - 4 * m, 30 - 4 * m]);
  });

  it.each(both)('全押（%s，出千）：3 次 12×m', (_n, amped, m) => {
    const { state, events } = cast('goAllIn', amped, rigged);
    expect(enemy(state).hp).toBe(100 - 36 * m);
    expect(ofType(events, 'damage')).toHaveLength(3);
  });

  it.each(both)('灌鉛骰子（%s）：取得能力並進入移除區', (_n, amped) => {
    const { state } = cast('loadedDice', amped);
    expect(state.powers.loadedDice).toBe(true);
    expect(state.exhausted.map((c) => c.cardId)).toEqual(['loadedDice']);
  });

  it.each(both)('輸家的反擊（%s）：luck 歸零，造成 luck×5×m', (_n, amped, m) => {
    const { state } = cast('losersRevenge', amped, { patch: (s) => (s.luck = 3) });
    expect(state.luck).toBe(0);
    expect(enemy(state).hp).toBe(100 - 15 * m);
  });

  it.each(both)('才不是為了你（%s）：8×m 格擋', (_n, amped, m) => {
    const { state } = cast('notForYou', amped, {}, 'ace');
    expect(ally(state, 'ace').block).toBe(8 * m);
  });

  it.each(both)('掩護射擊（%s）：6×m 傷害，攻擊意圖 −4×m', (_n, amped, m) => {
    const { state } = cast('coverFire', amped, {
      enemies: [{ hp: 100, intent: { kind: 'attack', damage: 10, hits: 1, targetId: 'leon' } }],
    });
    expect(enemy(state).hp).toBe(100 - 6 * m);
    expect(enemy(state).intent).toMatchObject({ kind: 'attack', damage: 10 - 4 * m });
  });

  it('掩護射擊：全體攻擊也會被壓制，最低為 0；防禦意圖不受影響', () => {
    const a = cast('coverFire', true, { enemies: [{ hp: 100, intent: { kind: 'aoe', damage: 5 } }] });
    expect(enemy(a.state).intent).toEqual({ kind: 'aoe', damage: 0 });
    const d = cast('coverFire', false, { enemies: [{ hp: 100, intent: { kind: 'defend', block: 6, strength: 0 } }] });
    expect(enemy(d.state).intent).toEqual({ kind: 'defend', block: 6, strength: 0 });
  });

  it('掩護射擊：目標被擊殺時不修改意圖', () => {
    const { events } = cast('coverFire', false, {
      enemies: [{ hp: 5, intent: { kind: 'attack', damage: 10, hits: 1, targetId: 'leon' } }, { hp: 10 }],
    });
    expect(ofType(events, 'intentReduced')).toHaveLength(0);
  });
});
