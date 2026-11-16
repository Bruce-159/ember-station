// 包裝 uiReducer：提供操作函式、自動存檔，以及事件動畫佇列。
//
// 動畫佇列：每個動作的 reduce 會回傳影格（見 engine/types.ts 的 Frame）。
// 這裡依 frameSchedule 的時間逐格顯示，並把每格的事件轉成浮動數字與震動。
// 播放中（busy）鎖住所有輸入，畫面顯示的是當下影格的狀態（view），不是最終狀態。

import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import type { CardId, GameState } from '../../engine/types.ts';
import { actingEnemy, eventsToEffects, FLOATER_MS, frameSchedule, type Effect } from '../effects.ts';
import { clearSave, loadSave, writeSave } from '../save.ts';
import { initUi, uiReducer, type UiState } from '../uiState.ts';

declare global {
  interface Window {
    /** 只在開發模式存在：讀取或直接載入遊戲狀態，方便手動驗證特定情境 */
    __ember?: { get(): GameState; load(state: GameState): void };
  }
}

/** 網址帶 ?seed=123 時用指定種子，否則隨機 */
export function seedFromUrl(search: string): number | null {
  const raw = new URLSearchParams(search).get('seed');
  if (raw === null) return null;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 ? n : null;
}

export function randomSeed(): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return (buf[0] ?? 0) % 1_000_000_000;
}

export interface GameControls {
  ui: UiState;
  /** 畫面要顯示的狀態（播放動畫時是當下的影格） */
  view: GameState;
  /** 正在播放動畫，輸入被鎖住 */
  busy: boolean;
  /** 正在行動的敵人 id */
  acting: string | null;
  /** 目前畫面上的浮動數字 */
  effects: Effect[];
  newRun(seed?: number): void;
  continueRun(): void;
  clickCard(uid: number): void;
  clickTarget(targetId: string): void;
  cancel(): void;
  endTurn(): void;
  pickReward(cardId: CardId | null): void;
  removeCard(uid: number | null): void;
  toTitle(): void;
}

export function useGame(): GameControls {
  const [ui, dispatch] = useReducer(uiReducer, undefined, () => initUi());
  const latest = useRef(ui);
  const busyRef = useRef(false);

  // ───── 動畫佇列 ─────
  const [pos, setPos] = useState({ seq: -1, index: 0 });
  const [effects, setEffects] = useState<Effect[]>([]);
  const nextEffectId = useRef(1);
  const cleanupTimers = useRef(new Set<ReturnType<typeof setTimeout>>());

  const { frames } = ui;
  const index = pos.seq === ui.seq ? pos.index : 0;
  const frame = frames.length > 0 ? frames[Math.min(index, frames.length - 1)] : undefined;
  const view = frame?.state ?? ui.game;
  const busy = frames.length > 1 && index < frames.length - 1;
  const acting = busy ? actingEnemy(frame) : null;

  useEffect(() => {
    latest.current = ui;
  }, [ui]);

  useEffect(() => {
    busyRef.current = busy;
  }, [busy]);

  useEffect(() => {
    const spawn = (list: Effect[]) => {
      if (list.length === 0) return;
      const ids = new Set(list.map((e) => e.id));
      setEffects((prev) => [...prev, ...list]);
      const t = setTimeout(() => {
        cleanupTimers.current.delete(t);
        setEffects((prev) => prev.filter((e) => !ids.has(e.id)));
      }, FLOATER_MS);
      cleanupTimers.current.add(t);
    };
    const timers = frameSchedule(frames).map((at, i) =>
      setTimeout(() => {
        setPos({ seq: ui.seq, index: i });
        const f = frames[i];
        if (!f) return;
        const list = eventsToEffects(f.events, nextEffectId.current);
        nextEffectId.current += list.length;
        spawn(list);
      }, at),
    );
    return () => timers.forEach(clearTimeout);
  }, [ui.seq, frames]);

  useEffect(() => {
    const pending = cleanupTimers.current;
    return () => pending.forEach(clearTimeout);
  }, []);

  // ───── 存檔 ─────
  useEffect(() => {
    writeSave(ui.game);
  }, [ui.game]);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    window.__ember = {
      get: () => latest.current.game,
      load: (state) => dispatch({ type: 'load', game: state, message: '（開發模式）已載入指定狀態' }),
    };
    return () => {
      delete window.__ember;
    };
  }, []);

  const controls = useMemo(() => {
    /** 播放動畫時忽略戰鬥操作 */
    const guarded =
      <A extends unknown[]>(fn: (...args: A) => void) =>
      (...args: A) => {
        if (!busyRef.current) fn(...args);
      };
    return {
      newRun: (seed?: number) =>
        dispatch({ type: 'game', action: { type: 'NEW_RUN', seed: seed ?? seedFromUrl(location.search) ?? randomSeed() } }),
      continueRun: () => {
        const saved = loadSave();
        if (saved) {
          dispatch({ type: 'load', game: saved });
          return;
        }
        // 讀取失敗：直接開新的一輪
        clearSave();
        dispatch({
          type: 'game',
          action: { type: 'NEW_RUN', seed: randomSeed() },
          notice: '存檔讀取失敗，已開始新的一輪',
        });
      },
      clickCard: guarded((uid: number) => dispatch({ type: 'clickCard', uid })),
      clickTarget: guarded((targetId: string) => dispatch({ type: 'clickTarget', targetId })),
      cancel: () => dispatch({ type: 'cancel' }),
      endTurn: guarded(() => dispatch({ type: 'game', action: { type: 'END_TURN' } })),
      pickReward: guarded((cardId: CardId | null) => dispatch({ type: 'game', action: { type: 'PICK_REWARD', cardId } })),
      removeCard: guarded((uid: number | null) => dispatch({ type: 'game', action: { type: 'REMOVE_CARD', uid } })),
      toTitle: () => dispatch({ type: 'toTitle' }),
    };
  }, []);

  return { ui, view, busy, acting, effects, ...controls };
}
