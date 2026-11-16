import { useState } from 'react';
import { encounterAt } from '../../engine/route.ts';
import { loadSave } from '../save.ts';

interface Props {
  onNew(): void;
  onContinue(): void;
  onRules(): void;
}

export function TitleScreen({ onNew, onContinue, onRules }: Props) {
  // 每次回到標題畫面都重新讀一次存檔
  const [saved] = useState(() => loadSave());
  return (
    <main className="title-screen">
      <h1>餘燼車站</h1>
      <p className="sub">列車永遠不會開走的車站裡，盧西安在後方增幅同伴，撐過十場戰鬥。</p>
      <div className="title-actions">
        {saved && (
          <button type="button" className="btn" onClick={onContinue}>
            繼續（第 {saved.battleIndex + 1} 戰：{encounterAt(saved)?.title}）
          </button>
        )}
        <button type="button" className={saved ? 'btn ghost' : 'btn'} onClick={onNew}>
          開始新的一輪
        </button>
        <button type="button" className="btn ghost" onClick={onRules}>
          遊戲規則說明
        </button>
      </div>
      {saved && <p className="sub small">開始新的一輪會覆蓋目前的存檔（種子 {saved.seed}）。</p>}
    </main>
  );
}
