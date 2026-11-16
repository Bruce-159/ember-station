import type { GameState } from '../../engine/types.ts';
import { handCardView } from '../view.ts';
import { Card } from './Card.tsx';

interface Props {
  game: GameState;
  selected: number | null;
  onCard(uid: number): void;
}

const HOTKEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];

export function Hand({ game, selected, onCard }: Props) {
  if (game.hand.length === 0) return <p className="empty-hand">手牌是空的</p>;
  return (
    <div className="hand" role="group" aria-label="手牌">
      {game.hand.map((card, i) => (
        <Card
          key={card.uid}
          view={handCardView(game, card)}
          selected={selected === card.uid}
          hotkey={HOTKEYS[i]}
          onClick={() => onCard(card.uid)}
        />
      ))}
    </div>
  );
}
