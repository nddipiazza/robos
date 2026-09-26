/**
 * RobOS cRPG Editor — 2D Interactive Canvas Renderer
 * Renders static scene background maps and KGraph map objects with 1:1 parity
 * with packages/robos-crpg-blockout (Pillow renderer & collision grid).
 */

class MapCanvasRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');

    // Viewport transform
    this.panX = 60;
    this.panY = 60;
    this.zoom = 1.0;
    this.pxPerFt = 12; // Base scale: 12 screen pixels per world foot

    // Display flags
    this.showGrid = true;
    this.showLabels = true;
    this.debugCollision = false;
    this.showBackground = true;
    this.backgroundOpacity = 1.0;
    this.imageCache = new Map();

    // Active state
    this.mapData = null;
    this.selectedObjectId = null;
    this.hoverFeet = { x: 0, y: 0 };
    this.hoverCell = { c: 0, r: 0 };

    // Styling constants matching Python robos_crpg_blockout
    this.TERRAIN_COLORS = {
      stone: '#3a3e46',
      grass: '#3e5438',
      dirt:  '#584838',
      sand:  '#8a7a5c',
      wood:  '#5c4632',
      snow:  '#bec4cc',
      cave:  '#28262a',
    };

    this.TYPE_STYLE = {
      wall:     { fill: '#22242a', stroke: '#787e8a', width: 2 },
      building: { fill: '#96989e', stroke: '#3c3e46', width: 2 },
      door:     { fill: '#805630', stroke: '#3c2614', width: 2 },
      pillar:   { fill: '#6e7076', stroke: '#3c3e46', width: 2 },
      tree:     { fill: '#2e6e3a', stroke: '#1a4022', width: 2 },
      rock:     { fill: '#76746e', stroke: '#464440', width: 2 },
      statue:   { fill: '#aaa8a0', stroke: '#5a5854', width: 2 },
      crate:    { fill: '#9c7446', stroke: '#5c4022', width: 2 },
      barrel:   { fill: '#8c603a', stroke: '#50341c', width: 2 },
      table:    { fill: '#966e46', stroke: '#563c22', width: 2 },
      altar:    { fill: '#b4b0be', stroke: '#605a6e', width: 2 },
      bed:      { fill: '#aa9678', stroke: '#64543c', width: 2 },
      chest:    { fill: '#aa823c', stroke: '#64461a', width: 2 },
      fence:    { fill: '#8c6840', stroke: '#503a1e', width: 2 },
      pit:      { fill: '#0c0a0c', stroke: '#aa3232', width: 2 },
      water:    { fill: '#346096', stroke: '#22426e', width: 2 },
      bush:     { fill: '#548846', stroke: '#345a2c', width: 2 },
      rubble:   { fill: '#605850', stroke: '#3c3630', width: 1.5 },
      stairs:   { fill: '#7a7672', stroke: '#4c4844', width: 1.5 },
      road:     { fill: '#4a4844', stroke: '#64625e', width: 1 },
      bridge:   { fill: '#644c32', stroke: '#403020', width: 1.5 },
      rug:      { fill: '#882234', stroke: '#5a1420', width: 1 },
      zone:     { fill: 'rgba(0, 188, 212, 0.15)', stroke: '#00bcd4', width: 1.5, dash: [4, 4] },
    };
  }

  setMapData(mapData) {
    this.mapData = mapData;
    this.preloadBackground();
    this.render();
  }

  setSelectedObject(id) {
    this.selectedObjectId = id;
    this.render();
  }

  preloadBackground() {
    if (!this.mapData) return;
    const bgPath = this.mapData['robos:backgroundImage'] || this.mapData.backgroundImage;
    if (!bgPath) return;

    if (!this.imageCache.has(bgPath)) {
      const img = new Image();
      // Handle repo-relative path if necessary
      img.src = bgPath.startsWith('http') || bgPath.startsWith('/') || bgPath.startsWith('file://')
        ? bgPath
        : `../../${bgPath}`;
      img.onload = () => {
        this.imageCache.set(bgPath, img);
        this.render();
      };
      img.onerror = () => {
        // Fallback for file path
        const fallback = new Image();
        fallback.src = `../../games/crpg-realm/${bgPath}`;
        fallback.onload = () => {
          this.imageCache.set(bgPath, fallback);
          this.render();
        };
      };
    }
  }

  // Coordinate transformations
  worldToScreen(wx, wy) {
    return {
      x: this.panX + wx * this.pxPerFt * this.zoom,
      y: this.panY + wy * this.pxPerFt * this.zoom,
    };
  }

  screenToWorld(sx, sy) {
    return {
      x: (sx - this.panX) / (this.pxPerFt * this.zoom),
      y: (sy - this.panY) / (this.pxPerFt * this.zoom),
    };
  }

  worldDistToScreen(ft) {
    return ft * this.pxPerFt * this.zoom;
  }

  screenDistToWorld(px) {
    return px / (this.pxPerFt * this.zoom);
  }

  resize(w, h) {
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = w * dpr;
    this.canvas.height = h * dpr;
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.ctx.scale(dpr, dpr);
    this.render();
  }

  resetView(w = 120, h = 80) {
    const cw = this.canvas.clientWidth || 800;
    const ch = this.canvas.clientHeight || 600;
    const padding = 60;
    const targetW = (w || 120) * this.pxPerFt;
    const targetH = (h || 80) * this.pxPerFt;
    const scaleX = (cw - padding * 2) / targetW;
    const scaleY = (ch - padding * 2) / targetH;
    this.zoom = Math.min(Math.max(Math.min(scaleX, scaleY), 0.3), 3.0);
    this.panX = (cw - targetW * this.zoom) / 2;
    this.panY = (ch - targetH * this.zoom) / 2;
    this.render();
  }

  render() {
    const ctx = this.ctx;
    const cw = this.canvas.clientWidth || 800;
    const ch = this.canvas.clientHeight || 600;

    ctx.save();
    // Clear whole canvas
    ctx.fillStyle = '#0d1117';
    ctx.fillRect(0, 0, cw, ch);

    if (!this.mapData) {
      this.drawEmptyState(ctx, cw, ch);
      ctx.restore();
      return;
    }

    const widthFt = Number(this.mapData['robos:width'] || this.mapData.width || 120);
    const heightFt = Number(this.mapData['robos:height'] || this.mapData.height || 80);
    const terrain = this.mapData['robos:terrain'] || this.mapData.terrain || 'stone';

    const origin = this.worldToScreen(0, 0);
    const mapW = this.worldDistToScreen(widthFt);
    const mapH = this.worldDistToScreen(heightFt);

    // 1. Draw Map Base Terrain
    ctx.fillStyle = this.TERRAIN_COLORS[terrain] || '#3a3e46';
    ctx.fillRect(origin.x, origin.y, mapW, mapH);

    // 2. Draw Background Underlay Artwork (if loaded and enabled)
    const bgPath = this.mapData['robos:backgroundImage'] || this.mapData.backgroundImage;
    if (this.showBackground && bgPath && this.imageCache.has(bgPath)) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, this.backgroundOpacity));
      const img = this.imageCache.get(bgPath);
      ctx.drawImage(img, origin.x, origin.y, mapW, mapH);
      ctx.restore();
    }

    // 3. Draw 5-ft Grid Overlay
    if (this.showGrid) {
      this.drawGrid(ctx, origin, widthFt, heightFt, mapW, mapH);
    }

    // 4. Draw Collision Grid Debug (if enabled)
    if (this.debugCollision && this.mapData['robos:blockout']) {
      this.drawCollisionDebug(ctx, this.mapData['robos:blockout'], widthFt, heightFt);
    }

    // 5. Draw Map Objects
    const objects = this.mapData['robos:mapObjects'] || this.mapData.mapObjects || [];
    for (const obj of objects) {
      const isSelected = (obj.id || obj['@id']) === this.selectedObjectId;
      this.drawMapObject(ctx, obj, isSelected);
    }

    // 6. Draw Map Outer Border
    ctx.strokeStyle = '#00bcd4';
    ctx.lineWidth = 2;
    ctx.strokeRect(origin.x, origin.y, mapW, mapH);

    ctx.restore();
  }

  drawEmptyState(ctx, cw, ch) {
    ctx.fillStyle = '#8b949e';
    ctx.font = '15px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Select or create a battle map to start editing.', cw / 2, ch / 2);
  }

  drawGrid(ctx, origin, widthFt, heightFt, mapW, mapH) {
    const cols = Math.floor(widthFt / 5);
    const rows = Math.floor(heightFt / 5);

    ctx.save();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1;

    for (let c = 0; c <= cols; c++) {
      const x = origin.x + this.worldDistToScreen(c * 5);
      ctx.beginPath();
      ctx.moveTo(x, origin.y);
      ctx.lineTo(x, origin.y + mapH);
      ctx.stroke();
    }

    for (let r = 0; r <= rows; r++) {
      const y = origin.y + this.worldDistToScreen(r * 5);
      ctx.beginPath();
      ctx.moveTo(origin.x, y);
      ctx.lineTo(origin.x + mapW, y);
      ctx.stroke();
    }
    ctx.restore();
  }

  drawCollisionDebug(ctx, blockout, widthFt, heightFt) {
    const cols = Math.floor(widthFt / 5);
    const blockedSet = new Set(blockout.blocked || []);
    const opaqueSet = new Set(blockout.opaque || []);
    const diffSet = new Set(blockout.difficult || []);

    ctx.save();
    for (const idx of blockedSet) {
      const c = idx % cols;
      const r = Math.floor(idx / cols);
      const pos = this.worldToScreen(c * 5, r * 5);
      const sz = this.worldDistToScreen(5);
      ctx.fillStyle = 'rgba(239, 68, 68, 0.35)'; // Red for blocked
      ctx.fillRect(pos.x, pos.y, sz, sz);
    }

    for (const idx of diffSet) {
      const c = idx % cols;
      const r = Math.floor(idx / cols);
      const pos = this.worldToScreen(c * 5, r * 5);
      const sz = this.worldDistToScreen(5);
      ctx.fillStyle = 'rgba(234, 179, 8, 0.35)'; // Yellow for difficult
      ctx.fillRect(pos.x, pos.y, sz, sz);
    }
    ctx.restore();
  }

  normalizeMapObject(obj) {
    if (!obj) return null;
    const id = obj['robos:objectId'] || obj.objectId || obj.id || obj['@id'] || '';
    const type = obj['robos:objectType'] || obj.objectType || obj.type || 'wall';
    const shape = obj['robos:shape'] || obj.shape || 'rect';
    const label = obj['dcterms:title'] || obj.title || obj['robos:label'] || obj.label || id;
    
    let x = obj.x, y = obj.y, width = obj.width, height = obj.height;
    if (Array.isArray(obj['robos:position'])) {
      x = obj['robos:position'][0];
      y = obj['robos:position'][1];
    }
    if (Array.isArray(obj['robos:size'])) {
      width = obj['robos:size'][0];
      height = obj['robos:size'][1];
    }
    
    let cx = obj.cx, cy = obj.cy, radius = obj.radius;
    if (Array.isArray(obj['robos:center'])) {
      cx = obj['robos:center'][0];
      cy = obj['robos:center'][1];
    }
    if (obj['robos:radius'] !== undefined) radius = obj['robos:radius'];

    let x1 = obj.x1, y1 = obj.y1, x2 = obj.x2, y2 = obj.y2, thickness = obj.thickness;
    if (Array.isArray(obj['robos:points']) && obj['robos:points'].length >= 2) {
      x1 = obj['robos:points'][0][0];
      y1 = obj['robos:points'][0][1];
      x2 = obj['robos:points'][1][0];
      y2 = obj['robos:points'][1][1];
    }
    if (obj['robos:thickness'] !== undefined) thickness = obj['robos:thickness'];

    return {
      id,
      type,
      shape,
      label,
      x: Number(x ?? 0),
      y: Number(y ?? 0),
      width: Number(width ?? 5),
      height: Number(height ?? 5),
      cx: Number(cx ?? 0),
      cy: Number(cy ?? 0),
      radius: Number(radius ?? 2.5),
      x1: Number(x1 ?? 0),
      y1: Number(y1 ?? 0),
      x2: Number(x2 ?? 0),
      y2: Number(y2 ?? 0),
      thickness: Number(thickness ?? 5),
      raw: obj,
    };
  }

  drawMapObject(ctx, rawObj, isSelected) {
    const obj = this.normalizeMapObject(rawObj);
    const shape = obj.shape;
    const type = obj.type;
    const style = this.TYPE_STYLE[type] || { fill: '#6e7076', stroke: '#3c3e46', width: 2 };

    ctx.save();
    ctx.fillStyle = style.fill;
    ctx.strokeStyle = isSelected ? '#00e5ff' : style.stroke;
    ctx.lineWidth = isSelected ? Math.max(style.width + 1.5, 3) : style.width;

    if (style.dash) ctx.setLineDash(style.dash);

    if (shape === 'rect') {
      const pos = this.worldToScreen(obj.x, obj.y);
      const w = this.worldDistToScreen(obj.width);
      const h = this.worldDistToScreen(obj.height);
      ctx.fillRect(pos.x, pos.y, w, h);
      ctx.strokeRect(pos.x, pos.y, w, h);

      if (this.showLabels && (obj.label || obj.id)) {
        this.drawLabel(ctx, obj.label || obj.id, pos.x + w / 2, pos.y + h / 2);
      }
    } else if (shape === 'circle') {
      const center = this.worldToScreen(obj.cx, obj.cy);
      const rad = this.worldDistToScreen(obj.radius);
      ctx.beginPath();
      ctx.arc(center.x, center.y, rad, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      if (this.showLabels && (obj.label || obj.id)) {
        this.drawLabel(ctx, obj.label || obj.id, center.x, center.y);
      }
    } else if (shape === 'line') {
      const p1 = this.worldToScreen(obj.x1, obj.y1);
      const p2 = this.worldToScreen(obj.x2, obj.y2);
      const thick = this.worldDistToScreen(obj.thickness);

      ctx.lineWidth = thick;
      ctx.lineCap = 'square';
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();

      if (isSelected) {
        ctx.strokeStyle = '#00e5ff';
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      if (this.showLabels && (obj.label || obj.id)) {
        this.drawLabel(ctx, obj.label || obj.id, (p1.x + p2.x) / 2, (p1.y + p2.y) / 2);
      }
    }

    if (isSelected) {
      this.drawSelectionHandles(ctx, obj);
    }

    ctx.restore();
  }

  drawLabel(ctx, text, x, y) {
    ctx.save();
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = 'rgba(0,0,0,0.8)';
    ctx.shadowBlur = 4;
    ctx.fillText(text, x, y);
    ctx.restore();
  }

  drawSelectionHandles(ctx, obj) {
    ctx.save();
    ctx.fillStyle = '#00e5ff';
    const sz = 6;

    if (obj.shape === 'rect') {
      const pos = this.worldToScreen(obj.x, obj.y);
      const w = this.worldDistToScreen(obj.width);
      const h = this.worldDistToScreen(obj.height);
      const corners = [
        { x: pos.x, y: pos.y },
        { x: pos.x + w, y: pos.y },
        { x: pos.x, y: pos.y + h },
        { x: pos.x + w, y: pos.y + h },
      ];
      for (const pt of corners) {
        ctx.fillRect(pt.x - sz / 2, pt.y - sz / 2, sz, sz);
      }
    }
    ctx.restore();
  }

  hitTest(worldX, worldY) {
    if (!this.mapData) return null;
    const objects = this.mapData['robos:mapObjects'] || this.mapData.mapObjects || [];

    // Traverse in reverse order (topmost first)
    for (let i = objects.length - 1; i >= 0; i--) {
      const raw = objects[i];
      const obj = this.normalizeMapObject(raw);
      const shape = obj.shape;

      if (shape === 'rect') {
        if (worldX >= obj.x && worldX <= obj.x + obj.width && worldY >= obj.y && worldY <= obj.y + obj.height) {
          return obj;
        }
      } else if (shape === 'circle') {
        const dist = Math.hypot(worldX - obj.cx, worldY - obj.cy);
        if (dist <= obj.radius) return obj;
      } else if (shape === 'line') {
        const dist = this.distToSegment(worldX, worldY, obj.x1, obj.y1, obj.x2, obj.y2);
        if (dist <= obj.thickness / 2) return obj;
      }
    }
    return null;
  }

  distToSegment(px, py, x1, y1, x2, y2) {
    const l2 = (x2 - x1) ** 2 + (y2 - y1) ** 2;
    if (l2 === 0) return Math.hypot(px - x1, py - y1);
    let t = ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / l2;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (x1 + t * (x2 - x1)), py - (y1 + t * (y2 - y1)));
  }
}
