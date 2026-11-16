// 第 11 節「對照清單」的六個情境，各一個引擎測試

import { describe, expect, it } from 'vitest';
import { canPlayCard, reduce } from '../src/engine/reducer.ts';
import { ally, battleState, enemy, ofType, play, playAll, rngStateWhere } from './helpers.ts';

describe('對照清單', () => {
  it('1. 增幅後打出毒草，敵人獲得 8 層中毒', () => {
    const s = playAll(battleState({ hand: ['amp', 'herb'], enemies: [{ hp: 50 }] }), 'amp', 'herb');
    expect(enemy(s).poison).toBe(8);
  });

  it('2. 解析後用脈衝攻擊，造成 9 點傷害', () => {
    const r = play(play(battleState({ hand: ['analyze', 'pulse'], enemies: [{ hp: 50 }] }), 'analyze').state, 'pulse');
    expect(ofType(r.events, 'damage')[0]?.amount).toBe(9);
    expect(enemy(r.state).hp).toBe(41);
  });

  it('3. 雷翁生命降到一半以下時，突刺打兩次', () => {
    const r = play(battleState({ hand: ['thrust'], enemies: [{ hp: 50 }], allyHp: { leon: 24 } }), 'thrust');
    expect(ofType(r.events, 'damage').map((e) => e.amount)).toEqual([8, 8]);
  });

  it('4. 袖裡藏牌後打出孤注一擲必定成功，同回合袖裡藏牌變為停用', () => {
    // 亂數設定為任何擲骰都會失敗，證明成功來自出千
    let s = battleState({
      hand: ['sleeve', 'allIn', 'sleeve'],
      enemies: [{ hp: 50 }],
      patch: (st) => (st.rngState = rngStateWhere((v) => v >= 0.9)),
    });
    s = play(s, 'sleeve').state;
    const r = play(s, 'allIn');
    expect(ofType(r.events, 'bet')[0]).toMatchObject({ success: true, reason: 'rigged' });
    expect(enemy(r.state).hp).toBe(34);
    const otherSleeve = r.state.hand.find((c) => c.cardId === 'sleeve');
    if (!otherSleeve) throw new Error('應該還有一張袖裡藏牌');
    expect(canPlayCard(r.state, otherSleeve.uid)).toEqual({ ok: false, reason: 'oncePerTurn' });
  });

  it('5. 雷翁倒下後，他的牌停用且無法打出；戰鬥結束後以 30% 生命復活', () => {
    let s = battleState({ hand: ['thrust', 'pulse'], enemies: [{ hp: 6 }], allyHp: { leon: 0 } });
    const thrust = s.hand.find((c) => c.cardId === 'thrust');
    if (!thrust) throw new Error();
    expect(canPlayCard(s, thrust.uid)).toEqual({ ok: false, reason: 'ownerDown' });
    const rejected = reduce(s, { type: 'PLAY_CARD', uid: thrust.uid, targetId: 'e0' });
    expect(rejected.state).toBe(s);

    s = play(s, 'pulse').state; // 擊殺 → 勝利
    s = reduce(s, { type: 'PICK_REWARD', cardId: null }).state;
    s = reduce(s, { type: 'REMOVE_CARD', uid: null }).state;
    expect(ally(s, 'leon').hp).toBe(15);
  });

  it('6. 打出餘毒後，敵人中毒層數不再減少', () => {
    let s = playAll(battleState({ hand: ['herb', 'lingeringPoison'], enemies: [{ hp: 100 }] }), 'herb', 'lingeringPoison');
    for (let turn = 0; turn < 3; turn++) s = reduce(s, { type: 'END_TURN' }).state;
    expect(enemy(s).poison).toBe(4);
    expect(enemy(s).hp).toBe(100 - 12);
  });
});
