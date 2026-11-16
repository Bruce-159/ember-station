// 平衡模擬器（第 5 節）

import { describe, expect, it } from 'vitest';
import {
  createGreedyBot,
  findAttackPlay,
  findDefensivePlay,
  findKillingPlay,
  findOtherPlay,
  incomingDamage,
  pickRemoval,
} from '../src/sim/greedyBot.ts';
import { parseArgs } from '../src/sim/simulate.ts';
import {
  deriveSeeds,
  displayWidth,
  formatReport,
  simulate,
  simulateRun,
  summarize,
  type RunResult,
} from '../src/sim/simulator.ts';
import { reduce } from '../src/engine/reducer.ts';
import type { GameState } from '../src/engine/types.ts';
import { battleState, newRun } from './helpers.ts';

const cardOf = (s: GameState, uid: number | undefined) => s.hand.find((c) => c.uid === uid)?.cardId;

describe('貪婪機器人：規則 1 擊殺', () => {
  it('優先打出能擊殺的攻擊，費用低者優先', () => {
    const s = battleState({ hand: ['overload', 'pulse', 'thrust'], enemies: [{ hp: 50 }, { hp: 6 }] });
    const c = findKillingPlay(s);
    expect(c?.def.id).toBe('pulse');
    expect(c?.targetId).toBe('e1');
  });

  it('考慮格擋與解析等加成', () => {
    const blocked = battleState({ hand: ['pulse'], enemies: [{ hp: 6, block: 1 }] });
    expect(findKillingPlay(blocked)).toBeNull();
    const analyzed = battleState({ hand: ['pulse'], enemies: [{ hp: 9, analyzed: true }] });
    expect(findKillingPlay(analyzed)?.def.id).toBe('pulse');
  });

  it('未保證成功的下注不算擊殺（不偷看亂數）；出千後才算', () => {
    const s = battleState({ hand: ['allIn'], enemies: [{ hp: 10 }] });
    expect(findKillingPlay(s)).toBeNull();
    const rigged = battleState({ hand: ['allIn'], enemies: [{ hp: 10 }], patch: (st) => (st.rigged = true) });
    expect(findKillingPlay(rigged)?.def.id).toBe('allIn');
  });

  it('擊殺優先於防守', () => {
    const s = battleState({
      hand: ['field', 'pulse'],
      enemies: [{ hp: 5, intent: { kind: 'attack', damage: 30, hits: 1, targetId: 'agnes' } }, { hp: 50 }],
    });
    expect(cardOf(s, (createGreedyBot().decide(s) as { uid?: number }).uid)).toBe('pulse');
  });
});

describe('貪婪機器人：規則 2 防守', () => {
  it('估算來襲傷害：攻擊含攻擊力與次數、全體攻擊打每位存活同伴', () => {
    const s = battleState({
      hand: [],
      enemies: [
        { hp: 10, strength: 1, intent: { kind: 'attack', damage: 4, hits: 2, targetId: 'agnes' } },
        { hp: 10, intent: { kind: 'aoe', damage: 3 } },
        { hp: 0, intent: { kind: 'aoe', damage: 99 } },
      ],
      allyHp: { ace: 0 },
    });
    expect(incomingDamage(s)).toEqual({ leon: 3, agnes: 13, ace: 0 });
  });

  it('同伴即將受到的傷害大於格擋時，對他出格擋', () => {
    const s = battleState({
      hand: ['pulse', 'field'],
      enemies: [{ hp: 50, intent: { kind: 'attack', damage: 8, hits: 1, targetId: 'ace' } }],
    });
    const c = findDefensivePlay(s);
    expect(c?.def.id).toBe('field');
    expect(c?.targetId).toBe('ace');
  });

  it('方陣只用來保護雷翁', () => {
    const forAgnes = battleState({ hand: ['phalanx'], enemies: [{ hp: 50, intent: { kind: 'attack', damage: 8, hits: 1, targetId: 'agnes' } }] });
    expect(findDefensivePlay(forAgnes)).toBeNull();
    const forLeon = battleState({ hand: ['phalanx'], enemies: [{ hp: 50, intent: { kind: 'attack', damage: 8, hits: 1, targetId: 'leon' } }] });
    expect(findDefensivePlay(forLeon)?.def.id).toBe('phalanx');
  });

  it('格擋已足夠時不出防守牌', () => {
    const s = battleState({
      hand: ['field'],
      enemies: [{ hp: 50, intent: { kind: 'attack', damage: 8, hits: 1, targetId: 'ace' } }],
      patch: (st) => (st.allies[2]!.block = 8),
    });
    expect(findDefensivePlay(s)).toBeNull();
  });

  it('沒有格擋牌時改出回復；滿血不回復', () => {
    const hurt = battleState({
      hand: ['poultice'],
      enemies: [{ hp: 50, intent: { kind: 'attack', damage: 8, hits: 1, targetId: 'ace' } }],
      allyHp: { ace: 20 },
    });
    expect(findDefensivePlay(hurt)?.def.id).toBe('poultice');
    const full = battleState({ hand: ['poultice'], enemies: [{ hp: 50, intent: { kind: 'attack', damage: 8, hits: 1, targetId: 'ace' } }] });
    expect(findDefensivePlay(full)).toBeNull();
  });

  it('多人受威脅時，先保護缺口最大的同伴', () => {
    const s = battleState({
      hand: ['field'],
      enemies: [
        { hp: 50, intent: { kind: 'attack', damage: 5, hits: 1, targetId: 'ace' } },
        { hp: 50, intent: { kind: 'attack', damage: 12, hits: 1, targetId: 'agnes' } },
      ],
    });
    expect(findDefensivePlay(s)?.targetId).toBe('agnes');
  });
});

describe('貪婪機器人：規則 3 攻擊、規則 4 其他', () => {
  it('攻擊依費用由高到低，目標選生命 + 格擋最低的敵人', () => {
    const s = battleState({ hand: ['pulse', 'overload'], enemies: [{ hp: 60 }, { hp: 30, block: 5 }] });
    const c = findAttackPlay(s);
    expect(c?.def.id).toBe('overload');
    expect(c?.targetId).toBe('e1');
  });

  it('不打必定 0 傷害的攻擊（例如手氣 0 的輸家的反擊）', () => {
    const s = battleState({ hand: ['losersRevenge'], enemies: [{ hp: 60 }] });
    expect(findAttackPlay(s)).toBeNull();
  });

  it('其他牌依費用由高到低，增幅類放最後，沒有效果的牌不打', () => {
    const s = battleState({ hand: ['amp', 'herb', 'sleeve'], enemies: [{ hp: 60 }] });
    expect(findOtherPlay(s, { allowCalibrate: true })?.def.id).toBe('herb');
    const ampLast = battleState({ hand: ['amp', 'sleeve'], enemies: [{ hp: 60 }] });
    expect(findOtherPlay(ampLast, { allowCalibrate: true })?.def.id).toBe('sleeve');
    const useless = battleState({ hand: ['corrode'], enemies: [{ hp: 60 }] });
    expect(findOtherPlay(useless, { allowCalibrate: true })).toBeNull();
  });

  it('沒有可打的牌就結束回合', () => {
    const s = battleState({ hand: ['overload'], energy: 1 });
    expect(createGreedyBot().decide(s)).toEqual({ type: 'END_TURN' });
  });
});

describe('貪婪機器人：獎勵與移除', () => {
  it('獎勵一律選第一張', () => {
    const s: GameState = { ...newRun(1), phase: 'reward', rewardOptions: ['wildfire', 'overload', 'soothe'] };
    expect(createGreedyBot().decide(s)).toEqual({ type: 'PICK_REWARD', cardId: 'wildfire' });
  });

  it('移除一張 pulse 或 field，沒有就跳過', () => {
    const s = newRun(1);
    const pulse = s.deck.find((c) => c.cardId === 'pulse');
    expect(pickRemoval(s)).toBe(pulse?.uid);
    const onlyField: GameState = { ...s, deck: s.deck.filter((c) => c.cardId !== 'pulse') };
    expect(onlyField.deck.find((c) => c.uid === pickRemoval(onlyField))?.cardId).toBe('field');
    const neither: GameState = { ...s, deck: s.deck.filter((c) => c.cardId !== 'pulse' && c.cardId !== 'field') };
    expect(pickRemoval(neither)).toBeNull();
  });

  it('機器人送出的動作永遠合法', () => {
    // simulateRun 遇到被拒絕的動作會丟出錯誤
    for (const seed of deriveSeeds(99, 30)) expect(() => simulateRun(seed)).not.toThrow();
  });

  it('機器人的決策不修改狀態', () => {
    const s = battleState({ enemies: [{ hp: 20, intent: { kind: 'attack', damage: 9, hits: 1, targetId: 'leon' } }] });
    const before = JSON.stringify(s);
    createGreedyBot().decide(s);
    expect(JSON.stringify(s)).toBe(before);
    expect(reduce(s, createGreedyBot().decide(s)).events[0]?.type).not.toBe('actionRejected');
  });
});

describe('模擬與報表', () => {
  it('每局的種子由基礎種子衍生，可重現且不重複', () => {
    expect(deriveSeeds(1, 50)).toEqual(deriveSeeds(1, 50));
    expect(new Set(deriveSeeds(1, 500)).size).toBe(500);
    expect(deriveSeeds(1, 5)).not.toEqual(deriveSeeds(2, 5));
  });

  it('同一個種子產生完全相同的報告與輸出文字', () => {
    const a = simulate({ runs: 40, seed: 3 });
    const b = simulate({ runs: 40, seed: 3 });
    expect(a).toEqual(b);
    expect(formatReport(a)).toBe(formatReport(b));
  });

  it('不同種子產生不同結果', () => {
    expect(simulate({ runs: 40, seed: 3 })).not.toEqual(simulate({ runs: 40, seed: 4 }));
  });

  it('統計前後一致：第 n+1 場的抵達數 = 第 n 場的通過數；第 10 場通過數 = 勝場', () => {
    const r = simulate({ runs: 60, seed: 5 });
    expect(r.battles).toHaveLength(10);
    expect(r.battles[0]?.reached).toBe(60);
    for (let i = 0; i < 9; i++) expect(r.battles[i + 1]?.reached).toBe(r.battles[i]?.passed);
    expect(r.battles[9]?.passed).toBe(r.wins);
    expect(r.winRate).toBeCloseTo(r.wins / 60);
    // 機器人每過一場（最後一場除外）都會拿一張牌
    const totalPicks = r.picks.reduce((sum, p) => sum + p.count, 0);
    const passedNonFinal = r.battles.slice(0, 9).reduce((sum, b) => sum + b.passed, 0);
    expect(totalPicks).toBe(passedNonFinal);
  });

  it('summarize 的比例計算', () => {
    const results: RunResult[] = [
      { seed: 1, won: true, lastBattle: 9, turns: [3, 3, 3, 3, 3, 3, 3, 3, 3, 3], picks: ['overload'], stalled: false },
      { seed: 2, won: false, lastBattle: 1, turns: [5, 7], picks: ['overload', 'soothe'], stalled: false },
    ];
    const r = summarize({ runs: 2, seed: 0 }, results);
    expect(r.winRate).toBe(0.5);
    expect(r.battles[0]).toMatchObject({ reached: 2, passed: 2, passRate: 1, avgTurns: 4 });
    expect(r.battles[1]).toMatchObject({ reached: 2, passed: 1, passRate: 0.5, avgTurns: 5 });
    expect(r.battles[2]).toMatchObject({ reached: 1, reachRate: 0.5 });
    expect(r.picks[0]).toMatchObject({ cardId: 'overload', count: 2 });
    expect(r.avgTurnsPerRun).toBe((30 + 12) / 2);
    expect(r.inTargetRange).toBe(true);
  });

  it('勝率超出 20%–60% 時，報表會標示交由開發者決定', () => {
    const base = summarize({ runs: 1, seed: 0 }, [
      { seed: 1, won: false, lastBattle: 0, turns: [2], picks: [], stalled: false },
    ]);
    expect(base.inTargetRange).toBe(false);
    expect(formatReport(base)).toContain('超出設計目標');
  });

  it('報表包含各關通過率與最常被選到的卡', () => {
    const text = formatReport(simulate({ runs: 20, seed: 1 }));
    expect(text).toContain('整體勝率');
    expect(text).toContain('通過率');
    expect(text).toContain('前段');
    expect(text).toContain('Boss');
    expect(text).toContain('最常被選到的卡');
  });

  it('全形字寬度算 2，表格才能對齊', () => {
    expect(displayWidth('abc')).toBe(3);
    expect(displayWidth('月台')).toBe(4);
    expect(displayWidth('Boss：列車')).toBe(10);
  });

  it('100 局在 5 秒內完成（1000 局 30 秒的保守代理）', () => {
    const start = performance.now();
    simulate({ runs: 100, seed: 8 });
    expect(performance.now() - start).toBeLessThan(5000);
  });
});

describe('CLI 參數', () => {
  it('預設值', () => {
    expect(parseArgs([])).toEqual({ runs: 1000, seed: 1, json: false });
  });

  it('讀取 --runs、--seed、--json', () => {
    expect(parseArgs(['--runs', '50', '--seed', '7', '--json'])).toEqual({ runs: 50, seed: 7, json: true });
  });

  it('不合法的參數會報錯', () => {
    expect(() => parseArgs(['--runs', '0'])).toThrow();
    expect(() => parseArgs(['--runs', 'abc'])).toThrow();
    expect(() => parseArgs(['--seed'])).toThrow();
    expect(() => parseArgs(['--what'])).toThrow(/不認得/);
  });
});
