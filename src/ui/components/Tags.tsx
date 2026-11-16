import type { Tag } from '../view.ts';

export function Tags({ tags }: { tags: Tag[] }) {
  return (
    <>
      {tags.map((t) => (
        <span key={t.text} className={`tag t-${t.tone}`}>
          {t.text}
        </span>
      ))}
    </>
  );
}

export function HpBar({ hp, maxHp }: { hp: number; maxHp: number }) {
  const pct = maxHp > 0 ? Math.max(0, Math.min(100, (hp / maxHp) * 100)) : 0;
  return (
    <div className="bar" aria-hidden="true">
      <i style={{ width: `${pct}%` }} />
    </div>
  );
}
