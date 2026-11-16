import { describe, expect, it } from 'vitest';
import { ALL_ENCOUNTER_IDS, ENCOUNTERS, ROUTE_LENGTH, STAGE_OF_SLOT, STAGES } from '../src/data/encounters.ts';
import { ALL_CARD_IDS, CARDS, REWARD_POOL, describeCard } from '../src/data/cards.ts';
import { CHARACTERS } from '../src/data/characters.ts';
import { STARTER_DECK } from '../src/data/starterDeck.ts';
import type { CardId, CardType, CharacterId, EncounterId, IntentPattern, TargetKind } from '../src/engine/types.ts';

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

describe('遭遇資料', () => {
  const notation = (p: IntentPattern): string => {
    if (p.kind === 'attack') return p.hits === 1 ? `A(${p.damage})` : `A(${p.damage},${p.hits})`;
    if (p.kind === 'aoe') return `AOE(${p.damage})`;
    return p.strength === 0 ? `DEF(${p.block})` : `DEF(${p.block},${p.strength})`;
  };
  const summary = (ids: EncounterId[]) =>
    Object.fromEntries(
      ids.map((id) => [id, [ENCOUNTERS[id].title, ENCOUNTERS[id].enemies.map((e) => `${e.hp}:${e.pattern.map(notation).join(' ')}`)]]),
    );

  it('共 19 組，id 與鍵一致', () => {
    expect(ALL_ENCOUNTER_IDS).toHaveLength(19);
    for (const id of ALL_ENCOUNTER_IDS) expect(ENCOUNTERS[id].id).toBe(id);
  });

  it('沿用的 10 組與第一版數值相同（精英二、後段、Boss 已含攻擊 −3）', () => {
    expect(
      summary(['platform', 'ticketOffice', 'benches', 'waitingRoom', 'baggageRoom', 'timetable', 'clockTower', 'overpass', 'endlessTrack', 'train']),
    ).toEqual({
      platform: ['車站外的月台', ['24:A(6) A(4,2) A(7)', '20:A(5) DEF(6) A(8)']],
      ticketOffice: ['售票口', ['34:A(8) DEF(8) A(10)', '22:A(5) DEF(6) A(9)']],
      benches: ['長椅區', ['18:A(5) A(3,2)', '18:A(3,2) A(5)', '18:A(6) DEF(5)']],
      waitingRoom: ['精英：凝固的候車室', ['72:A(11) AOE(6) DEF(12,2) A(15)']],
      baggageRoom: ['行李房', ['50:DEF(10) A(14) A(6,2)', '26:A(7) A(4,2) A(8)']],
      timetable: ['時刻表前', ['36:A(9) AOE(5) A(7,2)', '36:AOE(5) A(7,2) A(9)']],
      clockTower: ['精英：停擺的鐘塔', ['95:DEF(14,2) A(7,2) AOE(5) A(15)']],
      overpass: ['天橋', ['60:A(13) A(2,3) DEF(12)', '30:A(6) DEF(8) A(8)']],
      endlessTrack: ['無盡的軌道', ['34:A(5) AOE(2) A(8)', '34:AOE(2) A(8) A(5)', '34:A(8) A(5) AOE(2)']],
      train: ['Boss：永不出發的列車', ['160:A(9) AOE(5) DEF(18,3) A(6,2) A(19)']],
    });
  });

  it('新增的 9 組符合追加規格第 3.3 節', () => {
    expect(
      summary(['ticketGate', 'lostAndFound', 'lostStorage', 'platformTwo', 'queue', 'signalRoom', 'platformEnd', 'lastCarriage', 'stationOffice']),
    ).toEqual({
      ticketGate: ['剪票口', ['21:A(4,2) DEF(5) A(7)', '21:DEF(5) A(7) A(4,2)']],
      lostAndFound: ['失物招領櫃台', ['30:A(7) DEF(7) A(9)', '18:A(5) A(3,2)']],
      lostStorage: ['精英：遺失物倉庫', ['66:DEF(10,1) A(5,2) AOE(7) A(13)']],
      platformTwo: ['第二月台', ['40:A(6,2) DEF(9,1) A(11)', '26:A(6) DEF(7) A(9)']],
      queue: ['擁擠的候車線', ['22:A(6) A(4,2)', '22:A(4,2) A(6)', '22:A(7) DEF(6)']],
      signalRoom: ['精英：信號機房', ['58:AOE(4) A(10) DEF(10,1) A(5,2)', '26:A(5) DEF(7) A(7)']],
      platformEnd: ['月台盡頭', ['56:DEF(10) A(11) A(4,2)', '32:A(6) AOE(3) A(5,2)']],
      lastCarriage: ['末班車的車廂', ['40:A(9) DEF(10,1) AOE(3)', '40:DEF(10,1) AOE(3) A(9)']],
      stationOffice: ['Boss：熄燈前的站務室', ['150:AOE(4) A(8,2) DEF(15,2) A(12) AOE(7)']],
    });
  });

  it('6 段共 10 場；每組遭遇恰好屬於一段', () => {
    expect(STAGES.map((s) => [s.label, s.pool.length, s.count])).toEqual([
      ['前段', 5, 3],
      ['精英', 2, 1],
      ['中段', 4, 2],
      ['精英', 2, 1],
      ['後段', 4, 2],
      ['Boss', 2, 1],
    ]);
    expect(ROUTE_LENGTH).toBe(10);
    expect(STAGE_OF_SLOT).toEqual([0, 0, 0, 1, 2, 2, 3, 4, 4, 5]);
    const all = STAGES.flatMap((s) => s.pool);
    expect([...all].sort()).toEqual([...ALL_ENCOUNTER_IDS].sort());
  });

  it('難度：前段 1／2／3／1／3，中段 1／2／2／1，後段 1／2／1／2', () => {
    const d = (ids: EncounterId[]) => ids.map((id) => ENCOUNTERS[id].difficulty);
    expect(d(['platform', 'ticketOffice', 'benches', 'ticketGate', 'lostAndFound'])).toEqual([1, 2, 3, 1, 3]);
    expect(d(['baggageRoom', 'timetable', 'platformTwo', 'queue'])).toEqual([1, 2, 2, 1]);
    expect(d(['overpass', 'endlessTrack', 'platformEnd', 'lastCarriage'])).toEqual([1, 2, 1, 2]);
  });

  it('精英段只有精英、Boss 段只有 Boss，其他段兩者皆非', () => {
    STAGES.forEach((stage, i) => {
      for (const id of stage.pool) {
        const e = ENCOUNTERS[id];
        expect([!!e.elite, !!e.boss]).toEqual([i === 1 || i === 3, i === 5]);
      }
    });
  });

  it('每個敵人生命 > 0、至少一個行動；一場最多 3 個敵人', () => {
    for (const id of ALL_ENCOUNTER_IDS) {
      const e = ENCOUNTERS[id];
      expect(e.enemies.length).toBeGreaterThan(0);
      expect(e.enemies.length).toBeLessThanOrEqual(3);
      for (const enemy of e.enemies) {
        expect(enemy.hp).toBeGreaterThan(0);
        expect(enemy.pattern.length).toBeGreaterThan(0);
      }
    }
  });
});
