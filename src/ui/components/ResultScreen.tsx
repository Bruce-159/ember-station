import { BATTLES } from '../../data/battles.ts';
import type { GameState } from '../../engine/types.ts';

interface Props {
  game: GameState;
  onRestart(): void;
  onTitle(): void;
}

export function ResultScreen({ game, onRestart, onTitle }: Props) {
  const won = game.phase === 'victory';
  return (
    <section className="overlay result" aria-labelledby="result-title">
      <h2 id="result-title">{won ? '十戰全勝' : '隊伍全滅'}</h2>
      <p className="sub">
        {won
          ? '隊伍撐過了車站裡的十場戰鬥。可以再玩一次，試試不同的牌組路線。'
          : `在第 ${game.battleIndex + 1} 戰「${BATTLES[game.battleIndex]?.title ?? ''}」倒下，所有人的餘燼都回到了錨點。`}
      </p>
      <p className="sub">
        最終牌組 {game.deck.length} 張，種子 {game.seed}
      </p>
      <div className="actions">
        <button type="button" className="btn" onClick={onRestart}>
          再玩一次
        </button>
        <button type="button" className="btn ghost" onClick={onTitle}>
          回到標題
        </button>
      </div>
    </section>
  );
}
