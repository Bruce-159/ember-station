// 貪婪機器人（第 5 節）。純函式、不讀時間、不用 Math.random。
//
// 每一步依序檢查，採用第一個成立的規則：
//   1. 擊殺：打出「能擊殺敵人」的攻擊（費用低者優先）
//   2. 防守：同伴即將受到的傷害大於其格擋時，出格擋或回復（缺口最大的同伴優先，格擋優先於回復）
//   3. 攻擊：其餘攻擊依費用由高到低打出
//   4. 其他：剩下的技能與能力依費用由高到低打出（規格未定義，見下方說明）
//   都沒有 → 結束回合
//
// 規則 4 是補充：規格只寫到攻擊，若照字面，毒草、增幅、袖裡藏牌、血誓與所有能力牌都永遠不會被打出，
// 模擬出的勝率會嚴重低估。規則 4 只在攻擊打完、還有能量時才出這些牌，仍然是「簡單的貪婪」。
//
// 「能不能擊殺」「有沒有效果」都用 reduce 在副本上試打來判斷（reduce 是純函式，不影響真正的狀態）。
// 下注結果取決於亂數，試打會等於偷看未來，所以未保證成功的下注牌不參與擊殺判斷。

import { CARDS } from '../data/cards.ts';
import { guaranteedBet } from '../engine/bet.ts';
import { canPlayCard, reduce, validTargets } from '../engine/reducer.ts';
import type { Action, AllyId, CardDef, CardId, CardInstance, GameEvent, GameState, ReduceResult } from '../engine/types.ts';

/** 每回合最多出幾張牌（防止校準之類的循環） */
export const MAX_PLAYS_PER_TURN = 40;

/** 移除階段要移除的牌 */
export const REMOVE_PREFERENCE: readonly CardId[] = ['pulse', 'field'];

interface Candidate {
  readonly card: CardInstance;
  readonly def: CardDef;
  readonly targetId: string | undefined;
}

export interface GreedyBot {
  decide(state: GameState): Action;
}

export function createGreedyBot(): GreedyBot {
  let turnKey = '';
  let playsThisTurn = 0;
  let calibrated = false;

  return {
    decide(state) {
      if (state.phase === 'reward') return { type: 'PICK_REWARD', cardId: state.rewardOptions[0] ?? null };
      if (state.phase === 'remove') return { type: 'REMOVE_CARD', uid: pickRemoval(state) };
      if (state.phase !== 'battle') return { type: 'NEW_RUN', seed: state.seed };

      const key = `${state.battleIndex}:${state.turn}`;
      if (key !== turnKey) {
        turnKey = key;
        playsThisTurn = 0;
        calibrated = false;
      }
      if (playsThisTurn >= MAX_PLAYS_PER_TURN) return { type: 'END_TURN' };

      const choice =
        findKillingPlay(state) ??
        findDefensivePlay(state) ??
        findAttackPlay(state) ??
        findOtherPlay(state, { allowCalibrate: !calibrated });
      if (!choice) return { type: 'END_TURN' };

      playsThisTurn += 1;
      if (choice.def.id === 'calibrate') calibrated = true;
      return toAction(choice);
    },
  };
}

// ───────────── 規則 ─────────────

/** 規則 1：能擊殺敵人的攻擊，費用低者優先 */
export function findKillingPlay(state: GameState): Candidate | null {
  const kills = attackCandidates(state)
    .filter((c) => !isUncertainBet(state, c.def))
    .flatMap((c) => targetsFor(state, c))
    .filter((c) => hasEvent(trial(state, c), 'enemyDefeated'));
  return lowestCost(kills);
}

/** 規則 2：保護即將受到的傷害大於格擋的同伴 */
export function findDefensivePlay(state: GameState): Candidate | null {
  const incoming = incomingDamage(state);
  const threatened = state.allies
    .filter((a) => a.hp > 0 && incoming[a.id] > a.block)
    // 缺口（傷害 − 格擋）最大的優先
    .sort((a, b) => incoming[b.id] - b.block - (incoming[a.id] - a.block));
  if (threatened.length === 0) return null;

  const skills = playable(state).filter((c) => c.def.type === 'skill');
  for (const target of threatened) {
    const options = skills.flatMap((c) => {
      if (c.def.target === 'ally') return [{ ...c, targetId: target.id }];
      if (c.def.target === 'none') return [c];
      return [];
    });
    const block = options.find((c) => effectOn(trial(state, c), 'block', target.id) > 0);
    if (block) return block;
    const heal = options.find((c) => effectOn(trial(state, c), 'heal', target.id) > 0);
    if (heal) return heal;
  }
  return null;
}

/** 規則 3：其餘攻擊依費用由高到低；目標選生命 + 格擋最低的敵人 */
export function findAttackPlay(state: GameState): Candidate | null {
  const attacks = attackCandidates(state)
    .map((c) => withDefaultTarget(state, c))
    .filter((c) => isUncertainBet(state, c.def) || totalEnemyDamage(trial(state, c)) > 0);
  return highestCost(attacks);
}

/**
 * 規則 4：其他技能與能力依費用由高到低，跳過沒有任何效果的牌。
 * 增幅類放到最後：增幅次數會跨回合保留，留給下回合的第一張牌，
 * 避免被同回合的袖裡藏牌之類沒有數值的牌吃掉。
 */
export function findOtherPlay(state: GameState, opts: { allowCalibrate: boolean }): Candidate | null {
  const others = playable(state)
    .filter((c) => c.def.type !== 'attack')
    .filter((c) => opts.allowCalibrate || c.def.id !== 'calibrate')
    .map((c) => withDefaultTarget(state, c))
    .filter((c) => hasEffect(trial(state, c)));
  return highestCost(others.filter((c) => !c.def.isAmp)) ?? highestCost(others);
}

/** 移除：一張 pulse 或 field，沒有就跳過 */
export function pickRemoval(state: GameState): number | null {
  for (const id of REMOVE_PREFERENCE) {
    const card = state.deck.find((c) => c.cardId === id);
    if (card) return card.uid;
  }
  return null;
}

// ───────────── 估算 ─────────────

/** 依敵人意圖估算每位同伴這回合會受到的傷害 */
export function incomingDamage(state: GameState): Record<AllyId, number> {
  const out: Record<AllyId, number> = { leon: 0, agnes: 0, ace: 0 };
  for (const e of state.enemies) {
    if (e.hp <= 0 || !e.intent) continue;
    const it = e.intent;
    if (it.kind === 'attack') out[it.targetId] += Math.max(0, it.damage + e.strength) * it.hits;
    else if (it.kind === 'aoe') {
      for (const a of state.allies) if (a.hp > 0) out[a.id] += Math.max(0, it.damage + e.strength);
    }
  }
  return out;
}

// ───────────── 工具 ─────────────

function playable(state: GameState): Candidate[] {
  return state.hand
    .filter((card) => canPlayCard(state, card.uid).ok)
    .map((card) => ({ card, def: CARDS[card.cardId], targetId: undefined }));
}

function attackCandidates(state: GameState): Candidate[] {
  return playable(state).filter((c) => c.def.type === 'attack');
}

function isUncertainBet(state: GameState, def: CardDef): boolean {
  return (def.id === 'allIn' || def.id === 'goAllIn') && guaranteedBet(state) === null;
}

/** 展開所有合法目標 */
function targetsFor(state: GameState, c: Candidate): Candidate[] {
  if (c.def.target === 'none') return [c];
  return validTargets(state, c.def).map((targetId) => ({ ...c, targetId }));
}

/** 敵人目標：生命 + 格擋最低；同伴目標：生命比例最低 */
function withDefaultTarget(state: GameState, c: Candidate): Candidate {
  if (c.def.target === 'enemy') {
    const enemy = state.enemies
      .filter((e) => e.hp > 0)
      .reduce((best, e) => (e.hp + e.block < best.hp + best.block ? e : best));
    return { ...c, targetId: enemy.id };
  }
  if (c.def.target === 'ally') {
    const ally = state.allies
      .filter((a) => a.hp > 0)
      .reduce((best, a) => (a.hp / a.maxHp < best.hp / best.maxHp ? a : best));
    return { ...c, targetId: ally.id };
  }
  return c;
}

function trial(state: GameState, c: Candidate): ReduceResult {
  return reduce(state, toAction(c));
}

function toAction(c: Candidate): Action {
  return { type: 'PLAY_CARD', uid: c.card.uid, targetId: c.targetId };
}

function hasEvent(r: ReduceResult, type: GameEvent['type']): boolean {
  return r.events.some((e) => e.type === type);
}

/** 除了 cardPlayed 以外還有任何事件，視為有效果 */
function hasEffect(r: ReduceResult): boolean {
  return r.events.some((e) => e.type !== 'cardPlayed' && e.type !== 'actionRejected');
}

function effectOn(r: ReduceResult, type: 'block' | 'heal', targetId: string): number {
  let sum = 0;
  for (const e of r.events) if (e.type === type && e.targetId === targetId) sum += e.amount;
  return sum;
}

function totalEnemyDamage(r: ReduceResult): number {
  let sum = 0;
  for (const e of r.events) {
    if (e.type === 'damage' && e.source !== 'enemy') sum += e.amount + e.blocked;
  }
  return sum;
}

function lowestCost(cs: Candidate[]): Candidate | null {
  return cs.reduce<Candidate | null>((best, c) => (best === null || c.def.cost < best.def.cost ? c : best), null);
}

function highestCost(cs: Candidate[]): Candidate | null {
  return cs.reduce<Candidate | null>((best, c) => (best === null || c.def.cost > best.def.cost ? c : best), null);
}
