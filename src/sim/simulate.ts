// 平衡模擬器 CLI 入口
//   npm run sim -- --runs 1000 --seed 1
//   npm run sim -- --runs 200 --seed 7 --json
//
// 報告寫到 stdout（同種子每次完全相同，可直接 diff）；耗時寫到 stderr。

import { performance } from 'node:perf_hooks';
import { formatReport, simulate } from './simulator.ts';

export interface CliOptions {
  runs: number;
  seed: number;
  json: boolean;
}

const USAGE = '用法：npm run sim -- [--runs 1000] [--seed 1] [--json]';

export function parseArgs(argv: readonly string[]): CliOptions {
  const opts: CliOptions = { runs: 1000, seed: 1, json: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const readInt = (name: string, min: number): number => {
      const raw = argv[i + 1];
      i += 1;
      const n = Number(raw);
      if (raw === undefined || !Number.isInteger(n) || n < min) throw new Error(`${name} 需要 >= ${min} 的整數，收到 ${raw ?? '（空）'}`);
      return n;
    };
    if (arg === '--runs') opts.runs = readInt('--runs', 1);
    else if (arg === '--seed') opts.seed = readInt('--seed', 0);
    else if (arg === '--json') opts.json = true;
    else if (arg === '--help' || arg === '-h') throw new Error(USAGE);
    else throw new Error(`不認得的參數：${arg}\n${USAGE}`);
  }
  return opts;
}

function main(): void {
  let opts: CliOptions;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
    return;
  }

  const start = performance.now();
  const report = simulate({ runs: opts.runs, seed: opts.seed });
  const seconds = (performance.now() - start) / 1000;

  console.log(opts.json ? JSON.stringify(report, null, 2) : formatReport(report));
  console.error(`\n耗時 ${seconds.toFixed(2)} 秒（${(opts.runs / seconds).toFixed(0)} 局／秒）`);
}

// 只有直接執行時才跑（被測試 import 時不跑）
if (import.meta.url === new URL(process.argv[1] ?? '', 'file://').href || process.argv[1]?.endsWith('simulate.ts')) {
  main();
}
