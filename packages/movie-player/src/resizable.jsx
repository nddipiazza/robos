/**
 * Resizable Split Pane Hook for RobOS Movie Player
 */

import { useState, useCallback } from 'react';

export function useResizablePane({ initial = 220, min = 150, max = 420, direction = 'right' } = {}) {
  const [size, setSize] = useState(initial);

  const onMouseDown = useCallback((e) => {
    e.preventDefault();
    const startX = e.clientX;
    const startSize = size;
    const mul = direction === 'left' ? -1 : 1;

    const onMove = (ev) => {
      const delta = (ev.clientX - startX) * mul;
      const next = Math.max(min, Math.min(max, startSize + delta));
      setSize(next);
    };

    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [size, min, max, direction]);

  return { size, setSize, onMouseDown };
}
