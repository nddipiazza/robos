import React, { useCallback, useLayoutEffect, useRef, useState } from 'react';

// Resizable panes and table columns. Sizes are remembered per viewer in
// localStorage; double-clicking a divider or a column border restores the default.

const STORE_KEY = 'robos-audio-layout';

function readStore() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY) || '{}') || {}; } catch { return {}; }
}

function writeStore(key, value) {
  try {
    const all = readStore();
    if (value == null) delete all[key]; else all[key] = value;
    localStorage.setItem(STORE_KEY, JSON.stringify(all));
  } catch {}
}

/** Like useState, but remembered across launches (saved shortly after it settles). */
export function useLayoutPref(key, fallback) {
  const [value, setValue] = useState(() => {
    const stored = readStore()[key];
    return stored === undefined ? fallback : stored;
  });
  const first = useRef(true);
  const pending = useRef(null);
  useLayoutEffect(() => {
    if (first.current) { first.current = false; return undefined; }
    const save = () => {
      if (pending.current !== save) return;
      writeStore(key, value);
      pending.current = null;
    };
    pending.current = save;
    const timer = setTimeout(save, 250);
    return () => clearTimeout(timer);
  }, [key, value]);
  useLayoutEffect(() => {
    const flush = () => pending.current?.();
    window.addEventListener('pagehide', flush);
    return () => {
      window.removeEventListener('pagehide', flush);
      flush();
    };
  }, []);
  return [value, setValue];
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// Drags with pointer capture; onMove gets the distance from the start.
function startDrag(e, onMove, axis = 'clientX') {
  if (e.button !== 0) return;
  e.preventDefault();
  e.stopPropagation();
  const el = e.currentTarget;
  const start = e[axis];
  const resizeClass = axis === 'clientY' ? 'is-resizing-height' : 'is-resizing';
  try { el.setPointerCapture(e.pointerId); } catch {}
  document.body.classList.add(resizeClass);
  const move = (ev) => onMove(ev[axis] - start);
  const up = () => {
    el.removeEventListener('pointermove', move);
    el.removeEventListener('pointerup', up);
    el.removeEventListener('pointercancel', up);
    el.removeEventListener('lostpointercapture', up);
    document.body.classList.remove(resizeClass);
  };
  el.addEventListener('pointermove', move);
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', up);
  el.addEventListener('lostpointercapture', up);
}

/**
 * Divider that resizes the neighboring pane. A horizontal divider resizes
 * height. A vertical divider resizes width.
 */
export function Splitter({ id, size, onChange, min, max, defaultSize, side = 'left', orientation = 'vertical', label, className = '', style }) {
  const hi = typeof max === 'function' ? max() : max;
  const horizontal = orientation === 'horizontal';
  const sign = side === 'right' || side === 'bottom' ? -1 : 1;
  const onPointerDown = (e) => {
    const limit = typeof max === 'function' ? max() : max;
    startDrag(e, distance => onChange(clamp(Math.round(size + sign * distance), min, limit)), horizontal ? 'clientY' : 'clientX');
  };
  const onKeyDown = (e) => {
    const step = e.shiftKey ? 64 : 16;
    const [less, more] = horizontal ? ['ArrowUp', 'ArrowDown'] : ['ArrowLeft', 'ArrowRight'];
    if (e.key === less || e.key === more) {
      e.preventDefault();
      const dir = e.key === more ? 1 : -1;
      onChange(clamp(size + sign * dir * step, min, hi));
    } else if (e.key === 'Home') { e.preventDefault(); onChange(min); }
    else if (e.key === 'End') { e.preventDefault(); onChange(hi); }
  };
  return (
    <div
      id={id}
      className={`splitter ${className}`}
      style={style}
      role="separator"
      aria-orientation={orientation}
      aria-label={label}
      aria-valuenow={Math.round(size)}
      aria-valuemin={min}
      aria-valuemax={Math.round(hi)}
      tabIndex={0}
      title={`${label}: drag to resize, double-click to reset`}
      onPointerDown={onPointerDown}
      onDoubleClick={() => onChange(defaultSize)}
      onKeyDown={onKeyDown}
    />
  );
}

/**
 * Keep table columns in proportion as their pane resizes. Dragging a divider
 * transfers space between the two columns directly beside it.
 */
export function useColumns(storeKey, spec) {
  const [widths, setWidths] = useLayoutPref(`cols:${storeKey}`, {});
  const template = spec.map(column => {
    if (column.fixed) return column.width;
    const weight = widths.weights?.[column.key];
    if (weight > 0) return `minmax(0, ${weight}fr)`;
    // Read layouts saved before widths were stored in proportion.
    return !column.fill && widths[column.key] != null ? `${widths[column.key]}px` : column.width;
  }).join(' ');

  const handleFor = useCallback(key => {
    const index = spec.findIndex(column => column.key === key);
    const left = spec[index];
    const right = spec[index + 1];
    if (!left || !right || left.fixed || right.fixed) return null;
    return (
      <ColumnBorder
        key="col-border"
        label={`Resize the ${left.label || left.key} column`}
        measure={cell => {
          const cells = cell.parentElement.children;
          const measured = Object.fromEntries(spec.map((column, index) =>
            [column.key, Math.max(1, cells[index].getBoundingClientRect().width)]));
          const low = Math.min(0, (left.min ?? 40) - measured[left.key]);
          const high = Math.max(0, measured[right.key] - (right.min ?? 40));
          return distance => {
            const delta = clamp(distance, low, high);
            setWidths({
              weights: { ...measured, [left.key]: measured[left.key] + delta, [right.key]: measured[right.key] - delta },
            });
          };
        }}
        onReset={() => setWidths({})}
      />
    );
  }, [spec, setWidths]);

  return { template, handleFor };
}

function ColumnBorder({ label, measure, onReset }) {
  const onKeyDown = event => {
    const step = event.shiftKey ? 64 : 16;
    const distance = { ArrowLeft: -step, ArrowRight: step, Home: -Infinity, End: Infinity }[event.key];
    if (distance === undefined) return;
    event.preventDefault();
    event.stopPropagation();
    measure(event.currentTarget.parentElement)(distance);
  };
  return (
    <span
      className="col-border"
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      tabIndex={0}
      title="Drag to resize · double-click to reset columns"
      onPointerDown={event => startDrag(event, measure(event.currentTarget.parentElement))}
      onKeyDown={onKeyDown}
      onClick={event => event.stopPropagation()}
      onDoubleClick={event => { event.stopPropagation(); onReset(); }}
    />
  );
}
