import React, { useCallback, useEffect, useRef, useState } from 'react';

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
  useEffect(() => {
    if (first.current) { first.current = false; return undefined; }
    const timer = setTimeout(() => writeStore(key, value), 250);
    return () => clearTimeout(timer);
  }, [key, value]);
  return [value, setValue];
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// Drags with pointer capture; `onMove(dx)` gets the distance from the start.
function startDrag(e, onMove, onEnd) {
  if (e.button !== 0) return;
  e.preventDefault();
  e.stopPropagation();
  const el = e.currentTarget;
  const startX = e.clientX;
  try { el.setPointerCapture(e.pointerId); } catch {}
  document.body.classList.add('is-resizing');
  const move = (ev) => onMove(ev.clientX - startX);
  const up = () => {
    el.removeEventListener('pointermove', move);
    el.removeEventListener('pointerup', up);
    el.removeEventListener('pointercancel', up);
    document.body.classList.remove('is-resizing');
    if (onEnd) onEnd();
  };
  el.addEventListener('pointermove', move);
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', up);
}

/**
 * Vertical divider that resizes the pane beside it. `side` is where that pane
 * sits: 'left' (dragging right grows it) or 'right' (dragging left grows it).
 */
export function Splitter({ id, width, onChange, min, max, defaultWidth, side = 'left', label, className = '', style }) {
  const hi = typeof max === 'function' ? max() : max;
  const sign = side === 'left' ? 1 : -1;
  const onPointerDown = (e) => {
    const start = width;
    const limit = typeof max === 'function' ? max() : max;
    startDrag(e, dx => onChange(clamp(Math.round(start + sign * dx), min, limit)));
  };
  const onKeyDown = (e) => {
    const step = e.shiftKey ? 64 : 16;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      const dir = e.key === 'ArrowRight' ? 1 : -1;
      onChange(clamp(width + sign * dir * step, min, hi));
    } else if (e.key === 'Home') { e.preventDefault(); onChange(min); }
    else if (e.key === 'End') { e.preventDefault(); onChange(hi); }
  };
  return (
    <div
      id={id}
      className={`splitter ${className}`}
      style={style}
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuenow={Math.round(width)}
      aria-valuemin={min}
      aria-valuemax={Math.round(hi)}
      tabIndex={0}
      title={`${label}: drag to resize, double-click to reset`}
      onPointerDown={onPointerDown}
      onDoubleClick={() => onChange(defaultWidth)}
      onKeyDown={onKeyDown}
    />
  );
}

/**
 * Column widths for a grid table. `spec` lists the columns in order:
 *   { key, width: CSS default, min?: px, fixed?: true (not resizable), fill?: true }
 * One `fill` column takes whatever is left. Returns { template, handleFor(key) };
 * put handleFor(col) inside each header cell (it marks the border to its right).
 */
export function useColumns(storeKey, spec) {
  const [widths, setWidths] = useLayoutPref(`cols:${storeKey}`, {});
  const template = spec.map(c => (!c.fill && !c.fixed && widths[c.key] != null ? `${widths[c.key]}px` : c.width)).join(' ');

  const handleFor = useCallback((key) => {
    const i = spec.findIndex(c => c.key === key);
    const a = spec[i];
    const b = spec[i + 1];
    if (!a || !b || a.fixed || b.fixed) return null;
    return (
      <ColumnBorder
        key="col-border"
        label={`Resize the ${a.label || a.key} column`}
        onDragStart={(cell) => {
          // Measure every column once, so that only the fill column flexes.
          const row = cell.parentElement;
          const cells = Array.from(row.children);
          const measured = {};
          spec.forEach((c, n) => { if (cells[n]) measured[c.key] = cells[n].getBoundingClientRect().width; });
          const frozen = {};
          spec.forEach(c => { if (!c.fill && !c.fixed) frozen[c.key] = Math.round(measured[c.key]); });
          setWidths(frozen);
          const minA = a.min || 40;
          const minB = b.min || 40;
          const fillSpare = Math.max(0, (measured[(spec.find(c => c.fill) || {}).key] || 0) - 80);
          return (dx) => {
            // A column's right border sizes that column and the fill column (Title)
            // gives or takes the difference, like a file manager. Title's own
            // border trades width with the column to its right.
            const lo = a.fill ? -fillSpare : minA - measured[a.key];
            const hi = a.fill ? measured[b.key] - minB : fillSpare;
            const d = Math.round(clamp(dx, Math.min(lo, 0), Math.max(hi, 0)));
            setWidths(() => {
              const next = { ...frozen };
              if (a.fill) next[b.key] = Math.max(minB, Math.round(measured[b.key] - d));
              else next[a.key] = Math.max(minA, Math.round(measured[a.key] + d));
              return next;
            });
          };
        }}
        onReset={() => setWidths({})}
      />
    );
  }, [spec, setWidths]); // eslint-disable-line react-hooks/exhaustive-deps

  return { template, handleFor, widths };
}

function ColumnBorder({ label, onDragStart, onReset }) {
  const onPointerDown = (e) => {
    const cell = e.currentTarget.parentElement;
    const move = onDragStart(cell);
    startDrag(e, move);
  };
  return (
    <span
      className="col-border"
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      title="Drag to resize · double-click to reset columns"
      onPointerDown={onPointerDown}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => { e.stopPropagation(); onReset(); }}
    />
  );
}
