// 機制測試：M0 驗收要求的每個機制至少一個測試
// 增幅、解析、背水、中毒、餘毒、下注、出千、灌鉛骰子、反擊、倒下、休息復活

import { describe, expect, it } from 'vitest';
import { betChance } from '../src/engine/bet.ts';
import { canPlayCard, reduce } from '../src/engine/reducer.ts';
import type { GameState } from '../src/engine/types.ts';
import { ally, battleState, endTurn, enemy, ofType, play, playAll, rngStateWhere } from './helpers.ts';

describe('增幅', () => {
  it('增幅後下一張非增幅類的牌倍率為 2，並消耗 1 次', () => {
    const s = playAll(battleState({ hand: ['amp', 'pulse', 'pulse'], enemies: [{ hp: 100 }], energy: 5 }), 'amp', 'pulse');
    expect(enemy(s).hp).toBe(88);
    expect(s.ampCharges).toBe(0);
    expect(enemy(play(s, 'pulse').state).hp).toBe(82);
  });

  it('連鎖增幅讓接下來兩張都加倍', () => {
    const s = playAll(
      battleState({ hand: ['chainAmp', 'pulse', 'herb', 'pulse'], enemies: [{ hp: 100 }], energy: 10 }),
      'chainAmp',
      'pulse',
      'herb',
      'pulse',
    );
    expect(enemy(s).hp).toBe(100 - 12 - 6);
    expect(enemy(s).poison).toBe(8);
  });

  it('增幅次數跨回合保留', () => {
    let s = play(battleState({ hand: ['amp'], enemies: [{ hp: 100 }] }), 'amp').state;
    s = endTurn(s).state;
    expect(s.turn).toBe(2);
    expect(s.ampCharges).toBe(1);
  });

  it('增幅次數在戰鬥開始時歸零', () => {
    let s = battleState({ hand: ['amp', 'pulse'], enemies: [{ hp: 6 }], energy: 5 });
    s = play(s, 'amp').state; // ampCharges 1
    s.ampCharges = 2; // 留下多餘的次數
    s = play(s, 'pulse').state; // 擊殺 → 勝利
    expect(s.phase).toBe('reward');
    s = reduce(s, { type: 'PICK_REWARD', cardId: null }).state;
    s = reduce(s, { type: 'REMOVE_CARD', uid: null }).state;
    expect(s.phase).toBe('battle');
    expect(s.battleIndex).toBe(1);
    expect(s.ampCharges).toBe(0);
  });
});

describe('解析', () => {
  it('被解析的敵人本回合受到的傷害 ×1.5（向下取整）', () => {
    const s = playAll(battleState({ hand: ['analyze', 'thrust'], enemies: [{ hp: 100 }] }), 'analyze', 'thrust');
    expect(enemy(s).hp).toBe(100 - 12);
  });

  it('奇數傷害向下取整：5 → 7', () => {
    const s = playAll(battleState({ hand: ['analyze', 'spark'], enemies: [{ hp: 100 }] }), 'analyze', 'spark');
    expect(enemy(s).hp).toBe(100 - 7);
  });

  it('解析在下一個玩家回合開始時清除', () => {
    let s = play(battleState({ hand: ['analyze'], enemies: [{ hp: 100 }] }), 'analyze').state;
    expect(enemy(s).analyzed).toBe(true);
    s = endTurn(s).state;
    expect(enemy(s).analyzed).toBe(false);
  });

  it('解析的加成先於格擋計算', () => {
    const s = playAll(battleState({ hand: ['analyze', 'pulse'], enemies: [{ hp: 100, block: 4 }] }), 'analyze', 'pulse');
    // 6 × 1.5 = 9，格擋吸收 4，扣 5
    expect(enemy(s).hp).toBe(95);
    expect(enemy(s).block).toBe(0);
  });
});

describe('背水', () => {
  it('雷翁生命 <= 上限一半時為背水；剛好一半也算', () => {
    const at25 = play(battleState({ hand: ['thrust'], enemies: [{ hp: 100 }], allyHp: { leon: 25 } }), 'thrust');
    expect(enemy(at25.state).hp).toBe(84);
    const at26 = play(battleState({ hand: ['thrust'], enemies: [{ hp: 100 }], allyHp: { leon: 26 } }), 'thrust');
    expect(enemy(at26.state).hp).toBe(92);
  });

  it('不退：背水時雷翁的攻擊每次 +4（在解析前加入）', () => {
    const s = playAll(
      battleState({ hand: ['noRetreat', 'analyze', 'thrust'], enemies: [{ hp: 100 }], allyHp: { leon: 20 } }),
      'noRetreat',
      'analyze',
      'thrust',
    );
    // 每下 (8 + 4) × 1.5 = 18，打兩次
    expect(enemy(s).hp).toBe(100 - 36);
  });

  it('不退：未背水時沒有加成，也不影響其他角色', () => {
    const s = playAll(
      battleState({ hand: ['noRetreat', 'thrust', 'pulse'], enemies: [{ hp: 100 }], energy: 5 }),
      'noRetreat',
      'thrust',
    );
    expect(enemy(s).hp).toBe(92);
    const lowLeon = playAll(
      battleState({ hand: ['noRetreat', 'pulse'], enemies: [{ hp: 100 }], allyHp: { leon: 10 } }),
      'noRetreat',
      'pulse',
    );
    expect(enemy(lowLeon).hp).toBe(94);
  });
});

describe('中毒', () => {
  it('敵人行動前受到等同層數的傷害（無視格擋），然後層數 −1', () => {
    const s = endTurn(battleState({ hand: [], enemies: [{ hp: 30, poison: 5, block: 10 }] })).state;
    expect(enemy(s).hp).toBe(25);
    expect(enemy(s).poison).toBe(4);
  });

  it('中毒致死時敵人不行動', () => {
    const r = endTurn(
      battleState({
        hand: [],
        enemies: [
          { hp: 3, poison: 3, intent: { kind: 'attack', damage: 20, hits: 1, targetId: 'leon' } },
          { hp: 10 },
        ],
      }),
    );
    expect(enemy(r.state).hp).toBe(0);
    expect(ally(r.state, 'leon').hp).toBe(50);
    expect(ofType(r.events, 'enemyDefeated').map((e) => e.enemyId)).toEqual(['e0']);
  });

  it('中毒殺死最後一個敵人 → 戰鬥勝利', () => {
    const r = endTurn(battleState({ hand: [], enemies: [{ hp: 2, poison: 4 }] }));
    expect(r.state.phase).toBe('reward');
    expect(ofType(r.events, 'battleWon')).toHaveLength(1);
  });
});

describe('餘毒', () => {
  it('打出餘毒後，敵人中毒層數不再減少', () => {
    let s = play(battleState({ hand: ['lingeringPoison'], enemies: [{ hp: 100, poison: 4 }] }), 'lingeringPoison').state;
    s = endTurn(s).state;
    expect(enemy(s).hp).toBe(96);
    expect(enemy(s).poison).toBe(4);
    s = endTurn(s).state;
    expect(enemy(s).hp).toBe(92);
    expect(enemy(s).poison).toBe(4);
  });

  it('餘毒只在本場有效：下一場戰鬥重置', () => {
    let s = play(battleState({ hand: ['lingeringPoison'], enemies: [{ hp: 1, poison: 4 }] }), 'lingeringPoison').state;
    s = endTurn(s).state; // 中毒擊殺
    s = reduce(s, { type: 'PICK_REWARD', cardId: null }).state;
    s = reduce(s, { type: 'REMOVE_CARD', uid: null }).state;
    expect(s.powers.lingeringPoison).toBe(false);
  });
});

describe('下注', () => {
  it('成功率 = min(0.9, 0.5 + 0.1 × luck)', () => {
    expect(betChance(0)).toBe(0.5);
    expect(betChance(1)).toBe(0.6);
    expect(betChance(3)).toBe(0.8);
    expect(betChance(4)).toBe(0.9);
    expect(betChance(10)).toBe(0.9);
  });

  it('擲骰失敗：luck +1、不造成傷害、firstBetDone = true', () => {
    const s = battleState({ hand: ['allIn'], enemies: [{ hp: 100 }], patch: (st) => (st.rngState = rngStateWhere((v) => v >= 0.5)) });
    const r = play(s, 'allIn');
    expect(r.state.luck).toBe(1);
    expect(enemy(r.state).hp).toBe(100);
    expect(r.state.firstBetDone).toBe(true);
    expect(ofType(r.events, 'bet')[0]).toMatchObject({ success: false, reason: 'roll', chance: 0.5 });
  });

  it('擲骰成功：luck 歸零並造成傷害', () => {
    const s = battleState({
      hand: ['allIn'],
      enemies: [{ hp: 100 }],
      patch: (st) => {
        st.luck = 2;
        st.rngState = rngStateWhere((v) => v < 0.7);
      },
    });
    const r = play(s, 'allIn');
    expect(r.state.luck).toBe(0);
    expect(enemy(r.state).hp).toBe(84);
    expect(ofType(r.events, 'bet')[0]).toMatchObject({ success: true, chance: 0.7 });
  });

  it('手氣提高成功率：同一個亂數 0.65 在 luck=1 失敗、luck=2 成功', () => {
    const rng = rngStateWhere((v) => v >= 0.6 && v < 0.7);
    const at = (luck: number) =>
      play(battleState({ hand: ['allIn'], enemies: [{ hp: 100 }], patch: (st) => ((st.luck = luck), (st.rngState = rng)) }), 'allIn');
    expect(ofType(at(1).events, 'bet')[0]?.success).toBe(false);
    expect(ofType(at(2).events, 'bet')[0]?.success).toBe(true);
  });

  it('固定種子下，大量下注的成功率接近 50%', () => {
    let wins = 0;
    for (let seed = 1; seed <= 400; seed++) {
      const r = play(battleState({ seed, hand: ['allIn'], enemies: [{ hp: 100 }] }), 'allIn');
      if (ofType(r.events, 'bet')[0]?.success) wins += 1;
    }
    expect(wins / 400).toBeGreaterThan(0.42);
    expect(wins / 400).toBeLessThan(0.58);
  });
});

describe('出千（袖裡藏牌）', () => {
  const alwaysFail = (st: GameState) => (st.rngState = rngStateWhere((v) => v >= 0.9));

  it('出千後下一次下注必定成功，rigged 被消耗', () => {
    const s = playAll(battleState({ hand: ['sleeve', 'allIn', 'allIn'], enemies: [{ hp: 100 }], patch: alwaysFail }), 'sleeve');
    const r = play(s, 'allIn');
    expect(ofType(r.events, 'bet')[0]).toMatchObject({ success: true, reason: 'rigged' });
    expect(r.state.rigged).toBe(false);
    expect(enemy(r.state).hp).toBe(84);
  });

  it('袖裡藏牌每回合限用一次，下回合恢復', () => {
    let s = play(battleState({ hand: ['sleeve', 'sleeve'], enemies: [{ hp: 100 }] }), 'sleeve').state;
    const second = s.hand[0];
    if (!second) throw new Error('應該還有一張袖裡藏牌');
    expect(canPlayCard(s, second.uid)).toEqual({ ok: false, reason: 'oncePerTurn' });
    const rejected = reduce(s, { type: 'PLAY_CARD', uid: second.uid });
    expect(rejected.state).toBe(s);
    expect(ofType(rejected.events, 'actionRejected')[0]?.reason).toBe('oncePerTurn');
    s = endTurn(s).state;
    expect(s.sleeveUsed).toBe(false);
  });

  it('出千的效果跨回合保留，直到下一次下注', () => {
    let s = play(battleState({ hand: ['sleeve'], enemies: [{ hp: 100 }] }), 'sleeve').state;
    s = endTurn(s).state;
    expect(s.rigged).toBe(true);
  });
});

describe('灌鉛骰子', () => {
  const alwaysFail = (st: GameState) => (st.rngState = rngStateWhere((v) => v >= 0.9));

  it('每回合第一次下注必定成功，第二次照常擲骰', () => {
    let s = play(
      battleState({ hand: ['loadedDice', 'allIn', 'allIn'], enemies: [{ hp: 200 }], patch: alwaysFail }),
      'loadedDice',
    ).state;
    const first = play(s, 'allIn');
    expect(ofType(first.events, 'bet')[0]).toMatchObject({ success: true, reason: 'loadedDice' });
    s = first.state;
    s.rngState = rngStateWhere((v) => v >= 0.9);
    const second = play(s, 'allIn');
    expect(ofType(second.events, 'bet')[0]).toMatchObject({ success: false, reason: 'roll' });
  });

  it('下一回合又恢復第一次必定成功', () => {
    let s = play(battleState({ hand: ['loadedDice', 'allIn'], enemies: [{ hp: 200 }] }), 'loadedDice').state;
    s = play(s, 'allIn').state;
    expect(s.firstBetDone).toBe(true);
    s = endTurn(s).state;
    expect(s.firstBetDone).toBe(false);
  });

  it('出千優先於灌鉛骰子：出千被消耗、本回合第一次下注也算用掉', () => {
    let s = playAll(battleState({ hand: ['loadedDice', 'sleeve', 'allIn', 'allIn'], enemies: [{ hp: 200 }], energy: 5 }), 'loadedDice', 'sleeve');
    const r = play(s, 'allIn');
    expect(ofType(r.events, 'bet')[0]?.reason).toBe('rigged');
    s = r.state;
    s.rngState = rngStateWhere((v) => v >= 0.9);
    expect(ofType(play(s, 'allIn').events, 'bet')[0]?.success).toBe(false);
  });
});

describe('反擊', () => {
  it('雷翁有反擊值時，每次被攻擊都讓攻擊者受到反擊傷害', () => {
    const s = play(
      battleState({
        hand: ['holdFirm'],
        enemies: [{ hp: 50, intent: { kind: 'attack', damage: 3, hits: 2, targetId: 'leon' } }],
      }),
      'holdFirm',
    ).state;
    const r = endTurn(s);
    expect(enemy(r.state).hp).toBe(40);
    expect(ally(r.state, 'leon').hp).toBe(44);
    expect(ofType(r.events, 'damage').filter((e) => e.source === 'thorns')).toHaveLength(2);
  });

  it('反擊不受解析影響，格擋完全擋下時仍會觸發', () => {
    let s = battleState({
      hand: ['holdFirm', 'analyze', 'phalanx'],
      enemies: [{ hp: 50, intent: { kind: 'attack', damage: 5, hits: 1, targetId: 'leon' } }],
    });
    s = playAll(s, 'holdFirm', 'analyze', 'phalanx');
    const r = endTurn(s).state;
    expect(enemy(r).hp).toBe(45);
    expect(ally(r, 'leon').hp).toBe(50);
  });

  it('反擊值在下一個玩家回合歸零；打其他同伴不觸發', () => {
    let s = play(
      battleState({ hand: ['holdFirm'], enemies: [{ hp: 50, intent: { kind: 'attack', damage: 3, hits: 1, targetId: 'agnes' } }] }),
      'holdFirm',
    ).state;
    s = endTurn(s).state;
    expect(enemy(s).hp).toBe(50);
    expect(ally(s, 'leon').thorns).toBe(0);
  });

  it('反擊殺死攻擊者後，剩下的連擊停止', () => {
    const s = play(
      battleState({ hand: ['holdFirm'], enemies: [{ hp: 5, intent: { kind: 'attack', damage: 2, hits: 3, targetId: 'leon' } }, { hp: 10 }] }),
      'holdFirm',
    ).state;
    const r = endTurn(s).state;
    expect(enemy(r).hp).toBe(0);
    expect(ally(r, 'leon').hp).toBe(48);
  });
});

describe('倒下', () => {
  it('同伴生命歸零即倒下，他的牌無法打出但仍會被抽到', () => {
    const s = battleState({ hand: ['thrust', 'phalanx', 'pulse'], allyHp: { leon: 0 } });
    for (const c of s.hand.filter((x) => x.cardId !== 'pulse')) {
      expect(canPlayCard(s, c.uid)).toEqual({ ok: false, reason: 'ownerDown' });
    }
    const pulse = s.hand.find((c) => c.cardId === 'pulse');
    expect(pulse && canPlayCard(s, pulse.uid).ok).toBe(true);
  });

  it('倒下的同伴不能成為目標', () => {
    const s = battleState({ hand: ['field'], allyHp: { agnes: 0 } });
    const field = s.hand[0];
    if (!field) throw new Error();
    const r = reduce(s, { type: 'PLAY_CARD', uid: field.uid, targetId: 'agnes' });
    expect(ofType(r.events, 'actionRejected')[0]?.reason).toBe('invalidTarget');
  });

  it('倒下者的牌在回合結束時照常進棄牌堆，之後仍會被抽到', () => {
    const s = battleState({ hand: ['herb', 'pulse'], allyHp: { agnes: 0 } });
    const herbUid = s.hand[0]?.uid;
    const r = endTurn(s);
    expect(ofType(r.events, 'discardHand')[0]?.uids).toContain(herbUid);
    // 抽牌堆是空的 → 洗棄牌堆 → 兩張又被抽回手上
    expect(ofType(r.events, 'shuffle')).toHaveLength(1);
    expect(r.state.hand.map((c) => c.cardId).sort()).toEqual(['herb', 'pulse']);
  });

  it('被打倒時發出 allyDown，敵人之後不再選他為目標', () => {
    const r = endTurn(
      battleState({
        hand: [],
        enemies: [{ hp: 50, intent: { kind: 'attack', damage: 10, hits: 1, targetId: 'agnes' } }],
        allyHp: { agnes: 5 },
      }),
    );
    expect(ofType(r.events, 'allyDown').map((e) => e.allyId)).toEqual(['agnes']);
    const nextIntent = enemy(r.state).intent;
    if (nextIntent?.kind === 'attack') expect(nextIntent.targetId).not.toBe('agnes');
  });

  it('三位同伴全部倒下 → 本輪失敗', () => {
    const r = endTurn(
      battleState({ hand: [], enemies: [{ hp: 50, intent: { kind: 'aoe', damage: 99 } }] }),
    );
    expect(r.state.phase).toBe('defeat');
    expect(ofType(r.events, 'runLost')).toHaveLength(1);
    expect(reduce(r.state, { type: 'END_TURN' }).events[0]).toMatchObject({ type: 'actionRejected', reason: 'phase' });
  });
});

describe('休息復活', () => {
  function toRest(patch: (s: GameState) => void) {
    let s = battleState({ hand: ['pulse'], enemies: [{ hp: 1 }], patch });
    s = play(s, 'pulse').state;
    s = reduce(s, { type: 'PICK_REWARD', cardId: null }).state;
    return reduce(s, { type: 'REMOVE_CARD', uid: null });
  }

  it('倒下的同伴以 ceil(maxHp × 0.3) 復活', () => {
    const r = toRest((s) => {
      ally(s, 'leon').hp = 0;
      ally(s, 'agnes').hp = 0;
      ally(s, 'ace').hp = 0;
    });
    expect(ally(r.state, 'leon').hp).toBe(15);
    expect(ally(r.state, 'agnes').hp).toBe(11);
    expect(ally(r.state, 'ace').hp).toBe(12);
    expect(ofType(r.events, 'revived')).toHaveLength(3);
  });

  it('其他同伴回復 ceil(maxHp × 0.25)，不超過上限', () => {
    const r = toRest((s) => {
      ally(s, 'leon').hp = 10;
      ally(s, 'agnes').hp = 30;
    });
    expect(ally(r.state, 'leon').hp).toBe(23);
    expect(ally(r.state, 'agnes').hp).toBe(36);
    expect(ally(r.state, 'ace').hp).toBe(40);
  });

  it('復活後的同伴下一場可以出牌', () => {
    const r = toRest((s) => (ally(s, 'leon').hp = 0));
    const leonCard = r.state.hand.find((c) => ['phalanx', 'thrust', 'bloodOath'].includes(c.cardId));
    if (leonCard) expect(canPlayCard(r.state, leonCard.uid).ok).toBe(true);
    expect(ally(r.state, 'leon').hp).toBeGreaterThan(0);
  });
});
