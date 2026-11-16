// 關卡與敵人（第 3.9 節）

import type { IntentPattern } from '../engine/types.ts';

export interface EnemyDef {
  readonly name: string;
  readonly hp: number;
  readonly pattern: readonly IntentPattern[];
}

export interface BattleDef {
  readonly title: string;
  readonly elite?: boolean;
  readonly boss?: boolean;
  readonly enemies: readonly EnemyDef[];
}

/** A(傷害, 次數)：攻擊 */
const A = (damage: number, hits = 1): IntentPattern => ({ kind: 'attack', damage, hits });
/** AOE(傷害)：全體攻擊 */
const AOE = (damage: number): IntentPattern => ({ kind: 'aoe', damage });
/** DEF(格擋, 攻擊力)：防禦 */
const DEF = (block: number, strength = 0): IntentPattern => ({ kind: 'defend', block, strength });

export const BATTLES: readonly BattleDef[] = [
  {
    title: '車站外的月台',
    enemies: [
      { name: '徘徊的執念', hp: 24, pattern: [A(6), A(4, 2), A(7)] },
      { name: '低語的殘影', hp: 20, pattern: [A(5), DEF(6), A(8)] },
    ],
  },
  {
    title: '售票口',
    enemies: [
      { name: '遺失車票的執念', hp: 34, pattern: [A(8), DEF(8), A(10)] },
      { name: '低語的殘影', hp: 22, pattern: [A(5), DEF(6), A(9)] },
    ],
  },
  {
    title: '長椅區',
    enemies: [
      { name: '等待的影子', hp: 18, pattern: [A(5), A(3, 2)] },
      { name: '等待的影子', hp: 18, pattern: [A(3, 2), A(5)] },
      { name: '等待的影子', hp: 18, pattern: [A(6), DEF(5)] },
    ],
  },
  {
    title: '精英：凝固的候車室',
    elite: true,
    enemies: [{ name: '月台的守候者', hp: 72, pattern: [A(11), AOE(6), DEF(12, 2), A(15)] }],
  },
  {
    title: '行李房',
    enemies: [
      { name: '沉重的行囊', hp: 50, pattern: [DEF(10), A(14), A(6, 2)] },
      { name: '徘徊的執念', hp: 26, pattern: [A(7), A(4, 2), A(8)] },
    ],
  },
  {
    title: '時刻表前',
    enemies: [
      { name: '錯過的班次', hp: 36, pattern: [A(9), AOE(5), A(7, 2)] },
      { name: '錯過的班次', hp: 36, pattern: [AOE(5), A(7, 2), A(9)] },
    ],
  },
  {
    title: '精英：停擺的鐘塔',
    elite: true,
    enemies: [{ name: '停擺的鐘', hp: 95, pattern: [DEF(14, 2), A(7, 2), AOE(5), A(15)] }],
  },
  {
    title: '天橋',
    enemies: [
      { name: '墜落的瞬間', hp: 60, pattern: [A(13), A(2, 3), DEF(12)] },
      { name: '低語的殘影', hp: 30, pattern: [A(6), DEF(8), A(8)] },
    ],
  },
  {
    title: '無盡的軌道',
    enemies: [
      { name: '軌道上的執念', hp: 34, pattern: [A(5), AOE(2), A(8)] },
      { name: '軌道上的執念', hp: 34, pattern: [AOE(2), A(8), A(5)] },
      { name: '軌道上的執念', hp: 34, pattern: [A(8), A(5), AOE(2)] },
    ],
  },
  {
    title: 'Boss：永不出發的列車',
    boss: true,
    enemies: [{ name: '褪色的列車長', hp: 160, pattern: [A(9), AOE(5), DEF(18, 3), A(6, 2), A(19)] }],
  },
];
