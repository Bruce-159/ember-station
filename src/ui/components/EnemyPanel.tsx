import { useRef, type CSSProperties } from 'react';
import type { Enemy, GameState } from '../../engine/types.ts';
import { enemyTags } from '../view.ts';
import { latestHit, type Effect } from '../effects.ts';
import { useHitFeedback } from '../hooks/useHitFeedback.ts';
import { FloatingNumbers } from './FloatingNumbers.tsx';
import { IntentBadge } from './IntentBadge.tsx';
import { HpBar, Tags } from './Tags.tsx';

interface Props {
  game: GameState;
  /** 正在選敵人目標 */
  targeting: boolean;
  /** 正在行動的敵人 */
  acting: string | null;
  effects: Effect[];
  onTarget(id: string): void;
}

export function EnemyPanel({ game, targeting, acting, effects, onTarget }: Props) {
  return (
    <section className="zone zone-enemies" aria-label="敵人">
      <div className="enemies" style={{ '--n': game.enemies.length } as CSSProperties}>
        {game.enemies.map((e) => (
          <EnemyCard
            key={e.id}
            game={game}
            enemy={e}
            targetable={targeting && e.hp > 0}
            acting={acting === e.id}
            effects={effects}
            onTarget={onTarget}
          />
        ))}
      </div>
    </section>
  );
}

interface CardProps {
  game: GameState;
  enemy: Enemy;
  targetable: boolean;
  acting: boolean;
  effects: Effect[];
  onTarget(id: string): void;
}

function EnemyCard({ game, enemy: e, targetable, acting, effects, onTarget }: CardProps) {
  const ref = useRef<HTMLButtonElement>(null);
  useHitFeedback(ref, latestHit(effects, e.id));
  const alive = e.hp > 0;
  return (
    <button
      ref={ref}
      type="button"
      className={`unit enemy${alive ? '' : ' dead'}${targetable ? ' targetable' : ''}${acting ? ' acting' : ''}`}
      tabIndex={targetable ? 0 : -1}
      aria-disabled={!targetable}
      aria-label={`${e.name}，生命 ${e.hp} / ${e.maxHp}${targetable ? '，可選為目標' : ''}`}
      onClick={() => targetable && onTarget(e.id)}
    >
      <FloatingNumbers effects={effects} targetId={e.id} />
      <span className="name">{e.name}</span>
      <HpBar hp={e.hp} maxHp={e.maxHp} />
      <span className="stats">
        <span className="hp-num">
          {e.hp} / {e.maxHp}
        </span>
        <Tags tags={enemyTags(e)} />
      </span>
      <IntentBadge game={game} enemy={e} />
    </button>
  );
}
