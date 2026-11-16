import { useState } from 'react';
import { ROUTE_LENGTH } from '../data/encounters.ts';
import { encounterAt } from '../engine/route.ts';
import { AllyPanel } from './components/AllyPanel.tsx';
import { BattleLog } from './components/BattleLog.tsx';
import { BattleScreen } from './components/BattleScreen.tsx';
import { RelicBar } from './components/RelicBar.tsx';
import { RelicChoiceScreen } from './components/RelicChoiceScreen.tsx';
import { RemoveScreen } from './components/RemoveScreen.tsx';
import { ResultScreen } from './components/ResultScreen.tsx';
import { RewardScreen } from './components/RewardScreen.tsx';
import { RouteBar } from './components/RouteBar.tsx';
import { RulesDialog } from './components/RulesDialog.tsx';
import { TitleScreen } from './components/TitleScreen.tsx';
import { useGame } from './hooks/useGame.ts';

const noop = () => {};

export default function App() {
  const g = useGame();
  const [rulesOpen, setRulesOpen] = useState(false);
  // 畫面一律依「目前顯示的影格」決定，動畫播完才切到選牌或結果畫面
  const game = g.view;
  const rules = <RulesDialog open={rulesOpen} onClose={() => setRulesOpen(false)} />;

  if (game.phase === 'title') {
    return (
      <div className="wrap">
        <TitleScreen onNew={() => g.newRun()} onContinue={g.continueRun} onRules={() => setRulesOpen(true)} />
        {rules}
      </div>
    );
  }

  const battle = encounterAt(game);
  return (
    <div className="wrap">
      <header className="top">
        <div className="station">
          <span className="stop-no">
            第 {game.battleIndex + 1} 戰<span className="of">／共 {ROUTE_LENGTH} 戰</span>
          </span>
          <h1 className="stop-name">{battle?.title}</h1>
        </div>
        {game.phase === 'battle' && <span className="turn">第 {game.turn} 回合</span>}
        <span className="header-actions">
          <button type="button" className="btn ghost small" onClick={() => setRulesOpen(true)}>
            規則
          </button>
          <button type="button" className="btn ghost small" onClick={g.toTitle}>
            回到標題
          </button>
        </span>
      </header>
      <div className="journey">
        <RouteBar game={game} />
        <RelicBar relics={game.relics} effects={g.effects} />
      </div>

      <main>
        {game.phase === 'relicChoice' && <RelicChoiceScreen game={game} keyboardEnabled={!rulesOpen} onPick={g.pickRelic} />}
        {game.phase === 'battle' && <BattleScreen g={g} keyboardEnabled={!rulesOpen} />}
        {game.phase === 'reward' && <RewardScreen game={game} onPick={g.pickReward} />}
        {game.phase === 'remove' && <RemoveScreen game={game} onRemove={g.removeCard} />}
        {(game.phase === 'victory' || game.phase === 'defeat') && (
          <ResultScreen game={game} onRestart={() => g.newRun()} onTitle={g.toTitle} />
        )}
        {game.phase !== 'battle' && <AllyPanel game={game} targeting={false} effects={g.effects} onTarget={noop} />}
        <BattleLog log={g.ui.log} />
      </main>
      {rules}
    </div>
  );
}
