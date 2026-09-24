/**
 * RobOS cRPG Maker — 2D Interactive Canvas Renderer
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
      rubble:   { fill: '#68625a', stroke: '#46423c', width: 2 },
      stairs:   { fill: '#807e7a', stroke: '#504e4a', width: 2 },
      road:     { fill: '#968464', stroke: '#78684c', width: 2 },
      bridge:   { fill: '#846442', stroke: '#543c24', width: 2 },
      rug:      { fill: '#82323c', stroke: '#5a1e28', width: 2 },
      zone:     { fill: 'rgba(230, 200, 90, 0.15)', stroke: '#e6c85a', width: 1.5 },
    };

    this.GRID_FT = 5;
    this.render = this.render.bind(this);
  }

  setMap(data) {
    this.mapData = data;
    this.render();
  }

  setSelectedObject(id) {
    this.selectedObjectId = id;
    this.render();
  }

  resize(width, height) {
    this.canvas.width = width;
    this.canvas.height = height;
    this.render();
  }

  getImage(src) {
    if (!src) return null;
    let url = src;
    if (!url.startsWith('http') && !url.startsWith('data:') && !url.startsWith('file://')) {
      url = 'file:///home/ndipiazza/source/robos/games/crpg-realm/' + src.replace(/^games\/crpg-realm\//, '').replace(/^res:\/\//, '');
    }
    if (this.imageCache.has(url)) {
      return this.imageCache.get(url);
    }
    const img = new Image();
    img.src = url;
    img.onload = () => {
      this.render();
    };
    this.imageCache.set(url, img);
    return img;
  }

  // Coordinate Conversion
  scale() {
    return this.pxPerFt * this.zoom;
  }

  worldToScreen(fx, fy) {
    const s = this.scale();
    return {
      x: this.panX + fx * s,
      y: this.panY + fy * s,
    };
  }

  screenToWorld(sx, sy) {
    const s = this.scale();
    return {
      fx: (sx - this.panX) / s,
      fy: (sy - this.panY) / s,
    };
  }

  snapToGrid(val, step = 5) {
    return Math.round(val / step) * step;
  }

  fitToView() {
    if (!this.mapData) return;
    const mapW = Number(this.mapData['robos:width'] || this.mapData.width || 120);
    const mapH = Number(this.mapData['robos:height'] || this.mapData.height || 80);

    const availW = this.canvas.width - 120;
    const availH = this.canvas.height - 120;

    const scaleW = availW / (mapW * this.pxPerFt);
    const scaleH = availH / (mapH * this.pxPerFt);
    this.zoom = Math.max(0.2, Math.min(2.5, Math.min(scaleW, scaleH)));

    const s = this.scale();
    this.panX = Math.round((this.canvas.width - mapW * s) / 2);
    this.panY = Math.round((this.canvas.height - mapH * s) / 2);
    this.render();
  }

  render() {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;

    // Clear entire viewport
    ctx.fillStyle = '#090d13';
    ctx.fillRect(0, 0, w, h);

    if (!this.mapData) return;

    const mapW = Number(this.mapData['robos:width'] || this.mapData.width || 120);
    const mapH = Number(this.mapData['robos:height'] || this.mapData.height || 80);
    const terrain = this.mapData['robos:terrain'] || this.mapData.terrain || 'stone';

    const s = this.scale();
    const mapPixelW = mapW * s;
    const mapPixelH = mapH * s;
    const origin = this.worldToScreen(0, 0);

    ctx.save();

    // 1. Draw Map Base Ground & Subtle Checkerboard
    ctx.fillStyle = this.TERRAIN_COLORS[terrain] || this.TERRAIN_COLORS.stone;
    ctx.fillRect(origin.x, origin.y, mapPixelW, mapPixelH);

    // If background image is present and visible, draw it
    const bgImageSrc = this.mapData['robos:backgroundImage'] || this.mapData.backgroundImage;
    if (bgImageSrc && this.showBackground) {
      const bgImg = this.getImage(bgImageSrc);
      if (bgImg && bgImg.complete && bgImg.naturalWidth > 0) {
        ctx.save();
        const opacity = this.backgroundOpacity !== undefined ? this.backgroundOpacity : (this.mapData['robos:backgroundOpacity'] || 1.0);
        ctx.globalAlpha = opacity;
        ctx.drawImage(bgImg, origin.x, origin.y, mapPixelW, mapPixelH);
        ctx.restore();
      }
    }

    // Checkerboard floor tile variation (every 5-ft cell) if no background or transparent
    const cellPx = this.GRID_FT * s;
    const cols = Math.floor(mapW / this.GRID_FT);
    const rows = Math.floor(mapH / this.GRID_FT);

    if (!bgImageSrc || !this.showBackground || this.backgroundOpacity < 0.8) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.035)';
      for (let c = 0; c < cols; c++) {
        for (let r = 0; r < rows; r++) {
          if ((c + r) % 2 === 0) {
            ctx.fillRect(origin.x + c * cellPx, origin.y + r * cellPx, cellPx, cellPx);
          }
        }
      }
    }

    // 2. Draw Objects
    const rawObjects = this.mapData['robos:mapObjects'] || [];
    // Sorting order: decorations -> obstacles -> doors
    const orderMap = { road: 0, rug: 0, water: 0, zone: 0, bridge: 1, rubble: 1, stairs: 1, bush: 2 };
    const sortedObjects = [...rawObjects].sort((a, b) => {
      const typeA = a['robos:objectType'] || a.objectType || a.type;
      const typeB = b['robos:objectType'] || b.objectType || b.type;
      const pA = typeA === 'door' ? 3 : (orderMap[typeA] !== undefined ? orderMap[typeA] : 2);
      const pB = typeB === 'door' ? 3 : (orderMap[typeB] !== undefined ? orderMap[typeB] : 2);
      return pA - pB;
    });

    for (const obj of sortedObjects) {
      this.drawObject(ctx, obj, origin, s);
    }

    // 3. Draw 5-Foot Grid Lines
    if (this.showGrid) {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = 0; x <= mapPixelW; x += cellPx) {
        ctx.moveTo(origin.x + x, origin.y);
        ctx.lineTo(origin.x + x, origin.y + mapPixelH);
      }
      for (let y = 0; y <= mapPixelH; y += cellPx) {
        ctx.moveTo(origin.x, origin.y + y);
        ctx.lineTo(origin.x + mapPixelW, origin.y + y);
      }
      ctx.stroke();
    }

    // 4. Debug Collision Grid Overlay (if enabled)
    if (this.debugCollision && this.mapData['robos:blockout']) {
      const blockout = this.mapData['robos:blockout'];
      const blocked = blockout.blocked || [];
      const difficult = blockout.difficult || [];

      // Blocked cells (Red outline)
      ctx.strokeStyle = 'rgba(239, 68, 68, 0.8)';
      ctx.lineWidth = 2;
      for (const [c, r] of blocked) {
        ctx.strokeRect(origin.x + c * cellPx + 1, origin.y + r * cellPx + 1, cellPx - 2, cellPx - 2);
      }

      // Difficult cells (Blue inner box)
      ctx.strokeStyle = 'rgba(59, 130, 246, 0.8)';
      ctx.lineWidth = 2;
      for (const [c, r] of difficult) {
        ctx.strokeRect(origin.x + c * cellPx + 4, origin.y + r * cellPx + 4, cellPx - 8, cellPx - 8);
      }
    }

    // 5. Draw Labels
    if (this.showLabels) {
      for (const obj of sortedObjects) {
        this.drawObjectLabel(ctx, obj, origin, s);
      }
    }

    // 6. Draw Selected Object Highlight
    if (this.selectedObjectId) {
      const selObj = rawObjects.find(o => (o['robos:objectId'] || o.objectId || o.id) === this.selectedObjectId);
      if (selObj) {
        this.drawSelectionOutline(ctx, selObj, origin, s);
      }
    }

    // 7. Draw Map Outer Boundary Border
    ctx.strokeStyle = '#00bcd4';
    ctx.lineWidth = 2;
    ctx.strokeRect(origin.x, origin.y, mapPixelW, mapPixelH);

    ctx.restore();
  }

  drawObject(ctx, obj, origin, s) {
    const type = obj['robos:objectType'] || obj.objectType || obj.type || 'zone';
    const shape = obj['robos:shape'] || obj.shape || 'rect';
    const style = this.TYPE_STYLE[type] || this.TYPE_STYLE.zone;

    ctx.fillStyle = style.fill;
    ctx.strokeStyle = style.stroke;
    ctx.lineWidth = Math.max(1, style.width * (this.zoom * 0.8));

    if (shape === 'rect') {
      const pos = obj['robos:position'] || obj.position || [0, 0];
      const size = obj['robos:size'] || obj.size || [5, 5];
      const rx = origin.x + pos[0] * s;
      const ry = origin.y + pos[1] * s;
      const rw = size[0] * s;
      const rh = size[1] * s;

      ctx.fillRect(rx, ry, rw, rh);
      ctx.strokeRect(rx, ry, rw, rh);

      // Open door passage indicator
      if (type === 'door' && (obj['robos:open'] || obj.open)) {
        ctx.fillStyle = 'rgba(0, 188, 212, 0.4)';
        ctx.fillRect(rx + 2, ry + 2, rw - 4, rh - 4);
      }
    } else if (shape === 'circle') {
      const pos = obj['robos:position'] || obj.position || [0, 0];
      const rad = Number(obj['robos:radius'] || obj.radius || 2.5);
      const cx = origin.x + pos[0] * s;
      const cy = origin.y + pos[1] * s;
      const r = rad * s;

      ctx.beginPath();
      ctx.arc(cx, cy, Math.max(1, r), 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    } else if (shape === 'line') {
      const from = obj['robos:position'] || obj.position || [0, 0];
      const to = obj['robos:to'] || obj.to || [0, 0];
      const th = Number(obj['robos:thickness'] || obj.thickness || 5);

      const x1 = origin.x + from[0] * s;
      const y1 = origin.y + from[1] * s;
      const x2 = origin.x + to[0] * s;
      const y2 = origin.y + to[1] * s;

      ctx.save();
      ctx.lineWidth = Math.max(2, th * s);
      ctx.lineCap = 'square';
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      ctx.restore();
    } else if (shape === 'polygon' && Array.isArray(obj['robos:points'] || obj.points)) {
      const pts = obj['robos:points'] || obj.points;
      if (pts.length > 2) {
        ctx.beginPath();
        ctx.moveTo(origin.x + pts[0][0] * s, origin.y + pts[0][1] * s);
        for (let i = 1; i < pts.length; i++) {
          ctx.lineTo(origin.x + pts[i][0] * s, origin.y + pts[i][1] * s);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
    }
  }

  drawObjectLabel(ctx, obj, origin, s) {
    const label = obj['dcterms:title'] || obj.label || '';
    const type = obj['robos:objectType'] || obj.objectType || obj.type;
    const text = label || (['building', 'zone', 'altar', 'statue', 'chest'].includes(type) ? type : '');
    if (!text) return;

    const center = this.getObjectCenter(obj);
    const cx = origin.x + center.x * s;
    const cy = origin.y + center.y * s;

    const fontSize = Math.max(11, Math.min(18, Math.round(13 * this.zoom)));
    ctx.font = `600 ${fontSize}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const metrics = ctx.measureText(text);
    const boxW = metrics.width + 10;
    const boxH = fontSize + 8;

    // Background pill for readability
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(cx - boxW / 2, cy - boxH / 2, boxW, boxH);

    ctx.fillStyle = '#ffffff';
    ctx.fillText(text, cx, cy);
  }

  drawSelectionOutline(ctx, obj, origin, s) {
    const bbox = this.getObjectBoundingBox(obj);
    const rx = origin.x + bbox.minX * s;
    const ry = origin.y + bbox.minY * s;
    const rw = (bbox.maxX - bbox.minX) * s;
    const rh = (bbox.maxY - bbox.minY) * s;

    ctx.save();
    ctx.strokeStyle = '#00bcd4';
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]);
    ctx.strokeRect(rx - 3, ry - 3, rw + 6, rh + 6);

    // Corner anchor handles
    ctx.setLineDash([]);
    ctx.fillStyle = '#00bcd4';
    const handleSize = 6;
    ctx.fillRect(rx - 3 - handleSize / 2, ry - 3 - handleSize / 2, handleSize, handleSize);
    ctx.fillRect(rx + rw + 3 - handleSize / 2, ry - 3 - handleSize / 2, handleSize, handleSize);
    ctx.fillRect(rx - 3 - handleSize / 2, ry + rh + 3 - handleSize / 2, handleSize, handleSize);
    ctx.fillRect(rx + rw + 3 - handleSize / 2, ry + rh + 3 - handleSize / 2, handleSize, handleSize);

    ctx.restore();
  }

  getObjectCenter(obj) {
    const shape = obj['robos:shape'] || obj.shape || 'rect';
    if (shape === 'rect') {
      const pos = obj['robos:position'] || obj.position || [0, 0];
      const size = obj['robos:size'] || obj.size || [5, 5];
      return { x: pos[0] + size[0] / 2, y: pos[1] + size[1] / 2 };
    } else if (shape === 'circle') {
      const pos = obj['robos:position'] || obj.position || [0, 0];
      return { x: pos[0], y: pos[1] };
    } else if (shape === 'line') {
      const from = obj['robos:position'] || obj.position || [0, 0];
      const to = obj['robos:to'] || obj.to || [0, 0];
      return { x: (from[0] + to[0]) / 2, y: (from[1] + to[1]) / 2 };
    }
    return { x: 0, y: 0 };
  }

  getObjectBoundingBox(obj) {
    const shape = obj['robos:shape'] || obj.shape || 'rect';
    if (shape === 'rect') {
      const pos = obj['robos:position'] || obj.position || [0, 0];
      const size = obj['robos:size'] || obj.size || [5, 5];
      return {
        minX: pos[0],
        minY: pos[1],
        maxX: pos[0] + size[0],
        maxY: pos[1] + size[1],
      };
    } else if (shape === 'circle') {
      const pos = obj['robos:position'] || obj.position || [0, 0];
      const rad = Number(obj['robos:radius'] || obj.radius || 2.5);
      return {
        minX: pos[0] - rad,
        minY: pos[1] - rad,
        maxX: pos[0] + rad,
        maxY: pos[1] + rad,
      };
    } else if (shape === 'line') {
      const from = obj['robos:position'] || obj.position || [0, 0];
      const to = obj['robos:to'] || obj.to || [0, 0];
      const th = Number(obj['robos:thickness'] || obj.thickness || 5) / 2;
      return {
        minX: Math.min(from[0], to[0]) - th,
        minY: Math.min(from[1], to[1]) - th,
        maxX: Math.max(from[0], to[0]) + th,
        maxY: Math.max(from[1], to[1]) + th,
      };
    }
    return { minX: 0, minY: 0, maxX: 5, maxY: 5 };
  }

  // Hit-testing: find object at world coordinates (fx, fy)
  hitTest(fx, fy) {
    if (!this.mapData) return null;
    const rawObjects = this.mapData['robos:mapObjects'] || [];

    // Search top-to-bottom (reverse of render order)
    for (let i = rawObjects.length - 1; i >= 0; i--) {
      const obj = rawObjects[i];
      const shape = obj['robos:shape'] || obj.shape || 'rect';

      if (shape === 'rect') {
        const pos = obj['robos:position'] || obj.position || [0, 0];
        const size = obj['robos:size'] || obj.size || [5, 5];
        if (fx >= pos[0] && fx <= pos[0] + size[0] && fy >= pos[1] && fy <= pos[1] + size[1]) {
          return obj;
        }
      } else if (shape === 'circle') {
        const pos = obj['robos:position'] || obj.position || [0, 0];
        const rad = Number(obj['robos:radius'] || obj.radius || 2.5);
        const dist = Math.hypot(fx - pos[0], fy - pos[1]);
        if (dist <= rad) {
          return obj;
        }
      } else if (shape === 'line') {
        const from = obj['robos:position'] || obj.position || [0, 0];
        const to = obj['robos:to'] || obj.to || [0, 0];
        const th = Math.max(2.5, Number(obj['robos:thickness'] || obj.thickness || 5) / 2);

        // Distance from point to line segment
        const dist = this.distToSegment({ x: fx, y: fy }, { x: from[0], y: from[1] }, { x: to[0], y: to[1] });
        if (dist <= th) {
          return obj;
        }
      }
    }
    return null;
  }

  distToSegment(p, v, w) {
    const l2 = (w.x - v.x) ** 2 + (w.y - v.y) ** 2;
    if (l2 === 0) return Math.hypot(p.x - v.x, p.y - v.y);
    let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(p.x - (v.x + t * (w.x - v.x)), p.y - (v.y + t * (w.y - v.y)));
  }
}
