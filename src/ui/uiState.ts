// UI 層的狀態：遊戲狀態 + 選取中的卡 + 戰鬥紀錄 + 提示訊息。
// uiReducer 是純函式，供 useReducer 使用，也可以在 Node 測試。

import { CARDS } from '../data/cards.ts';
import { canPlayCard, reduce, validTargets } from '../engine/reducer.ts';
import { createInitialState } from '../engine/run.ts';
import type { Action, Frame, GameEvent, GameState, RejectReason } from '../engine/types.ts';
import { eventToText, type LogKind } from './eventText.ts';
import { UNPLAYABLE_TEXT } from './view.ts';

export const LOG_LIMIT = 200;

export interface LogLine {
  id: number;
  text: string;
  kind: LogKind;
}

export interface UiState {
  game: GameState;
  /** 已選取、等待選目標的手牌 uid */
  selected: number | null;
  /** 新的在前 */
  log: LogLine[];
  nextLogId: number;
  /** 最近一次的提示（例如無法打出的原因） */
  notice: string | null;
  /** 最近一次 reduce 的事件 */
  lastEvents: GameEvent[];
  /** 最近一次 reduce 的影格，由 useGame 依序播放 */
  frames: Frame[];
  /** 每次遊戲狀態改變就 +1（單調遞增），useGame 用它判斷要不要開始播放 */
  seq: number;
}

export type UiAction =
  | { type: 'game'; action: Action; notice?: string }
  | { type: 'clickCard'; uid: number }
  | { type: 'clickTarget'; targetId: string }
  | { type: 'cancel' }
  | { type: 'load'; game: GameState; message?: string }
  | { type: 'toTitle' };

export function initUi(game: GameState = createInitialState(), seq = 0): UiState {
  return { game, selected: null, log: [], nextLogId: 1, notice: null, lastEvents: [], frames: [], seq };
}

const REJECT_TEXT: Readonly<Record<RejectReason, string>> = {
  ...UNPLAYABLE_TEXT,
  invalidTarget: '請選擇合法的目標',
  invalidChoice: '這個選項無效',
};

function appendLog(ui: UiState, lines: Array<{ text: string; kind: LogKind }>): Pick<UiState, 'log' | 'nextLogId'> {
  let id = ui.nextLogId;
  const fresh = lines.map((l) => ({ ...l, id: id++ })).reverse();
  return { log: [...fresh, ...ui.log].slice(0, LOG_LIMIT), nextLogId: id };
}

function applyGame(ui: UiState, action: Action): UiState {
  const { state, events, frames = [] } = reduce(ui.game, action, { frames: true });
  const rejected = events.find((e) => e.type === 'actionRejected');
  if (rejected) return { ...ui, notice: REJECT_TEXT[rejected.reason], lastEvents: events };
  const lines = events.flatMap((e) => {
    const t = eventToText(e, state);
    return t ? [t] : [];
  });
  // 新的一輪從乾淨的紀錄開始
  const base = action.type === 'NEW_RUN' ? { ...ui, log: [], nextLogId: ui.nextLogId } : ui;
  return {
    ...base,
    ...appendLog(base, lines),
    game: state,
    selected: null,
    notice: null,
    lastEvents: events,
    frames,
    seq: ui.seq + 1,
  };
}

export function uiReducer(ui: UiState, a: UiAction): UiState {
  switch (a.type) {
    case 'game': {
      const next = applyGame(ui, a.action);
      return a.notice ? { ...next, notice: a.notice } : next;
    }

    case 'clickCard': {
      const { game } = ui;
      if (game.phase !== 'battle') return ui;
      if (ui.selected === a.uid) return { ...ui, selected: null, notice: null };
      const card = game.hand.find((c) => c.uid === a.uid);
      if (!card) return ui;
      const def = CARDS[card.cardId];
      const check = canPlayCard(game, a.uid);
      if (!check.ok) return { ...ui, selected: null, notice: `「${def.name}」無法打出：${UNPLAYABLE_TEXT[check.reason]}` };
      if (def.target === 'none') return applyGame({ ...ui, selected: null }, { type: 'PLAY_CARD', uid: a.uid });
      return { ...ui, selected: a.uid, notice: null };
    }

    case 'clickTarget': {
      if (ui.selected === null) return ui;
      const card = ui.game.hand.find((c) => c.uid === ui.selected);
      if (!card) return { ...ui, selected: null };
      if (!validTargets(ui.game, CARDS[card.cardId]).includes(a.targetId)) return ui;
      return applyGame(ui, { type: 'PLAY_CARD', uid: card.uid, targetId: a.targetId });
    }

    case 'cancel':
      return ui.selected === null && ui.notice === null ? ui : { ...ui, selected: null, notice: null };

    case 'load': {
      const fresh = initUi(a.game, ui.seq + 1);
      return { ...fresh, ...appendLog(fresh, [{ text: a.message ?? '已讀取存檔，繼續這一輪', kind: 'heading' }]) };
    }

    case 'toTitle':
      return initUi(undefined, ui.seq + 1);
  }
}

/** 選取中的卡需要的目標種類（沒有選取時為 null） */
export function pendingTarget(ui: UiState): 'enemy' | 'ally' | null {
  if (ui.selected === null) return null;
  const card = ui.game.hand.find((c) => c.uid === ui.selected);
  if (!card) return null;
  const t = CARDS[card.cardId].target;
  return t === 'none' ? null : t;
}

/** 鍵盤 1–9、0 對應第 1–10 張手牌；不是數字鍵回傳 null */
export function keyToHandIndex(key: string): number | null {
  if (key === '0') return 9;
  if (/^[1-9]$/.test(key)) return Number(key) - 1;
  return null;
}

/** 選擇畫面（例如媒介物品）：1 ～ count 對應第 1 ～ count 個選項；其他鍵回傳 null */
export function keyToChoiceIndex(key: string, count: number): number | null {
  if (!/^[1-9]$/.test(key)) return null;
  const index = Number(key) - 1;
  return index < count ? index : null;
}
