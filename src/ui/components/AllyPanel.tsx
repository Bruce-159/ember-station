import { useRef } from 'react';
import { CHARACTERS } from '../../data/characters.ts';
import type { Ally, GameState } from '../../engine/types.ts';
import { allyTags, lucianTags } from '../view.ts';
import { latestHit, type Effect } from '../effects.ts';
import { useHitFeedback } from '../hooks/useHitFeedback.ts';
import { FloatingNumbers } from './FloatingNumbers.tsx';
import { HpBar, Tags } from './Tags.tsx';

interface Props {
  game: GameState;
  /** 正在選同伴目標 */
  targeting: boolean;
  effects?: Effect[];
  onTarget(id: string): void;
}

export function AllyPanel({ game, targeting, effects = [], onTarget }: Props) {
  const lucian = lucianTags(game);
  return (
    <section className="zone zone-party" aria-label="隊伍">
      <div className="party">
        <div className="unit ally owner-lucian lucian">
          <FloatingNumbers effects={effects} targetId="lucian" />
          <span className="name">{CHARACTERS.lucian.name}</span>
          <span className="role">後方支援，不會被攻擊</span>
          <span className="stats">{lucian.length ? <Tags tags={lucian} /> : <span>增幅未啟動</span>}</span>
        </div>
        {game.allies.map((a) => (
          <AllyCard key={a.id} game={game} ally={a} targetable={targeting && a.hp > 0} effects={effects} onTarget={onTarget} />
        ))}
      </div>
    </section>
  );
}

interface CardProps {
  game: GameState;
  ally: Ally;
  targetable: boolean;
  effects: Effect[];
  onTarget(id: string): void;
}

function AllyCard({ game, ally: a, targetable, effects, onTarget }: CardProps) {
  const ref = useRef<HTMLButtonElement>(null);
  useHitFeedback(ref, latestHit(effects, a.id));
  const alive = a.hp > 0;
  return (
    <button
      ref={ref}
      type="button"
      className={`unit ally owner-${a.id}${alive ? '' : ' ko'}${targetable ? ' targetable' : ''}`}
      tabIndex={targetable ? 0 : -1}
      aria-disabled={!targetable}
      aria-label={`${CHARACTERS[a.id].name}，生命 ${a.hp} / ${a.maxHp}${targetable ? '，可選為目標' : ''}`}
      onClick={() => targetable && onTarget(a.id)}
    >
      <FloatingNumbers effects={effects} targetId={a.id} />
      <span className="name">{CHARACTERS[a.id].name}</span>
      <span className="role">{CHARACTERS[a.id].role}</span>
      <HpBar hp={a.hp} maxHp={a.maxHp} />
      <span className="stats">
        <span className="hp-num">
          {a.hp} / {a.maxHp}
        </span>
        <Tags tags={allyTags(game, a)} />
      </span>
    </button>
  );
}
