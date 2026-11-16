// 影格：UI 依序播放敵人行動用的狀態快照

import { describe, expect, it } from 'vitest';
import { reduce } from '../src/engine/reducer.ts';
import type { Action, GameState, ReduceResult } from '../src/engine/types.ts';
import { autoplayRun, battleState, freshRun, newRun } from './helpers.ts';

function checkInvariants(r: ReduceResult) {
  const frames = r.frames;
  if (!frames) throw new Error('應該要有影格');
  expect(frames.length).toBeGreaterThan(0);
  expect(frames.flatMap((f) => f.events)).toEqual(r.events);
  expect(frames.at(-1)?.state).toBe(r.state);
}

describe('影格', () => {
  it('預設不產生影格（模擬器不需要負擔）', () => {
    expect(reduce(newRun(1), { type: 'END_TURN' }).frames).toBeUndefined();
  });

  it('開啟影格不影響狀態與事件', () => {
    const s = newRun(3);
    const plain = reduce(s, { type: 'END_TURN' });
    const framed = reduce(s, { type: 'END_TURN' }, { frames: true });
    expect(framed.state).toEqual(plain.state);
    expect(framed.events).toEqual(plain.events);
  });

  it('結束回合：棄牌一格、每個存活敵人一格、下一回合一格', () => {
    const s = battleState({
      hand: ['pulse'],
      enemies: [
        { hp: 50, intent: { kind: 'attack', damage: 5, hits: 1, targetId: 'leon' } },
        { hp: 0 },
        { hp: 50, intent: { kind: 'attack', damage: 7, hits: 1, targetId: 'agnes' } },
      ],
    });
    const r = reduce(s, { type: 'END_TURN' }, { frames: true });
    checkInvariants(r);
    const frames = r.frames ?? [];
    expect(frames.map((f) => f.events[0]?.type)).toEqual(['discardHand', 'enemyTurn', 'enemyTurn', 'turnStarted']);
    // 第一個敵人行動後，雷翁已受傷、阿格妮絲還沒
    const afterFirst = frames[1]?.state as GameState;
    expect(afterFirst.allies.map((a) => a.hp)).toEqual([45, 36, 40]);
    expect((frames[2]?.state as GameState).allies.map((a) => a.hp)).toEqual([45, 29, 40]);
  });

  it('影格是獨立的快照，之後的結算不會改到前面的影格', () => {
    // 有手牌 → 第一格是棄牌（敵人還沒行動）
    const s = battleState({ hand: ['pulse'], enemies: [{ hp: 50, intent: { kind: 'aoe', damage: 5 } }] });
    const frames = reduce(s, { type: 'END_TURN' }, { frames: true }).frames ?? [];
    expect(frames[0]?.state.allies[0]?.hp).toBe(50);
    expect(frames[1]?.state.allies[0]?.hp).toBe(45);
  });

  it('出牌擊殺最後一個敵人：先停在敵人倒下的那一格，再進入選牌', () => {
    const s = battleState({ hand: ['pulse'], enemies: [{ hp: 3 }] });
    const r = reduce(s, { type: 'PLAY_CARD', uid: s.hand[0]!.uid, targetId: 'e0' }, { frames: true });
    checkInvariants(r);
    const frames = r.frames ?? [];
    expect(frames.map((f) => f.state.phase)).toEqual(['battle', 'reward']);
    expect(frames[0]?.state.enemies[0]?.hp).toBe(0);
  });

  it('全滅：最後一格是失敗', () => {
    const s = battleState({ hand: [], enemies: [{ hp: 50, intent: { kind: 'aoe', damage: 99 } }, { hp: 50 }] });
    const r = reduce(s, { type: 'END_TURN' }, { frames: true });
    checkInvariants(r);
    expect(r.frames?.map((f) => f.state.phase)).toEqual(['battle', 'defeat']);
  });

  it('被拒絕的動作沒有影格', () => {
    expect(reduce(newRun(1), { type: 'PICK_REWARD', cardId: null }, { frames: true }).frames).toBeUndefined();
  });

  it('整輪的每個動作都滿足影格不變式', () => {
    const { actions } = autoplayRun(55);
    let s = freshRun(55);
    for (const a of actions.slice(1) as Action[]) {
      const r = reduce(s, a, { frames: true });
      checkInvariants(r);
      s = r.state;
    }
  });
});
