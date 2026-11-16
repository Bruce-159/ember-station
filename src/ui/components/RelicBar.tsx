import { useState } from 'react';
import type { RelicId } from '../../engine/types.ts';
import { relicEffectTarget, type Effect } from '../effects.ts';
import { relicView } from '../view.ts';

interface Props {
  relics: readonly RelicId[];
  /** 目前畫面上的效果；遺物生效時對應的徽章會閃一下 */
  effects: readonly Effect[];
}

export function RelicBar({ relics, effects }: Props) {
  const [open, setOpen] = useState<RelicId | null>(null);
  if (relics.length === 0) return null;
  return (
    <ul className="relics" aria-label="媒介物品">
      {relics.map((id) => {
        const v = relicView(id);
        const active = effects.some((e) => e.targetId === relicEffectTarget(id));
        const tipId = `relic-tip-${id}`;
        return (
          <li key={id} className={`relic theme-${v.theme}${active ? ' flash' : ''}${open === id ? ' open' : ''}`}>
            <button
              type="button"
              className="relic-badge"
              aria-describedby={tipId}
              aria-expanded={open === id}
              onClick={() => setOpen(open === id ? null : id)}
            >
              <span aria-hidden="true">{v.short}</span>
              <span className="visually-hidden">{v.name}</span>
            </button>
            <span role="tooltip" id={tipId} className="relic-tip">
              <strong>{v.name}</strong>
              {v.description}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
