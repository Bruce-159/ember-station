// 一輪的流程：開始、戰鬥開始、勝利、獎勵、移除、休息（第 3.6 節）

import { ALLY_ORDER, allyMaxHp } from '../data/characters.ts';
import { REWARD_POOL } from '../data/cards.ts';
import { ENCOUNTERS, ROUTE_LENGTH } from '../data/encounters.ts';
import { STARTER_DECK } from '../data/starterDeck.ts';
import { startPlayerTurn } from './combat.ts';
import { chooseIntent } from './enemyAI.ts';
import { seedToState, shuffle } from './rng.ts';
import { emptyRelicFlags } from './relics.ts';
import { buildRoute } from './route.ts';
import type { CardId, CardInstance, Ctx, GameState } from './types.ts';

export const REWARD_CHOICES = 3;
export const REVIVE_PERCENT = 30;
export const REST_HEAL_PERCENT = 25;

/** 標題畫面用的空狀態 */
export function createInitialState(): GameState {
  return {
    phase: 'title',
    seed: 0,
    rngState: seedToState(0),
    nextUid: 1,
    battleIndex: 0,
    route: [],
    turn: 0,
    energy: 0,
    allies: [],
    enemies: [],
    deck: [],
    drawPile: [],
    hand: [],
    discard: [],
    exhausted: [],
    ampCharges: 0,
    luck: 0,
    rigged: false,
    sleeveUsed: false,
    firstBetDone: false,
    powers: { noRetreat: false, lingeringPoison: false, loadedDice: false },
    relics: [],
    relicFlags: emptyRelicFlags(),
    rewardOptions: [],
  };
}

export function makeCard(state: GameState, cardId: CardId): CardInstance {
  const card = { uid: state.nextUid, cardId };
  state.nextUid += 1;
  return card;
}

/** 新的一輪：設定種子、建立起始牌組、同伴滿血，開始第 1 場戰鬥 */
export function startRun(ctx: Ctx, seed: number): void {
  const fresh = createInitialState();
  Object.assign(ctx.state, fresh);
  const { state } = ctx;
  state.seed = seed;
  state.rngState = seedToState(seed);
  state.allies = ALLY_ORDER.map((id) => {
    const maxHp = allyMaxHp(id);
    return { id, hp: maxHp, maxHp, block: 0, thorns: 0 };
  });
  state.deck = STARTER_DECK.map((id) => makeCard(state, id));
  ctx.events.push({ type: 'runStarted', seed });
  state.route = buildRoute(state);
  ctx.events.push({ type: 'routeBuilt', route: [...state.route] });
  startBattle(ctx, 0);
}

/** 戰鬥開始：洗牌、清空牌堆、重置能力／手氣／增幅／出千，決定意圖後進入第一個玩家回合 */
export function startBattle(ctx: Ctx, battleIndex: number): void {
  const { state } = ctx;
  const encounterId = state.route[battleIndex];
  if (encounterId === undefined) throw new Error(`沒有第 ${battleIndex + 1} 場戰鬥`);
  const def = ENCOUNTERS[encounterId];
  state.phase = 'battle';
  state.battleIndex = battleIndex;
  state.turn = 0;
  state.energy = 0;
  state.enemies = def.enemies.map((e, i) => ({
    id: `e${i}`,
    name: e.name,
    hp: e.hp,
    maxHp: e.hp,
    block: 0,
    poison: 0,
    strength: 0,
    analyzed: false,
    pattern: e.pattern,
    patternIndex: 0,
    intent: null,
  }));
  state.drawPile = shuffle(state, state.deck);
  state.hand = [];
  state.discard = [];
  state.exhausted = [];
  state.powers = { noRetreat: false, lingeringPoison: false, loadedDice: false };
  state.luck = 0;
  state.ampCharges = 0;
  state.rigged = false;
  state.rewardOptions = [];
  for (const a of state.allies) {
    a.block = 0;
    a.thorns = 0;
  }
  ctx.events.push({ type: 'battleStarted', battleIndex, encounterId, title: def.title });
  for (const e of state.enemies) chooseIntent(ctx, e);
  startPlayerTurn(ctx);
}

export function isFinalBattle(battleIndex: number): boolean {
  return battleIndex >= ROUTE_LENGTH - 1;
}

/** 戰鬥勝利：最後一場 → 本輪勝利；否則進入選牌 */
export function winBattle(ctx: Ctx): void {
  const { state } = ctx;
  ctx.events.push({ type: 'battleWon', battleIndex: state.battleIndex });
  if (isFinalBattle(state.battleIndex)) {
    state.phase = 'victory';
    ctx.events.push({ type: 'runWon' });
    return;
  }
  state.phase = 'reward';
  state.rewardOptions = shuffle(state, REWARD_POOL).slice(0, REWARD_CHOICES);
  ctx.events.push({ type: 'rewardOffered', cardIds: [...state.rewardOptions] });
}

export function loseRun(ctx: Ctx): void {
  ctx.state.phase = 'defeat';
  ctx.events.push({ type: 'runLost', battleIndex: ctx.state.battleIndex });
}

/** 選牌：選 1 張加入牌組，或跳過（null） */
export function pickReward(ctx: Ctx, cardId: CardId | null): void {
  const { state } = ctx;
  if (cardId !== null) {
    const card = makeCard(state, cardId);
    state.deck.push(card);
    ctx.events.push({ type: 'cardAdded', uid: card.uid, cardId });
  }
  state.rewardOptions = [];
  state.phase = 'remove';
}

/** 移除：從牌組移除 1 張或跳過；之後休息並開始下一場戰鬥 */
export function removeCardAndContinue(ctx: Ctx, uid: number | null): void {
  const { state } = ctx;
  if (uid !== null) {
    const card = state.deck.find((c) => c.uid === uid);
    if (card) {
      state.deck = state.deck.filter((c) => c.uid !== uid);
      ctx.events.push({ type: 'cardRemoved', uid, cardId: card.cardId });
    }
  }
  rest(ctx);
  startBattle(ctx, state.battleIndex + 1);
}

/** 休息：倒下的同伴以 ceil(maxHp × 0.3) 復活；其他同伴回復 ceil(maxHp × 0.25)，不超過上限 */
export function rest(ctx: Ctx): void {
  for (const a of ctx.state.allies) {
    if (a.hp <= 0) {
      a.hp = percentCeil(a.maxHp, REVIVE_PERCENT);
      ctx.events.push({ type: 'revived', allyId: a.id, hp: a.hp });
    } else {
      const healed = Math.min(a.maxHp - a.hp, percentCeil(a.maxHp, REST_HEAL_PERCENT));
      a.hp += healed;
      ctx.events.push({ type: 'heal', targetId: a.id, amount: healed });
    }
  }
}

/** ceil(n × percent / 100)，以整數運算避免 10 × 0.3 = 3.0000000000000004 之類的誤差 */
export function percentCeil(n: number, percent: number): number {
  return Math.ceil((n * percent) / 100);
}
