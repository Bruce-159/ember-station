// reduce(state, action) => { state, events }
// 純函式：不修改傳入的 state、不讀取時間、不呼叫 Math.random。
// 作法是先複製一份草稿，所有規則都在草稿上運算，最後回傳草稿與事件。

import { CARDS } from '../data/cards.ts';
import {
  aliveEnemies,
  allAlliesDead,
  allEnemiesDead,
  getAlly,
  isAlive,
  isCharacterAvailable,
  startPlayerTurn,
} from './combat.ts';
import { runEnemyAction } from './enemyAI.ts';
import { loseRun, pickReward, removeCardAndContinue, startRun, winBattle } from './run.ts';
import type {
  Action,
  AllyId,
  CardDef,
  CardInstance,
  Ctx,
  GameEvent,
  GameState,
  Multiplier,
  ReduceOptions,
  ReduceResult,
  RejectReason,
  UnplayableReason,
} from './types.ts';

// ───────────── 複製 ─────────────

export function cloneState(s: GameState): GameState {
  return {
    ...s,
    route: s.route.slice(),
    allies: s.allies.map((a) => ({ ...a })),
    enemies: s.enemies.map((e) => ({ ...e, intent: e.intent ? { ...e.intent } : null })),
    deck: s.deck.slice(),
    drawPile: s.drawPile.slice(),
    hand: s.hand.slice(),
    discard: s.discard.slice(),
    exhausted: s.exhausted.slice(),
    powers: { ...s.powers },
    rewardOptions: s.rewardOptions.slice(),
  };
}

// ───────────── 出牌判定 ─────────────

export type Playability = { ok: true } | { ok: false; reason: UnplayableReason };

/** 這張手牌現在能不能打出（UI 用來顯示停用原因） */
export function canPlayCard(state: GameState, uid: number): Playability {
  if (state.phase !== 'battle') return { ok: false, reason: 'phase' };
  const card = state.hand.find((c) => c.uid === uid);
  if (!card) return { ok: false, reason: 'notInHand' };
  const def = CARDS[card.cardId];
  if (!isCharacterAvailable(state, def.owner)) return { ok: false, reason: 'ownerDown' };
  if (def.oncePerTurn && card.cardId === 'sleeve' && state.sleeveUsed) return { ok: false, reason: 'oncePerTurn' };
  if (def.cost > state.energy) return { ok: false, reason: 'energy' };
  return { ok: true };
}

/** 打出這張牌時會套用的增幅倍率（UI 預覽用） */
export function previewMultiplier(state: GameState, def: CardDef): Multiplier {
  return !def.isAmp && state.ampCharges > 0 ? 2 : 1;
}

/** 合法目標的 id 清單；不需要目標時為空陣列 */
export function validTargets(state: GameState, def: CardDef): string[] {
  if (def.target === 'enemy') return aliveEnemies(state).map((e) => e.id);
  if (def.target === 'ally') return state.allies.filter(isAlive).map((a) => a.id);
  return [];
}

// ───────────── reducer ─────────────

function reject(state: GameState, action: Action, reason: RejectReason): ReduceResult {
  return { state, events: [{ type: 'actionRejected', action: action.type, reason }] };
}

export function reduce(state: GameState, action: Action, opts: ReduceOptions = {}): ReduceResult {
  const begin = () => makeCtx(cloneState(state), opts);
  switch (action.type) {
    case 'NEW_RUN': {
      const ctx = begin();
      startRun(ctx, action.seed);
      return finish(ctx);
    }
    case 'PLAY_CARD':
      return playCard(state, action, opts);
    case 'END_TURN': {
      if (state.phase !== 'battle') return reject(state, action, 'phase');
      const ctx = begin();
      endTurn(ctx);
      return finish(ctx);
    }
    case 'PICK_REWARD': {
      if (state.phase !== 'reward') return reject(state, action, 'phase');
      if (action.cardId !== null && !state.rewardOptions.includes(action.cardId)) {
        return reject(state, action, 'invalidChoice');
      }
      const ctx = begin();
      pickReward(ctx, action.cardId);
      return finish(ctx);
    }
    case 'REMOVE_CARD': {
      if (state.phase !== 'remove') return reject(state, action, 'phase');
      if (action.uid !== null && !state.deck.some((c) => c.uid === action.uid)) {
        return reject(state, action, 'invalidChoice');
      }
      const ctx = begin();
      removeCardAndContinue(ctx, action.uid);
      return finish(ctx);
    }
  }
}

function makeCtx(state: GameState, opts: ReduceOptions): Ctx {
  const events: GameEvent[] = [];
  return opts.frames ? { state, events, recorder: { frames: [], mark: 0 } } : { state, events };
}

/** 切出一個影格：自上一個影格以來的事件 + 目前狀態的快照（沒開影格時什麼都不做） */
function markFrame(ctx: Ctx): void {
  const rec = ctx.recorder;
  if (!rec || rec.mark === ctx.events.length) return;
  rec.frames.push({ state: cloneState(ctx.state), events: ctx.events.slice(rec.mark) });
  rec.mark = ctx.events.length;
}

function finish(ctx: Ctx): ReduceResult {
  if (!ctx.recorder) return { state: ctx.state, events: ctx.events };
  markFrame(ctx);
  const { frames } = ctx.recorder;
  // 最後一個影格的狀態直接使用最終狀態（內容相同，避免多一份複製）
  const last = frames.at(-1);
  if (last) last.state = ctx.state;
  else frames.push({ state: ctx.state, events: [] });
  return { state: ctx.state, events: ctx.events, frames };
}

function playCard(state: GameState, action: Extract<Action, { type: 'PLAY_CARD' }>, opts: ReduceOptions): ReduceResult {
  const playable = canPlayCard(state, action.uid);
  if (!playable.ok) return reject(state, action, playable.reason);

  const handCard = state.hand.find((c) => c.uid === action.uid) as CardInstance;
  const def = CARDS[handCard.cardId];

  // 目標驗證（在複製之前，失敗時原封不動回傳）
  let targetId: string | null = null;
  if (def.target !== 'none') {
    if (action.targetId === undefined || !validTargets(state, def).includes(action.targetId)) {
      return reject(state, action, 'invalidTarget');
    }
    targetId = action.targetId;
  }

  const ctx = makeCtx(cloneState(state), opts);
  const s = ctx.state;

  // 1. 先扣能量、從手牌移除
  s.energy -= def.cost;
  s.hand = s.hand.filter((c) => c.uid !== handCard.uid);

  // 2. 計算增幅倍率
  let m: Multiplier = 1;
  if (!def.isAmp && s.ampCharges > 0) {
    m = 2;
    s.ampCharges -= 1;
  }
  ctx.events.push({ type: 'cardPlayed', uid: handCard.uid, cardId: def.id, multiplier: m, targetId });

  // 3. 結算效果
  const enemy = def.target === 'enemy' ? (s.enemies.find((e) => e.id === targetId) ?? null) : null;
  const ally = def.target === 'ally' ? getAlly(s, targetId as AllyId) : null;
  def.play({ state: s, events: ctx.events, m, enemy, ally }, def.values);

  // 4. 卡牌去向：能力牌與「打出後移除」進移除區，其他進棄牌堆
  if (def.type === 'power' || def.exhaust) s.exhausted.push(handCard);
  else s.discard.push(handCard);

  // 5. 檢查勝利（先切一個影格，讓畫面停在敵人倒下的那一刻）
  if (allEnemiesDead(s)) {
    markFrame(ctx);
    winBattle(ctx);
  }
  return finish(ctx);
}

/** 結束回合：手牌進棄牌堆 → 敵人依序行動 → 判定勝負 → 下一個玩家回合 */
function endTurn(ctx: Ctx): void {
  const { state } = ctx;
  if (state.hand.length > 0) ctx.events.push({ type: 'discardHand', uids: state.hand.map((c) => c.uid) });
  state.discard.push(...state.hand);
  state.hand = [];
  markFrame(ctx);

  // 每個敵人行動完切一個影格，UI 依序播放
  for (const enemy of state.enemies) {
    if (!isAlive(enemy)) continue;
    runEnemyAction(ctx, enemy);
    markFrame(ctx);
    if (allAlliesDead(state)) {
      loseRun(ctx);
      return;
    }
  }

  if (allEnemiesDead(state)) {
    winBattle(ctx);
    return;
  }
  startPlayerTurn(ctx);
}
