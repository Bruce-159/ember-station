import { useEffect } from 'react';
import { CARDS } from '../../data/cards.ts';
import type { GameControls } from '../hooks/useGame.ts';
import { keyToHandIndex, pendingTarget } from '../uiState.ts';
import { TARGET_TEXT } from '../view.ts';
import { AllyPanel } from './AllyPanel.tsx';
import { EnemyPanel } from './EnemyPanel.tsx';
import { Hand } from './Hand.tsx';

interface Props {
  g: GameControls;
  /** 有對話框開著時暫停鍵盤操作 */
  keyboardEnabled: boolean;
}

export function BattleScreen({ g, keyboardEnabled }: Props) {
  const { selected, notice } = g.ui;
  const game = g.view;
  const targeting = g.busy ? null : pendingTarget(g.ui);

  useEffect(() => {
    if (!keyboardEnabled) return;
    const onKey = (ev: KeyboardEvent) => {
      if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
      const el = ev.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) return;
      const idx = keyToHandIndex(ev.key);
      if (idx !== null) {
        const card = game.hand[idx];
        if (card) g.clickCard(card.uid);
        ev.preventDefault();
      } else if (ev.key === 'Escape') {
        g.cancel();
      } else if (ev.key === 'e' || ev.key === 'E') {
        g.endTurn();
        ev.preventDefault();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [g, game.hand, keyboardEnabled]);

  const selectedCard = selected === null ? null : game.hand.find((c) => c.uid === selected);
  let hint = '點一張牌出牌；需要目標的牌再點目標。鍵盤：1–0 選牌，E 結束回合';
  if (g.busy) hint = '敵人行動中……';
  else if (notice) hint = notice;
  else if (selectedCard && targeting) {
    hint = `選擇「${CARDS[selectedCard.cardId].name}」的目標（${TARGET_TEXT[targeting]}）；再點一次這張牌或按 Esc 取消`;
  }

  return (
    <div className={`battle${targeting ? ` targeting-${targeting}` : ''}${g.busy ? ' is-busy' : ''}`}>
      <EnemyPanel game={game} targeting={targeting === 'enemy'} acting={g.acting} effects={g.effects} onTarget={g.clickTarget} />
      <AllyPanel game={game} targeting={targeting === 'ally'} effects={g.effects} onTarget={g.clickTarget} />
      <div className="dock">
        <div className="controls">
          <div className="energy" aria-label={`能量 ${game.energy}`}>
            <span className="energy-label">能量</span>
            {Array.from({ length: Math.max(3, game.energy) }, (_, i) => (
              <span key={i} className={`pip${i < game.energy ? ' on' : ''}${i >= 3 ? ' extra' : ''}`} />
            ))}
          </div>
          <span className="piles">
            <span>抽牌堆 {game.drawPile.length}</span>
            <span>棄牌堆 {game.discard.length}</span>
            {game.exhausted.length > 0 && <span>移除區 {game.exhausted.length}</span>}
          </span>
          <button type="button" className="btn end-turn" onClick={g.endTurn} disabled={g.busy}>
            結束回合 <kbd>E</kbd>
          </button>
        </div>
        <p className={`hint${notice && !g.busy ? ' hint-warn' : ''}`} role="status">
          {hint}
        </p>
        <Hand game={game} selected={selected} onCard={g.clickCard} />
      </div>
    </div>
  );
}
