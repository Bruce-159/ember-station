// 一輪的流程、重現性、純函式

import { describe, expect, it } from 'vitest';
import { REWARD_POOL } from '../src/data/cards.ts';
import { ENCOUNTERS, ROUTE_LENGTH } from '../src/data/encounters.ts';
import { cloneState, reduce } from '../src/engine/reducer.ts';
import { createInitialState } from '../src/engine/run.ts';
import type { Action, CardId, GameState } from '../src/engine/types.ts';
import { autoplayRun, battleState, deepFreeze, newRun, ofType, play } from './helpers.ts';

/** 作弊：把目前戰鬥的敵人都打到 1 血，再用槍林彈雨清場 */
function winCurrentBattle(state: GameState): GameState {
  const s = cloneState(state);
  for (const e of s.enemies) {
    e.hp = Math.min(e.hp, 1);
    e.block = 0;
  }
  s.hand.push({ uid: s.nextUid, cardId: 'bulletRain' });
  s.nextUid += 1;
  s.energy = Math.max(s.energy, 1);
  return play(s, 'bulletRain').state;
}

describe('新的一輪', () => {
  it('設定種子、建立 17 張起始牌組、同伴滿血、進入第 1 場', () => {
    const r = reduce(createInitialState(), { type: 'NEW_RUN', seed: 42 });
    const s = r.state;
    expect(s.seed).toBe(42);
    expect(s.deck).toHaveLength(17);
    expect(new Set(s.deck.map((c) => c.uid)).size).toBe(17);
    expect(s.allies.map((a) => [a.id, a.hp, a.maxHp])).toEqual([
      ['leon', 50, 50],
      ['agnes', 36, 36],
      ['ace', 40, 40],
    ]);
    expect(s.phase).toBe('battle');
    const first = ENCOUNTERS[s.route[0]!];
    expect(s.enemies.map((e) => e.name)).toEqual(first.enemies.map((e) => e.name));
    expect(ofType(r.events, 'routeBuilt')[0]?.route).toEqual(s.route);
    expect(ofType(r.events, 'battleStarted')[0]).toMatchObject({ battleIndex: 0, encounterId: s.route[0], title: first.title });
    expect(ofType(r.events, 'intentChosen')).toHaveLength(2);
  });

  it('戰鬥中也可以重新開始一輪', () => {
    const s = reduce(battleState({ allyHp: { leon: 3 } }), { type: 'NEW_RUN', seed: 5 }).state;
    expect(s.allies[0]?.hp).toBe(50);
    expect(s.battleIndex).toBe(0);
  });
});

describe('選牌', () => {
  it('從獎勵卡池隨機抽 3 張不重複的牌', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const s = winCurrentBattle(newRun(seed));
      expect(s.phase).toBe('reward');
      expect(s.rewardOptions).toHaveLength(3);
      expect(new Set(s.rewardOptions).size).toBe(3);
      for (const id of s.rewardOptions) expect(REWARD_POOL).toContain(id);
    }
  });

  it('選 1 張加入牌組', () => {
    const s = winCurrentBattle(newRun(3));
    const pick = s.rewardOptions[1] as CardId;
    const r = reduce(s, { type: 'PICK_REWARD', cardId: pick });
    expect(r.state.deck).toHaveLength(18);
    expect(r.state.deck.at(-1)?.cardId).toBe(pick);
    expect(r.state.phase).toBe('remove');
  });

  it('可以跳過', () => {
    const r = reduce(winCurrentBattle(newRun(3)), { type: 'PICK_REWARD', cardId: null });
    expect(r.state.deck).toHaveLength(17);
    expect(r.state.phase).toBe('remove');
  });

  it('不能選不在選項中的牌', () => {
    const s = winCurrentBattle(newRun(3));
    const notOffered = REWARD_POOL.find((id) => !s.rewardOptions.includes(id)) as CardId;
    const r = reduce(s, { type: 'PICK_REWARD', cardId: notOffered });
    expect(r.state).toBe(s);
    expect(r.events[0]).toMatchObject({ type: 'actionRejected', reason: 'invalidChoice' });
  });
});

describe('移除與下一場', () => {
  function atRemove(seed = 3): GameState {
    return reduce(winCurrentBattle(newRun(seed)), { type: 'PICK_REWARD', cardId: null }).state;
  }

  it('從牌組移除 1 張牌，然後開始下一場', () => {
    const s = atRemove();
    const target = s.deck.find((c) => c.cardId === 'pulse');
    if (!target) throw new Error();
    const r = reduce(s, { type: 'REMOVE_CARD', uid: target.uid });
    expect(r.state.deck).toHaveLength(16);
    expect(r.state.deck.some((c) => c.uid === target.uid)).toBe(false);
    expect(r.state.battleIndex).toBe(1);
    expect(r.state.phase).toBe('battle');
    expect(ofType(r.events, 'cardRemoved')[0]).toMatchObject({ uid: target.uid, cardId: 'pulse' });
  });

  it('可以跳過移除', () => {
    const r = reduce(atRemove(), { type: 'REMOVE_CARD', uid: null });
    expect(r.state.deck).toHaveLength(17);
    expect(r.state.battleIndex).toBe(1);
  });

  it('不在牌組中的 uid 會被拒絕', () => {
    const s = atRemove();
    expect(reduce(s, { type: 'REMOVE_CARD', uid: 99999 }).events[0]).toMatchObject({ reason: 'invalidChoice' });
  });

  it('新戰鬥開始時：整副牌組洗成抽牌堆，清空棄牌堆與移除區，重置能力、手氣、增幅、出千', () => {
    let s = atRemove();
    s = cloneState(s);
    s.powers = { noRetreat: true, lingeringPoison: true, loadedDice: true };
    s.luck = 4;
    s.ampCharges = 2;
    s.rigged = true;
    s.exhausted = [{ uid: 9999, cardId: 'overload' }];
    s = reduce(s, { type: 'REMOVE_CARD', uid: null }).state;
    expect(s.powers).toEqual({ noRetreat: false, lingeringPoison: false, loadedDice: false });
    expect(s).toMatchObject({ luck: 0, ampCharges: 0, rigged: false, turn: 1 });
    expect(s.exhausted).toEqual([]);
    expect(s.discard).toEqual([]);
    expect(s.hand.length + s.drawPile.length).toBe(17);
  });
});

describe('一輪的終點', () => {
  it('依序打完 10 場 → 本輪勝利（第 10 場後沒有選牌）', () => {
    let s = newRun(11);
    const titles: string[] = [];
    for (let i = 0; i < ROUTE_LENGTH; i++) {
      expect(s.battleIndex).toBe(i);
      titles.push(ENCOUNTERS[s.route[s.battleIndex]!].title);
      const r = reduce(s, { type: 'END_TURN' }); // 確認一般回合不會出錯
      s = r.state.phase === 'battle' ? r.state : s;
      s = winCurrentBattle(s);
      if (i < ROUTE_LENGTH - 1) {
        expect(s.phase).toBe('reward');
        s = reduce(s, { type: 'PICK_REWARD', cardId: s.rewardOptions[0] ?? null }).state;
        s = reduce(s, { type: 'REMOVE_CARD', uid: null }).state;
      }
    }
    expect(s.phase).toBe('victory');
    expect(s.rewardOptions).toEqual([]);
    expect(s.deck).toHaveLength(17 + 9);
    expect(titles).toEqual(s.route.map((id) => ENCOUNTERS[id].title));
  });

  it('勝利或失敗後，除了 NEW_RUN 以外的動作都會被拒絕', () => {
    const s: GameState = { ...battleState(), phase: 'victory' };
    const actions: Action[] = [
      { type: 'END_TURN' },
      { type: 'PLAY_CARD', uid: s.hand[0]?.uid ?? 0 },
      { type: 'PICK_REWARD', cardId: null },
      { type: 'REMOVE_CARD', uid: null },
    ];
    for (const a of actions) expect(reduce(s, a).events[0]).toMatchObject({ type: 'actionRejected', reason: 'phase' });
  });
});

describe('重現性', () => {
  it('同一種子、同一串動作 → 完全相同的最終狀態', () => {
    const a = autoplayRun(2024);
    const b = autoplayRun(2024);
    expect(a.actions).toEqual(b.actions);
    expect(a.state).toEqual(b.state);
    expect(['victory', 'defeat']).toContain(a.state.phase);
  });

  it('重播記錄下來的動作，得到相同狀態與事件', () => {
    const { state, actions } = autoplayRun(77);
    const replay = (acts: Action[]) => {
      let s = createInitialState();
      const events: unknown[] = [];
      for (const act of acts) {
        const r = reduce(s, act);
        s = r.state;
        events.push(...r.events);
      }
      return { s, events };
    };
    const first = replay(actions);
    const second = replay(actions);
    expect(first.s).toEqual(state);
    expect(second.events).toEqual(first.events);
  });

  it('不同種子會走出不同的局面', () => {
    const results = [1, 2, 3, 4, 5].map((seed) => JSON.stringify(newRun(seed).hand));
    expect(new Set(results).size).toBeGreaterThan(1);
  });

  it('自動遊玩多個種子都能正常結束', () => {
    for (let seed = 100; seed < 120; seed++) {
      const { state } = autoplayRun(seed);
      expect(['victory', 'defeat']).toContain(state.phase);
    }
  });
});

describe('純函式', () => {
  it('reduce 不修改傳入的狀態（輸入被深度凍結也能運作）', () => {
    const base = battleState({ hand: ['amp', 'pulse', 'herb'], enemies: [{ hp: 100, poison: 2 }] });
    const snapshot = JSON.parse(JSON.stringify(base)) as GameState;
    deepFreeze(base);
    const r1 = play(base, 'amp');
    const r2 = play(r1.state, 'pulse');
    const r3 = reduce(base, { type: 'END_TURN' });
    expect(JSON.parse(JSON.stringify(base))).toEqual(snapshot);
    expect(r1.state).not.toBe(base);
    expect(r2.state).not.toBe(r1.state);
    expect(r3.state.turn).toBe(2);
  });

  it('選牌與移除也不修改輸入', () => {
    const atReward = deepFreeze(winCurrentBattle(newRun(8)));
    const atRemove = deepFreeze(reduce(atReward, { type: 'PICK_REWARD', cardId: atReward.rewardOptions[0] ?? null }).state);
    expect(() => reduce(atRemove, { type: 'REMOVE_CARD', uid: atRemove.deck[0]?.uid ?? null })).not.toThrow();
  });

  it('同一個輸入呼叫兩次，結果相同', () => {
    const base = deepFreeze(newRun(9));
    expect(reduce(base, { type: 'END_TURN' })).toEqual(reduce(base, { type: 'END_TURN' }));
  });
});
