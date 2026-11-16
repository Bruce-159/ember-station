// 同伴資料（第 3.1 節）

import type { AllyId, CharacterId } from '../engine/types.ts';

export interface CharacterDef {
  readonly id: CharacterId;
  readonly name: string;
  readonly role: string;
  /** 盧西安沒有血條，為 null */
  readonly maxHp: number | null;
}

export const CHARACTERS: Readonly<Record<CharacterId, CharacterDef>> = {
  lucian: { id: 'lucian', name: '盧西安', role: '後方支援', maxHp: null },
  leon: { id: 'leon', name: '雷翁', role: '前線坦克', maxHp: 50 },
  agnes: { id: 'agnes', name: '阿格妮絲', role: '毒與治療', maxHp: 36 },
  ace: { id: 'ace', name: '艾斯', role: '下注爆發', maxHp: 40 },
};

/** 場上同伴的排列順序 */
export const ALLY_ORDER: readonly AllyId[] = ['leon', 'agnes', 'ace'];

export function allyMaxHp(id: AllyId): number {
  const hp = CHARACTERS[id].maxHp;
  if (hp === null) throw new Error(`${id} 沒有血條`);
  return hp;
}
