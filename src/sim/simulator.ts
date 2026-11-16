// 平衡模擬：用貪婪機器人跑完整的一輪，統計勝率與各關通過率。
// 純函式、可重現：同一個 seed 與 runs 一定產生相同的報告。

import { BATTLES } from '../data/battles.ts';
import { CARDS } from '../data/cards.ts';
import { CHARACTERS } from '../data/characters.ts';
import { reduce } from '../engine/reducer.ts';
import { mulberry32, seedToState } from '../engine/rng.ts';
import { createInitialState } from '../engine/run.ts';
import type { CardId, GameState } from '../engine/types.ts';
import { createGreedyBot } from './greedyBot.ts';

/** 設計目標：貪婪機器人的整體勝率（非市場數據，可調整） */
export const TARGET_WIN_RATE = { min: 0.2, max: 0.6 } as const;

/** 單場戰鬥超過這個回合數視為卡死，該局記為失敗 */
export const MAX_TURNS_PER_BATTLE = 100;

export interface SimOptions {
  runs: number;
  seed: number;
}

export interface RunResult {
  seed: number;
  won: boolean;
  /** 抵達的最後一場（0 起算） */
  lastBattle: number;
  /** 每一場（含失敗的那場）花的回合數 */
  turns: number[];
  picks: CardId[];
  stalled: boolean;
}

export interface BattleStats {
  index: number;
  title: string;
  reached: number;
  passed: number;
  reachRate: number;
  /** 抵達者中通過的比例 */
  passRate: number;
  avgTurns: number;
}

export interface PickStats {
  cardId: CardId;
  name: string;
  owner: string;
  count: number;
  share: number;
}

export interface SimReport {
  runs: number;
  seed: number;
  wins: number;
  winRate: number;
  inTargetRange: boolean;
  avgTurnsPerRun: number;
  stalled: number;
  battles: BattleStats[];
  picks: PickStats[];
}

/** 由基礎種子衍生每一局的種子（相鄰的基礎種子不會共用大部分的局） */
export function deriveSeeds(seed: number, runs: number): number[] {
  let st = seedToState(seed);
  const out: number[] = [];
  for (let i = 0; i < runs; i++) {
    const { value, next } = mulberry32(st);
    st = next;
    out.push(Math.floor(value * 0x100000000));
  }
  return out;
}

/** 用貪婪機器人玩完一輪 */
export function simulateRun(seed: number): RunResult {
  const bot = createGreedyBot();
  let state: GameState = reduce(createInitialState(), { type: 'NEW_RUN', seed }).state;
  const turns: number[] = [];
  const picks: CardId[] = [];
  let stalled = false;

  while (state.phase !== 'victory' && state.phase !== 'defeat') {
    if (state.phase === 'battle' && state.turn > MAX_TURNS_PER_BATTLE) {
      stalled = true;
      turns.push(state.turn);
      break;
    }
    const action = bot.decide(state);
    const result = reduce(state, action);
    const rejected = result.events.find((e) => e.type === 'actionRejected');
    if (rejected) throw new Error(`機器人送出不合法的動作：${JSON.stringify(action)} → ${JSON.stringify(rejected)}`);
    for (const e of result.events) {
      if (e.type === 'battleWon' || e.type === 'runLost') turns.push(state.turn);
      if (e.type === 'cardAdded') picks.push(e.cardId);
    }
    state = result.state;
  }

  return { seed, won: state.phase === 'victory', lastBattle: state.battleIndex, turns, picks, stalled };
}

export function simulate(opts: SimOptions): SimReport {
  const results = deriveSeeds(opts.seed, opts.runs).map(simulateRun);
  return summarize(opts, results);
}

export function summarize(opts: SimOptions, results: RunResult[]): SimReport {
  const runs = results.length;
  const wins = results.filter((r) => r.won).length;

  const battles: BattleStats[] = BATTLES.map((b, index) => {
    const reachedRuns = results.filter((r) => r.lastBattle >= index);
    const passed = results.filter((r) => r.lastBattle > index || (r.lastBattle === index && r.won)).length;
    const turnSum = reachedRuns.reduce((sum, r) => sum + (r.turns[index] ?? 0), 0);
    return {
      index,
      title: b.title,
      reached: reachedRuns.length,
      passed,
      reachRate: ratio(reachedRuns.length, runs),
      passRate: ratio(passed, reachedRuns.length),
      avgTurns: ratio(turnSum, reachedRuns.length),
    };
  });

  const pickCounts = new Map<CardId, number>();
  for (const r of results) for (const id of r.picks) pickCounts.set(id, (pickCounts.get(id) ?? 0) + 1);
  const totalPicks = [...pickCounts.values()].reduce((a, b) => a + b, 0);
  const picks = [...pickCounts.entries()]
    .map(([cardId, count]) => ({
      cardId,
      name: CARDS[cardId].name,
      owner: CHARACTERS[CARDS[cardId].owner].name,
      count,
      share: ratio(count, totalPicks),
    }))
    // 次數相同時依卡牌 id 排序，確保輸出穩定
    .sort((a, b) => b.count - a.count || a.cardId.localeCompare(b.cardId));

  const winRate = ratio(wins, runs);
  return {
    runs,
    seed: opts.seed,
    wins,
    winRate,
    inTargetRange: winRate >= TARGET_WIN_RATE.min && winRate <= TARGET_WIN_RATE.max,
    avgTurnsPerRun: ratio(
      results.reduce((sum, r) => sum + r.turns.reduce((a, b) => a + b, 0), 0),
      runs,
    ),
    stalled: results.filter((r) => r.stalled).length,
    battles,
    picks,
  };
}

function ratio(a: number, b: number): number {
  return b === 0 ? 0 : a / b;
}

// ───────────── 報表 ─────────────

const WIDE = /[ᄀ-ᅟ⺀-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦]/;

/** 終端機顯示寬度：全形字算 2 */
export function displayWidth(s: string): number {
  let w = 0;
  for (const ch of s) w += WIDE.test(ch) ? 2 : 1;
  return w;
}

function pad(s: string, width: number, align: 'left' | 'right'): string {
  const fill = ' '.repeat(Math.max(0, width - displayWidth(s)));
  return align === 'left' ? s + fill : fill + s;
}

function table(headers: string[], rows: string[][], align: Array<'left' | 'right'>): string {
  const widths = headers.map((h, i) => Math.max(displayWidth(h), ...rows.map((r) => displayWidth(r[i] ?? ''))));
  const line = (cells: string[]) => cells.map((c, i) => pad(c, widths[i] ?? 0, align[i] ?? 'left')).join('  ');
  const rule = widths.map((w) => '─'.repeat(w)).join('  ');
  return [line(headers), rule, ...rows.map(line)].join('\n');
}

const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

export function formatReport(r: SimReport, topPicks = 10): string {
  const range = `${pct(TARGET_WIN_RATE.min)}–${pct(TARGET_WIN_RATE.max)}`;
  const verdict = r.inTargetRange
    ? `在設計目標 ${range} 內`
    : `⚠ 超出設計目標 ${range}，請開發者決定是否調整數值（模擬器不會自行修改）`;

  const battleRows = r.battles.map((b) => [
    String(b.index + 1),
    b.title,
    `${b.reached}`,
    pct(b.reachRate),
    `${b.passed}`,
    b.reached ? pct(b.passRate) : '—',
    b.reached ? b.avgTurns.toFixed(1) : '—',
  ]);

  const pickRows = r.picks
    .slice(0, topPicks)
    .map((p, i) => [String(i + 1), p.name, p.owner, `${p.count}`, pct(p.share)]);

  return [
    '餘燼車站：平衡模擬報告',
    `種子 ${r.seed}，共 ${r.runs} 局，貪婪機器人`,
    '',
    `整體勝率：${pct(r.winRate)}（${r.wins} / ${r.runs}），${verdict}`,
    `平均每局回合數：${r.avgTurnsPerRun.toFixed(1)}`,
    ...(r.stalled > 0 ? [`⚠ 有 ${r.stalled} 局因單場超過 ${MAX_TURNS_PER_BATTLE} 回合而中止，記為失敗`] : []),
    '',
    '各場戰鬥',
    table(
      ['場次', '關卡', '抵達', '抵達率', '通過', '通過率', '平均回合'],
      battleRows,
      ['right', 'left', 'right', 'right', 'right', 'right', 'right'],
    ),
    '',
    `最常被選到的卡（前 ${Math.min(topPicks, r.picks.length)} 名，機器人一律選第一張）`,
    table(['排名', '卡牌', '角色', '次數', '佔比'], pickRows, ['right', 'left', 'left', 'right', 'right']),
  ].join('\n');
}
