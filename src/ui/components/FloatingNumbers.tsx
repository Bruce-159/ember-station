import type { CSSProperties } from 'react';
import type { Effect } from '../effects.ts';

/** 在單位上方跳出的浮動數字（傷害、格擋、回復、中毒…） */
export function FloatingNumbers({ effects, targetId }: { effects: Effect[]; targetId: string }) {
  const mine = effects.filter((e) => e.targetId === targetId);
  if (mine.length === 0) return null;
  return (
    <span className="floaters" aria-hidden="true">
      {mine.map((e, i) => (
        <span key={e.id} className={`floater f-${e.tone}`} style={{ '--i': i } as CSSProperties}>
          {e.text}
        </span>
      ))}
    </span>
  );
}
