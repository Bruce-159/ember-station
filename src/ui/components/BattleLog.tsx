import type { LogLine } from '../uiState.ts';

export function BattleLog({ log }: { log: LogLine[] }) {
  return (
    <section aria-label="戰鬥紀錄">
      <h2 className="zone-label">戰鬥紀錄</h2>
      <ol className="log" aria-live="polite">
        {log.slice(0, 60).map((l) => (
          <li key={l.id} className={`log-${l.kind}`}>
            {l.text}
          </li>
        ))}
      </ol>
    </section>
  );
}
