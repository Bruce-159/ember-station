import type { CardView } from '../view.ts';

interface Props {
  view: CardView;
  selected?: boolean;
  hotkey?: string;
  onClick?: () => void;
}

/** 卡牌做成車票：上段票根（費用、角色、快捷鍵），打孔線下是效果 */
export function Card({ view, selected = false, hotkey, onClick }: Props) {
  const label = [
    view.name,
    `${view.cost} 點能量`,
    view.ownerName,
    view.description,
    view.amplified ? '增幅' : '',
    view.disabledReason ?? '',
  ]
    .filter(Boolean)
    .join('，');

  return (
    <button
      type="button"
      className={`card owner-${view.owner}${selected ? ' sel' : ''}${view.amplified ? ' amplified' : ''}`}
      disabled={!view.playable}
      aria-pressed={onClick && view.playable ? selected : undefined}
      aria-label={label}
      onClick={onClick}
    >
      <span className="stub">
        <span className="cost">{view.cost}</span>
        <span className="owner">{view.ownerName}</span>
        {hotkey && <kbd>{hotkey}</kbd>}
      </span>
      <span className="ticket-body">
        <span className="cname">{view.name}</span>
        <span className="desc">{view.description}</span>
        <span className="ctype">
          {view.disabledReason ? <span className="why">{view.disabledReason}</span> : view.typeName}
          {view.amplified && view.playable && <span className="stamp">增幅</span>}
        </span>
      </span>
    </button>
  );
}
