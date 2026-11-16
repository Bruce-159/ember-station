// 遭遇與路線分段（追加規格 v2 第 3 節）。
// 第 7–10 場（精英二、後段、Boss）的數值已對齊「攻擊 −3」之後的水準。
// 平衡調整（2026-11-16，開發者決定）：所有敵人生命 ×1.25（無條件進位），行動模式不變。

import type { EncounterId, IntentPattern } from '../engine/types.ts';

export interface EnemyDef {
  readonly name: string;
  readonly hp: number;
  readonly pattern: readonly IntentPattern[];
}

export interface EncounterDef {
  readonly id: EncounterId;
  readonly title: string;
  readonly elite?: boolean;
  readonly boss?: boolean;
  /** 同一段內的排序依據：數字小的先出現（只抽 1 組的段不使用，固定填 1） */
  readonly difficulty: number;
  readonly enemies: readonly EnemyDef[];
}

export interface StageDef {
  readonly label: string;
  readonly pool: readonly EncounterId[];
  readonly count: number;
}

/** A(傷害, 次數)：攻擊 */
const A = (damage: number, hits = 1): IntentPattern => ({ kind: 'attack', damage, hits });
/** AOE(傷害)：全體攻擊 */
const AOE = (damage: number): IntentPattern => ({ kind: 'aoe', damage });
/** DEF(格擋, 攻擊力)：防禦 */
const DEF = (block: number, strength = 0): IntentPattern => ({ kind: 'defend', block, strength });

export const ENCOUNTERS: Readonly<Record<EncounterId, EncounterDef>> = {
  // ───── 前段 ─────
  platform: {
    id: 'platform',
    title: '車站外的月台',
    difficulty: 1,
    enemies: [
      { name: '徘徊的執念', hp: 30, pattern: [A(6), A(4, 2), A(7)] },
      { name: '低語的殘影', hp: 25, pattern: [A(5), DEF(6), A(8)] },
    ],
  },
  ticketOffice: {
    id: 'ticketOffice',
    title: '售票口',
    difficulty: 2,
    enemies: [
      { name: '遺失車票的執念', hp: 43, pattern: [A(8), DEF(8), A(10)] },
      { name: '低語的殘影', hp: 28, pattern: [A(5), DEF(6), A(9)] },
    ],
  },
  benches: {
    id: 'benches',
    title: '長椅區',
    difficulty: 3,
    enemies: [
      { name: '等待的影子', hp: 23, pattern: [A(5), A(3, 2)] },
      { name: '等待的影子', hp: 23, pattern: [A(3, 2), A(5)] },
      { name: '等待的影子', hp: 23, pattern: [A(6), DEF(5)] },
    ],
  },
  ticketGate: {
    id: 'ticketGate',
    title: '剪票口',
    difficulty: 1,
    enemies: [
      { name: '剪票口的殘影', hp: 27, pattern: [A(4, 2), DEF(5), A(7)] },
      { name: '剪票口的殘影', hp: 27, pattern: [DEF(5), A(7), A(4, 2)] },
    ],
  },
  lostAndFound: {
    id: 'lostAndFound',
    title: '失物招領櫃台',
    difficulty: 3,
    enemies: [
      { name: '遺失車票的執念', hp: 38, pattern: [A(7), DEF(7), A(9)] },
      { name: '等待的影子', hp: 23, pattern: [A(5), A(3, 2)] },
    ],
  },

  // ───── 精英一 ─────
  waitingRoom: {
    id: 'waitingRoom',
    title: '精英：凝固的候車室',
    elite: true,
    difficulty: 1,
    enemies: [{ name: '月台的守候者', hp: 90, pattern: [A(11), AOE(6), DEF(12, 2), A(15)] }],
  },
  lostStorage: {
    id: 'lostStorage',
    title: '精英：遺失物倉庫',
    elite: true,
    difficulty: 1,
    enemies: [{ name: '堆積的遺失物', hp: 83, pattern: [DEF(10, 1), A(5, 2), AOE(7), A(13)] }],
  },

  // ───── 中段 ─────
  baggageRoom: {
    id: 'baggageRoom',
    title: '行李房',
    difficulty: 1,
    enemies: [
      { name: '沉重的行囊', hp: 63, pattern: [DEF(10), A(14), A(6, 2)] },
      { name: '徘徊的執念', hp: 33, pattern: [A(7), A(4, 2), A(8)] },
    ],
  },
  timetable: {
    id: 'timetable',
    title: '時刻表前',
    difficulty: 2,
    enemies: [
      { name: '錯過的班次', hp: 45, pattern: [A(9), AOE(5), A(7, 2)] },
      { name: '錯過的班次', hp: 45, pattern: [AOE(5), A(7, 2), A(9)] },
    ],
  },
  platformTwo: {
    id: 'platformTwo',
    title: '第二月台',
    difficulty: 2,
    enemies: [
      { name: '掃不完的灰燼', hp: 50, pattern: [A(6, 2), DEF(9, 1), A(11)] },
      { name: '低語的殘影', hp: 33, pattern: [A(6), DEF(7), A(9)] },
    ],
  },
  queue: {
    id: 'queue',
    title: '擁擠的候車線',
    difficulty: 1,
    enemies: [
      { name: '等待的影子', hp: 28, pattern: [A(6), A(4, 2)] },
      { name: '等待的影子', hp: 28, pattern: [A(4, 2), A(6)] },
      { name: '等待的影子', hp: 28, pattern: [A(7), DEF(6)] },
    ],
  },

  // ───── 精英二 ─────
  clockTower: {
    id: 'clockTower',
    title: '精英：停擺的鐘塔',
    elite: true,
    difficulty: 1,
    enemies: [{ name: '停擺的鐘', hp: 119, pattern: [DEF(14, 2), A(7, 2), AOE(5), A(15)] }],
  },
  signalRoom: {
    id: 'signalRoom',
    title: '精英：信號機房',
    elite: true,
    difficulty: 1,
    enemies: [
      { name: '失靈的信號燈', hp: 73, pattern: [AOE(4), A(10), DEF(10, 1), A(5, 2)] },
      { name: '低語的殘影', hp: 33, pattern: [A(5), DEF(7), A(7)] },
    ],
  },

  // ───── 後段 ─────
  overpass: {
    id: 'overpass',
    title: '天橋',
    difficulty: 1,
    enemies: [
      { name: '墜落的瞬間', hp: 75, pattern: [A(13), A(2, 3), DEF(12)] },
      { name: '低語的殘影', hp: 38, pattern: [A(6), DEF(8), A(8)] },
    ],
  },
  endlessTrack: {
    id: 'endlessTrack',
    title: '無盡的軌道',
    difficulty: 2,
    enemies: [
      { name: '軌道上的執念', hp: 43, pattern: [A(5), AOE(2), A(8)] },
      { name: '軌道上的執念', hp: 43, pattern: [AOE(2), A(8), A(5)] },
      { name: '軌道上的執念', hp: 43, pattern: [A(8), A(5), AOE(2)] },
    ],
  },
  platformEnd: {
    id: 'platformEnd',
    title: '月台盡頭',
    difficulty: 1,
    enemies: [
      { name: '沉重的行囊', hp: 70, pattern: [DEF(10), A(11), A(4, 2)] },
      { name: '錯過的班次', hp: 40, pattern: [A(6), AOE(3), A(5, 2)] },
    ],
  },
  lastCarriage: {
    id: 'lastCarriage',
    title: '末班車的車廂',
    difficulty: 2,
    enemies: [
      { name: '沉睡的乘客', hp: 50, pattern: [A(9), DEF(10, 1), AOE(3)] },
      { name: '沉睡的乘客', hp: 50, pattern: [DEF(10, 1), AOE(3), A(9)] },
    ],
  },

  // ───── Boss ─────
  train: {
    id: 'train',
    title: 'Boss：永不出發的列車',
    boss: true,
    difficulty: 1,
    enemies: [{ name: '褪色的列車長', hp: 200, pattern: [A(9), AOE(5), DEF(18, 3), A(6, 2), A(19)] }],
  },
  stationOffice: {
    id: 'stationOffice',
    title: 'Boss：熄燈前的站務室',
    boss: true,
    difficulty: 1,
    enemies: [{ name: '不肯熄燈的站長', hp: 188, pattern: [AOE(4), A(8, 2), DEF(15, 2), A(12), AOE(7)] }],
  },
};

export const ALL_ENCOUNTER_IDS = Object.keys(ENCOUNTERS) as EncounterId[];

/** 一輪的 6 段，依序排列 */
export const STAGES: readonly StageDef[] = [
  { label: '前段', pool: ['platform', 'ticketOffice', 'benches', 'ticketGate', 'lostAndFound'], count: 3 },
  { label: '精英', pool: ['waitingRoom', 'lostStorage'], count: 1 },
  { label: '中段', pool: ['baggageRoom', 'timetable', 'platformTwo', 'queue'], count: 2 },
  { label: '精英', pool: ['clockTower', 'signalRoom'], count: 1 },
  { label: '後段', pool: ['overpass', 'endlessTrack', 'platformEnd', 'lastCarriage'], count: 2 },
  { label: 'Boss', pool: ['train', 'stationOffice'], count: 1 },
];

/** 一輪的場數 */
export const ROUTE_LENGTH = STAGES.reduce((n, s) => n + s.count, 0);

/** 第 i 場屬於第幾段（長度 = ROUTE_LENGTH） */
export const STAGE_OF_SLOT: readonly number[] = STAGES.flatMap((s, i) => Array.from({ length: s.count }, () => i));
