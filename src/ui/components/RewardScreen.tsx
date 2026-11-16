import type { CardId, GameState } from '../../engine/types.ts';
import { previewCardView } from '../view.ts';
import { Card } from './Card.tsx';

interface Props {
  game: GameState;
  onPick(cardId: CardId | null): void;
}

export function RewardScreen({ game, onPick }: Props) {
  return (
    <section className="overlay" aria-labelledby="reward-title">
      <h2 id="reward-title">戰鬥勝利</h2>
      <p className="sub">挑一張牌加入牌組（目前 {game.deck.length} 張），或跳過。</p>
      <div className="hand wrap-cards">
        {game.rewardOptions.map((id) => (
          <Card key={id} view={previewCardView(id)} onClick={() => onPick(id)} />
        ))}
      </div>
      <button type="button" className="btn ghost" onClick={() => onPick(null)}>
        不拿牌
      </button>
    </section>
  );
}
