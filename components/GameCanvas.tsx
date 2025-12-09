import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
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
  if (!color) return '#000000';
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
  if (!hex) return 'rgba(0,0,0,0)';
  if (hex.startsWith('#')) {
    let r = parseInt(hex.substring(1, 3), 16);
    let g = parseInt(hex.substring(3, 5), 16);
    let b = parseInt(hex.substring(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  return hex;
}

const GameCanvasComponent: React.FC<GameCanvasProps> = ({
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
  const terrainCanvasRef = useRef<HTMLCanvasElement | null>(null); // Buffer for static terrain

  const [camera, setCamera] = useState<Camera>({
    x: (engine.config.mapWidth * TILE_SIZE) / 2,
    y: (engine.config.mapHeight * TILE_SIZE) / 2,
    zoom: 1
  });

  const isDragging = useRef(false);
  const lastMousePos = useRef<Coordinates>({ x: 0, y: 0 });

  // --- 1. TERRAIN CACHING ---
  // We draw the terrain once to an offscreen canvas and reuse it.
  useEffect(() => {
    if (!engine.tiles || engine.tiles.length === 0) return;

    // Create buffer if needed
    if (!terrainCanvasRef.current) {
      terrainCanvasRef.current = document.createElement('canvas');
      terrainCanvasRef.current.width = engine.config.mapWidth * TILE_SIZE;
      terrainCanvasRef.current.height = engine.config.mapHeight * TILE_SIZE;
    }

    const tCtx = terrainCanvasRef.current.getContext('2d');
    if (!tCtx) return;

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

    // Draw ALL tiles to buffer
    const width = engine.config.mapWidth;
    const height = engine.config.mapHeight;

    // Resize canvas if dimensions change
    if (terrainCanvasRef.current) {
      if (terrainCanvasRef.current.width !== width * TILE_SIZE || terrainCanvasRef.current.height !== height * TILE_SIZE) {
        terrainCanvasRef.current.width = width * TILE_SIZE;
        terrainCanvasRef.current.height = height * TILE_SIZE;
      }
    }

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        // Safe check
        if (!engine.tiles[y] || !engine.tiles[y][x]) continue;

        const tile = engine.tiles[y][x];
        const px = x * TILE_SIZE;
        const py = y * TILE_SIZE;

        if (tile.type === 'LAND') {
          tCtx.fillStyle = getTerrainColor(tile.elevation);
          // Bleed to avoid gaps
          tCtx.fillRect(px, py, TILE_SIZE + 1, TILE_SIZE + 1);
        } else {
          tCtx.fillStyle = '#3b82f6';
          tCtx.fillRect(px, py, TILE_SIZE + 1, TILE_SIZE + 1);
        }
      }
    }
  }, [engine.tiles, engine.config.mapWidth, engine.config.mapHeight]); // Only rebuild if tiles array reference changes (new map)

  const ownershipCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const lastTickRef = useRef<number>(-1);

  // --- 1.5 OWNERSHIP CACHING ---
  // Rebuild only when game tick advances (10fps max)
  useEffect(() => {
    if (!engine.tiles || engine.tiles.length === 0) return;

    // Only update if tick changed
    if (engine.tickCount === lastTickRef.current) return;
    lastTickRef.current = engine.tickCount;

    if (!ownershipCanvasRef.current) {
      ownershipCanvasRef.current = document.createElement('canvas');
      ownershipCanvasRef.current.width = engine.config.mapWidth * TILE_SIZE;
      ownershipCanvasRef.current.height = engine.config.mapHeight * TILE_SIZE;
    }

    const oCtx = ownershipCanvasRef.current.getContext('2d');
    if (!oCtx) return;

    // CLEAR
    oCtx.clearRect(0, 0, ownershipCanvasRef.current.width, ownershipCanvasRef.current.height);

    const BORDER_WIDTH = 0.5;

    // Optimization: Loop through owned tiles of each player instead of full map?
    // Engine doesn't easily expose "list of all owned tiles" efficiently across all players without iterating players.
    // engine.players has ownedTiles.

    engine.players.forEach(p => {
      if (p.ownedTiles.length === 0) return;

      const color = p.color;
      const borderColor = darkenColor(color, 0.4);
      const rgba = hexToRgba(color, 0.3);

      p.ownedTiles.forEach(tile => {
        const px = tile.x * TILE_SIZE;
        const py = tile.y * TILE_SIZE;

        // Fill
        oCtx.fillStyle = rgba;
        oCtx.fillRect(px, py, TILE_SIZE, TILE_SIZE);

        // Borders
        oCtx.fillStyle = borderColor;

        // Check neighbors (using engine grid)
        const checkNeighbor = (dx: number, dy: number) => {
          const nx = tile.x + dx;
          const ny = tile.y + dy;
          // Edges are borders
          if (nx < 0 || ny < 0 || nx >= engine.config.mapWidth || ny >= engine.config.mapHeight) return true;
          const neighbor = engine.tiles[ny][nx];
          return neighbor.ownerId !== tile.ownerId;
        };

        if (checkNeighbor(0, -1)) oCtx.fillRect(px, py, TILE_SIZE, BORDER_WIDTH); // Top
        if (checkNeighbor(0, 1)) oCtx.fillRect(px, py + TILE_SIZE - BORDER_WIDTH, TILE_SIZE, BORDER_WIDTH); // Bottom
        if (checkNeighbor(-1, 0)) oCtx.fillRect(px, py, BORDER_WIDTH, TILE_SIZE); // Left
        if (checkNeighbor(1, 0)) oCtx.fillRect(px + TILE_SIZE - BORDER_WIDTH, py, BORDER_WIDTH, TILE_SIZE); // Right
      });
    });

  }, [engine.tickCount, engine.players, engine.tiles]); // Re-run on tick or player updates


  const drawBuilding = (ctx: CanvasRenderingContext2D, type: BuildingType, x: number, y: number, size: number, color: string) => {
    ctx.save();
    ctx.fillStyle = color;
    const p = (pct: number) => pct * size;

    switch (type) {
      case BuildingType.KINGDOM:
        const kX = x;
        const kY = y;
        const kSize = size;
        ctx.fillStyle = '#4a5568'; // Dark stone
        ctx.fillRect(kX, kY, kSize, kSize);
        ctx.fillStyle = '#2d3748';
        ctx.fillRect(kX + p(0.1), kY + p(0.1), p(0.8), p(0.8));
        ctx.fillStyle = color;
        ctx.fillRect(kX + p(0.25), kY + p(0.25), p(0.5), p(0.5));
        ctx.fillStyle = '#718096';
        ctx.fillRect(kX, kY, p(0.2), p(0.2));
        ctx.fillRect(kX + p(0.8), kY, p(0.2), p(0.2));
        ctx.fillRect(kX, kY + p(0.8), p(0.2), p(0.2));
        ctx.fillRect(kX + p(0.8), kY + p(0.8), p(0.2), p(0.2));
        break;

      case BuildingType.CASTLE:
        ctx.fillRect(x + p(0.15), y + p(0.3), p(0.7), p(0.6));
        ctx.fillRect(x + p(0.1), y + p(0.1), p(0.2), p(0.4));
        ctx.fillRect(x + p(0.7), y + p(0.1), p(0.2), p(0.4));
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.fillRect(x + p(0.4), y + p(0.6), p(0.2), p(0.3));
        break;

      case BuildingType.TOWN:
        ctx.fillRect(x + p(0.1), y + p(0.5), p(0.3), p(0.4));
        ctx.beginPath();
        ctx.moveTo(x + p(0.1), y + p(0.5));
        ctx.lineTo(x + p(0.25), y + p(0.3));
        ctx.lineTo(x + p(0.4), y + p(0.5));
        ctx.fill();
        ctx.fillRect(x + p(0.5), y + p(0.4), p(0.4), p(0.5));
        ctx.beginPath();
        ctx.moveTo(x + p(0.5), y + p(0.4));
        ctx.lineTo(x + p(0.7), y + p(0.2));
        ctx.lineTo(x + p(0.9), y + p(0.4));
        ctx.fill();
        break;

      case BuildingType.MARKET:
        ctx.fillRect(x + p(0.15), y + p(0.4), p(0.7), p(0.5));
        ctx.beginPath();
        ctx.moveTo(x + p(0.15), y + p(0.4));
        ctx.lineTo(x + p(0.5), y + p(0.1));
        ctx.lineTo(x + p(0.85), y + p(0.4));
        ctx.fill();
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.fillRect(x + p(0.3), y + p(0.6), p(0.4), p(0.3));
        break;

      case BuildingType.FARM:
        ctx.strokeStyle = color;
        ctx.lineWidth = size * 0.1;
        for (let i = 1; i <= 3; i++) {
          ctx.beginPath();
          ctx.moveTo(x + p(0.2 * i + 0.1), y + p(0.8));
          ctx.lineTo(x + p(0.2 * i + 0.1), y + p(0.2));
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(x + p(0.2 * i + 0.1), y + p(0.3), p(0.1), 0, Math.PI * 2);
          ctx.fill();
        }
        break;

      case BuildingType.WOODCUTTER:
        ctx.fillStyle = '#5d4037';
        ctx.fillRect(x + p(0.4), y + p(0.6), p(0.2), p(0.3));
        ctx.beginPath();
        ctx.moveTo(x + p(0.1), y + p(0.6));
        ctx.lineTo(x + p(0.5), y + p(0.1));
        ctx.lineTo(x + p(0.9), y + p(0.6));
        ctx.fill();
        break;

      case BuildingType.MINE:
        ctx.beginPath();
        ctx.arc(x + p(0.5), y + p(0.8), p(0.4), Math.PI, 0);
        ctx.fill();
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.beginPath();
        ctx.arc(x + p(0.5), y + p(0.8), p(0.15), Math.PI, 0);
        ctx.fill();
        break;

      case BuildingType.BARRACKS:
        ctx.fillRect(x + p(0.1), y + p(0.2), p(0.8), p(0.7));
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
        ctx.fillRect(x + p(0.2), y + p(0.3), p(0.6), p(0.6));
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
    if (!engine.tiles || engine.tiles.length === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Background
    ctx.fillStyle = '#1e3a8a';
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

    // OPTIMIZATION: Create Player Map for O(1) lookup
    const playerMap = new Map<string, any>();
    engine.players.forEach(p => playerMap.set(p.id, p));

    // PASS 1: STATIC TERRAIN FROM CACHE (FAST)
    if (terrainCanvasRef.current) {
      ctx.drawImage(
        terrainCanvasRef.current,
        0, 0, engine.config.mapWidth * TILE_SIZE, engine.config.mapHeight * TILE_SIZE,
        0, 0, engine.config.mapWidth * TILE_SIZE, engine.config.mapHeight * TILE_SIZE
      );
    }

    // PASS 2: DYNAMIC OVERLAYS (Ownership, Borders) - CACHED
    // We cache this because calculating borders for 65k tiles is expensive.
    // We only redraw if cachedOwnershipRef is dirty (controlled below).
    if (ownershipCanvasRef.current) {
      ctx.drawImage(
        ownershipCanvasRef.current,
        0, 0, engine.config.mapWidth * TILE_SIZE, engine.config.mapHeight * TILE_SIZE,
        0, 0, engine.config.mapWidth * TILE_SIZE, engine.config.mapHeight * TILE_SIZE
      );
    }

    // Iterate visibly for BUILDINGS ONLY now
    const DRAW_SIZE = TILE_SIZE * 2.5;

    for (let y = Math.max(0, startRow); y < Math.min(engine.config.mapHeight, endRow + 2); y++) {
      if (!engine.tiles[y]) continue;

      for (let x = Math.max(0, startCol); x < Math.min(engine.config.mapWidth, endCol + 2); x++) {
        const tile = engine.tiles[y][x];
        if (!tile) continue;

        // Buildings
        if (tile.building) {
          const px = x * TILE_SIZE;
          const py = y * TILE_SIZE;
          const owner = playerMap.get(tile.building.ownerId);
          const color = owner ? owner.color : '#555';

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
    }

    // PASS 3: UNITS & ATTACKS

    // 3A. ATTACKS (Visual Projectiles) - REMOVED per user request
    // if (engine.attacks) { ... }

    // 3B. UNITS
    // Units are sparse compared to tiles, so iteration over player units is O(U) vs O(Map)
    if (engine.players) {
      engine.players.forEach(p => {
        p.units.forEach(u => {
          // Optimization: Frustum Cull
          if (u.x < startCol - 2 || u.x > endCol + 2 || u.y < startRow - 2 || u.y > endRow + 2) return;

          const screenX = u.x * TILE_SIZE + TILE_SIZE / 2;
          const screenY = u.y * TILE_SIZE + TILE_SIZE / 2;

          // Draw Unit Tail/Trail - REMOVED per user request

          ctx.beginPath();
          ctx.arc(screenX, screenY, 2.5, 0, Math.PI * 2);
          ctx.fillStyle = p.color;
          ctx.fill();
          ctx.strokeStyle = 'white';
          ctx.lineWidth = 0.5;
          ctx.stroke();

          // Health bar
          const hpPct = u.hp / u.maxHp;
          if (hpPct < 1) {
            ctx.fillStyle = 'red';
            ctx.fillRect(screenX - 2, screenY - 5, 4, 1);
            ctx.fillStyle = '#22c55e';
            ctx.fillRect(screenX - 2, screenY - 5, 4 * hpPct, 1);
          }

          if (u.id === selectedUnitId) {
            ctx.beginPath();
            ctx.arc(screenX, screenY, 5, 0, Math.PI * 2);
            ctx.strokeStyle = '#ffff00';
            ctx.lineWidth = 1;
            ctx.stroke();
          }
        });
      });
    }

    // Pass 4: Player Labels
    if (engine.players) {
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      engine.players.forEach(p => {
        if (p.landArea > 5) {
          // Frustum Cull Labels too
          const cx = p.center.x * TILE_SIZE;
          const cy = p.center.y * TILE_SIZE;

          // Check world coords vs camera bounds
          // Simplification: if center is visible
          if (p.center.x < startCol || p.center.x > endCol || p.center.y < startRow || p.center.y > endRow) return;

          // Dynamic sizing based on land area
          const fontSize = Math.max(2, Math.min(20, Math.sqrt(p.landArea) * 0.4));
          ctx.font = `bold ${fontSize}px sans-serif`;

          ctx.fillStyle = 'rgba(0,0,0,0.5)';
          ctx.fillText(p.name, cx + 0.5, cy + 0.5);

          ctx.fillStyle = 'white';
          ctx.fillText(p.name, cx, cy);

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

          ctx.font = `${fontSize * 0.7}px monospace`;
          ctx.fillStyle = '#eab308';
          ctx.fillText(`${Math.floor(p.population)}`, cx, cy + fontSize * 1.1);
        }
      });
    }

    // Ghost Building
    if (selectedBuildingType) {
      const mouseX = lastMousePos.current.x;
      const mouseY = lastMousePos.current.y;

      const worldXAdjusted = (mouseX - centerX) / camera.zoom + camera.x;
      const worldYAdjusted = (mouseY - centerY) / camera.zoom + camera.y;

      const tileX = Math.floor(worldXAdjusted / TILE_SIZE);
      const tileY = Math.floor(worldYAdjusted / TILE_SIZE);

      const canBuild = engine.canBuild(playerId, selectedBuildingType as BuildingType, tileX, tileY);
      const player = engine.players.find(p => p.id === playerId);
      const color = canBuild && player ? player.color : '#ef4444';

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
      ctx.strokeRect(px, py, TILE_SIZE, TILE_SIZE);
    }

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

    if (selectedBuildingType) {
      onPlaceBuilding(tileX, tileY);
      return;
    }

    if (selectedSpawnUnitType) {
      onSpawnUnitAt(tileX, tileY);
      return;
    }

    const player = engine.players.find(p => p.id === playerId);
    if (player) {
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

export const GameCanvas = React.memo(GameCanvasComponent);
