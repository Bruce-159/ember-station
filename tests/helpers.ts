// 測試共用工具：建立可控的戰鬥狀態、出牌、找出特定亂數狀態

import { CARDS } from '../src/data/cards.ts';
import { canPlayCard, cloneState, reduce, validTargets } from '../src/engine/reducer.ts';
import { mulberry32 } from '../src/engine/rng.ts';
import { createInitialState, startBattle } from '../src/engine/run.ts';
import type {
  Action,
  AllyId,
  CardId,
  Enemy,
  GameEvent,
  GameState,
  Intent,
  IntentPattern,
  ReduceResult,
  RelicId,
} from '../src/engine/types.ts';

/** 剛開局、停在選媒介物品的狀態 */
export function freshRun(seed = 1): GameState {
  return reduce(createInitialState(), { type: 'NEW_RUN', seed }).state;
}

/**
 * 新的一輪，跳過開局的媒介物品選擇，直接進入第 1 場。
 * relics 指定持有的遺物（預設沒有），讓既有測試不受遺物影響。
 */
export function newRun(seed = 1, relics: RelicId[] = []): GameState {
  const s = cloneState(freshRun(seed));
  s.relics = [...relics];
  s.relicOptions = [];
  s.afterRelic = null;
  startBattle({ state: s, events: [] }, 0);
  return s;
}

export interface EnemySpec {
  hp?: number;
  maxHp?: number;
  block?: number;
  poison?: number;
  strength?: number;
  analyzed?: boolean;
  pattern?: IntentPattern[];
  intent?: Intent | null;
}

/** 什麼都不做的意圖：格擋 0、攻擊力 0 */
export const IDLE: IntentPattern = { kind: 'defend', block: 0, strength: 0 };

export function makeEnemy(id: string, spec: EnemySpec = {}): Enemy {
  const hp = spec.hp ?? 100;
  const pattern = spec.pattern ?? [IDLE];
  return {
    id,
    name: `測試敵人${id}`,
    hp,
    maxHp: spec.maxHp ?? hp,
    block: spec.block ?? 0,
    poison: spec.poison ?? 0,
    strength: spec.strength ?? 0,
    analyzed: spec.analyzed ?? false,
    pattern,
    patternIndex: 1,
    intent: spec.intent === undefined ? patternToIntent(pattern[0] ?? IDLE) : spec.intent,
  };
}

function patternToIntent(p: IntentPattern): Intent {
  if (p.kind === 'attack') return { kind: 'attack', damage: p.damage, hits: p.hits, targetId: 'leon' };
  return { ...p };
}

export interface BattleSpec {
  seed?: number;
  /** 指定手牌；指定時抽牌堆與棄牌堆預設清空 */
  hand?: CardId[];
  drawPile?: CardId[];
  discard?: CardId[];
  enemies?: EnemySpec[];
  energy?: number;
  allyHp?: Partial<Record<AllyId, number>>;
  patch?: (s: GameState) => void;
}

/** 建立一個可控的戰鬥狀態（第 1 場戰鬥、第 1 回合） */
export function battleState(spec: BattleSpec = {}): GameState {
  const s = cloneState(newRun(spec.seed ?? 1));
  const mk = (id: CardId) => {
    const c = { uid: s.nextUid, cardId: id };
    s.nextUid += 1;
    return c;
  };
  if (spec.hand) {
    s.hand = spec.hand.map(mk);
    s.drawPile = [];
    s.discard = [];
  }
  if (spec.drawPile) s.drawPile = spec.drawPile.map(mk);
  if (spec.discard) s.discard = spec.discard.map(mk);
  if (spec.enemies) s.enemies = spec.enemies.map((e, i) => makeEnemy(`e${i}`, e));
  if (spec.energy !== undefined) s.energy = spec.energy;
  if (spec.allyHp) {
    for (const a of s.allies) {
      const hp = spec.allyHp[a.id];
      if (hp !== undefined) a.hp = hp;
    }
  }
  spec.patch?.(s);
  return s;
}

/** 打出手牌中第一張 cardId；需要目標時預設選第一個合法目標 */
export function play(state: GameState, cardId: CardId, targetId?: string): ReduceResult {
  const card = state.hand.find((c) => c.cardId === cardId);
  if (!card) throw new Error(`手牌中沒有 ${cardId}`);
  const def = CARDS[cardId];
  const target = def.target === 'none' ? undefined : (targetId ?? validTargets(state, def)[0]);
  const result = reduce(state, { type: 'PLAY_CARD', uid: card.uid, targetId: target });
  const rejected = result.events.find((e) => e.type === 'actionRejected');
  if (rejected) throw new Error(`出牌被拒絕：${cardId}（${JSON.stringify(rejected)}）`);
  return result;
}

/** 連續打出多張牌，回傳最後狀態 */
export function playAll(state: GameState, ...cards: Array<CardId | [CardId, string]>): GameState {
  let s = state;
  for (const c of cards) s = Array.isArray(c) ? play(s, c[0], c[1]).state : play(s, c).state;
  return s;
}

export function dispatch(state: GameState, action: Action): ReduceResult {
  return reduce(state, action);
}

export function endTurn(state: GameState): ReduceResult {
  return reduce(state, { type: 'END_TURN' });
}

export function ofType<T extends GameEvent['type']>(events: GameEvent[], type: T): Extract<GameEvent, { type: T }>[] {
  return events.filter((e): e is Extract<GameEvent, { type: T }> => e.type === type);
}

export function enemy(state: GameState, id = 'e0'): Enemy {
  const e = state.enemies.find((x) => x.id === id);
  if (!e) throw new Error(`沒有敵人 ${id}`);
  return e;
}

export function ally(state: GameState, id: AllyId) {
  const a = state.allies.find((x) => x.id === id);
  if (!a) throw new Error(`沒有同伴 ${id}`);
  return a;
}

/** 找一個 rngState，使下一個亂數滿足條件（用來強制下注成功或失敗） */
export function rngStateWhere(pred: (value: number) => boolean): number {
  for (let s = 1; s < 1_000_000; s++) {
    if (pred(mulberry32(s).value)) return s;
  }
  throw new Error('找不到符合條件的亂數狀態');
}

/** 深度凍結，用來驗證 reducer 沒有修改輸入 */
export function deepFreeze<T>(obj: T): T {
  if (obj && typeof obj === 'object' && !Object.isFrozen(obj)) {
    Object.freeze(obj);
    for (const v of Object.values(obj)) deepFreeze(v);
  }
  return obj;
}

/** 簡單的自動玩家：能打就打第一張可打的牌，否則結束回合；獎勵選第一張、不移除 */
export function autoplayRun(seed: number, maxSteps = 20_000): { state: GameState; actions: Action[] } {
  let s = createInitialState();
  const actions: Action[] = [];
  const step = (a: Action) => {
    actions.push(a);
    s = reduce(s, a).state;
  };
  step({ type: 'NEW_RUN', seed });
  for (let i = 0; i < maxSteps; i++) {
    if (s.phase === 'victory' || s.phase === 'defeat') return { state: s, actions };
    if (s.phase === 'relicChoice') {
      step({ type: 'PICK_RELIC', relicId: s.relicOptions[0]! });
      continue;
    }
    if (s.phase === 'reward') {
      step({ type: 'PICK_REWARD', cardId: s.rewardOptions[0] ?? null });
      continue;
    }
    if (s.phase === 'remove') {
      step({ type: 'REMOVE_CARD', uid: null });
      continue;
    }
    const playable = s.hand.find((c) => canPlayCard(s, c.uid).ok);
    if (playable) {
      const def = CARDS[playable.cardId];
      step({ type: 'PLAY_CARD', uid: playable.uid, targetId: validTargets(s, def)[0] });
    } else {
      step({ type: 'END_TURN' });
    }
  }
  throw new Error('自動遊玩沒有在步數上限內結束');
}
