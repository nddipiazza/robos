import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';

// The library pages scroll inside `.lib-content`. Lists and grids inside it render
// only the rows near the visible part of that container, so a 100,000-track library
// keeps a few hundred DOM nodes no matter how far you scroll.
export const ScrollContainerContext = createContext(null);

const OVERSCAN_PX = 600;

/**
 * Tracks which vertical slice of `rootRef` is visible inside the scroll container.
 * Returns { top, bottom, width, container } in the root's own coordinates, or null
 * when there is no scroll container (render everything).
 */
export function useViewport(rootRef, active = true) {
  const containerRef = useContext(ScrollContainerContext);
  const [view, setView] = useState(null);

  // A passive effect on purpose: the scroll container's ref (owned by a parent)
  // is only attached after child layout effects have run on first mount.
  useEffect(() => {
    const container = containerRef && containerRef.current;
    if (!container || !rootRef.current) return undefined;
    let frame = 0;
    const measure = () => {
      frame = 0;
      const root = rootRef.current;
      if (!root) return;
      const offset = root.getBoundingClientRect().top - container.getBoundingClientRect().top;
      const top = -offset;
      const bottom = top + container.clientHeight;
      const width = root.clientWidth;
      setView(v => (v && Math.abs(v.top - top) < 1 && Math.abs(v.bottom - bottom) < 1 && v.width === width
        ? v
        : { top, bottom, width, container }));
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(measure); };
    measure();
    container.addEventListener('scroll', schedule, { passive: true });
    const ro = new ResizeObserver(schedule);
    ro.observe(container);
    ro.observe(rootRef.current);
    return () => {
      container.removeEventListener('scroll', schedule);
      ro.disconnect();
      if (frame) cancelAnimationFrame(frame);
    };
  }, [containerRef, rootRef, active]);

  return view;
}

/** Scrolls the container so that `y` (root coordinates) sits `margin` px from the top. */
export function scrollRootTo(view, rootRef, y, margin = 0) {
  if (!view || !rootRef.current) return;
  const { container } = view;
  const offset = rootRef.current.getBoundingClientRect().top - container.getBoundingClientRect().top;
  container.scrollTop += offset + y - margin;
}

// First index whose row ends below `y` (rows sorted by top).
function firstRowAt(rows, y) {
  let lo = 0;
  let hi = rows.length - 1;
  let ans = rows.length;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (rows[mid].top + rows[mid].height >= y) { ans = mid; hi = mid - 1; } else lo = mid + 1;
  }
  return ans;
}

const DEFAULT_GRID = { minWidth: 150, gapX: 16, gapY: 20, textHeight: 46, headingHeight: 50 };
const RAIL_WIDTH = 26;

/**
 * Windowed card grid. Cards are square art + `textHeight` of captions unless
 * `itemHeight` is given. With `letterOf`, items are split under A–Z headings and a
 * jump rail is shown. Lists shorter than `virtualizeFrom` render as a plain grid.
 */
export function VirtualGrid({
  items,
  renderItem,
  keyOf,
  letterOf = null,
  className = '',
  virtualizeFrom = 60,
  ...options
}) {
  const opts = { ...DEFAULT_GRID, ...options };
  const rootRef = useRef(null);
  const view = useViewport(rootRef);
  const width = view ? view.width - (letterOf ? RAIL_WIDTH : 0) : 0;
  const virtual = items.length >= virtualizeFrom && !!view && width > 0;

  const layout = useMemo(() => {
    if (!virtual) return null;
    const cols = Math.max(1, Math.floor((width + opts.gapX) / (opts.minWidth + opts.gapX)));
    const cardWidth = (width - opts.gapX * (cols - 1)) / cols;
    const rowHeight = (opts.itemHeight || cardWidth + opts.textHeight) + opts.gapY;
    const rows = [];
    const letterTops = [];
    let top = 0;
    let i = 0;
    while (i < items.length) {
      const letter = letterOf ? letterOf(items[i]) : null;
      if (letterOf) {
        letterTops.push({ letter, top });
        rows.push({ kind: 'heading', letter, top, height: opts.headingHeight });
        top += opts.headingHeight;
      }
      // Fill rows until the letter changes (or the list ends).
      while (i < items.length && (!letterOf || letterOf(items[i]) === letter)) {
        const start = i;
        const chunk = [];
        while (chunk.length < cols && i < items.length && (!letterOf || letterOf(items[i]) === letter)) {
          chunk.push(items[i]);
          i++;
        }
        rows.push({ kind: 'cards', items: chunk, start, top, height: rowHeight });
        top += rowHeight;
      }
    }
    return { cols, rows, total: top, letterTops };
  }, [virtual, items, width, letterOf, opts.minWidth, opts.gapX, opts.gapY, opts.textHeight, opts.itemHeight, opts.headingHeight]); // eslint-disable-line react-hooks/exhaustive-deps

  const plainGrid = () => (
    <div className={`card-grid ${className}`} style={opts.itemHeight ? { gridAutoRows: opts.itemHeight } : undefined}>
      {items.map(item => <React.Fragment key={keyOf(item)}>{renderItem(item)}</React.Fragment>)}
    </div>
  );

  // One root element in every mode: useViewport measures it.
  if (!virtual) {
    // Big lists wait for the first measurement (same frame) instead of mounting every card.
    const waitingForMeasure = items.length >= virtualizeFrom;
    return (
      <div ref={rootRef} className={`vgrid ${letterOf ? 'with-rail' : ''}`}>
        {waitingForMeasure ? null : plainGrid()}
      </div>
    );
  }

  const first = firstRowAt(layout.rows, view.top - OVERSCAN_PX);
  const visible = [];
  for (let r = first; r < layout.rows.length && layout.rows[r].top < view.bottom + OVERSCAN_PX; r++) {
    visible.push(layout.rows[r]);
  }

  return (
    <div ref={rootRef} className={`vgrid virtual ${letterOf ? 'with-rail' : ''}`} style={{ height: layout.total }}>
      {letterOf && layout.letterTops.length > 1 && (
        <div className="letter-rail-track">
          <div className="letter-rail">
            {layout.letterTops.map(({ letter, top }) => (
              <button key={letter} title={`Jump to ${letter}`} onClick={() => scrollRootTo(view, rootRef, top, 4)}>{letter}</button>
            ))}
          </div>
        </div>
      )}
      {visible.map(row => (row.kind === 'heading' ? (
        <h4 key={`h-${row.letter}`} className="letter-heading vgrid-heading" style={{ top: row.top }}>{row.letter}</h4>
      ) : (
        <div
          key={`r-${row.start}`}
          className={`card-grid vgrid-row ${className}`}
          style={{ top: row.top, height: row.height - opts.gapY, gridTemplateColumns: `repeat(${layout.cols}, minmax(0, 1fr))` }}
        >
          {row.items.map(item => <React.Fragment key={keyOf(item)}>{renderItem(item)}</React.Fragment>)}
        </div>
      )))}
    </div>
  );
}
