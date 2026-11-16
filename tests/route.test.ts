// 路線：開局用種子產生 10 場（追加規格 v2 第 3.2 節）

import { describe, expect, it } from 'vitest';
import { ALL_ENCOUNTER_IDS, ENCOUNTERS, ROUTE_LENGTH, STAGES } from '../src/data/encounters.ts';
import { seedToState } from '../src/engine/rng.ts';
import { buildRoute, encounterAt } from '../src/engine/route.ts';
import { createInitialState } from '../src/engine/run.ts';
import type { EncounterId, GameState } from '../src/engine/types.ts';
import { newRun } from './helpers.ts';

function routeFor(seed: number): EncounterId[] {
  const s: GameState = { ...createInitialState(), rngState: seedToState(seed) };
  return buildRoute(s);
}

/** 依 STAGES 把路線切成每一段 */
function slices(route: EncounterId[]): EncounterId[][] {
  let offset = 0;
  return STAGES.map((stage) => {
    const part = route.slice(offset, offset + stage.count);
    offset += stage.count;
    return part;
  });
}

describe('路線', () => {
  it('同一個種子產生同一條路線；長度為 10', () => {
    expect(routeFor(7)).toEqual(routeFor(7));
    expect(routeFor(7)).toHaveLength(ROUTE_LENGTH);
  });

  it('不同種子會走出不同的路線', () => {
    const routes = new Set(Array.from({ length: 20 }, (_, i) => routeFor(i).join(',')));
    expect(routes.size).toBeGreaterThan(5);
  });

  it('每一段：來自該段的池、不重複、依難度由低到高', () => {
    for (let seed = 0; seed < 200; seed++) {
      slices(routeFor(seed)).forEach((part, i) => {
        const stage = STAGES[i]!;
        for (const id of part) expect(stage.pool).toContain(id);
        expect(new Set(part).size).toBe(part.length);
        const diffs = part.map((id) => ENCOUNTERS[id].difficulty);
        expect(diffs).toEqual([...diffs].sort((a, b) => a - b));
      });
    }
  });

  it('1000 個種子跑完，19 組遭遇都至少出現一次', () => {
    const seen = new Set<EncounterId>();
    for (let seed = 0; seed < 1000; seed++) for (const id of routeFor(seed)) seen.add(id);
    expect([...seen].sort()).toEqual([...ALL_ENCOUNTER_IDS].sort());
  });

  it('新的一輪把路線存進狀態，第 1 場就是路線的第一組', () => {
    const s = newRun(3);
    expect(s.route).toHaveLength(ROUTE_LENGTH);
    expect(encounterAt(s)?.id).toBe(s.route[0]);
    expect(s.enemies.map((e) => e.name)).toEqual(ENCOUNTERS[s.route[0]!].enemies.map((e) => e.name));
    expect(encounterAt(s, 99)).toBeUndefined();
  });
});
