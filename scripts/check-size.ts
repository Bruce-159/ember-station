// 檢查正式建置的 JavaScript 經 gzip 後是否小於上限（規格第 9 節：200KB）
//   npm run build && npm run size

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

const LIMIT_KB = 200;
const assets = join(import.meta.dirname, '..', 'dist', 'assets');

let files: string[];
try {
  files = readdirSync(assets).filter((f) => f.endsWith('.js'));
} catch {
  console.error('找不到 dist/assets，請先執行 npm run build');
  process.exit(1);
}

let total = 0;
for (const f of files) {
  const gz = gzipSync(readFileSync(join(assets, f)), { level: 9 }).length;
  total += gz;
  console.log(`${f}  ${(gz / 1024).toFixed(1)} KB（gzip）`);
}

const kb = total / 1024;
const ok = kb < LIMIT_KB;
console.log(`JavaScript 合計 ${kb.toFixed(1)} KB（gzip），上限 ${LIMIT_KB} KB：${ok ? '通過' : '超過上限'}`);
if (!ok) process.exit(1);
