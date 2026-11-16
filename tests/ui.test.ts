// UI 純邏輯：畫面資料、紀錄文字、存檔、UI 狀態機（不需要 DOM）

import { describe, expect, it } from 'vitest';
import { cloneState, reduce } from '../src/engine/reducer.ts';
import { createInitialState, startBattle } from '../src/engine/run.ts';
import type { GameEvent, GameState } from '../src/engine/types.ts';
import { eventToText } from '../src/ui/eventText.ts';
import { deserialize, isValidState, loadSave, SAVE_KEY, SAVE_VERSION, serialize, writeSave, type StorageLike } from '../src/ui/save.ts';
import { initUi, keyToChoiceIndex, keyToHandIndex, pendingTarget, uiReducer, type UiState } from '../src/ui/uiState.ts';
import { allyTags, enemyTags, handCardView, intentView, nextStop, previewCardView, relicView, restPreview, routeView, sortedDeck } from '../src/ui/view.ts';
import { ally, autoplayRun, battleState, enemy, freshRun, newRun, play } from './helpers.ts';

function memoryStorage(): StorageLike & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

const uiWith = (game: GameState): UiState => ({ ...initUi(game) });

describe('卡牌顯示', () => {
  it('共鳴水晶：卡面顯示 ×3 與實際傷害', () => {
    const s = battleState({
      hand: ['pulse'],
      patch: (st) => {
        st.ampCharges = 1;
        st.relics = ['resonanceCrystal'];
      },
    });
    const v = handCardView(s, s.hand[0]!);
    expect(v).toMatchObject({ multiplier: 3, amplified: true });
    expect(v.description).toContain('18');
    expect(previewCardView('pulse').multiplier).toBe(1);
  });

  it('被增幅的牌即時顯示加倍後的數字並標註增幅', () => {
    const s = battleState({ hand: ['pulse', 'amp'], patch: (st) => (st.ampCharges = 1) });
    const pulse = handCardView(s, s.hand[0]!);
    expect(pulse.amplified).toBe(true);
    expect(pulse.description).toContain('12');
    // 增幅類不吃增幅
    expect(handCardView(s, s.hand[1]!).amplified).toBe(false);
  });

  it('無法打出的牌註明原因：能量不足、持有者倒下、本回合已使用', () => {
    const s = battleState({ hand: ['overload', 'thrust', 'sleeve'], energy: 1, allyHp: { leon: 0 }, patch: (st) => (st.sleeveUsed = true) });
    expect(s.hand.map((c) => handCardView(s, c).disabledReason)).toEqual(['能量不足', '持有者已倒下', '本回合已使用']);
  });

  it('下注牌顯示成功率；出千時顯示必定成功', () => {
    const s = battleState({ hand: ['allIn'], patch: (st) => (st.luck = 2) });
    expect(handCardView(s, s.hand[0]!).description).toContain('70%');
    s.rigged = true;
    expect(handCardView(s, s.hand[0]!).description).toContain('必定成功');
  });

  it('背水時方陣與突刺的文字跟著改變', () => {
    const s = battleState({ hand: ['phalanx', 'thrust'], allyHp: { leon: 20 } });
    expect(handCardView(s, s.hand[0]!).description).toContain('12');
    expect(handCardView(s, s.hand[1]!).description).toContain('兩次');
  });

  it('獎勵預覽不依賴戰鬥狀態', () => {
    expect(previewCardView('wildfire')).toMatchObject({ name: '野火', cost: 2, ownerName: '阿格妮絲', playable: true });
  });

  it('牌組依角色排序：盧西安、雷翁、阿格妮絲、艾斯', () => {
    const owners = sortedDeck(newRun(1).deck).map((c) => c.cardId);
    expect(owners.slice(0, 6)).toEqual(['amp', 'analyze', 'field', 'field', 'field', 'pulse']);
    expect(owners.at(-1)).toBe('sleeve');
  });
});

describe('意圖與狀態標籤', () => {
  it('意圖顯示目標名字與實際傷害（含攻擊力）', () => {
    const s = battleState({ enemies: [{ hp: 10, strength: 2, intent: { kind: 'attack', damage: 9, hits: 2, targetId: 'agnes' } }] });
    expect(intentView(s, enemy(s))).toEqual({ kind: 'attack', label: '攻擊 阿格妮絲', detail: '11 × 2' });
  });

  it('目標已倒下時提示會重新選擇', () => {
    const s = battleState({ enemies: [{ hp: 10, intent: { kind: 'attack', damage: 5, hits: 1, targetId: 'ace' } }], allyHp: { ace: 0 } });
    expect(intentView(s, enemy(s))?.label).toContain('隨機同伴');
  });

  it('全體攻擊與防禦', () => {
    const s = battleState({
      enemies: [{ hp: 10, strength: 1, intent: { kind: 'aoe', damage: 5 } }, { hp: 10, intent: { kind: 'defend', block: 6, strength: 2 } }],
    });
    expect(intentView(s, enemy(s, 'e0'))?.detail).toBe('每人 6');
    expect(intentView(s, enemy(s, 'e1'))?.detail).toBe('格擋 6，攻擊力 +2');
  });

  it('死亡的敵人不顯示意圖', () => {
    const s = battleState({ enemies: [{ hp: 0 }] });
    expect(intentView(s, enemy(s))).toBeNull();
    expect(enemyTags(enemy(s))).toEqual([{ text: '已消散', tone: 'danger' }]);
  });

  it('同伴標籤：背水、反擊、手氣、出千、能力', () => {
    const s = battleState({
      allyHp: { leon: 20 },
      patch: (st) => {
        ally(st, 'leon').thorns = 5;
        st.powers.noRetreat = true;
        st.powers.loadedDice = true;
        st.rigged = true;
        st.luck = 2;
      },
    });
    expect(allyTags(s, ally(s, 'leon')).map((t) => t.text)).toEqual(['反擊 5', '背水', '不退']);
    expect(allyTags(s, ally(s, 'ace')).map((t) => t.text)).toEqual(['手氣 2', '出千中', '灌鉛骰子']);
  });

  it('休息預覽與實際休息結果一致', () => {
    let s = battleState({ hand: ['pulse'], enemies: [{ hp: 1 }], allyHp: { leon: 0, agnes: 30 } });
    s = play(s, 'pulse').state;
    s = reduce(s, { type: 'PICK_REWARD', cardId: null }).state;
    const preview = restPreview(s);
    const after = reduce(s, { type: 'REMOVE_CARD', uid: null }).state;
    expect(preview.map((p) => p.to)).toEqual(after.allies.map((a) => a.hp));
    expect(preview[0]).toMatchObject({ revived: true, to: 15 });
  });

  it('有旅人的水壺時，休息預覽也是 40%', () => {
    let s = battleState({ hand: ['pulse'], enemies: [{ hp: 1 }], allyHp: { agnes: 10 }, patch: (st) => (st.relics = ['travelersFlask']) });
    s = play(s, 'pulse').state;
    s = reduce(s, { type: 'PICK_REWARD', cardId: null }).state;
    const preview = restPreview(s);
    const after = reduce(s, { type: 'REMOVE_CARD', uid: null }).state;
    expect(preview.map((p) => p.to)).toEqual(after.allies.map((a) => a.hp));
    expect(preview[1]?.to).toBe(25);
  });
});

describe('媒介物品與路線的畫面資料', () => {
  it('遺物：名稱、縮寫、方向、說明', () => {
    expect(relicView('sacredOath')).toMatchObject({ name: '聖隊的誓約', short: '聖', theme: 'leon', themeName: '雷翁' });
    expect(relicView('sacredOath').description).toContain('60%');
  });

  it('路線：已通過／目前／未到，標出精英與 Boss', () => {
    const s = cloneState(newRun(2));
    startBattle({ state: s, events: [] }, 4);
    const stops = routeView(s);
    expect(stops).toHaveLength(10);
    expect(stops.map((x) => x.status)).toEqual(['done', 'done', 'done', 'done', 'current', 'upcoming', 'upcoming', 'upcoming', 'upcoming', 'upcoming']);
    expect([stops[3]?.kind, stops[6]?.kind, stops[9]?.kind, stops[0]?.kind]).toEqual(['elite', 'elite', 'boss', 'normal']);
  });

  it('下一站：開局選遺物時是第 1 場；戰鬥中是下一場；最後一場之後沒有', () => {
    expect(nextStop(freshRun(2))?.index).toBe(0);
    expect(nextStop(newRun(2))?.index).toBe(1);
    const last = cloneState(newRun(2));
    startBattle({ state: last, events: [] }, 9);
    expect(nextStop(last)).toBeNull();
  });

  it('選遺物的鍵盤：只有 1–選項數有作用', () => {
    expect(['1', '2', '3', '4', '0', 'a'].map((k) => keyToChoiceIndex(k, 3))).toEqual([0, 1, 2, null, null, null]);
    expect(keyToChoiceIndex('2', 1)).toBeNull();
  });
});

describe('戰鬥紀錄文字', () => {
  it('完整一輪的所有事件都能轉成文字或略過，不會出錯', () => {
    const { actions } = autoplayRun(31);
    let s = createInitialState();
    const types = new Set<string>();
    for (const a of actions) {
      const r = reduce(s, a);
      s = r.state;
      for (const e of r.events) {
        types.add(e.type);
        const t = eventToText(e, s);
        if (t) expect(t.text.length).toBeGreaterThan(0);
      }
    }
    expect(types.size).toBeGreaterThan(15);
  });

  it('常見事件的文字', () => {
    const s = battleState({ enemies: [{ hp: 10 }] });
    const t = (e: GameEvent) => eventToText(e, s)?.text;
    expect(t({ type: 'cardPlayed', uid: 1, cardId: 'herb', multiplier: 2, targetId: 'e0' })).toBe('阿格妮絲打出「毒草」（增幅） → 「測試敵人e0」');
    expect(t({ type: 'damage', targetId: 'e0', amount: 9, blocked: 0, source: 'lucian', sourceId: 'lucian' })).toBe('盧西安對「測試敵人e0」造成 9 點傷害');
    expect(t({ type: 'damage', targetId: 'leon', amount: 3, blocked: 5, source: 'enemy', sourceId: 'e0' })).toBe('「測試敵人e0」攻擊雷翁，造成 3 點傷害（格擋擋下 5）');
    expect(t({ type: 'bet', success: false, reason: 'roll', chance: 0.6, luck: 2 })).toBe('下注失敗（成功率 60%），手氣累積到 2');
    expect(t({ type: 'cardPlayed', uid: 1, cardId: 'pulse', multiplier: 3, targetId: 'e0' })).toBe('盧西安打出「脈衝」（增幅 ×3） → 「測試敵人e0」');
    expect(t({ type: 'relicGained', relicId: 'warmAmp' })).toBe('獲得媒介物品「預熱的增幅器」');
    expect(t({ type: 'relicTriggered', relicId: 'pyreEmber' })).toBe('媒介物品「火刑柱的餘燼」生效');
    expect(t({ type: 'relicOffered', relicIds: ['warmAmp'] })).toBeUndefined();
    expect(t({ type: 'bet', success: true, reason: 'rigged', chance: 1, luck: 0 })).toBe('下注成功（出千）');
    expect(t({ type: 'allyDown', allyId: 'leon' })).toContain('雷翁倒下了');
    expect(t({ type: 'heal', targetId: 'ace', amount: 0 })).toBeUndefined();
    expect(t({ type: 'draw', uids: [1] })).toBeUndefined();
  });
});

describe('存檔', () => {
  it('序列化後讀回得到相同狀態', () => {
    const s = newRun(5);
    expect(deserialize(serialize(s))).toEqual(s);
  });

  it('讀回的存檔可以繼續玩，結果與沒存檔時相同', () => {
    const s = newRun(6);
    const restored = deserialize(serialize(s));
    if (!restored) throw new Error('應該讀得回來');
    expect(reduce(restored, { type: 'END_TURN' }).state).toEqual(reduce(s, { type: 'END_TURN' }).state);
  });

  it('格式錯誤、版本不符、內容不完整都回傳 null', () => {
    expect(deserialize(null)).toBeNull();
    expect(deserialize('{壞掉的 json')).toBeNull();
    expect(deserialize(JSON.stringify({ version: 999, state: newRun(1) }))).toBeNull();
    expect(deserialize(JSON.stringify({ version: SAVE_VERSION, state: { ...newRun(1), allies: [] } }))).toBeNull();
    expect(deserialize(JSON.stringify({ version: SAVE_VERSION, state: { ...newRun(1), hand: [{ uid: 1, cardId: 'notACard' }] } }))).toBeNull();
    expect(deserialize(JSON.stringify({ version: SAVE_VERSION, state: { ...newRun(1), battleIndex: 10 } }))).toBeNull();
    expect(isValidState({ ...newRun(1), phase: 'title' })).toBe(false);
  });

  it('開局選媒介物品時（還沒有敵人）也能存檔，讀回後可以繼續', () => {
    const s = freshRun(4);
    const restored = deserialize(serialize(s));
    expect(restored).toEqual(s);
    if (!restored) throw new Error('應該讀得回來');
    const pick = { type: 'PICK_RELIC', relicId: s.relicOptions[0]! } as const;
    expect(reduce(restored, pick).state).toEqual(reduce(s, pick).state);
  });

  it('第 1 版存檔不接續', () => {
    expect(deserialize(JSON.stringify({ version: 1, state: newRun(1) }))).toBeNull();
  });

  it('路線、遺物、旗標或選項不合法時回傳 null', () => {
    const bad = (patch: Record<string, unknown>, base: GameState = newRun(1)) =>
      deserialize(JSON.stringify({ version: SAVE_VERSION, state: { ...base, ...patch } }));
    expect(bad({})).not.toBeNull();
    expect(bad({ route: ['platform'] })).toBeNull();
    expect(bad({ route: [...newRun(1).route.slice(0, 9), 'nowhere'] })).toBeNull();
    expect(bad({ relics: ['notARelic'] })).toBeNull();
    expect(bad({ relics: ['warmAmp', 'warmAmp'] })).toBeNull();
    expect(bad({ relicFlags: { resonanceUsed: false } })).toBeNull();
    expect(bad({ afterRelic: 'shop' })).toBeNull();
    expect(bad({ enemies: [] })).toBeNull();
    expect(bad({ relicOptions: [] }, freshRun(1))).toBeNull();
  });

  it('進行中寫入存檔；勝利或失敗時清除', () => {
    const storage = memoryStorage();
    writeSave(newRun(1), storage);
    expect(loadSave(storage)?.seed).toBe(1);
    writeSave({ ...newRun(1), phase: 'defeat' }, storage);
    expect(storage.data.has(SAVE_KEY)).toBe(false);
  });

  it('標題畫面的空狀態不會覆蓋存檔', () => {
    const storage = memoryStorage();
    writeSave(newRun(2), storage);
    writeSave(createInitialState(), storage);
    expect(loadSave(storage)?.seed).toBe(2);
  });

  it('儲存空間丟出錯誤時不影響遊戲', () => {
    const broken: StorageLike = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('quota');
      },
      removeItem: () => {
        throw new Error('blocked');
      },
    };
    expect(() => writeSave(newRun(1), broken)).not.toThrow();
    expect(loadSave(broken)).toBeNull();
    expect(loadSave(null)).toBeNull();
  });
});

describe('UI 狀態機', () => {
  it('點需要目標的牌 → 選取；再點同一張 → 取消', () => {
    const s = battleState({ hand: ['pulse', 'field'] });
    const uid = s.hand[0]!.uid;
    let ui = uiReducer(uiWith(s), { type: 'clickCard', uid });
    expect(ui.selected).toBe(uid);
    expect(pendingTarget(ui)).toBe('enemy');
    ui = uiReducer(ui, { type: 'clickCard', uid });
    expect(ui.selected).toBeNull();
  });

  it('選取後點合法目標就打出；點不合法目標沒有反應', () => {
    const s = battleState({ hand: ['field'], enemies: [{ hp: 20 }] });
    let ui = uiReducer(uiWith(s), { type: 'clickCard', uid: s.hand[0]!.uid });
    expect(pendingTarget(ui)).toBe('ally');
    expect(uiReducer(ui, { type: 'clickTarget', targetId: 'e0' })).toBe(ui);
    ui = uiReducer(ui, { type: 'clickTarget', targetId: 'agnes' });
    expect(ally(ui.game, 'agnes').block).toBe(5);
    expect(ui.selected).toBeNull();
    expect(ui.log.some((l) => l.text.includes('力場'))).toBe(true);
  });

  it('不需要目標的牌點擊即打出', () => {
    const s = battleState({ hand: ['phalanx'] });
    const ui = uiReducer(uiWith(s), { type: 'clickCard', uid: s.hand[0]!.uid });
    expect(ally(ui.game, 'leon').block).toBe(8);
  });

  it('點無法打出的牌：不選取並提示原因', () => {
    const s = battleState({ hand: ['thrust'], allyHp: { leon: 0 } });
    const ui = uiReducer(uiWith(s), { type: 'clickCard', uid: s.hand[0]!.uid });
    expect(ui.selected).toBeNull();
    expect(ui.notice).toBe('「突刺」無法打出：持有者已倒下');
    expect(ui.game).toBe(s);
  });

  it('Esc 取消選取與提示', () => {
    const s = battleState({ hand: ['pulse'] });
    const ui = uiReducer(uiReducer(uiWith(s), { type: 'clickCard', uid: s.hand[0]!.uid }), { type: 'cancel' });
    expect(ui.selected).toBeNull();
  });

  it('被拒絕的動作不改變遊戲，只顯示提示', () => {
    const s = battleState();
    const ui = uiReducer(uiWith(s), { type: 'game', action: { type: 'PICK_REWARD', cardId: null } });
    expect(ui.game).toBe(s);
    expect(ui.notice).toBe('現在無法出牌');
  });

  it('新的一輪清空紀錄；紀錄新的在前、有上限', () => {
    let ui = uiReducer(initUi(), { type: 'game', action: { type: 'NEW_RUN', seed: 1 } });
    expect(ui.log.at(-1)?.text).toContain('新的一輪開始');
    for (let i = 0; i < 80; i++) ui = uiReducer(ui, { type: 'game', action: { type: 'END_TURN' } });
    expect(ui.log.length).toBeLessThanOrEqual(200);
    ui = uiReducer(ui, { type: 'game', action: { type: 'NEW_RUN', seed: 2 } });
    expect(ui.log.at(-1)?.text).toContain('種子 2');
  });

  it('讀取存檔與回到標題', () => {
    const loaded = uiReducer(initUi(), { type: 'load', game: newRun(4) });
    expect(loaded.game.seed).toBe(4);
    expect(loaded.log[0]?.text).toContain('已讀取存檔');
    expect(uiReducer(loaded, { type: 'toTitle' }).game.phase).toBe('title');
  });

  it('鍵盤 1–9、0 對應第 1–10 張手牌', () => {
    expect(['1', '5', '9', '0', 'e', 'Escape'].map(keyToHandIndex)).toEqual([0, 4, 8, 9, null, null]);
  });
});
