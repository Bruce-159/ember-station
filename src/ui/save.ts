// 用 localStorage 保存目前這一輪（第 12 節）。
// 讀取失敗（不存在、格式錯誤、版本不符）一律回傳 null，由呼叫端開新的一輪。

import { BATTLES } from '../data/battles.ts';
import { CARDS } from '../data/cards.ts';
import type { CardInstance, GameState } from '../engine/types.ts';

export const SAVE_KEY = 'ember-station:run';
export const SAVE_VERSION = 1;

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** 取得瀏覽器的 localStorage；在 Node、隱私模式或被封鎖時回傳 null */
export function browserStorage(): StorageLike | null {
  try {
    const s = (globalThis as { localStorage?: StorageLike }).localStorage;
    return s ?? null;
  } catch {
    return null;
  }
}

const SAVABLE: ReadonlySet<GameState['phase']> = new Set(['battle', 'reward', 'remove']);

export function serialize(state: GameState): string {
  return JSON.stringify({ version: SAVE_VERSION, state });
}

export function deserialize(raw: string | null): GameState | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed) || parsed.version !== SAVE_VERSION) return null;
    return isValidState(parsed.state) ? parsed.state : null;
  } catch {
    return null;
  }
}

export function hasSave(storage: StorageLike | null = browserStorage()): boolean {
  return loadSave(storage) !== null;
}

export function loadSave(storage: StorageLike | null = browserStorage()): GameState | null {
  if (!storage) return null;
  try {
    return deserialize(storage.getItem(SAVE_KEY));
  } catch {
    return null;
  }
}

/** 進行中的一輪寫入存檔；勝利、失敗或標題畫面則清除存檔 */
export function writeSave(state: GameState, storage: StorageLike | null = browserStorage()): void {
  if (!storage) return;
  try {
    if (SAVABLE.has(state.phase)) storage.setItem(SAVE_KEY, serialize(state));
    else if (state.phase !== 'title') storage.removeItem(SAVE_KEY);
  } catch {
    // 儲存空間已滿或被封鎖：本次不存，遊戲照常進行
  }
}

export function clearSave(storage: StorageLike | null = browserStorage()): void {
  try {
    storage?.removeItem(SAVE_KEY);
  } catch {
    // 忽略
  }
}

// ───────────── 驗證 ─────────────

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);

function isCardList(v: unknown): v is CardInstance[] {
  return Array.isArray(v) && v.every((c) => isRecord(c) && isInt(c.uid) && typeof c.cardId === 'string' && c.cardId in CARDS);
}

/** 檢查讀回來的資料是否像一個可以繼續玩的 GameState */
export function isValidState(v: unknown): v is GameState {
  if (!isRecord(v)) return false;
  if (typeof v.phase !== 'string' || !SAVABLE.has(v.phase as GameState['phase'])) return false;
  const ints = ['seed', 'rngState', 'nextUid', 'battleIndex', 'turn', 'energy', 'ampCharges', 'luck'];
  if (!ints.every((k) => isInt(v[k]))) return false;
  if (!isInt(v.battleIndex) || v.battleIndex < 0 || v.battleIndex >= BATTLES.length) return false;
  if (!['deck', 'drawPile', 'hand', 'discard', 'exhausted'].every((k) => isCardList(v[k]))) return false;
  if (!['rigged', 'sleeveUsed', 'firstBetDone'].every((k) => typeof v[k] === 'boolean')) return false;
  if (!isRecord(v.powers)) return false;
  if (!Array.isArray(v.rewardOptions) || !v.rewardOptions.every((id) => typeof id === 'string' && id in CARDS)) return false;

  const allies = v.allies;
  if (!Array.isArray(allies) || allies.length !== 3) return false;
  if (!allies.every((a) => isRecord(a) && ['leon', 'agnes', 'ace'].includes(a.id as string) && isInt(a.hp) && isInt(a.maxHp))) {
    return false;
  }

  const enemies = v.enemies;
  if (!Array.isArray(enemies) || enemies.length === 0) return false;
  return enemies.every(
    (e) => isRecord(e) && typeof e.id === 'string' && isInt(e.hp) && Array.isArray(e.pattern) && e.pattern.length > 0,
  );
}
