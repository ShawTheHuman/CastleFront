import React, { useRef, useEffect, useState, useCallback } from 'react';
import { GameEngine } from '../game/GameEngine';
import { TILE_SIZE, MAP_WIDTH, MAP_HEIGHT, BUILDING_STATS, PLAYER_COLORS } from '../constants';
import { Camera, Coordinates, UnitType, BuildingType } from '../types';

interface GameCanvasProps {
  engine: GameEngine;
  playerId: string;
  onSelectTile: (x: number, y: number) => void;
  selectedBuildingType: string | null;
  onPlaceBuilding: (x: number, y: number) => void;
  selectedUnitId: string | null;
  onSelectUnit: (unitId: string | null) => void;
  selectedSpawnUnitType: UnitType | null;
  onSpawnUnitAt: (x: number, y: number) => void;
}

// Utility to darken hex color
const darkenColor = (color: string, percent: number) => {
  // Simple RGB darkened
  if (color.startsWith('#')) {
    let r = parseInt(color.substring(1, 3), 16);
    let g = parseInt(color.substring(3, 5), 16);
    let b = parseInt(color.substring(5, 7), 16);

    r = Math.floor(r * (1 - percent));
    g = Math.floor(g * (1 - percent));
    b = Math.floor(b * (1 - percent));

    return `rgb(${r},${g},${b})`;
  }
  return color;
}

// Utility to convert hex to rgba
const hexToRgba = (hex: string, alpha: number) => {
  if (hex.startsWith('#')) {
    let r = parseInt(hex.substring(1, 3), 16);
    let g = parseInt(hex.substring(3, 5), 16);
    let b = parseInt(hex.substring(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  return hex;
}

export const GameCanvas: React.FC<GameCanvasProps> = ({
  engine,
  playerId,
  onSelectTile,
  selectedBuildingType,
  onPlaceBuilding,
  selectedUnitId,
  onSelectUnit,
  selectedSpawnUnitType,
  onSpawnUnitAt
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [camera, setCamera] = useState<Camera>({ x: 0, y: 0, zoom: 1 });
  const isDragging = useRef(false);
  const lastMousePos = useRef<Coordinates>({ x: 0, y: 0 });

  // Helper to get terrain color based on elevation
  const getTerrainColor = (elevation: number) => {
    if (elevation <= 5) {
      const t = (elevation - 1) / 4;
      const r = 74 + (34 - 74) * t;
      const g = 222 + (197 - 222) * t;
      const b = 128 + (94 - 128) * t;
      return `rgb(${Math.floor(r)},${Math.floor(g)},${Math.floor(b)})`;
    } else if (elevation <= 11) {
      const t = (elevation - 6) / 5;
      const r = 34 + (120 - 34) * t;
      const g = 197 + (53 - 197) * t;
      const b = 94 + (15 - 94) * t;
      return `rgb(${Math.floor(r)},${Math.floor(g)},${Math.floor(b)})`;
    } else {
      const t = (elevation - 12) / 3;
      const r = 120 + (255 - 120) * t;
      const g = 53 + (255 - 53) * t;
      const b = 15 + (255 - 15) * t;
      return `rgb(${Math.floor(r)},${Math.floor(g)},${Math.floor(b)})`;
    }
  };

  const drawBuilding = (ctx: CanvasRenderingContext2D, type: BuildingType, x: number, y: number, size: number, color: string) => {
    ctx.save();
    ctx.fillStyle = color;
    const p = (pct: number) => pct * size;

    switch (type) {
      case BuildingType.KINGDOM:
        // Draws a 3x3 fortress centered on (x,y)
        // Adjust draw for center origin
        const kX = x;
        const kY = y;
        const kSize = size;

        // Outer walls
        ctx.fillStyle = '#4a5568'; // Dark stone
        ctx.fillRect(kX, kY, kSize, kSize);

        // Inner courtyard
        ctx.fillStyle = '#2d3748';
        ctx.fillRect(kX + p(0.1), kY + p(0.1), p(0.8), p(0.8));

        // Central Keep
        ctx.fillStyle = color;
        ctx.fillRect(kX + p(0.25), kY + p(0.25), p(0.5), p(0.5));

        // Towers at corners
        ctx.fillStyle = '#718096';
        ctx.fillRect(kX, kY, p(0.2), p(0.2)); // TL
        ctx.fillRect(kX + p(0.8), kY, p(0.2), p(0.2)); // TR
        ctx.fillRect(kX, kY + p(0.8), p(0.2), p(0.2)); // BL
        ctx.fillRect(kX + p(0.8), kY + p(0.8), p(0.2), p(0.2)); // BR
        break;

      case BuildingType.CASTLE:
        // Main keep
        ctx.fillRect(x + p(0.15), y + p(0.3), p(0.7), p(0.6));
        // Towers
        ctx.fillRect(x + p(0.1), y + p(0.1), p(0.2), p(0.4));
        ctx.fillRect(x + p(0.7), y + p(0.1), p(0.2), p(0.4));
        // Gate
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.fillRect(x + p(0.4), y + p(0.6), p(0.2), p(0.3));
        break;

      case BuildingType.TOWN:
        // Small houses
        ctx.fillRect(x + p(0.1), y + p(0.5), p(0.3), p(0.4)); // House 1
        ctx.beginPath();
        ctx.moveTo(x + p(0.1), y + p(0.5));
        ctx.lineTo(x + p(0.25), y + p(0.3));
        ctx.lineTo(x + p(0.4), y + p(0.5));
        ctx.fill();

        ctx.fillRect(x + p(0.5), y + p(0.4), p(0.4), p(0.5)); // House 2
        ctx.beginPath();
        ctx.moveTo(x + p(0.5), y + p(0.4));
        ctx.lineTo(x + p(0.7), y + p(0.2));
        ctx.lineTo(x + p(0.9), y + p(0.4));
        ctx.fill();
        break;

      case BuildingType.MARKET:
        // Tent shape
        ctx.fillRect(x + p(0.15), y + p(0.4), p(0.7), p(0.5));
        ctx.beginPath();
        ctx.moveTo(x + p(0.15), y + p(0.4));
        ctx.lineTo(x + p(0.5), y + p(0.1));
        ctx.lineTo(x + p(0.85), y + p(0.4));
        ctx.fill();
        // Stripes/Stall opening
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.fillRect(x + p(0.3), y + p(0.6), p(0.4), p(0.3));
        break;

      case BuildingType.FARM:
        // Crops
        ctx.strokeStyle = color;
        ctx.lineWidth = size * 0.1;
        for (let i = 1; i <= 3; i++) {
          ctx.beginPath();
          ctx.moveTo(x + p(0.2 * i + 0.1), y + p(0.8));
          ctx.lineTo(x + p(0.2 * i + 0.1), y + p(0.2));
          ctx.stroke();
          // Leaves
          ctx.beginPath();
          ctx.arc(x + p(0.2 * i + 0.1), y + p(0.3), p(0.1), 0, Math.PI * 2);
          ctx.fill();
        }
        break;

      case BuildingType.WOODCUTTER:
        // Tree
        ctx.fillStyle = '#5d4037'; // Trunk always brownish if possible, but we use 'color' for territory ownership. 
        // Let's stick to the passed color for ownership clarity.
        ctx.fillRect(x + p(0.4), y + p(0.6), p(0.2), p(0.3));

        ctx.beginPath();
        ctx.moveTo(x + p(0.1), y + p(0.6));
        ctx.lineTo(x + p(0.5), y + p(0.1));
        ctx.lineTo(x + p(0.9), y + p(0.6));
        ctx.fill();
        break;

      case BuildingType.MINE:
        // Mound
        ctx.beginPath();
        ctx.arc(x + p(0.5), y + p(0.8), p(0.4), Math.PI, 0);
        ctx.fill();
        // Entrance
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.beginPath();
        ctx.arc(x + p(0.5), y + p(0.8), p(0.15), Math.PI, 0);
        ctx.fill();
        break;

      case BuildingType.BARRACKS:
        // Square building
        ctx.fillRect(x + p(0.1), y + p(0.2), p(0.8), p(0.7));
        // Crossed swords / X
        ctx.strokeStyle = 'rgba(0,0,0,0.3)';
        ctx.lineWidth = size * 0.15;
        ctx.beginPath();
        ctx.moveTo(x + p(0.2), y + p(0.3));
        ctx.lineTo(x + p(0.8), y + p(0.8));
        ctx.moveTo(x + p(0.8), y + p(0.3));
        ctx.lineTo(x + p(0.2), y + p(0.8));
        ctx.stroke();
        break;

      case BuildingType.PIER:
        // Dock
        ctx.fillRect(x + p(0.2), y + p(0.3), p(0.6), p(0.6)); // Platform
        // Posts
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.fillRect(x + p(0.2), y + p(0.8), p(0.1), p(0.1));
        ctx.fillRect(x + p(0.7), y + p(0.8), p(0.1), p(0.1));
        ctx.fillRect(x + p(0.2), y + p(0.3), p(0.1), p(0.1));
        ctx.fillRect(x + p(0.7), y + p(0.3), p(0.1), p(0.1));
        break;
    }
    ctx.restore();
  };

  // Render loop
  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Safety check
    if (!engine.tiles || engine.tiles.length === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Background
    ctx.fillStyle = '#1e3a8a'; // Deep Ocean Blue
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.save();

    // Apply Camera
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    ctx.translate(centerX, centerY);
    ctx.scale(camera.zoom, camera.zoom);
    ctx.translate(-camera.x, -camera.y);

    const startCol = Math.floor((camera.x - (centerX / camera.zoom)) / TILE_SIZE);
    const endCol = startCol + (canvas.width / camera.zoom) / TILE_SIZE + 1;
    const startRow = Math.floor((camera.y - (centerY / camera.zoom)) / TILE_SIZE);
    const endRow = startRow + (canvas.height / camera.zoom) / TILE_SIZE + 1;

    const BORDER_WIDTH = 0.5; // Scaled border width
    const DRAW_SIZE = TILE_SIZE * 2.5; // Draw icons larger than grid (2.5x tile size)

    // PASS 1: TERRAIN AND BORDERS
    for (let y = Math.max(0, startRow); y < Math.min(MAP_HEIGHT, endRow + 2); y++) {
      if (!engine.tiles[y]) continue;

      for (let x = Math.max(0, startCol); x < Math.min(MAP_WIDTH, endCol + 2); x++) {
        const tile = engine.tiles[y][x];
        if (!tile) continue;

        const px = x * TILE_SIZE;
        const py = y * TILE_SIZE;

        if (tile.type === 'LAND') {
          // 1. Draw Terrain Base Color based on Elevation
          ctx.fillStyle = getTerrainColor(tile.elevation);
          // BLEED: Add small overlap to prevent anti-aliasing grid lines
          ctx.fillRect(px, py, TILE_SIZE + 0.5, TILE_SIZE + 0.5);

          // 2. Draw Borders AND Overlay if Owned
          if (tile.ownerId) {
            const owner = engine.players.find(p => p.id === tile.ownerId);
            if (owner) {
              // Transparent Overlay
              ctx.fillStyle = hexToRgba(owner.color, 0.3);
              ctx.fillRect(px, py, TILE_SIZE + 0.5, TILE_SIZE + 0.5);

              // Border Logic
              const borderColor = darkenColor(owner.color, 0.4);
              ctx.fillStyle = borderColor;

              // Check neighbors for border drawing
              const checkNeighbor = (dx: number, dy: number) => {
                const nx = x + dx;
                const ny = y + dy;
                if (nx < 0 || ny < 0 || nx >= MAP_WIDTH || ny >= MAP_HEIGHT) return true; // Map Edge is border
                const neighbor = engine.tiles[ny][nx];
                return neighbor.ownerId !== tile.ownerId;
              };

              if (checkNeighbor(0, -1)) ctx.fillRect(px, py, TILE_SIZE, BORDER_WIDTH); // Top
              if (checkNeighbor(0, 1)) ctx.fillRect(px, py + TILE_SIZE - BORDER_WIDTH, TILE_SIZE, BORDER_WIDTH); // Bottom
              if (checkNeighbor(-1, 0)) ctx.fillRect(px, py, BORDER_WIDTH, TILE_SIZE); // Left
              if (checkNeighbor(1, 0)) ctx.fillRect(px + TILE_SIZE - BORDER_WIDTH, py, BORDER_WIDTH, TILE_SIZE); // Right
            }
          }
        } else {
          // Water tile
          ctx.fillStyle = '#3b82f6';
          ctx.fillRect(px, py, TILE_SIZE + 0.5, TILE_SIZE + 0.5);
        }
      }
    }

    // PASS 2: BUILDINGS
    // We iterate again to draw buildings on top of terrain
    for (let y = Math.max(0, startRow); y < Math.min(MAP_HEIGHT, endRow + 2); y++) {
      if (!engine.tiles[y]) continue;

      for (let x = Math.max(0, startCol); x < Math.min(MAP_WIDTH, endCol + 2); x++) {
        const tile = engine.tiles[y][x];
        if (!tile || !tile.building) continue;

        const px = x * TILE_SIZE;
        const py = y * TILE_SIZE;

        const owner = engine.players.find(p => p.id === tile.building!.ownerId);
        const color = owner ? owner.color : '#555';

        // Center the larger icon on the small tile
        // Tile Center: px + TILE_SIZE/2, py + TILE_SIZE/2
        // Draw Top-Left: Center - DRAW_SIZE/2
        const drawX = px + TILE_SIZE / 2 - DRAW_SIZE / 2;
        const drawY = py + TILE_SIZE / 2 - DRAW_SIZE / 2;

        drawBuilding(ctx, tile.building.type, drawX, drawY, DRAW_SIZE, color);

        // Under Construction Overlay
        if (tile.building.isUnderConstruction) {
          ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
          ctx.fillRect(drawX, drawY, DRAW_SIZE, DRAW_SIZE);
        }

        // Health bar
        const hpPct = tile.building.hp / tile.building.maxHp;
        if (hpPct < 1) {
          ctx.fillStyle = 'red';
          ctx.fillRect(drawX, drawY - 2, DRAW_SIZE, 1.5);
          ctx.fillStyle = '#22c55e';
          ctx.fillRect(drawX, drawY - 2, DRAW_SIZE * hpPct, 1.5);
        }
      }
    }

    // Draw Units
    if (engine.players) {
      engine.players.forEach(p => {
        p.units.forEach(u => {
          const screenX = u.x * TILE_SIZE + TILE_SIZE / 2;
          const screenY = u.y * TILE_SIZE + TILE_SIZE / 2;

          ctx.beginPath();
          ctx.arc(screenX, screenY, 2.5, 0, Math.PI * 2); // Radius matches roughly TILE_SIZE of old (2.5) vs new (2)
          ctx.fillStyle = p.color;
          ctx.fill();
          ctx.strokeStyle = 'white';
          ctx.lineWidth = 0.5;
          ctx.stroke();

          // Health bar for units
          const hpPct = u.hp / u.maxHp;
          if (hpPct < 1) {
            ctx.fillStyle = 'red';
            ctx.fillRect(screenX - 2, screenY - 5, 4, 1);
            ctx.fillStyle = '#22c55e';
            ctx.fillRect(screenX - 2, screenY - 5, 4 * hpPct, 1);
          }

          // Selected Unit Highlight
          if (u.id === selectedUnitId) {
            ctx.beginPath();
            ctx.arc(screenX, screenY, 5, 0, Math.PI * 2);
            ctx.strokeStyle = '#ffff00'; // Yellow selection
            ctx.lineWidth = 1;
            ctx.stroke();
          }
        });
      });
    }

    // Pass 3: Player Labels
    if (engine.players) {
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      engine.players.forEach(p => {
        if (p.landArea > 5) { // Only show label if they have decent land
          const cx = p.center.x * TILE_SIZE;
          const cy = p.center.y * TILE_SIZE;

          // Dynamic sizing based on land area
          // Area 500 = small, Area 5000 = large
          const fontSize = Math.max(2, Math.min(20, Math.sqrt(p.landArea) * 0.4));

          ctx.font = `bold ${fontSize}px sans-serif`;

          // Name Shadow
          ctx.fillStyle = 'rgba(0,0,0,0.5)';
          ctx.fillText(p.name, cx + 0.5, cy + 0.5);

          // Name Color
          ctx.fillStyle = 'white';
          ctx.fillText(p.name, cx, cy);

          // Underline for AI
          if (p.isAI) {
            const metrics = ctx.measureText(p.name);
            const width = metrics.width;
            ctx.strokeStyle = 'white';
            ctx.lineWidth = fontSize * 0.1;
            ctx.beginPath();
            ctx.moveTo(cx - width / 2, cy + fontSize / 2);
            ctx.lineTo(cx + width / 2, cy + fontSize / 2);
            ctx.stroke();
          }

          // Population Count
          ctx.font = `${fontSize * 0.7}px monospace`;
          ctx.fillStyle = '#eab308'; // Yellow for pop
          ctx.fillText(`${Math.floor(p.population)}`, cx, cy + fontSize * 1.1);
        }
      });
    }

    // Ghost Building Preview
    if (selectedBuildingType) {
      const mouseX = lastMousePos.current.x;
      const mouseY = lastMousePos.current.y;

      const worldXAdjusted = (mouseX - centerX) / camera.zoom + camera.x;
      const worldYAdjusted = (mouseY - centerY) / camera.zoom + camera.y;

      const tileX = Math.floor(worldXAdjusted / TILE_SIZE);
      const tileY = Math.floor(worldYAdjusted / TILE_SIZE);

      const canBuild = engine.canBuild(playerId, selectedBuildingType as BuildingType, tileX, tileY);
      const player = engine.players.find(p => p.id === playerId);
      const color = canBuild && player ? player.color : '#ef4444'; // Red if invalid

      const px = tileX * TILE_SIZE;
      const py = tileY * TILE_SIZE;
      const drawX = px + TILE_SIZE / 2 - DRAW_SIZE / 2;
      const drawY = py + TILE_SIZE / 2 - DRAW_SIZE / 2;

      ctx.globalAlpha = 0.6;
      drawBuilding(ctx, selectedBuildingType as BuildingType, drawX, drawY, DRAW_SIZE, color);
      ctx.globalAlpha = 1.0;

      ctx.strokeStyle = canBuild ? '#4ade80' : '#ef4444';
      ctx.lineWidth = 1 / camera.zoom;
      if (ctx.lineWidth < 0.5) ctx.lineWidth = 0.5;
      // Stroke the TILE, not the icon size
      ctx.strokeRect(px, py, TILE_SIZE, TILE_SIZE);
    }

    // Ghost Unit Preview (Placement Mode)
    if (selectedSpawnUnitType) {
      const mouseX = lastMousePos.current.x;
      const mouseY = lastMousePos.current.y;

      const worldXAdjusted = (mouseX - centerX) / camera.zoom + camera.x;
      const worldYAdjusted = (mouseY - centerY) / camera.zoom + camera.y;

      const tileX = Math.floor(worldXAdjusted / TILE_SIZE);
      const tileY = Math.floor(worldYAdjusted / TILE_SIZE);

      const canSpawn = engine.canSpawnUnit(playerId, selectedSpawnUnitType, tileX, tileY);
      const player = engine.players.find(p => p.id === playerId);
      const color = canSpawn && player ? player.color : '#ef4444';

      const screenX = tileX * TILE_SIZE + TILE_SIZE / 2;
      const screenY = tileY * TILE_SIZE + TILE_SIZE / 2;

      ctx.globalAlpha = 0.6;
      ctx.beginPath();
      ctx.arc(screenX, screenY, 4, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.globalAlpha = 1.0;

      ctx.strokeStyle = canSpawn ? '#4ade80' : '#ef4444';
      ctx.lineWidth = 1 / camera.zoom;
      ctx.strokeRect(tileX * TILE_SIZE, tileY * TILE_SIZE, TILE_SIZE, TILE_SIZE);
    }

    ctx.restore();

  }, [engine, camera, selectedBuildingType, playerId, selectedUnitId, selectedSpawnUnitType]);

  // Game Loop
  useEffect(() => {
    let animationId: number;
    const loop = () => {
      render();
      animationId = requestAnimationFrame(loop);
    };
    loop();
    return () => cancelAnimationFrame(animationId);
  }, [render]);

  // Input Handlers
  const handleMouseDown = (e: React.MouseEvent | React.TouchEvent) => {
    isDragging.current = true;
    let clientX = 0;
    let clientY = 0;

    if ('touches' in e) {
      if (e.touches.length > 0) {
        clientX = e.touches[0].clientX;
        clientY = e.touches[0].clientY;
      } else {
        return;
      }
    } else {
      clientX = (e as React.MouseEvent).clientX;
      clientY = (e as React.MouseEvent).clientY;
    }

    lastMousePos.current = { x: clientX, y: clientY };
  };

  const handleMouseMove = (e: React.MouseEvent | React.TouchEvent) => {
    if (!canvasRef.current) return;

    let clientX = 0;
    let clientY = 0;

    if ('touches' in e) {
      if (e.touches.length > 0) {
        clientX = e.touches[0].clientX;
        clientY = e.touches[0].clientY;
      } else {
        return;
      }
    } else {
      clientX = (e as React.MouseEvent).clientX;
      clientY = (e as React.MouseEvent).clientY;
    }

    if (isDragging.current) {
      const dx = clientX - lastMousePos.current.x;
      const dy = clientY - lastMousePos.current.y;

      setCamera(prev => ({
        ...prev,
        x: prev.x - dx / prev.zoom,
        y: prev.y - dy / prev.zoom
      }));
    }

    lastMousePos.current = { x: clientX, y: clientY };
  };

  const handleMouseUp = (e: React.MouseEvent | React.TouchEvent) => {
    isDragging.current = false;
  };

  const handleClick = (e: React.MouseEvent) => {
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const centerX = canvasRef.current.width / 2;
    const centerY = canvasRef.current.height / 2;

    const worldX = (x - centerX) / camera.zoom + camera.x;
    const worldY = (y - centerY) / camera.zoom + camera.y;

    const tileX = Math.floor(worldX / TILE_SIZE);
    const tileY = Math.floor(worldY / TILE_SIZE);

    // PRIORITY 1: Placing Building or Spawning Unit
    if (selectedBuildingType) {
      onPlaceBuilding(tileX, tileY);
      return;
    }

    if (selectedSpawnUnitType) {
      onSpawnUnitAt(tileX, tileY);
      return;
    }

    // PRIORITY 2: Selecting Existing Unit
    const player = engine.players.find(p => p.id === playerId);
    if (player) {
      // Check roughly 1.5 tiles distance for easy tapping
      const clickedUnit = player.units.find(u => {
        const dx = u.x - (worldX / TILE_SIZE);
        const dy = u.y - (worldY / TILE_SIZE);
        return Math.sqrt(dx * dx + dy * dy) < 1.0;
      });

      if (clickedUnit) {
        onSelectUnit(clickedUnit.id);
        return;
      }
    }

    // PRIORITY 3: Normal Tile Select (Attack/Move)
    onSelectTile(tileX, tileY);
  };

  const handleWheel = (e: React.WheelEvent) => {
    const zoomSensitivity = 0.001;
    setCamera(prev => ({
      ...prev,
      zoom: Math.min(Math.max(0.2, prev.zoom - e.deltaY * zoomSensitivity), 8)
    }));
  };

  return (
    <canvas
      ref={canvasRef}
      width={window.innerWidth}
      height={window.innerHeight}
      className="block touch-none cursor-crosshair"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onTouchStart={handleMouseDown}
      onTouchMove={handleMouseMove}
      onTouchEnd={handleMouseUp}
      onClick={handleClick}
      onWheel={handleWheel}
    />
  );
};
