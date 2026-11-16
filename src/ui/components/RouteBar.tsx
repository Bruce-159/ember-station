import type { GameState } from '../../engine/types.ts';
import { nextStop, routeView } from '../view.ts';

export function RouteBar({ game }: { game: GameState }) {
  const stops = routeView(game);
  const next = nextStop(game);
  if (stops.length === 0) return null;
  return (
    <nav className="route" aria-label="路線">
      <ol className="stops">
        {stops.map((s) => (
          <li
            key={s.index}
            className={`stop ${s.kind} ${s.status}`}
            title={`第 ${s.index + 1} 戰：${s.title}`}
            aria-current={s.status === 'current' ? 'step' : undefined}
          >
            <span className="visually-hidden">
              第 {s.index + 1} 戰：{s.title}
              {s.status === 'done' ? '（已通過）' : ''}
            </span>
          </li>
        ))}
      </ol>
      {next && <span className="next-stop">下一站：{next.title}</span>}
    </nav>
  );
}
