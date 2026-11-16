// 起始牌組（第 3.7 節，共 17 張）

import type { CardId } from '../engine/types.ts';

export const STARTER_DECK_COUNTS: ReadonlyArray<readonly [CardId, number]> = [
  ['pulse', 3],
  ['field', 3],
  ['amp', 1],
  ['analyze', 1],
  ['phalanx', 1],
  ['thrust', 1],
  ['bloodOath', 1],
  ['herb', 1],
  ['poultice', 1],
  ['spark', 1],
  ['allIn', 1],
  ['sleeve', 1],
  ['bulletRain', 1],
];

export const STARTER_DECK: readonly CardId[] = STARTER_DECK_COUNTS.flatMap(([id, n]) =>
  Array.from({ length: n }, () => id),
);
