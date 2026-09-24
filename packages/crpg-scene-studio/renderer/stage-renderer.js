/**
 * RobOS cRPG Scene Stage Renderer
 * High-performance 2D Canvas renderer for battlemaps, placed party heroes,
 * NPCs, enemy combatants, containers, and transition portals.
 */

class SceneStageRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');

    // World & Transform State
    this.worldWidth = 5120;
    this.worldHeight = 3840;
    this.feetWidth = 320;
    this.feetHeight = 240;
    this.pixelsPerFoot = 16; // 5120 / 320 = 16 px/ft (5-ft cell = 80px)

    this.zoom = 0.25;
    this.panX = 0;
    this.panY = 0;

    // View Options
    this.showGrid = true;
    this.showCollisions = true;
    this.showLabels = true;
    this.showRanges = true;

    // Data references
    this.sceneData = null;
    this.mapData = null;
    this.backgroundImage = null;
    this.bgLoaded = false;

    // Interaction State
    this.selectedEntityId = null;
    this.hoveredEntityId = null;
    this.isDragging = false;
    this.dragTarget = null;
    this.isPanning = false;
    this.lastMousePos = { x: 0, y: 0 };
    this.placementMode = null; // null or entity template to place on click

    // Callbacks
    this.onSelectEntity = null;
    this.onEntityMoved = null;
    this.onEntityPlaced = null;

    this.setupEvents();
  }

  setupEvents() {
    this.canvas.addEventListener('mousedown', (e) => this.handleMouseDown(e));
    window.addEventListener('mousemove', (e) => this.handleMouseMove(e));
    window.addEventListener('mouseup', (e) => this.handleMouseUp(e));
    this.canvas.addEventListener('wheel', (e) => this.handleWheel(e), { passive: false });

    // Window resize
    window.addEventListener('resize', () => {
      this.resizeCanvas();
      this.draw();
    });
  }

  resizeCanvas() {
    const rect = this.canvas.parentElement.getBoundingClientRect();
    this.canvas.width = rect.width;
    this.canvas.height = rect.height;
  }

  setScene(sceneData, mapData, bgImagePath = null) {
    this.sceneData = sceneData;
    this.mapData = mapData;

    if (sceneData?.['robos:dimensions']) {
      const dims = sceneData['robos:dimensions'];
      this.worldWidth = dims.width || (dims.feetWidth ? dims.feetWidth * 16 : 5120);
      this.worldHeight = dims.height || (dims.feetHeight ? dims.feetHeight * 16 : 3840);
      this.feetWidth = dims.feetWidth || Math.round(this.worldWidth / 16);
      this.feetHeight = dims.feetHeight || Math.round(this.worldHeight / 16);
    } else if (mapData) {
      const wFeet = mapData['robos:width'] || 120;
      const hFeet = mapData['robos:height'] || 80;
      this.worldWidth = wFeet * 16;
      this.worldHeight = hFeet * 16;
      this.feetWidth = wFeet;
      this.feetHeight = hFeet;
    }

    if (bgImagePath) {
      this.loadBackgroundImage(bgImagePath);
    } else {
      this.backgroundImage = null;
      this.bgLoaded = false;
    }

    this.fitToScreen();
    this.draw();
  }

  loadBackgroundImage(url) {
    this.bgLoaded = false;
    const img = new Image();
    img.onload = () => {
      this.backgroundImage = img;
      this.bgLoaded = true;
      this.draw();
    };
    img.onerror = () => {
      console.warn("Failed to load stage background image:", url);
      this.backgroundImage = null;
      this.bgLoaded = false;
      this.draw();
    };
    img.src = url;
  }

  fitToScreen() {
    this.resizeCanvas();
    const margin = 40;
    const scaleX = (this.canvas.width - margin * 2) / this.worldWidth;
    const scaleY = (this.canvas.height - margin * 2) / this.worldHeight;
    this.zoom = Math.min(scaleX, scaleY, 1.0);
    this.zoom = Math.max(0.05, Math.min(3.0, this.zoom));

    // Center in canvas
    this.panX = (this.canvas.width - this.worldWidth * this.zoom) / 2;
    this.panY = (this.canvas.height - this.worldHeight * this.zoom) / 2;
  }

  screenToWorld(sx, sy) {
    return {
      x: (sx - this.panX) / this.zoom,
      y: (sy - this.panY) / this.zoom,
    };
  }

  worldToScreen(wx, wy) {
    return {
      x: wx * this.zoom + this.panX,
      y: wy * this.zoom + this.panY,
    };
  }

  handleWheel(e) {
    e.preventDefault();
    const rect = this.canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const prevZoom = this.zoom;
    const factor = e.deltaY < 0 ? 1.15 : 0.85;
    this.zoom = Math.max(0.04, Math.min(3.5, this.zoom * factor));

    // Zoom centered on cursor
    this.panX = mouseX - (mouseX - this.panX) * (this.zoom / prevZoom);
    this.panY = mouseY - (mouseY - this.panY) * (this.zoom / prevZoom);

    this.draw();
  }

  handleMouseDown(e) {
    const rect = this.canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    this.lastMousePos = { x: e.clientX, y: e.clientY };

    // Middle click or Spacebar held -> Pan
    if (e.button === 1 || e.spaceKey || (e.button === 0 && e.altKey)) {
      this.isPanning = true;
      return;
    }

    if (e.button === 0) {
      const worldPos = this.screenToWorld(mouseX, mouseY);

      // If in placement mode, place new entity
      if (this.placementMode) {
        if (this.onEntityPlaced) {
          this.onEntityPlaced({
            ...this.placementMode,
            x: Math.round(worldPos.x),
            y: Math.round(worldPos.y),
          });
        }
        this.placementMode = null;
        this.draw();
        return;
      }

      // Check for clicked entity
      const hit = this.hitTestEntity(worldPos.x, worldPos.y);
      if (hit) {
        this.selectedEntityId = hit.id;
        this.isDragging = true;
        this.dragTarget = hit;
        if (this.onSelectEntity) this.onSelectEntity(hit);
      } else {
        // Deselect or click-drag to pan
        this.selectedEntityId = null;
        if (this.onSelectEntity) this.onSelectEntity(null);
        this.isPanning = true;
      }
      this.draw();
    }
  }

  handleMouseMove(e) {
    const rect = this.canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    if (this.isPanning) {
      const dx = e.clientX - this.lastMousePos.x;
      const dy = e.clientY - this.lastMousePos.y;
      this.panX += dx;
      this.panY += dy;
      this.lastMousePos = { x: e.clientX, y: e.clientY };
      this.draw();
      return;
    }

    if (this.isDragging && this.dragTarget) {
      const worldPos = this.screenToWorld(mouseX, mouseY);
      this.dragTarget.x = Math.round(worldPos.x);
      this.dragTarget.y = Math.round(worldPos.y);
      if (this.onEntityMoved) this.onEntityMoved(this.dragTarget);
      this.draw();
      return;
    }

    // Hover detection
    if (mouseX >= 0 && mouseX <= this.canvas.width && mouseY >= 0 && mouseY <= this.canvas.height) {
      const worldPos = this.screenToWorld(mouseX, mouseY);
      const hit = this.hitTestEntity(worldPos.x, worldPos.y);
      if (hit?.id !== this.hoveredEntityId) {
        this.hoveredEntityId = hit?.id || null;
        this.draw();
      }
    }
  }

  handleMouseUp(_e) {
    this.isPanning = false;
    this.isDragging = false;
    this.dragTarget = null;
  }

  hitTestEntity(wx, wy) {
    if (!this.sceneData || !Array.isArray(this.sceneData['robos:entities'])) return null;
    const entities = this.sceneData['robos:entities'];
    const hitRadiusWorld = 28 / this.zoom; // hit radius in world units

    // Test in reverse order (top rendered first)
    for (let i = entities.length - 1; i >= 0; i--) {
      const ent = entities[i];
      const ex = ent.x || 0;
      const ey = ent.y || 0;
      const dist = Math.hypot(wx - ex, wy - ey);
      if (dist <= Math.max(30, hitRadiusWorld)) {
        return ent;
      }
    }
    return null;
  }

  draw() {
    if (!this.canvas || !this.ctx) return;
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;

    // Clear background
    ctx.fillStyle = '#0a0d13';
    ctx.fillRect(0, 0, w, h);

    ctx.save();
    ctx.translate(this.panX, this.panY);
    ctx.scale(this.zoom, this.zoom);

    // 1. Draw World Stage Base
    ctx.fillStyle = '#161b22';
    ctx.fillRect(0, 0, this.worldWidth, this.worldHeight);

    // 2. Draw Background Artwork or Blockout PNG
    if (this.bgLoaded && this.backgroundImage) {
      ctx.drawImage(this.backgroundImage, 0, 0, this.worldWidth, this.worldHeight);
    }

    // 3. Draw 5-Foot Tactical Grid
    if (this.showGrid) {
      this.drawTacticalGrid(ctx);
    }

    // 4. Draw Map Collisions / Obstacles
    if (this.showCollisions && this.mapData) {
      this.drawMapObstacles(ctx);
    }

    // 5. Draw Placed Entities
    if (this.sceneData && Array.isArray(this.sceneData['robos:entities'])) {
      this.drawEntities(ctx, this.sceneData['robos:entities']);
    }

    // 6. Draw Stage Border
    ctx.strokeStyle = '#00bcd4';
    ctx.lineWidth = 2 / this.zoom;
    ctx.strokeRect(0, 0, this.worldWidth, this.worldHeight);

    ctx.restore();

    // 7. Draw HUD Overlay (Coordinates & Zoom)
    this.drawHUD(ctx);
  }

  drawTacticalGrid(ctx) {
    const cellSize = 5 * this.pixelsPerFoot; // 5 ft * 16 px/ft = 80 px
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1 / this.zoom;

    ctx.beginPath();
    for (let x = 0; x <= this.worldWidth; x += cellSize) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, this.worldHeight);
    }
    for (let y = 0; y <= this.worldHeight; y += cellSize) {
      ctx.moveTo(0, y);
      ctx.lineTo(this.worldWidth, y);
    }
    ctx.stroke();
  }

  drawMapObstacles(ctx) {
    const objects = this.mapData['robos:mapObjects'] || [];
    objects.forEach(obj => {
      const type = obj['robos:objectType'] || obj.type || 'obstacle';
      const x = (obj.x || 0) * this.pixelsPerFoot;
      const y = (obj.y || 0) * this.pixelsPerFoot;
      const ow = (obj.w || 5) * this.pixelsPerFoot;
      const oh = (obj.h || 5) * this.pixelsPerFoot;

      if (type === 'wall' || type === 'barrier') {
        ctx.fillStyle = 'rgba(74, 85, 104, 0.5)';
        ctx.strokeStyle = 'rgba(113, 128, 150, 0.8)';
      } else if (type === 'door') {
        ctx.fillStyle = 'rgba(217, 119, 6, 0.4)';
        ctx.strokeStyle = '#f59e0b';
      } else if (type === 'water') {
        ctx.fillStyle = 'rgba(37, 99, 235, 0.4)';
        ctx.strokeStyle = '#3b82f6';
      } else {
        ctx.fillStyle = 'rgba(100, 116, 139, 0.3)';
        ctx.strokeStyle = '#94a3b8';
      }

      ctx.lineWidth = 1.5 / this.zoom;
      ctx.fillRect(x, y, ow, oh);
      ctx.strokeRect(x, y, ow, oh);
    });
  }

  drawEntities(ctx, entities) {
    // Sort so selected entity is drawn on top
    const sorted = [...entities].sort((a, b) => {
      if (a.id === this.selectedEntityId) return 1;
      if (b.id === this.selectedEntityId) return -1;
      return 0;
    });

    sorted.forEach(ent => {
      this.drawSingleEntity(ctx, ent);
    });
  }

  drawSingleEntity(ctx, ent) {
    const x = ent.x || 0;
    const y = ent.y || 0;
    const isSelected = (ent.id === this.selectedEntityId);
    const isHovered = (ent.id === this.hoveredEntityId);
    const type = ent.type || 'npc';

    ctx.save();
    ctx.translate(x, y);

    // Style colors per type
    let tokenColor = '#00bcd4'; // Hero (Cyan)
    let tokenBorder = '#26c6da';
    let iconChar = '⚔️';

    if (type === 'hero') {
      tokenColor = '#00bcd4';
      tokenBorder = '#80deea';
      iconChar = ent.portrait || '👤';
    } else if (type === 'npc') {
      tokenColor = '#10b981'; // Green
      tokenBorder = '#6ee7b7';
      iconChar = '💬';
    } else if (type === 'enemy' || type === 'monster') {
      tokenColor = '#ef4444'; // Red
      tokenBorder = '#fca5a5';
      iconChar = '💀';
    } else if (type === 'container' || type === 'loot') {
      tokenColor = '#f59e0b'; // Gold
      tokenBorder = '#fcd34d';
      iconChar = '📦';
    } else if (type === 'portal') {
      tokenColor = '#8b5cf6'; // Purple
      tokenBorder = '#c4b5fd';
      iconChar = '🌀';
    }

    const radius = 24;

    // Selection or hover halo
    if (isSelected) {
      ctx.beginPath();
      ctx.arc(0, 0, radius + 10, 0, Math.PI * 2);
      ctx.strokeStyle = '#00bcd4';
      ctx.lineWidth = 3 / this.zoom;
      ctx.setLineDash([6, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
    } else if (isHovered) {
      ctx.beginPath();
      ctx.arc(0, 0, radius + 6, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
      ctx.lineWidth = 2 / this.zoom;
      ctx.stroke();
    }

    // Direction pointer
    if (ent.facing !== undefined) {
      const angleRad = (ent.facing * Math.PI) / 180;
      ctx.save();
      ctx.rotate(angleRad);
      ctx.fillStyle = tokenBorder;
      ctx.beginPath();
      ctx.moveTo(radius + 14, 0);
      ctx.lineTo(radius + 2, -6);
      ctx.lineTo(radius + 2, 6);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    // Token Body Circle
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.fillStyle = tokenColor;
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = tokenBorder;
    ctx.stroke();

    // Inner icon / emoji
    ctx.font = '20px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(iconChar, 0, 1);

    // Label and Badges
    if (this.showLabels) {
      const name = ent.name || ent.id;
      ctx.font = 'bold 12px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';

      // Text background plate
      const textMetrics = ctx.measureText(name);
      const textWidth = textMetrics.width;
      ctx.fillStyle = 'rgba(13, 17, 23, 0.85)';
      ctx.fillRect(-textWidth / 2 - 4, radius + 4, textWidth + 8, 16);

      // Label text
      ctx.fillStyle = '#ffffff';
      ctx.fillText(name, 0, radius + 5);

      // Sub-label (AI directive, role, or portal destination)
      let subText = '';
      if (type === 'enemy' && ent.aiDirective) {
        subText = `[AI: ${ent.aiDirective}]`;
      } else if (type === 'npc' && ent.role) {
        subText = ent.role;
      } else if (type === 'portal' && ent.targetScene) {
        subText = `→ ${ent.targetScene}`;
      } else if (type === 'hero' && ent.heroClass) {
        subText = ent.heroClass;
      }

      if (subText) {
        ctx.font = '10px sans-serif';
        const subMetrics = ctx.measureText(subText);
        ctx.fillStyle = 'rgba(13, 17, 23, 0.85)';
        ctx.fillRect(-subMetrics.width / 2 - 4, radius + 22, subMetrics.width + 8, 14);
        ctx.fillStyle = tokenBorder;
        ctx.fillText(subText, 0, radius + 23);
      }
    }

    ctx.restore();
  }

  drawHUD(ctx) {
    ctx.save();
    ctx.font = '11px monospace';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.textAlign = 'left';
    ctx.fillText(`Zoom: ${Math.round(this.zoom * 100)}% | Size: ${this.worldWidth}×${this.worldHeight} px (${this.feetWidth}×${this.feetHeight} ft)`, 16, this.canvas.height - 14);
    ctx.restore();
  }
}

if (typeof module !== 'undefined') {
  module.exports = SceneStageRenderer;
}
