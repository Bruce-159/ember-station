// 把引擎狀態轉成畫面要顯示的資料。純函式、不依賴 React，可以在 Node 測試。

import { CARDS, describeCard } from '../data/cards.ts';
import { ALLY_ORDER, CHARACTERS } from '../data/characters.ts';
import { ENCOUNTERS } from '../data/encounters.ts';
import { describeRelic, RELICS, type RelicTheme } from '../data/relics.ts';
import { intentDamage } from '../engine/enemyAI.ts';
import { isBackwater } from '../engine/combat.ts';
import { canPlayCard, previewMultiplier } from '../engine/reducer.ts';
import { restHealPercent } from '../engine/relics.ts';
import { percentCeil, REST_HEAL_PERCENT, REVIVE_PERCENT } from '../engine/run.ts';
import type {
  Ally,
  AllyId,
  CardId,
  CardInstance,
  CardType,
  CharacterId,
  Enemy,
  GameState,
  Multiplier,
  RelicId,
  TargetKind,
  UnplayableReason,
} from '../engine/types.ts';

export const TYPE_NAME: Readonly<Record<CardType, string>> = { attack: '攻擊', skill: '技能', power: '能力' };

export const UNPLAYABLE_TEXT: Readonly<Record<UnplayableReason, string>> = {
  energy: '能量不足',
  ownerDown: '持有者已倒下',
  oncePerTurn: '本回合已使用',
  phase: '現在無法出牌',
  notInHand: '不在手牌中',
};

export const TARGET_TEXT: Readonly<Record<TargetKind, string>> = { enemy: '敵人', ally: '同伴', none: '' };

export interface CardView {
  uid: number;
  cardId: CardId;
  name: string;
  cost: number;
  owner: CharacterId;
  ownerName: string;
  typeName: string;
  description: string;
  target: TargetKind;
  /** 打出時的增幅倍率 */
  multiplier: Multiplier;
  /** 打出時會被增幅 */
  amplified: boolean;
  playable: boolean;
  disabledReason: string | null;
}

/** 手牌中的卡：數字依目前狀態與增幅即時計算 */
export function handCardView(state: GameState, card: CardInstance): CardView {
  const def = CARDS[card.cardId];
  const m = previewMultiplier(state, def);
  const check = canPlayCard(state, card.uid);
  return {
    uid: card.uid,
    cardId: card.cardId,
    name: def.name,
    cost: def.cost,
    owner: def.owner,
    ownerName: CHARACTERS[def.owner].name,
    typeName: TYPE_NAME[def.type],
    description: describeCard(card.cardId, { state, m }),
    target: def.target,
    multiplier: m,
    amplified: m > 1,
    playable: check.ok,
    disabledReason: check.ok ? null : UNPLAYABLE_TEXT[check.reason],
  };
}

/** 獎勵與移除畫面的卡：不帶戰鬥狀態，顯示一般說明 */
export function previewCardView(cardId: CardId, uid = 0): CardView {
  const def = CARDS[cardId];
  return {
    uid,
    cardId,
    name: def.name,
    cost: def.cost,
    owner: def.owner,
    ownerName: CHARACTERS[def.owner].name,
    typeName: TYPE_NAME[def.type],
    description: describeCard(cardId),
    target: def.target,
    multiplier: 1,
    amplified: false,
    playable: true,
    disabledReason: null,
  };
}

const OWNER_ORDER: readonly CharacterId[] = ['lucian', ...ALLY_ORDER];

/** 牌組依角色、再依卡牌 id 排序 */
export function sortedDeck(deck: readonly CardInstance[]): CardInstance[] {
  return [...deck].sort((a, b) => {
    const oa = OWNER_ORDER.indexOf(CARDS[a.cardId].owner);
    const ob = OWNER_ORDER.indexOf(CARDS[b.cardId].owner);
    return oa - ob || a.cardId.localeCompare(b.cardId) || a.uid - b.uid;
  });
}

export function characterName(id: CharacterId): string {
  return CHARACTERS[id].name;
}

/** 任意 id（同伴或敵人）轉成名字 */
export function unitName(state: GameState, id: string): string {
  if (id in CHARACTERS) return CHARACTERS[id as CharacterId].name;
  return state.enemies.find((e) => e.id === id)?.name ?? id;
}

// ───────────── 意圖 ─────────────

export interface IntentView {
  kind: 'attack' | 'aoe' | 'defend';
  label: string;
  detail: string;
}

/** 意圖顯示目標名字與實際傷害（含攻擊力） */
export function intentView(state: GameState, enemy: Enemy): IntentView | null {
  const it = enemy.intent;
  if (!it || enemy.hp <= 0) return null;
  if (it.kind === 'defend') {
    return {
      kind: 'defend',
      label: '防禦',
      detail: `格擋 ${it.block}${it.strength ? `，攻擊力 +${it.strength}` : ''}`,
    };
  }
  const dmg = intentDamage(enemy) ?? 0;
  if (it.kind === 'aoe') return { kind: 'aoe', label: '全體攻擊', detail: `每人 ${dmg}` };
  const target = state.allies.find((a) => a.id === it.targetId);
  const targetText = target && target.hp > 0 ? CHARACTERS[it.targetId].name : '隨機同伴（原目標已倒下）';
  return { kind: 'attack', label: `攻擊 ${targetText}`, detail: it.hits > 1 ? `${dmg} × ${it.hits}` : `${dmg}` };
}

// ───────────── 狀態標籤 ─────────────

export type Tone = 'block' | 'poison' | 'ember' | 'danger';
export interface Tag {
  text: string;
  tone: Tone;
}

export function enemyTags(enemy: Enemy): Tag[] {
  const tags: Tag[] = [];
  if (enemy.hp <= 0) return [{ text: '已消散', tone: 'danger' }];
  if (enemy.block) tags.push({ text: `格擋 ${enemy.block}`, tone: 'block' });
  if (enemy.poison) tags.push({ text: `中毒 ${enemy.poison}`, tone: 'poison' });
  if (enemy.analyzed) tags.push({ text: '已解析', tone: 'ember' });
  if (enemy.strength) tags.push({ text: `攻擊力 +${enemy.strength}`, tone: 'danger' });
  return tags;
}

export function allyTags(state: GameState, ally: Ally): Tag[] {
  if (ally.hp <= 0) return [{ text: '倒下', tone: 'danger' }];
  const tags: Tag[] = [];
  if (ally.block) tags.push({ text: `格擋 ${ally.block}`, tone: 'block' });
  if (ally.thorns) tags.push({ text: `反擊 ${ally.thorns}`, tone: 'ember' });
  if (ally.id === 'leon') {
    if (isBackwater(state)) tags.push({ text: '背水', tone: 'danger' });
    if (state.powers.noRetreat) tags.push({ text: '不退', tone: 'ember' });
  }
  if (ally.id === 'agnes' && state.powers.lingeringPoison) tags.push({ text: '餘毒', tone: 'poison' });
  if (ally.id === 'ace') {
    tags.push({ text: `手氣 ${state.luck}`, tone: 'ember' });
    if (state.rigged) tags.push({ text: '出千中', tone: 'ember' });
    if (state.powers.loadedDice) tags.push({ text: '灌鉛骰子', tone: 'ember' });
  }
  return tags;
}

export function lucianTags(state: GameState): Tag[] {
  return state.ampCharges > 0 ? [{ text: `增幅待命 ${state.ampCharges}`, tone: 'ember' }] : [];
}

// ───────────── 休息預覽 ─────────────

export interface RestPreview {
  id: AllyId;
  name: string;
  from: number;
  to: number;
  maxHp: number;
  revived: boolean;
}

/** 休息後每位同伴的生命（與 run.ts 的 rest 同一套公式） */
export function restPreview(state: GameState): RestPreview[] {
  const healPercent = restHealPercent(state, REST_HEAL_PERCENT);
  return state.allies.map((a) => {
    const revived = a.hp <= 0;
    const to = revived ? percentCeil(a.maxHp, REVIVE_PERCENT) : Math.min(a.maxHp, a.hp + percentCeil(a.maxHp, healPercent));
    return { id: a.id, name: CHARACTERS[a.id].name, from: a.hp, to, maxHp: a.maxHp, revived };
  });
}

// ───────────── 媒介物品 ─────────────

export const RELIC_THEME_NAME: Readonly<Record<RelicTheme, string>> = {
  amp: '增幅',
  leon: '雷翁',
  agnes: '阿格妮絲',
  ace: '艾斯',
  general: '通用',
};

export interface RelicView {
  id: RelicId;
  name: string;
  theme: RelicTheme;
  themeName: string;
  /** 徽章上顯示的一個字 */
  short: string;
  description: string;
}

export function relicView(id: RelicId): RelicView {
  const def = RELICS[id];
  return {
    id,
    name: def.name,
    theme: def.theme,
    themeName: RELIC_THEME_NAME[def.theme],
    short: def.name.slice(0, 1),
    description: describeRelic(id),
  };
}

// ───────────── 路線 ─────────────

export type StopKind = 'normal' | 'elite' | 'boss';
export type StopStatus = 'done' | 'current' | 'upcoming';

export interface RouteStop {
  index: number;
  title: string;
  kind: StopKind;
  status: StopStatus;
}

export function routeView(state: GameState): RouteStop[] {
  return state.route.map((id, index) => {
    const e = ENCOUNTERS[id];
    const kind: StopKind = e.boss ? 'boss' : e.elite ? 'elite' : 'normal';
    const status: StopStatus = index < state.battleIndex ? 'done' : index === state.battleIndex ? 'current' : 'upcoming';
    return { index, title: e.title, kind, status };
  });
}

/** 下一站：開局選遺物時是第 1 場；之後是目前這場的下一場；最後一場之後為 null */
export function nextStop(state: GameState): RouteStop | null {
  const atStart = state.phase === 'relicChoice' && state.afterRelic === 'battle';
  return routeView(state)[atStart ? state.battleIndex : state.battleIndex + 1] ?? null;
}
