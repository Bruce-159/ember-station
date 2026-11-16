// 可設定種子的亂數（mulberry32）。亂數狀態存放在 GameState.rngState，
// 因此同一個狀態 + 同一串動作一定得到同樣的結果。

import type { GameState } from './types.ts';

/** 把任意數字種子轉成 32 位元無號整數的初始狀態 */
export function seedToState(seed: number): number {
  // 先用一次 splitmix 風格的雜湊打散，避免相鄰種子產生相近序列
  let h = (Math.trunc(seed) ^ 0x9e3779b9) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

/** mulberry32 單步：給定狀態，回傳 [0,1) 的亂數與下一個狀態 */
export function mulberry32(stateIn: number): { value: number; next: number } {
  const next = (stateIn + 0x6d2b79f5) >>> 0;
  let t = next;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return { value, next };
}

/** 從遊戲狀態取一個 [0,1) 亂數，並推進狀態（只能用在 reducer 的草稿上） */
export function nextFloat(state: GameState): number {
  const { value, next } = mulberry32(state.rngState);
  state.rngState = next;
  return value;
}

/** 取 [0, n) 的整數 */
export function nextInt(state: GameState, n: number): number {
  return Math.floor(nextFloat(state) * n);
}

/** Fisher–Yates 洗牌，回傳新陣列 */
export function shuffle<T>(state: GameState, items: readonly T[]): T[] {
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = nextInt(state, i + 1);
    const tmp = a[i] as T;
    a[i] = a[j] as T;
    a[j] = tmp;
  }
  return a;
}

/** 依權重抽一個元素；items 為空時回傳 null */
export function weightedPick<T>(state: GameState, items: readonly T[], weight: (item: T) => number): T | null {
  if (items.length === 0) return null;
  const total = items.reduce((sum, it) => sum + weight(it), 0);
  let roll = nextFloat(state) * total;
  for (const it of items) {
    roll -= weight(it);
    if (roll < 0) return it;
  }
  return items[items.length - 1] ?? null;
}
