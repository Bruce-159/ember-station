// 手感：事件 → 浮動數字、影格播放時序

import { describe, expect, it } from 'vitest';
import { reduce } from '../src/engine/reducer.ts';
import type { Frame, GameEvent } from '../src/engine/types.ts';
import {
  actingEnemy,
  ENEMY_STEP_MS,
  eventsToEffects,
  frameSchedule,
  latestHit,
  relicEffectTarget,
  RESULT_HOLD_MS,
} from '../src/ui/effects.ts';
import { initUi, uiReducer } from '../src/ui/uiState.ts';
import { battleState } from './helpers.ts';

describe('浮動數字', () => {
  it('傷害、格擋、回復、中毒都會跳出數字', () => {
    const events: GameEvent[] = [
      { type: 'damage', targetId: 'e0', amount: 9, blocked: 0, source: 'lucian', sourceId: 'lucian' },
      { type: 'block', targetId: 'leon', amount: 8 },
      { type: 'heal', targetId: 'agnes', amount: 6 },
      { type: 'poison', targetId: 'e1', amount: 4, total: 4 },
    ];
    expect(eventsToEffects(events, 1).map((e) => [e.targetId, e.text, e.tone])).toEqual([
      ['e0', '−9', 'damage'],
      ['leon', '+8 格擋', 'block'],
      ['agnes', '+6', 'heal'],
      ['e1', '+4 毒', 'poison'],
    ]);
  });

  it('受到實際傷害才震動；被格擋全部擋下時改顯示擋下的量', () => {
    const [hit] = eventsToEffects([{ type: 'damage', targetId: 'leon', amount: 3, blocked: 0, source: 'enemy', sourceId: 'e0' }], 1);
    expect(hit?.hit).toBe(true);
    const blocked = eventsToEffects([{ type: 'damage', targetId: 'leon', amount: 0, blocked: 6, source: 'enemy', sourceId: 'e0' }], 1);
    expect(blocked.map((e) => e.text)).toEqual(['擋 6']);
    const partial = eventsToEffects([{ type: 'damage', targetId: 'leon', amount: 2, blocked: 4, source: 'enemy', sourceId: 'e0' }], 1);
    expect(partial.map((e) => e.text)).toEqual(['−2', '擋 4']);
  });

  it('中毒傷害用中毒的顏色；回復 0 不顯示', () => {
    const [p] = eventsToEffects([{ type: 'damage', targetId: 'e0', amount: 4, blocked: 0, source: 'poison', sourceId: null }], 1);
    expect(p?.tone).toBe('poison');
    expect(eventsToEffects([{ type: 'heal', targetId: 'ace', amount: 0 }], 1)).toEqual([]);
  });

  it('id 連號遞增', () => {
    const list = eventsToEffects(
      [
        { type: 'block', targetId: 'leon', amount: 1 },
        { type: 'block', targetId: 'ace', amount: 1 },
      ],
      10,
    );
    expect(list.map((e) => e.id)).toEqual([10, 11]);
  });

  it('實際出牌產生的事件：增幅後毒草 → 盧西安「增幅」與敵人「+8 毒」', () => {
    let s = battleState({ hand: ['amp', 'herb'], enemies: [{ hp: 40 }] });
    const r1 = reduce(s, { type: 'PLAY_CARD', uid: s.hand[0]!.uid });
    s = r1.state;
    const r2 = reduce(s, { type: 'PLAY_CARD', uid: s.hand[0]!.uid, targetId: 'e0' });
    expect(eventsToEffects(r1.events, 1).map((e) => e.text)).toEqual(['增幅 ×1']);
    expect(eventsToEffects(r2.events, 1).map((e) => e.text)).toEqual(['+8 毒']);
  });

  it('遺物生效 → 對應徽章的效果（用來閃動）', () => {
    const [e] = eventsToEffects([{ type: 'relicTriggered', relicId: 'warmAmp' }], 1);
    expect(e).toMatchObject({ targetId: relicEffectTarget('warmAmp'), tone: 'ember', hit: false });
    expect(relicEffectTarget('warmAmp')).toBe('relic:warmAmp');
  });

  it('latestHit 找出該單位最近一次受擊', () => {
    const list = eventsToEffects(
      [
        { type: 'damage', targetId: 'leon', amount: 3, blocked: 0, source: 'enemy', sourceId: 'e0' },
        { type: 'block', targetId: 'leon', amount: 5 },
        { type: 'damage', targetId: 'leon', amount: 2, blocked: 0, source: 'enemy', sourceId: 'e1' },
      ],
      1,
    );
    expect(latestHit(list, 'leon')).toBe(3);
    expect(latestHit(list, 'ace')).toBe(0);
  });
});

describe('影格播放時序', () => {
  const frames = (phases: string[]): Frame[] =>
    phases.map((phase) => ({ state: { ...battleState(), phase } as Frame['state'], events: [] }));

  it('第一格立即顯示，之後每個敵人間隔 400 毫秒', () => {
    expect(frameSchedule(frames(['battle', 'battle', 'battle', 'battle']))).toEqual([0, 400, 800, 1200]);
    expect(ENEMY_STEP_MS).toBe(400);
  });

  it('戰鬥結束前多停一下，讓玩家看到最後一擊', () => {
    expect(frameSchedule(frames(['battle', 'reward']))).toEqual([0, RESULT_HOLD_MS]);
    expect(frameSchedule(frames(['battle', 'battle', 'defeat']))).toEqual([0, 400, 400 + RESULT_HOLD_MS]);
    expect(frameSchedule(frames(['battle', 'relicChoice']))).toEqual([0, RESULT_HOLD_MS]);
  });

  it('實際結束回合：棄牌 → 敵人 e0 → 敵人 e1 → 新回合', () => {
    const s = battleState({
      hand: ['pulse'],
      enemies: [
        { hp: 30, intent: { kind: 'attack', damage: 3, hits: 1, targetId: 'leon' } },
        { hp: 30, intent: { kind: 'attack', damage: 3, hits: 1, targetId: 'ace' } },
      ],
    });
    const f = reduce(s, { type: 'END_TURN' }, { frames: true }).frames ?? [];
    expect(f.map(actingEnemy)).toEqual([null, 'e0', 'e1', null]);
    expect(frameSchedule(f)).toEqual([0, 400, 800, 1200]);
  });
});

describe('UI 狀態保存影格', () => {
  it('每個成功的動作都更新影格並遞增序號；被拒絕的動作不變', () => {
    const s = battleState({ hand: ['pulse'], enemies: [{ hp: 30 }] });
    const ui0 = initUi(s, 5);
    const ui1 = uiReducer(ui0, { type: 'game', action: { type: 'END_TURN' } });
    expect(ui1.seq).toBe(6);
    expect(ui1.frames.at(-1)?.state).toBe(ui1.game);
    const rejected = uiReducer(ui1, { type: 'game', action: { type: 'PICK_REWARD', cardId: null } });
    expect(rejected.seq).toBe(6);
    expect(rejected.frames).toBe(ui1.frames);
  });

  it('讀檔與回到標題時清空影格，序號仍繼續遞增', () => {
    const ui1 = uiReducer(initUi(battleState(), 3), { type: 'game', action: { type: 'END_TURN' } });
    const loaded = uiReducer(ui1, { type: 'load', game: battleState() });
    expect(loaded.frames).toEqual([]);
    expect(loaded.seq).toBe(ui1.seq + 1);
    expect(uiReducer(loaded, { type: 'toTitle' }).seq).toBe(loaded.seq + 1);
  });
});
