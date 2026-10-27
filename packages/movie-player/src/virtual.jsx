/**
 * Windowed Virtual Table & Virtual Card Grid for 100,000+ Movie Libraries
 */

import React, { useState, useEffect, useRef } from 'react';

export function VirtualTable({
  items = [],
  rowHeight = 40,
  overscan = 10,
  className = '',
  renderRow
}) {
  const containerRef = useRef(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(520);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return undefined;
    const updateSize = () => {
      if (el.clientHeight > 0) setViewportHeight(el.clientHeight);
    };
    updateSize();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(updateSize) : null;
    if (ro) ro.observe(el);
    window.addEventListener('resize', updateSize);
    return () => {
      if (ro) ro.disconnect();
      window.removeEventListener('resize', updateSize);
    };
  }, []);

  const totalHeight = items.length * rowHeight;
  const startIdx = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
  const visibleCount = Math.ceil(viewportHeight / rowHeight) + overscan * 2;
  const endIdx = Math.min(items.length, startIdx + visibleCount);
  const offsetY = startIdx * rowHeight;

  const visibleItems = items.slice(startIdx, endIdx);

  return (
    <div
      ref={containerRef}
      className={`vt-scroll-container ${className}`}
      onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
      style={{ overflowY: 'auto', flex: 1, position: 'relative' }}
    >
      <div style={{ height: totalHeight, position: 'relative', width: '100%' }}>
        <div style={{ transform: `translateY(${offsetY}px)`, position: 'absolute', left: 0, right: 0, top: 0 }}>
          {visibleItems.map((item, i) => renderRow(item, startIdx + i))}
        </div>
      </div>
    </div>
  );
}

export function VirtualGrid({
  items = [],
  minCardWidth = 168,
  cardHeight = 224,
  gap = 14,
  overscanRows = 3,
  renderItem
}) {
  const containerRef = useRef(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [dims, setDims] = useState({ width: 900, height: 520 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return undefined;
    const measure = () => {
      setDims({
        width: el.clientWidth || 900,
        height: el.clientHeight || 520
      });
    };
    measure();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    if (ro) ro.observe(el);
    window.addEventListener('resize', measure);
    return () => {
      if (ro) ro.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, []);

  const cols = Math.max(1, Math.floor((dims.width + gap) / (minCardWidth + gap)));
  const rowCount = Math.ceil(items.length / cols);
  const rowStride = cardHeight + gap;
  const totalHeight = rowCount * rowStride;

  const startRow = Math.max(0, Math.floor(scrollTop / rowStride) - overscanRows);
  const visibleRows = Math.ceil(dims.height / rowStride) + overscanRows * 2;
  const endRow = Math.min(rowCount, startRow + visibleRows);

  const rows = [];
  for (let r = startRow; r < endRow; r++) {
    const slice = items.slice(r * cols, (r + 1) * cols);
    rows.push({ rowIndex: r, items: slice, top: r * rowStride });
  }

  return (
    <div
      ref={containerRef}
      className="vg-scroll-container"
      onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
      style={{ overflowY: 'auto', flex: 1, position: 'relative', padding: '8px 12px' }}
    >
      <div style={{ height: totalHeight, position: 'relative', width: '100%' }}>
        {rows.map(row => (
          <div
            key={row.rowIndex}
            style={{
              position: 'absolute',
              top: row.top,
              left: 0,
              right: 0,
              height: cardHeight,
              display: 'grid',
              gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
              gap
            }}
          >
            {row.items.map((item, idx) => (
              <React.Fragment key={item.key || item.id || idx}>
                {renderItem(item, row.rowIndex * cols + idx)}
              </React.Fragment>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
