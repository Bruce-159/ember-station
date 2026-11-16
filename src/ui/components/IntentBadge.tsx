import type { Enemy, GameState } from '../../engine/types.ts';
import { intentView } from '../view.ts';

export function IntentBadge({ game, enemy }: { game: GameState; enemy: Enemy }) {
  const view = intentView(game, enemy);
  if (!view) return null;
  return (
    <div className={`intent intent-${view.kind}`}>
      <span className="intent-label">{view.label}</span>：{view.detail}
    </div>
  );
}
