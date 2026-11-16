import { useEffect, type RefObject } from 'react';

const prefersReducedMotion = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * 受擊回饋：短暫震動並閃一下紅框。
 * 開啟「減少動態效果」時不震動，只保留不位移的閃框。
 */
export function useHitFeedback(ref: RefObject<HTMLElement | null>, token: number): void {
  useEffect(() => {
    const el = ref.current;
    if (!token || !el || typeof el.animate !== 'function') return;
    const hp = getComputedStyle(el).getPropertyValue('--hp').trim() || 'red';
    el.animate([{ boxShadow: `0 0 0 3px ${hp}` }, { boxShadow: '0 0 0 0 transparent' }], { duration: 420, easing: 'ease-out' });
    if (prefersReducedMotion()) return;
    el.animate(
      [
        { transform: 'translateX(0)' },
        { transform: 'translateX(-7px)' },
        { transform: 'translateX(6px)' },
        { transform: 'translateX(-3px)' },
        { transform: 'translateX(0)' },
      ],
      { duration: 300, easing: 'ease-out' },
    );
  }, [ref, token]);
}
