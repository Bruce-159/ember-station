// 敵人意圖選擇與執行（第 3.5 節）

import { describe, expect, it } from 'vitest';
import { chooseIntent, intentDamage, pickAllyTarget } from '../src/engine/enemyAI.ts';
import type { Ctx, GameEvent, IntentPattern } from '../src/engine/types.ts';
import { ally, battleState, endTurn, enemy, makeEnemy, ofType } from './helpers.ts';

const A = (damage: number, hits = 1): IntentPattern => ({ kind: 'attack', damage, hits });
const AOE = (damage: number): IntentPattern => ({ kind: 'aoe', damage });
const DEF = (block: number, strength = 0): IntentPattern => ({ kind: 'defend', block, strength });

describe('意圖選擇', () => {
  it('依行動模式循環', () => {
    const s = battleState({ hand: [] });
    const e = makeEnemy('x', { pattern: [A(5), DEF(6), AOE(3)] });
    e.patternIndex = 0;
    const ctx: Ctx = { state: s, events: [] as GameEvent[] };
    const kinds: string[] = [];
    for (let i = 0; i < 7; i++) {
      chooseIntent(ctx, e);
      kinds.push(e.intent?.kind ?? '');
    }
    expect(kinds).toEqual(['attack', 'defend', 'aoe', 'attack', 'defend', 'aoe', 'attack']);
    expect(ofType(ctx.events, 'intentChosen')).toHaveLength(7);
  });

  it('戰鬥開始時就決定意圖，攻擊意圖已選好目標', () => {
    const s = battleState();
    const first = enemy(s, 'e0').intent;
    expect(first).toMatchObject({ kind: 'attack', damage: 6, hits: 1 });
    if (first?.kind === 'attack') expect(['leon', 'agnes', 'ace']).toContain(first.targetId);
  });

  it('目標加權：雷翁權重 2、其他人 1（約 50% / 25% / 25%）', () => {
    const s = battleState({ hand: [] });
    const counts = { leon: 0, agnes: 0, ace: 0 };
    const n = 8000;
    for (let i = 0; i < n; i++) {
      const t = pickAllyTarget(s);
      if (t) counts[t] += 1;
    }
    expect(counts.leon / n).toBeGreaterThan(0.46);
    expect(counts.leon / n).toBeLessThan(0.54);
    expect(counts.agnes / n).toBeGreaterThan(0.21);
    expect(counts.ace / n).toBeGreaterThan(0.21);
  });

  it('只從存活同伴中選', () => {
    const s = battleState({ hand: [], allyHp: { leon: 0, ace: 0 } });
    for (let i = 0; i < 50; i++) expect(pickAllyTarget(s)).toBe('agnes');
    const none = battleState({ hand: [], allyHp: { leon: 0, ace: 0, agnes: 0 } });
    expect(pickAllyTarget(none)).toBeNull();
  });

  it('意圖顯示的實際傷害 = 意圖傷害 + 攻擊力', () => {
    const e = makeEnemy('x', { strength: 3, intent: { kind: 'attack', damage: 9, hits: 2, targetId: 'leon' } });
    expect(intentDamage(e)).toBe(12);
    expect(intentDamage(makeEnemy('y', { intent: { kind: 'defend', block: 5, strength: 0 } }))).toBeNull();
  });
});

describe('意圖執行', () => {
  it('攻擊：依次數打指定目標，傷害含攻擊力', () => {
    const s = endTurn(
      battleState({ hand: [], enemies: [{ hp: 50, strength: 2, intent: { kind: 'attack', damage: 4, hits: 2, targetId: 'ace' } }] }),
    ).state;
    expect(ally(s, 'ace').hp).toBe(40 - 12);
  });

  it('攻擊：執行時若目標已倒下，重新選一位存活同伴', () => {
    const r = endTurn(
      battleState({
        hand: [],
        enemies: [{ hp: 50, intent: { kind: 'attack', damage: 5, hits: 1, targetId: 'agnes' } }],
        allyHp: { agnes: 0 },
      }),
    );
    const hits = ofType(r.events, 'damage').filter((e) => e.source === 'enemy');
    expect(hits).toHaveLength(1);
    expect(['leon', 'ace']).toContain(hits[0]?.targetId);
  });

  it('攻擊：連擊中途目標倒下，剩下的連擊改打另一位', () => {
    const r = endTurn(
      battleState({
        hand: [],
        enemies: [{ hp: 50, intent: { kind: 'attack', damage: 5, hits: 3, targetId: 'agnes' } }],
        allyHp: { agnes: 5 },
      }),
    );
    const targets = ofType(r.events, 'damage').filter((e) => e.source === 'enemy').map((e) => e.targetId);
    expect(targets).toHaveLength(3);
    expect(targets[0]).toBe('agnes');
    expect(targets[1]).not.toBe('agnes');
    expect(targets[2]).toBe(targets[1]);
  });

  it('全體攻擊：打所有存活同伴', () => {
    const s = endTurn(
      battleState({ hand: [], enemies: [{ hp: 50, strength: 1, intent: { kind: 'aoe', damage: 5 } }], allyHp: { ace: 0 } }),
    ).state;
    expect([ally(s, 'leon').hp, ally(s, 'agnes').hp, ally(s, 'ace').hp]).toEqual([44, 30, 0]);
  });

  it('防禦：獲得格擋，攻擊力永久提高', () => {
    let s = battleState({
      hand: [],
      enemies: [{ hp: 50, pattern: [DEF(6, 2), A(5)], intent: { kind: 'defend', block: 6, strength: 2 } }],
    });
    s = endTurn(s).state;
    expect(enemy(s)).toMatchObject({ block: 6, strength: 2 });
    expect(enemy(s).intent).toMatchObject({ kind: 'attack', damage: 5 });
    const leonBefore = ally(s, 'leon').hp + ally(s, 'agnes').hp + ally(s, 'ace').hp;
    s = endTurn(s).state;
    // 敵人行動時格擋歸零；攻擊 5 + 2 = 7
    expect(enemy(s).block).toBe(0);
    const after = ally(s, 'leon').hp + ally(s, 'agnes').hp + ally(s, 'ace').hp;
    expect(leonBefore - after).toBe(7);
  });

  it('敵人的格擋在自己行動時歸零（玩家回合中仍有效）', () => {
    const s = endTurn(battleState({ hand: [], enemies: [{ hp: 50, block: 9 }] })).state;
    expect(enemy(s).block).toBe(0);
  });

  it('行動順序：中毒 → 格擋歸零 → 執行意圖 → 決定下一個意圖', () => {
    const r = endTurn(
      battleState({
        hand: [],
        enemies: [{ hp: 50, poison: 2, pattern: [A(3), DEF(4)], intent: { kind: 'attack', damage: 3, hits: 1, targetId: 'leon' } }],
      }),
    );
    const seq = r.events
      .filter((e) => ['enemyTurn', 'damage', 'intentChosen', 'turnStarted'].includes(e.type))
      .map((e) => (e.type === 'damage' ? `damage:${e.source}` : e.type));
    expect(seq).toEqual(['enemyTurn', 'damage:poison', 'damage:enemy', 'intentChosen', 'turnStarted']);
  });

  it('敵人依陣列順序逐一行動', () => {
    const r = endTurn(
      battleState({
        hand: [],
        enemies: [
          { hp: 50, intent: { kind: 'attack', damage: 1, hits: 1, targetId: 'leon' } },
          { hp: 50, intent: { kind: 'attack', damage: 2, hits: 1, targetId: 'leon' } },
          { hp: 0 },
        ],
      }),
    );
    expect(ofType(r.events, 'enemyTurn').map((e) => e.enemyId)).toEqual(['e0', 'e1']);
  });

  it('同伴在中途全滅時立刻失敗，後面的敵人不再行動', () => {
    const r = endTurn(
      battleState({
        hand: [],
        enemies: [{ hp: 50, intent: { kind: 'aoe', damage: 99 } }, { hp: 50, intent: { kind: 'aoe', damage: 1 } }],
      }),
    );
    expect(r.state.phase).toBe('defeat');
    expect(ofType(r.events, 'enemyTurn')).toHaveLength(1);
  });
});
