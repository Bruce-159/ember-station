// 手感（第 4 節）：把引擎事件轉成畫面上的浮動數字與震動，以及影格的播放時序。
// 純函式、不依賴 React，可以在 Node 測試。

import type { Frame, GameEvent } from '../engine/types.ts';

/** 敵人之間的行動間隔 */
export const ENEMY_STEP_MS = 400;
/** 戰鬥結束（勝利、失敗）前停留，讓玩家看到最後一擊 */
export const RESULT_HOLD_MS = 900;
/** 浮動數字存在的時間（要與 CSS 動畫長度一致） */
export const FLOATER_MS = 1000;

export type EffectTone = 'damage' | 'poison' | 'block' | 'heal' | 'ember' | 'miss';

export interface Effect {
  id: number;
  /** 顯示在哪個單位上：同伴 id、敵人 id 或 'lucian' */
  targetId: string;
  text: string;
  tone: EffectTone;
  /** 受擊：目標要震動 */
  hit: boolean;
}

type Draft = Omit<Effect, 'id'>;

function toEffects(e: GameEvent): Draft[] {
  switch (e.type) {
    case 'damage': {
      const out: Draft[] = [];
      if (e.amount > 0) {
        out.push({ targetId: e.targetId, text: `−${e.amount}`, tone: e.source === 'poison' ? 'poison' : 'damage', hit: true });
      }
      if (e.blocked > 0) out.push({ targetId: e.targetId, text: `擋 ${e.blocked}`, tone: 'block', hit: e.amount === 0 });
      if (e.amount === 0 && e.blocked === 0) out.push({ targetId: e.targetId, text: '0', tone: 'miss', hit: false });
      return out;
    }
    case 'hpLoss':
      return e.amount > 0 ? [{ targetId: e.targetId, text: `−${e.amount}`, tone: 'damage', hit: false }] : [];
    case 'block':
      return [{ targetId: e.targetId, text: `+${e.amount} 格擋`, tone: 'block', hit: false }];
    case 'heal':
      return e.amount > 0 ? [{ targetId: e.targetId, text: `+${e.amount}`, tone: 'heal', hit: false }] : [];
    case 'poison':
      return [{ targetId: e.targetId, text: `+${e.amount} 毒`, tone: 'poison', hit: false }];
    case 'revived':
      return [{ targetId: e.allyId, text: '復活', tone: 'heal', hit: false }];
    case 'bet':
      return [{ targetId: 'ace', text: e.success ? '下注成功' : '落空', tone: e.success ? 'ember' : 'miss', hit: false }];
    case 'ampSet':
      return [{ targetId: 'lucian', text: `增幅 ×${e.charges}`, tone: 'ember', hit: false }];
    case 'analyzed':
      return [{ targetId: e.targetId, text: '解析', tone: 'ember', hit: false }];
    case 'thorns':
      return [{ targetId: 'leon', text: `反擊 ${e.total}`, tone: 'ember', hit: false }];
    case 'intentReduced':
      return [{ targetId: e.enemyId, text: `壓制 −${e.amount}`, tone: 'block', hit: false }];
    case 'strength':
      return [{ targetId: e.enemyId, text: `攻擊力 +${e.amount}`, tone: 'damage', hit: false }];
    default:
      return [];
  }
}

/** 事件 → 浮動數字；id 從 firstId 開始連號 */
export function eventsToEffects(events: readonly GameEvent[], firstId: number): Effect[] {
  return events.flatMap(toEffects).map((d, i) => ({ ...d, id: firstId + i }));
}

/** 影格裡正在行動的敵人（沒有則為 null） */
export function actingEnemy(frame: Frame | undefined): string | null {
  const e = frame?.events.find((x) => x.type === 'enemyTurn');
  return e?.type === 'enemyTurn' ? e.enemyId : null;
}

/**
 * 每個影格相對於動作開始的播放時間（毫秒）。
 * 第一格立即顯示；之後每格間隔 ENEMY_STEP_MS；從戰鬥切到結算畫面前多停 RESULT_HOLD_MS。
 */
export function frameSchedule(frames: readonly Frame[]): number[] {
  const times: number[] = [];
  let t = 0;
  frames.forEach((f, i) => {
    if (i > 0) {
      const prev = frames[i - 1];
      const leavingBattle = prev?.state.phase === 'battle' && f.state.phase !== 'battle';
      t += leavingBattle ? RESULT_HOLD_MS : ENEMY_STEP_MS;
    }
    times.push(t);
  });
  return times;
}

/** 該單位最近一次受擊的效果 id（沒有則為 0），用來觸發震動 */
export function latestHit(effects: readonly Effect[], targetId: string): number {
  let id = 0;
  for (const e of effects) if (e.hit && e.targetId === targetId && e.id > id) id = e.id;
  return id;
}
