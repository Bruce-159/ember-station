import { useEffect } from 'react';
import type { GameState, RelicId } from '../../engine/types.ts';
import { keyToChoiceIndex } from '../uiState.ts';
import { relicView } from '../view.ts';

interface Props {
  game: GameState;
  /** 有對話框開著時暫停鍵盤操作 */
  keyboardEnabled: boolean;
  onPick(relicId: RelicId): void;
}

export function RelicChoiceScreen({ game, keyboardEnabled, onPick }: Props) {
  const options = game.relicOptions;

  useEffect(() => {
    if (!keyboardEnabled) return;
    const onKey = (ev: KeyboardEvent) => {
      if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
      const index = keyToChoiceIndex(ev.key, options.length);
      const id = index === null ? undefined : options[index];
      if (!id) return;
      ev.preventDefault();
      onPick(id);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [keyboardEnabled, options, onPick]);

  const atStart = game.afterRelic === 'battle';
  return (
    <section className="overlay" aria-labelledby="relic-title">
      <h2 id="relic-title">選擇一件媒介物品</h2>
      <p className="sub">
        {atStart
          ? '出發前，挑一件隕石礦物做成的媒介物品帶在身上。效果持續整輪。'
          : '精英戰勝利。再挑一件媒介物品，接著照常選牌。'}
      </p>
      <div className="relic-choices">
        {options.map((id, i) => {
          const v = relicView(id);
          return (
            <button key={id} type="button" className={`relic-choice theme-${v.theme}`} onClick={() => onPick(id)}>
              <span className="relic-head">
                <span className="relic-mark" aria-hidden="true">
                  {v.short}
                </span>
                <span className="relic-name">{v.name}</span>
                <kbd>{i + 1}</kbd>
              </span>
              <span className="relic-theme">{v.themeName}</span>
              <span className="relic-desc">{v.description}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
