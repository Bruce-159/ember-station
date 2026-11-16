import { describe, expect, it } from 'vitest';
import { BATTLES } from '../src/data/battles.ts';
import { ALL_CARD_IDS, CARDS, REWARD_POOL, describeCard } from '../src/data/cards.ts';
import { CHARACTERS } from '../src/data/characters.ts';
import { STARTER_DECK } from '../src/data/starterDeck.ts';
import type { CardId, CardType, CharacterId, IntentPattern, TargetKind } from '../src/engine/types.ts';

describe('角色資料', () => {
  it('生命值符合規格', () => {
    expect(CHARACTERS.lucian.maxHp).toBeNull();
    expect(CHARACTERS.leon.maxHp).toBe(50);
    expect(CHARACTERS.agnes.maxHp).toBe(36);
    expect(CHARACTERS.ace.maxHp).toBe(40);
  });
});

describe('卡牌資料', () => {
  it('共 31 張卡，且每張的 id 與鍵一致', () => {
    expect(ALL_CARD_IDS).toHaveLength(31);
    for (const id of ALL_CARD_IDS) expect(CARDS[id].id).toBe(id);
  });

  it('獎勵卡池正好是規格表標示「是」的 18 張', () => {
    const expected: CardId[] = [
      'chainAmp', 'overload', 'calibrate',
      'shieldBash', 'holdFirm', 'noRetreat', 'lastCharge',
      'miasma', 'corrode', 'consume', 'soothe', 'wildfire', 'lingeringPoison',
      'goAllIn', 'loadedDice', 'losersRevenge', 'notForYou', 'coverFire',
    ];
    expect([...REWARD_POOL].sort()).toEqual([...expected].sort());
  });

  it('費用、持有者、類型、目標符合規格表', () => {
    const table: Array<[CardId, number, CharacterId, CardType, TargetKind]> = [
      ['pulse', 1, 'lucian', 'attack', 'enemy'],
      ['field', 1, 'lucian', 'skill', 'ally'],
      ['amp', 1, 'lucian', 'skill', 'none'],
      ['analyze', 0, 'lucian', 'skill', 'enemy'],
      ['chainAmp', 1, 'lucian', 'skill', 'none'],
      ['overload', 2, 'lucian', 'attack', 'enemy'],
      ['calibrate', 0, 'lucian', 'skill', 'none'],
      ['phalanx', 1, 'leon', 'skill', 'none'],
      ['thrust', 1, 'leon', 'attack', 'enemy'],
      ['bloodOath', 0, 'leon', 'skill', 'none'],
      ['shieldBash', 1, 'leon', 'attack', 'enemy'],
      ['holdFirm', 1, 'leon', 'skill', 'none'],
      ['noRetreat', 1, 'leon', 'power', 'none'],
      ['lastCharge', 2, 'leon', 'attack', 'enemy'],
      ['herb', 1, 'agnes', 'skill', 'enemy'],
      ['poultice', 1, 'agnes', 'skill', 'ally'],
      ['spark', 1, 'agnes', 'attack', 'enemy'],
      ['miasma', 1, 'agnes', 'skill', 'none'],
      ['corrode', 1, 'agnes', 'skill', 'enemy'],
      ['consume', 2, 'agnes', 'attack', 'enemy'],
      ['soothe', 1, 'agnes', 'skill', 'ally'],
      ['wildfire', 2, 'agnes', 'attack', 'none'],
      ['lingeringPoison', 2, 'agnes', 'power', 'none'],
      ['allIn', 1, 'ace', 'attack', 'enemy'],
      ['sleeve', 0, 'ace', 'skill', 'none'],
      ['bulletRain', 1, 'ace', 'attack', 'none'],
      ['goAllIn', 2, 'ace', 'attack', 'enemy'],
      ['loadedDice', 1, 'ace', 'power', 'none'],
      ['losersRevenge', 1, 'ace', 'attack', 'enemy'],
      ['notForYou', 1, 'ace', 'skill', 'ally'],
      ['coverFire', 1, 'ace', 'attack', 'enemy'],
    ];
    expect(table).toHaveLength(31);
    for (const [id, cost, owner, type, target] of table) {
      const def = CARDS[id];
      expect({ id, cost: def.cost, owner: def.owner, type: def.type, target: def.target }).toEqual({
        id,
        cost,
        owner,
        type,
        target,
      });
    }
  });

  it('只有增幅、連鎖增幅是增幅類；只有過載標記打出後移除；只有袖裡藏牌每回合限一次', () => {
    expect(ALL_CARD_IDS.filter((id) => CARDS[id].isAmp).sort()).toEqual(['amp', 'chainAmp']);
    expect(ALL_CARD_IDS.filter((id) => CARDS[id].exhaust)).toEqual(['overload']);
    expect(ALL_CARD_IDS.filter((id) => CARDS[id].oncePerTurn)).toEqual(['sleeve']);
  });

  it('每張卡都有說明文字，增幅後數字跟著改變', () => {
    for (const id of ALL_CARD_IDS) expect(describeCard(id).length).toBeGreaterThan(0);
    expect(describeCard('pulse')).toContain('6');
    expect(describeCard('pulse', { m: 2 })).toContain('12');
    expect(describeCard('herb', { m: 2 })).toContain('8');
  });
});

describe('起始牌組', () => {
  it('共 17 張，組成符合規格', () => {
    expect(STARTER_DECK).toHaveLength(17);
    const count = (id: CardId) => STARTER_DECK.filter((x) => x === id).length;
    expect(count('pulse')).toBe(3);
    expect(count('field')).toBe(3);
    const singles: CardId[] = [
      'amp', 'analyze', 'phalanx', 'thrust', 'bloodOath', 'herb', 'poultice', 'spark', 'allIn', 'sleeve', 'bulletRain',
    ];
    for (const id of singles) expect(count(id)).toBe(1);
    expect(STARTER_DECK.every((id) => !CARDS[id].reward)).toBe(true);
  });
});

describe('關卡資料', () => {
  it('共 10 場，標題與敵人生命符合規格', () => {
    expect(BATTLES).toHaveLength(10);
    const summary = BATTLES.map((b) => [b.title, b.enemies.map((e) => e.hp)]);
    expect(summary).toEqual([
      ['車站外的月台', [24, 20]],
      ['售票口', [34, 22]],
      ['長椅區', [18, 18, 18]],
      ['精英：凝固的候車室', [72]],
      ['行李房', [50, 26]],
      ['時刻表前', [36, 36]],
      ['精英：停擺的鐘塔', [95]],
      ['天橋', [60, 30]],
      ['無盡的軌道', [34, 34, 34]],
      ['Boss：永不出發的列車', [160]],
    ]);
  });

  it('所有敵人的行動模式符合規格（第 7–10 場攻擊傷害已依平衡決定 −3）', () => {
    const notation = (p: IntentPattern): string => {
      if (p.kind === 'attack') return p.hits === 1 ? `A(${p.damage})` : `A(${p.damage},${p.hits})`;
      if (p.kind === 'aoe') return `AOE(${p.damage})`;
      return p.strength === 0 ? `DEF(${p.block})` : `DEF(${p.block},${p.strength})`;
    };
    expect(BATTLES.map((b) => b.enemies.map((e) => e.pattern.map(notation).join(' ')))).toEqual([
      ['A(6) A(4,2) A(7)', 'A(5) DEF(6) A(8)'],
      ['A(8) DEF(8) A(10)', 'A(5) DEF(6) A(9)'],
      ['A(5) A(3,2)', 'A(3,2) A(5)', 'A(6) DEF(5)'],
      ['A(11) AOE(6) DEF(12,2) A(15)'],
      ['DEF(10) A(14) A(6,2)', 'A(7) A(4,2) A(8)'],
      ['A(9) AOE(5) A(7,2)', 'AOE(5) A(7,2) A(9)'],
      // 以下為平衡調整後的數值（原值各 +3）
      ['DEF(14,2) A(7,2) AOE(5) A(15)'],
      ['A(13) A(2,3) DEF(12)', 'A(6) DEF(8) A(8)'],
      ['A(5) AOE(2) A(8)', 'AOE(2) A(8) A(5)', 'A(8) A(5) AOE(2)'],
      ['A(9) AOE(5) DEF(18,3) A(6,2) A(19)'],
    ]);
  });

  it('每個敵人都有至少一個行動', () => {
    for (const b of BATTLES) for (const e of b.enemies) expect(e.pattern.length).toBeGreaterThan(0);
  });
});
