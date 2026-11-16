import { describe, expect, it } from 'vitest';
import { mulberry32, nextFloat, nextInt, seedToState, shuffle, weightedPick } from '../src/engine/rng.ts';
import { battleState } from './helpers.ts';

describe('rng 種子亂數', () => {
  it('同一個狀態產生同一個數字', () => {
    expect(mulberry32(123)).toEqual(mulberry32(123));
  });

  it('數值落在 [0, 1)', () => {
    let st = seedToState(42);
    for (let i = 0; i < 10_000; i++) {
      const { value, next } = mulberry32(st);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
      st = next;
    }
  });

  it('nextFloat 推進 GameState.rngState，且相同起點得到相同序列', () => {
    const a = battleState({ seed: 7 });
    const b = battleState({ seed: 7 });
    const seqA = Array.from({ length: 20 }, () => nextFloat(a));
    const seqB = Array.from({ length: 20 }, () => nextFloat(b));
    expect(seqA).toEqual(seqB);
    expect(a.rngState).toBe(b.rngState);
  });

  it('不同種子產生不同序列', () => {
    expect(seedToState(1)).not.toBe(seedToState(2));
  });

  it('nextInt 涵蓋整個範圍', () => {
    const s = battleState();
    const seen = new Set<number>();
    for (let i = 0; i < 500; i++) seen.add(nextInt(s, 6));
    expect([...seen].sort()).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('shuffle 不改變元素、不修改原陣列、可重現', () => {
    const src = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const a = shuffle(battleState({ seed: 3 }), src);
    const b = shuffle(battleState({ seed: 3 }), src);
    expect(a).toEqual(b);
    expect([...a].sort((x, y) => x - y)).toEqual(src);
    expect(src).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it('weightedPick 依權重分配', () => {
    const s = battleState({ seed: 9 });
    const counts = { a: 0, b: 0 };
    for (let i = 0; i < 6000; i++) {
      const p = weightedPick(s, ['a', 'b'] as const, (x) => (x === 'a' ? 3 : 1));
      if (p) counts[p] += 1;
    }
    expect(counts.a / 6000).toBeGreaterThan(0.7);
    expect(counts.a / 6000).toBeLessThan(0.8);
    expect(weightedPick(s, [], () => 1)).toBeNull();
  });
});
