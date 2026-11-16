import type { GameState } from '../../engine/types.ts';
import { previewCardView, restPreview, sortedDeck } from '../view.ts';
import { Card } from './Card.tsx';

interface Props {
  game: GameState;
  onRemove(uid: number | null): void;
}

export function RemoveScreen({ game, onRemove }: Props) {
  const rest = restPreview(game);
  return (
    <section className="overlay" aria-labelledby="remove-title">
      <h2 id="remove-title">重新校準增幅器</h2>
      <p className="sub">在車站稍作休息。可以從牌組移除一張牌（目前 {game.deck.length} 張），或跳過。</p>
      <ul className="rest-preview" aria-label="休息後的生命">
        {rest.map((r) => (
          <li key={r.id}>
            {r.name}：{r.from} → <strong>{r.to}</strong> / {r.maxHp}
            {r.revived && <span className="tag t-ember">經由錨點復活</span>}
          </li>
        ))}
      </ul>
      <div className="hand wrap-cards">
        {sortedDeck(game.deck).map((c) => (
          <Card key={c.uid} view={previewCardView(c.cardId, c.uid)} onClick={() => onRemove(c.uid)} />
        ))}
      </div>
      <button type="button" className="btn ghost" onClick={() => onRemove(null)}>
        不移除，繼續前進
      </button>
    </section>
  );
}
