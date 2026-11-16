import { useEffect, useRef } from 'react';

interface Props {
  open: boolean;
  onClose(): void;
}

/** 遊戲規則說明（內容同原型的「怎麼玩」，數值依規格書） */
export function RulesDialog({ open, onClose }: Props) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog ref={ref} className="rules" aria-labelledby="rules-title" onClose={onClose}>
      <h2 id="rules-title">怎麼玩</h2>
      <ul>
        <li>每回合 3 點能量、抽 5 張牌。點一張牌，再點目標（敵人或同伴）打出；不需要目標的牌會直接打出。</li>
        <li>盧西安在後方支援，沒有血條。「增幅」讓下一張牌效果加倍，「解析」讓敵人本回合受到的傷害提高 50%。</li>
        <li>雷翁生命在一半以下時進入「背水」，方陣與突刺變強。</li>
        <li>阿格妮絲的中毒在敵人行動前造成傷害，之後層數減 1。</li>
        <li>艾斯的下注牌會賭成功率；失敗累積「手氣」，提高之後的成功率；「袖裡藏牌」讓下一次下注必定成功。</li>
        <li>同伴倒下後，他們的牌在本場無法使用；戰鬥結束後經由錨點以 30% 生命復活。三位同伴全倒就失敗。</li>
        <li>共 10 場戰鬥，第 4、7 場是精英戰，第 10 場是 Boss。每一輪的敵人組合都不同：前段、中段、後段各從幾組遭遇中抽出，上方的路線列會顯示下一站。</li>
        <li>開局與每場精英戰勝利後，從三件「媒介物品」中選一件，效果持續整輪；點上方的徽章可以查看說明。每場勝利後可挑一張新牌、選擇是否移除一張牌，隊伍再休息回復 25% 生命。</li>
      </ul>
      <h3>鍵盤</h3>
      <ul>
        <li>
          <kbd>1</kbd>–<kbd>9</kbd>、<kbd>0</kbd>：選第 1–10 張手牌
        </li>
        <li>
          <kbd>Esc</kbd>：取消選擇
        </li>
        <li>
          <kbd>E</kbd>：結束回合
        </li>
      </ul>
      <form method="dialog">
        <button type="submit" className="btn">
          知道了
        </button>
      </form>
    </dialog>
  );
}
