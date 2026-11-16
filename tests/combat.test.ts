// 回合流程、傷害與格擋、抽牌、出牌規則

import { describe, expect, it } from 'vitest';
import { canPlayCard, reduce } from '../src/engine/reducer.ts';
import { ally, battleState, endTurn, enemy, ofType, play, playAll } from './helpers.ts';

describe('傷害與格擋', () => {
  it('格擋先吸收，剩餘扣生命，生命最低為 0', () => {
    const r = play(battleState({ hand: ['pulse'], enemies: [{ hp: 3, block: 2 }, { hp: 10 }] }), 'pulse');
    expect(enemy(r.state)).toMatchObject({ hp: 0, block: 0 });
    expect(ofType(r.events, 'damage')[0]).toMatchObject({ amount: 3, blocked: 2 });
    expect(ofType(r.events, 'enemyDefeated')).toHaveLength(1);
  });

  it('格擋大於傷害時只扣格擋', () => {
    const s = play(battleState({ hand: ['pulse'], enemies: [{ hp: 20, block: 10 }] }), 'pulse').state;
    expect(enemy(s)).toMatchObject({ hp: 20, block: 4 });
  });

  it('敵人攻擊同伴：格擋先吸收', () => {
    let s = battleState({ hand: ['field'], enemies: [{ hp: 20, intent: { kind: 'attack', damage: 8, hits: 1, targetId: 'agnes' } }] });
    s = play(s, 'field', 'agnes').state;
    s = endTurn(s).state;
    expect(ally(s, 'agnes').hp).toBe(33);
  });

  it('同伴的格擋撐過敵人回合，在下一個玩家回合開始時歸零', () => {
    let s = play(battleState({ hand: ['phalanx'], enemies: [{ hp: 20 }] }), 'phalanx').state;
    expect(ally(s, 'leon').block).toBe(8);
    s = endTurn(s).state;
    expect(ally(s, 'leon').block).toBe(0);
  });
});

describe('回合流程', () => {
  it('新回合：回合 +1、能量 3、重置每回合限制、抽 5 張', () => {
    const s = battleState({
      hand: [],
      drawPile: ['pulse', 'pulse', 'pulse', 'pulse', 'pulse', 'pulse', 'pulse'],
      energy: 0,
      patch: (st) => {
        st.sleeveUsed = true;
        st.firstBetDone = true;
      },
    });
    const r = endTurn(s);
    expect(r.state).toMatchObject({ turn: 2, energy: 3, sleeveUsed: false, firstBetDone: false });
    expect(r.state.hand).toHaveLength(5);
    expect(r.state.drawPile).toHaveLength(2);
  });

  it('開局：第 1 回合、能量 3、手牌 5 張、牌組 17 張分布在手牌與抽牌堆', () => {
    const s = battleState();
    expect(s).toMatchObject({ phase: 'battle', turn: 1, energy: 3, battleIndex: 0 });
    expect(s.hand).toHaveLength(5);
    expect(s.drawPile).toHaveLength(12);
    expect(s.enemies.every((e) => e.intent !== null)).toBe(true);
  });

  it('結束回合：手牌全部進棄牌堆', () => {
    const s = battleState({ hand: ['pulse', 'field'], drawPile: ['herb', 'herb', 'herb', 'herb', 'herb'] });
    const r = endTurn(s).state;
    expect(r.discard.map((c) => c.cardId).sort()).toEqual(['field', 'pulse']);
    expect(r.hand.map((c) => c.cardId)).toEqual(['herb', 'herb', 'herb', 'herb', 'herb']);
  });
});

describe('抽牌', () => {
  it('從抽牌堆頂依序抽', () => {
    const s = battleState({ hand: ['analyze'], drawPile: ['pulse', 'herb'] });
    expect(play(s, 'analyze').state.hand.map((c) => c.cardId)).toEqual(['pulse']);
  });

  it('抽牌堆空了就把棄牌堆洗勻成新的抽牌堆', () => {
    const s = battleState({ hand: ['analyze'], drawPile: [], discard: ['herb', 'herb'] });
    const r = play(s, 'analyze');
    expect(r.state.hand.map((c) => c.cardId)).toEqual(['herb']);
    expect(r.state.drawPile).toHaveLength(1);
    expect(r.state.discard.map((c) => c.cardId)).toEqual(['analyze']);
    expect(ofType(r.events, 'shuffle')).toHaveLength(1);
  });

  it('兩者都空就停止', () => {
    const s = battleState({ hand: ['analyze'], drawPile: [], discard: [] });
    expect(play(s, 'analyze').state.hand).toHaveLength(0);
  });

  it('手牌上限 10 張，滿了就不再抽', () => {
    // 10 張手牌，打出解析後剩 9 張；增幅後要抽 2 張，但只能抽到第 10 張
    const s = battleState({
      hand: ['analyze', 'pulse', 'pulse', 'pulse', 'pulse', 'pulse', 'pulse', 'pulse', 'pulse', 'pulse'],
      drawPile: ['herb', 'herb', 'herb'],
      patch: (st) => (st.ampCharges = 1),
    });
    const r = play(s, 'analyze');
    expect(r.state.hand).toHaveLength(10);
    expect(r.state.drawPile).toHaveLength(2);
    expect(ofType(r.events, 'draw')[0]?.uids).toHaveLength(1);
  });
});

describe('出牌規則', () => {
  it('能量不足無法打出', () => {
    const s = battleState({ hand: ['overload'], energy: 1 });
    const c = s.hand[0];
    if (!c) throw new Error();
    expect(canPlayCard(s, c.uid)).toEqual({ ok: false, reason: 'energy' });
  });

  it('先扣能量、從手牌移除，結算後進棄牌堆', () => {
    const s = play(battleState({ hand: ['pulse', 'field'], enemies: [{ hp: 50 }] }), 'pulse').state;
    expect(s.energy).toBe(2);
    expect(s.hand.map((c) => c.cardId)).toEqual(['field']);
    expect(s.discard.map((c) => c.cardId)).toEqual(['pulse']);
  });

  it('需要目標的牌沒給目標或目標不合法會被拒絕，狀態不變', () => {
    const s = battleState({ hand: ['pulse'], enemies: [{ hp: 0 }, { hp: 10 }] });
    const uid = s.hand[0]?.uid ?? -1;
    for (const targetId of [undefined, 'e0', 'nope', 'leon']) {
      const r = reduce(s, { type: 'PLAY_CARD', uid, targetId });
      expect(r.state).toBe(s);
      expect(r.events).toEqual([{ type: 'actionRejected', action: 'PLAY_CARD', reason: 'invalidTarget' }]);
    }
  });

  it('不在手牌的牌、非戰鬥階段都會被拒絕', () => {
    const s = battleState({ hand: ['pulse'] });
    expect(reduce(s, { type: 'PLAY_CARD', uid: 99999 }).events[0]).toMatchObject({ reason: 'notInHand' });
    expect(reduce({ ...s, phase: 'reward' }, { type: 'PLAY_CARD', uid: 1 }).events[0]).toMatchObject({ reason: 'phase' });
  });

  it('打出後敵人全滅 → 戰鬥勝利，進入選牌', () => {
    const r = play(battleState({ hand: ['bulletRain'], enemies: [{ hp: 4 }, { hp: 3 }] }), 'bulletRain');
    expect(r.state.phase).toBe('reward');
    expect(r.state.rewardOptions).toHaveLength(3);
    expect(ofType(r.events, 'battleWon')).toHaveLength(1);
  });

  it('對已死亡的敵人不再造成傷害（多段攻擊中途擊殺）', () => {
    const s = battleState({ hand: ['goAllIn'], enemies: [{ hp: 15 }, { hp: 50 }], patch: (st) => (st.rigged = true) });
    const r = play(s, 'goAllIn');
    expect(ofType(r.events, 'damage').map((e) => e.amount)).toEqual([12, 3]);
  });

  it('連續出牌：增幅、毒草、火種的組合', () => {
    const s = playAll(battleState({ hand: ['amp', 'herb', 'spark'], enemies: [{ hp: 100 }] }), 'amp', 'herb', 'spark');
    // 毒草被增幅 → 8 層；火種 5 + 8 = 13
    expect(enemy(s).poison).toBe(8);
    expect(enemy(s).hp).toBe(87);
  });
});
