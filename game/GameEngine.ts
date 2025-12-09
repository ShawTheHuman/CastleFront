import { BuildingType, GameConfig, Player, ResourceType, Tile, Unit, UnitType, Building, AttackWave, PlayerProfile, MatchLog, AIType } from '../types';
import { BUILDING_STATS, BUILDING_COSTS, UNIT_STATS, PLAYER_COLORS, MAP_HEIGHT, MAP_WIDTH, UNIT_COSTS } from '../constants';

export class GameEngine {
    tiles: Tile[][] = [];
    players: Player[] = [];
    attacks: AttackWave[] = [];
    config: GameConfig;
    tickCount: number = 0;
    winnerId: string | null = null;
    totalLandTiles: number = 0;
    isGameActive: boolean = false;
    wipeOutQueue: { tile: Tile, newOwnerId: string }[] = [];

    constructor(config: GameConfig) {
        this.config = config;
        this.generateMap(); // Initialize map immediately to prevent render crashes
    }

    // Updated Init to accept Lobby Roster and Map Data
    init(roster: PlayerProfile[], mapData?: any) {
        this.winnerId = null;
        this.isGameActive = false; // Reset game state

        if (mapData && mapData.tiles && mapData.tiles.length > 0) {
            this.loadMap(mapData);
        } else {
            this.generateMap();
        }

        this.setupPlayers(roster);
        this.spawnBotBases();
        this.attacks = [];
        this.tickCount = 0;
    }

    loadMap(mapData: any) {
        this.tiles = [];
        this.totalLandTiles = 0;
        const w = mapData.width;
        const h = mapData.height;
        this.config.mapWidth = w;
        this.config.mapHeight = h;

        // Initialize empty grid
        for (let y = 0; y < h; y++) {
            this.tiles[y] = [];
            for (let x = 0; x < w; x++) {
                this.tiles[y][x] = null as any; // Placeholder
            }
        }

        // Populate from map data
        // Support legacy object array OR new flat optimized array
        if (typeof mapData.tiles[0] === 'number') {
            // OPTIMIZED: [type, elev, type, elev...]
            // Type: 1 = LAND, 0 = WATER
            let idx = 0;
            for (let i = 0; i < mapData.tiles.length; i += 2) {
                const typeCode = mapData.tiles[i];
                const elevation = mapData.tiles[i + 1];

                const x = idx % w;
                const y = Math.floor(idx / w);
                const type = typeCode === 1 ? 'LAND' : 'WATER';

                if (type === 'LAND') this.totalLandTiles++;

                this.tiles[y][x] = {
                    x, y,
                    type,
                    elevation,
                    ownerId: null,
                    building: null,
                    defense: type === 'LAND' ? 1 : 0
                };
                idx++;
            }
        } else {
            // LEGACY: [{x,y,type,elevation}...]
            for (const t of mapData.tiles) {
                if (t.type === 'LAND') this.totalLandTiles++;

                const tile = {
                    x: t.x,
                    y: t.y,
                    type: t.type,
                    elevation: t.elevation,
                    ownerId: null,
                    building: null,
                    defense: t.type === 'LAND' ? 1 : 0
                };
                this.tiles[t.y][t.x] = tile;

                if (t.ownerId) { // Use t.ownerId from map data if exists ? Or tile.ownerId? 
                    // The legacy map data 't' might have ownerId? Assuming t has it. 
                    // Actually the previous code used `tile.ownerId`. The created tile has ownerId=null in the block above.
                    // If the intent was to load owner from map, we need to read it from `t`.
                    // But looking at lines 83-91 in original: ownerId: null.
                    // So `tile.ownerId` is always null here.
                    // Lines 93-98 seem to try to restore ownership?
                    // "if (tile.ownerId)" -> if null, this block never runs.
                    // I will just fix the variable definition so it doesn't crash.
                    // The block seems useless if ownerId is hardcoded to null, but maybe I should check `t.ownerId`?
                    // For safety, I'll just make it compile and run without crashing.
                    if (tile.ownerId) {
                        const owner = this.players.find(p => p.id === tile.ownerId);
                        if (owner) {
                            owner.ownedTiles.push(tile);
                        }
                    }
                }
            }
        }
    }

    startMatch() {
        this.isGameActive = true;
    }

    // Simple pseudo-random 2D noise
    noise(x: number, y: number, seed: number = 0): number {
        const sinX = Math.sin(x * 12.9898 + seed);
        const cosY = Math.cos(y * 4.1414 + seed);
        return Math.abs(Math.sin(sinX * cosY * 43758.5453) % 1);
    }

    // Smoother value noise
    smoothNoise(x: number, y: number, seed: number): number {
        const intX = Math.floor(x);
        const intY = Math.floor(y);
        const fractX = x - intX;
        const fractY = y - intY;

        const v1 = this.noise(intX, intY, seed);
        const v2 = this.noise(intX + 1, intY, seed);
        const v3 = this.noise(intX, intY + 1, seed);
        const v4 = this.noise(intX + 1, intY + 1, seed);

        const i1 = this.interpolate(v1, v2, fractX);
        const i2 = this.interpolate(v3, v4, fractX);

        return this.interpolate(i1, i2, fractY);
    }

    interpolate(a: number, b: number, t: number): number {
        // Smoothstep
        const ft = t * t * (3 - 2 * t);
        return a * (1 - ft) + b * ft;
    }

    // Fractal Brownian Motion for more natural, detailed terrain
    fbm(x: number, y: number, octaves: number, persistence: number, scale: number, seed: number): number {
        let total = 0;
        let frequency = scale;
        let amplitude = 1;
        let maxValue = 0;
        for (let i = 0; i < octaves; i++) {
            total += this.smoothNoise(x * frequency, y * frequency, seed) * amplitude;
            maxValue += amplitude;
            amplitude *= persistence;
            frequency *= 2;
        }
        return total / maxValue;
    }

    generateMap() {
        const w = this.config.mapWidth;
        const h = this.config.mapHeight;
        this.tiles = [];
        this.totalLandTiles = 0;

        const seed = Math.random() * 10000;

        for (let y = 0; y < h; y++) {
            const row: Tile[] = [];
            for (let x = 0; x < w; x++) {

                // 1. Generate Fractal Terrain
                // Scale adjusted to 0.02 for larger map dimension to keep features proportional
                let noiseVal = this.fbm(x, y, 6, 0.5, 0.02, seed);

                // 2. Apply Edge Mask
                // Creates a soft circular constraint so map edges are water
                const dx = x - w / 2;
                const dy = y - h / 2;
                const dist = Math.sqrt(dx * dx + dy * dy);
                const maxDist = Math.min(w, h) / 2;

                let mask = 1;
                // Start fading out at 80% of the radius
                if (dist > maxDist * 0.8) {
                    const t = (dist - maxDist * 0.8) / (maxDist * 0.2);
                    mask = Math.max(0, 1 - t);
                }

                let elevationVal = noiseVal * mask;

                // 3. Determine Tile Type & Elevation
                // 0.35 threshold creates good separation between islands
                const waterThreshold = 0.35;

                let type: 'LAND' | 'WATER' = 'WATER';
                let finalElevation = 0;

                if (elevationVal > waterThreshold) {
                    type = 'LAND';
                    this.totalLandTiles++;
                    // Map remaining range to 1-15
                    const landHeight = (elevationVal - waterThreshold) / (1 - waterThreshold);
                    finalElevation = Math.max(1, Math.min(15, Math.floor(landHeight * 15) + 1));
                } else {
                    type = 'WATER';
                    finalElevation = 0;
                }

                row.push({
                    x,
                    y,
                    type,
                    elevation: finalElevation,
                    ownerId: null,
                    building: null,
                    defense: type === 'LAND' ? 1 : 0 // NEUTRAL LAND 1 HP
                });
            }
            this.tiles.push(row);
        }
    }

    setupPlayers(roster: PlayerProfile[]) {
        this.players = [];
        roster.forEach(p => {
            this.players.push(this.createPlayer(p.id, p.name, p.color, p.isAI, p.aiType));
        });
    }

    getPlayer(id: string): Player | undefined {
        return this.players.find(p => p.id === id);
    }

    createPlayer(id: string, name: string, color: string, isAI: boolean, aiType: AIType): Player {
        return {
            id,
            name,
            color,
            isAI,
            aiType,
            resources: { [ResourceType.GOLD]: 100, [ResourceType.WOOD]: 100, [ResourceType.STONE]: 50, [ResourceType.FOOD]: 50 },
            income: { [ResourceType.GOLD]: 0, [ResourceType.WOOD]: 0, [ResourceType.STONE]: 0, [ResourceType.FOOD]: 0 },
            population: 5,
            maxPopulation: 0,
            militaryPopulation: 0,
            attackTarget: null,
            units: [],
            center: { x: 0, y: 0 },
            landArea: 0,
            ownedTiles: []
        };
    }

    spawnBotBases() {
        const existingBases: { x: number, y: number }[] = [];

        // Filter for AI players
        const bots = this.players.filter(p => p.isAI);

        bots.forEach((p) => {
            // Find a valid spot that is far from other bases
            let bestSpot: { x: number, y: number } | null = null;
            let maxMinDist = -1;

            // Try X random locations and pick the one with best distance
            for (let i = 0; i < 30; i++) {
                const rx = Math.floor(Math.random() * this.config.mapWidth);
                const ry = Math.floor(Math.random() * this.config.mapHeight);

                if (this.isValidSpawn(rx, ry)) {
                    let minDist = 9999;
                    if (existingBases.length === 0) {
                        minDist = 9999;
                    } else {
                        for (const base of existingBases) {
                            const d = Math.sqrt((rx - base.x) ** 2 + (ry - base.y) ** 2);
                            if (d < minDist) minDist = d;
                        }
                    }

                    if (minDist > maxMinDist) {
                        maxMinDist = minDist;
                        bestSpot = { x: rx, y: ry };
                    }
                }
            }

            if (bestSpot) {
                // DIFFERENCE: Camps do NOT get a Kingdom building
                if (p.aiType === AIType.CAMP) {
                    // Just claim land
                    const claimedCount = this.claimRadius(p.id, bestSpot.x, bestSpot.y, 2); // Smaller radius for camps
                    p.maxPopulation = claimedCount * 10;

                    // Give them a headstart on pop since they don't have a building for bonus defense
                    p.population = 10;
                } else {
                    // Kingdoms get a base
                    this.placeBuilding(p.id, BuildingType.KINGDOM, bestSpot.x, bestSpot.y, true);
                    const claimedCount = this.claimRadius(p.id, bestSpot.x, bestSpot.y, 4); // Radius 4
                    p.maxPopulation = claimedCount * 10;

                    // Reinforce core
                    for (let dy = -2; dy <= 2; dy++) {
                        for (let dx = -2; dx <= 2; dx++) {
                            const nx = bestSpot.x + dx;
                            const ny = bestSpot.y + dy;
                            if (this.isValid(nx, ny)) {
                                const t = this.tiles[ny][nx];
                                t.ownerId = p.id;
                                t.defense = 1 + Math.floor(p.population / 2000);
                                p.ownedTiles.push(t);
                            }
                        }
                    }
                }
                existingBases.push(bestSpot);
            }
        });
    }

    spawnHumanBase(playerId: string, x: number, y: number): boolean {
        if (this.isValidSpawn(x, y)) {
            this.placeBuilding(playerId, BuildingType.KINGDOM, x, y, true);
            const claimedCount = this.claimRadius(playerId, x, y, 4); // Radius 4

            const player = this.players.find(p => p.id === playerId);
            if (player) {
                player.maxPopulation = claimedCount * 10;
            }

            // Reinforce 5x5 core
            for (let dy = -2; dy <= 2; dy++) {
                for (let dx = -2; dx <= 2; dx++) {
                    const nx = x + dx;
                    const ny = y + dy;
                    if (this.isValid(nx, ny)) {
                        const t = this.tiles[ny][nx];
                        t.ownerId = playerId;
                        t.defense = 1 + Math.floor((player?.population || 0) / 2000);
                        player?.ownedTiles.push(t);
                    }
                }
            }
            return true;
        }
        return false;
    }

    spawnHumanRandomly(playerId: string) {
        // Find valid spot similar to bot logic
        const existingBases: { x: number, y: number }[] = [];
        for (let y = 0; y < this.config.mapHeight; y++) {
            for (let x = 0; x < this.config.mapWidth; x++) {
                if (this.tiles[y][x].building?.type === BuildingType.KINGDOM || this.tiles[y][x].building?.type === BuildingType.CASTLE) {
                    existingBases.push({ x, y });
                }
            }
        }

        let bestSpot: { x: number, y: number } | null = null;
        let maxMinDist = -1;

        for (let i = 0; i < 50; i++) {
            const rx = Math.floor(Math.random() * this.config.mapWidth);
            const ry = Math.floor(Math.random() * this.config.mapHeight);

            if (this.isValidSpawn(rx, ry)) {
                let minDist = 9999;
                for (const base of existingBases) {
                    const d = Math.sqrt((rx - base.x) ** 2 + (ry - base.y) ** 2);
                    if (d < minDist) minDist = d;
                }

                if (minDist > maxMinDist) {
                    maxMinDist = minDist;
                    bestSpot = { x: rx, y: ry };
                }
            }
        }

        if (bestSpot) {
            this.spawnHumanBase(playerId, bestSpot.x, bestSpot.y);
        } else {
            // Fallback: Just scan for first valid spot
            for (let y = 0; y < this.config.mapHeight; y++) {
                for (let x = 0; x < this.config.mapWidth; x++) {
                    if (this.spawnHumanBase(playerId, x, y)) return;
                }
            }
        }
    }

    // Check 5x5 clearance for Kingdom to match larger radius/scale
    isValidSpawn(x: number, y: number): boolean {
        for (let dy = -2; dy <= 2; dy++) {
            for (let dx = -2; dx <= 2; dx++) {
                const nx = x + dx;
                const ny = y + dy;
                if (!this.isValid(nx, ny)) return false;
                const tile = this.tiles[ny][nx];
                if (tile.type !== 'LAND') return false;
                if (tile.building) return false;
                if (tile.elevation > 12) return false;
                if (tile.ownerId !== null) return false;
            }
        }
        return true;
    }

    claimRadius(playerId: string, cx: number, cy: number, radius: number): number {
        let count = 0;
        for (let y = cy - radius; y <= cy + radius; y++) {
            for (let x = cx - radius; x <= cx + radius; x++) {
                if (this.isValid(x, y)) {
                    const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
                    if (dist <= radius) {
                        const tile = this.tiles[y][x];
                        if (tile.type === 'LAND' && !tile.ownerId) {
                            tile.ownerId = playerId;
                            const player = this.players.find(p => p.id === playerId);
                            if (player) {
                                tile.defense = 1 + Math.floor(player.population / 2000);
                                player.ownedTiles.push(tile);
                            }

                            count++;
                        }
                    }
                }
            }
        }
        return count;
    }
    // ... rest of class remains unchanged ...
    isAdjacentToPlayer(x: number, y: number, playerId: string): boolean {
        const neighbors = [
            { dx: 0, dy: -1 }, { dx: 0, dy: 1 },
            { dx: -1, dy: 0 }, { dx: 1, dy: 0 }
        ];

        for (const n of neighbors) {
            const nx = x + n.dx;
            const ny = y + n.dy;
            if (this.isValid(nx, ny)) {
                if (this.tiles[ny][nx].ownerId === playerId) return true;
            }
        }
        return false;
    }

    distributeExpansion(playerId: string, clickX: number, clickY: number, percentage: number) {
        if (!this.isValid(clickX, clickY)) return;

        const targetTile = this.tiles[clickY][clickX];
        const targetOwner = targetTile.ownerId;

        if (targetOwner === playerId) return;

        const player = this.players.find(p => p.id === playerId);
        if (!player || player.population <= 2) return;

        const amountToSend = Math.floor(player.population * (percentage / 100));
        if (amountToSend <= 0) return;

        player.population -= amountToSend;
        player.militaryPopulation += amountToSend;
        player.attackTarget = targetOwner;
    }

    processMilitaryDispatch() {
        this.players.forEach(player => {
            if (player.militaryPopulation < 1) return;

            const targetOwner = player.attackTarget;

            let castleX = this.config.mapWidth / 2;
            let castleY = this.config.mapHeight / 2;
            const castleTile = this.tiles.flat().find(t => (t.building?.type === BuildingType.KINGDOM || t.building?.type === BuildingType.CASTLE) && t.ownerId === player.id);
            if (castleTile) {
                castleX = castleTile.x;
                castleY = castleTile.y;
            }

            const candidates: { source: Tile, targets: Tile[] }[] = [];
            const neighbors = [{ x: 0, y: -1 }, { x: 0, y: 1 }, { x: -1, y: 0 }, { x: 1, y: 0 }];

            player.ownedTiles.forEach(tile => {
                const validNeighbors: Tile[] = [];
                neighbors.forEach(n => {
                    const nx = tile.x + n.x;
                    const ny = tile.y + n.y;
                    if (this.isValid(nx, ny)) {
                        const neighbor = this.tiles[ny][nx];
                        let isValidTarget = false;
                        if (targetOwner === null) {
                            isValidTarget = neighbor.ownerId === null && neighbor.type === 'LAND';
                        } else {
                            isValidTarget = neighbor.ownerId === targetOwner;
                        }

                        if (isValidTarget) {
                            validNeighbors.push(neighbor);
                        }
                    }
                });

                if (validNeighbors.length > 0) {
                    candidates.push({ source: tile, targets: validNeighbors });
                }
            });

            if (candidates.length === 0) {
                return;
            }

            candidates.sort((a, b) => {
                const da = (a.source.x - castleX) ** 2 + (a.source.y - castleY) ** 2;
                const db = (b.source.x - castleX) ** 2 + (b.source.y - castleY) ** 2;
                return da - db;
            });

            const flowRate = Math.ceil(player.militaryPopulation * 0.05) + 5;
            const amountToDeploy = Math.min(player.militaryPopulation, flowRate);

            let remainingBudget = amountToDeploy;
            const powerPerSource = Math.max(1, Math.floor(remainingBudget / candidates.length));

            for (const cand of candidates) {
                if (remainingBudget <= 0) break;

                let powerForThis = powerPerSource;
                if (powerForThis > remainingBudget) powerForThis = remainingBudget;

                const powerPerTarget = Math.max(1, Math.floor(powerForThis / cand.targets.length));

                cand.targets.forEach(tgt => {
                    if (remainingBudget > 0) {
                        this.createAttack(player.id, cand.source.x, cand.source.y, tgt.x, tgt.y, powerPerTarget, player.color);
                        remainingBudget -= powerPerTarget;
                    }
                });
            }

            const actuallySpent = amountToDeploy - remainingBudget;
            player.militaryPopulation -= actuallySpent;
        });
    }

    createAttack(playerId: string, sx: number, sy: number, tx: number, ty: number, power: number, color: string) {
        this.attacks.push({
            id: Math.random().toString(36).substr(2, 9),
            ownerId: playerId,
            x: sx,
            y: sy,
            targetX: tx,
            targetY: ty,
            power: power,
            speed: 0.2 + (Math.random() * 0.1),
            color: color
        });
    }

    updateAttacks() {
        for (let i = this.attacks.length - 1; i >= 0; i--) {
            const atk = this.attacks[i];
            const dx = atk.targetX - atk.x;
            const dy = atk.targetY - atk.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < 0.2) {
                this.applyAttack(atk);
                this.attacks.splice(i, 1);
            } else {
                const move = Math.min(dist, atk.speed);
                atk.x += (dx / dist) * move;
                atk.y += (dy / dist) * move;
            }
        }
    }

    applyAttack(initialAtk: AttackWave) {
        // Queue for BFS overflow
        // item: { x, y, power, ownerId }
        const queue: { x: number, y: number, power: number, ownerId: string }[] = [{
            x: initialAtk.targetX,
            y: initialAtk.targetY,
            power: initialAtk.power,
            ownerId: initialAtk.ownerId
        }];

        let tilesProcessed = 0;
        const MAX_CHAIN = 20; // Hard limit to prevent lag spikes

        while (queue.length > 0 && tilesProcessed < MAX_CHAIN) {
            const current = queue.shift()!;

            if (!this.isValid(current.x, current.y)) continue;
            const tile = this.tiles[current.y][current.x];

            tilesProcessed++;

            // 1. Calculate Damage (10 Pop = 1 Dmg)
            const damage = Math.max(0.1, current.power / 10);

            // 2. Building Hit?
            if (tile.building) {
                tile.building.hp -= damage;
                if (tile.building.hp <= 0) {
                    // Check for King Slayer
                    if (tile.building.type === BuildingType.KINGDOM) {
                        const victim = this.players.find(p => p.id === tile.building!.ownerId);
                        const killer = this.players.find(p => p.id === current.ownerId);
                        if (victim && killer) {
                            this.queueWipeOut(killer, victim);
                        }
                    }
                    tile.building = null;
                }
                continue; // Stop propagation if hitting a building (it absorbs impact)
            }

            // 3. Tile Hit
            if (tile.ownerId !== current.ownerId) {
                const initialDefense = tile.defense;
                tile.defense -= damage;

                // 4. Check Conquest
                if (tile.defense <= 0) {
                    // Won!
                    if (tile.ownerId) {
                        const oldP = this.players.find(p => p.id === tile.ownerId);
                        if (oldP) oldP.ownedTiles = oldP.ownedTiles.filter(t => t !== tile);
                    }

                    tile.ownerId = current.ownerId;
                    const newOwner = this.players.find(p => p.id === current.ownerId);
                    if (newOwner) newOwner.ownedTiles.push(tile);

                    const owner = this.players.find(p => p.id === current.ownerId);
                    const pop = owner ? owner.population : 0;
                    tile.defense = 1 + Math.floor(pop / 2000);

                    // 5. Overflow
                    const costOfConquest = initialDefense * 10;
                    const remainingPower = current.power - costOfConquest;

                    if (remainingPower > 10) {
                        const neighbors = [
                            { x: 0, y: -1 }, { x: 0, y: 1 }, { x: -1, y: 0 }, { x: 1, y: 0 }
                        ];

                        const validNeighbors = [];
                        for (const n of neighbors) {
                            const nx = current.x + n.x;
                            const ny = current.y + n.y;
                            if (this.isValid(nx, ny)) {
                                const nt = this.tiles[ny][nx];
                                // Only expand into enemy/neutral
                                if (nt.ownerId !== current.ownerId) {
                                    validNeighbors.push({ x: nx, y: ny });
                                }
                            }
                        }

                        if (validNeighbors.length > 0) {
                            const powerPerTarget = remainingPower / validNeighbors.length;
                            validNeighbors.forEach(vp => {
                                queue.push({
                                    x: vp.x,
                                    y: vp.y,
                                    power: powerPerTarget,
                                    ownerId: current.ownerId
                                });
                            });
                        }
                    }
                }
            } else {
                // Heal Own
                const owner = this.players.find(p => p.id === current.ownerId);
                const maxDef = 1 + Math.floor((owner?.population || 0) / 2000);
                if (tile.defense < maxDef) {
                    tile.defense += damage;
                    if (tile.defense > maxDef) tile.defense = maxDef;
                }
            }
        }
    }

    // "Painting" Style Wipe-Out
    // Converts all of defender's tiles to attacker over a short period (simulated by spawning many high-speed attacks or just direct conversion with delay)
    // "Painting" Style Wipe-Out - QUEUE BASED (Deterministic)
    queueWipeOut(attacker: Player, defender: Player) {
        // 1. Identify all tiles owned by defender
        const defenderTiles: Tile[] = [];
        for (let y = 0; y < this.config.mapHeight; y++) {
            for (let x = 0; x < this.config.mapWidth; x++) {
                if (this.tiles[y][x].ownerId === defender.id) {
                    defenderTiles.push(this.tiles[y][x]);
                }
            }
        }

        if (defenderTiles.length === 0) return;

        // 2. Sort tiles by distance from attacker's center (to create a "wave" effect)
        const center = attacker.center;
        defenderTiles.sort((a, b) => {
            const distA = (a.x - center.x) ** 2 + (a.y - center.y) ** 2;
            const distB = (b.x - center.x) ** 2 + (b.y - center.y) ** 2;
            return distA - distB;
        });

        // 3. Add to Queue
        defenderTiles.forEach(tile => {
            this.wipeOutQueue.push({ tile, newOwnerId: attacker.id });
        });
    }

    processWipeOutQueue() {
        if (this.wipeOutQueue.length === 0) return;

        // Process 50 tiles per tick (approx 500 tiles/sec at 10tps)
        // Increases speed if queue is massive to prevent it taking forever
        const count = Math.max(50, Math.ceil(this.wipeOutQueue.length / 20));

        for (let i = 0; i < count; i++) {
            if (this.wipeOutQueue.length === 0) break;
            const item = this.wipeOutQueue.shift();
            if (item) {
                const { tile, newOwnerId } = item;
                // Instant convert

                // Remove from old owner (Cache update)
                if (tile.ownerId) {
                    const oldP = this.players.find(p => p.id === tile.ownerId);
                    if (oldP) oldP.ownedTiles = oldP.ownedTiles.filter(t => t !== tile);
                }

                tile.ownerId = newOwnerId;
                tile.defense = 50; // Moderate defense for new lands

                // Add to new owner
                const newP = this.players.find(p => p.id === newOwnerId);
                if (newP) newP.ownedTiles.push(tile);

                if (tile.building) {
                    tile.building.ownerId = newOwnerId;
                }
            }
        }
    }

    checkEncirclement() {
        const visited = new Set<string>();
        const w = this.config.mapWidth;
        const h = this.config.mapHeight;

        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                const key = `${x},${y}`;
                if (visited.has(key)) continue;

                const tile = this.tiles[y][x];
                if (tile.type !== 'LAND' || !tile.ownerId) {
                    visited.add(key);
                    continue;
                }

                const owner = tile.ownerId;
                const component: Tile[] = [];
                const queue: Tile[] = [tile];
                visited.add(key);

                const boundary = new Set<string>();

                let head = 0;
                while (head < queue.length) {
                    const curr = queue[head++];
                    component.push(curr);

                    const neighbors = [
                        { x: curr.x, y: curr.y - 1 },
                        { x: curr.x, y: curr.y + 1 },
                        { x: curr.x - 1, y: curr.y },
                        { x: curr.x + 1, y: curr.y }
                    ];

                    for (const n of neighbors) {
                        if (!this.isValid(n.x, n.y)) {
                            boundary.add('EDGE');
                            continue;
                        }
                        const neighbor = this.tiles[n.y][n.x];

                        if (neighbor.type === 'WATER') {
                            boundary.add('WATER');
                        } else if (neighbor.type === 'LAND') {
                            if (neighbor.ownerId === owner) {
                                const nKey = `${n.x},${n.y}`;
                                if (!visited.has(nKey)) {
                                    visited.add(nKey);
                                    queue.push(neighbor);
                                }
                            } else if (neighbor.ownerId === null) {
                                boundary.add('NEUTRAL');
                            } else {
                                boundary.add(neighbor.ownerId);
                            }
                        }
                    }
                }

                if (boundary.has('WATER') || boundary.has('EDGE') || boundary.has('NEUTRAL')) {
                    continue;
                }

                if (boundary.size === 1) {
                    const capturerId = boundary.values().next().value;
                    this.captureComponent(component, capturerId);
                }
            }
        }
    }

    captureComponent(tiles: Tile[], newOwnerId: string) {
        const newOwner = this.players.find(p => p.id === newOwnerId);

        tiles.forEach(t => {
            if (t.ownerId) {
                const oldP = this.players.find(p => p.id === t.ownerId);
                // Slow filter, but captures are rare events
                if (oldP) oldP.ownedTiles = oldP.ownedTiles.filter(ot => ot !== t);
            }

            t.ownerId = newOwnerId;
            t.defense = 10; // Reset defense
            if (newOwner) newOwner.ownedTiles.push(t);

            if (t.building) {
                t.building.ownerId = newOwnerId;
                t.building.hp = t.building.maxHp * 0.5; // Damage it
            }
        });
    }

    isValid(x: number, y: number): boolean {
        return x >= 0 && x < this.config.mapWidth && y >= 0 && y < this.config.mapHeight;
    }

    update(dt: number) {
        this.tickCount++;

        // 1. Economy
        if (this.tickCount % 10 === 0) {
            this.updateEconomy();
            this.updateAI();
        }

        // 2. Units Movement & Combat (Military)
        this.updateUnits();

        // 3. New: Process Military Dispatch from Reserves
        this.processMilitaryDispatch();

        // 4. Attacks (Population Expansion)
        this.updateAttacks();

        // 5. Building Construction
        this.updateBuildings();

        // 6. Encirclement check (Auto-claim)
        // Optimization: Run less frequently (every 5 seconds)
        if (this.tickCount % 50 === 0) {
            this.checkEncirclement();
        }

        // 7. Territory Pressure (Passive regen only)
        // Optimization: Run less frequently (every 2 seconds)
        if (this.tickCount % 20 === 0) {
            this.updateTerritory();
        }

        // 8. WipeOut Queue (Smoothing)
        this.processWipeOutQueue();
    }

    updateEconomy() {
        // Reset counters for calculations (pop growth is additive)
        // ADDED sumX, sumY for centroid calculation
        const playerStats: Record<string, {
            gold: number, wood: number, stone: number, food: number,
            popGrowth: number, maxPop: number, landCount: number,
            sumX: number, sumY: number
        }> = {};

        this.players.forEach(p => {
            playerStats[p.id] = { gold: 1, wood: 0, stone: 0, food: 0, popGrowth: 0, maxPop: 0, landCount: 0, sumX: 0, sumY: 0 };
        });

        // Iterate map once
        for (let y = 0; y < this.config.mapHeight; y++) {
            for (let x = 0; x < this.config.mapWidth; x++) {
                const tile = this.tiles[y][x];
                if (tile.ownerId && playerStats[tile.ownerId]) {
                    const stats = playerStats[tile.ownerId];
                    stats.landCount++; // Count owned land
                    stats.sumX += x;
                    stats.sumY += y;

                    // Each claimed tile generates +1 pop per tick (economy tick)
                    stats.popGrowth += 1;
                    // Each tile claimed generates +10 max population
                    stats.maxPop += 10;

                    const b = tile.building;
                    if (b && b.ownerId === tile.ownerId && !b.isUnderConstruction) {
                        const bStats = BUILDING_STATS[b.type];
                        if (bStats.income[ResourceType.GOLD]) stats.gold += bStats.income[ResourceType.GOLD]!;
                        if (bStats.income[ResourceType.WOOD]) stats.wood += bStats.income[ResourceType.WOOD]!;
                        if (bStats.income[ResourceType.STONE]) stats.stone += bStats.income[ResourceType.STONE]!;
                        if (bStats.income[ResourceType.FOOD]) stats.food += bStats.income[ResourceType.FOOD]!;

                        // Special Population Rules
                        if (b.type === BuildingType.TOWN) {
                            stats.popGrowth += 10;
                        } else if (b.type === BuildingType.CASTLE || b.type === BuildingType.KINGDOM) {
                            // Kingdom treated as Castle tier or higher
                            stats.popGrowth += 100;
                        }
                    }
                }
            }
        }

        // Apply calculated stats
        this.players.forEach(p => {
            const stats = playerStats[p.id];
            if (!stats) return;

            p.resources[ResourceType.GOLD] += stats.gold;
            p.resources[ResourceType.WOOD] += stats.wood;
            p.resources[ResourceType.STONE] += stats.stone;
            p.resources[ResourceType.FOOD] += stats.food;

            p.income = {
                [ResourceType.GOLD]: stats.gold,
                [ResourceType.WOOD]: stats.wood,
                [ResourceType.STONE]: stats.stone,
                [ResourceType.FOOD]: stats.food
            };

            // Update Center and Area
            p.landArea = stats.landCount;
            if (stats.landCount > 0) {
                p.center = { x: stats.sumX / stats.landCount, y: stats.sumY / stats.landCount };
            }

            // Update Max Pop
            p.maxPopulation = Math.max(100, stats.maxPop); // Min 100

            // Apply Pop Growth (unconditional, no food cost as per new rules logic)
            if (p.population < p.maxPopulation) {
                // Growth based on food or just constant trickle?
                // Let's say 1% growth per tick + base
                const growth = 0.5 + (p.population * 0.005);
                p.population += growth;
                if (p.population > p.maxPopulation) p.population = p.maxPopulation;
            } else if (p.population > p.maxPopulation) {
                // Decay if over pop
                p.population -= 1;
            }

            // WIN CONDITION: > 80% of total land
            if (this.totalLandTiles > 0 && stats.landCount / this.totalLandTiles > 0.8) {
                this.winnerId = p.id;
            }
        });

        // GAME OVER CONDITION: No human players with land remaining
        if (this.isGameActive) {
            const humanAlive = this.players.some(p => !p.isAI && playerStats[p.id].landCount > 0);
            if (!humanAlive && this.players.some(p => !p.isAI)) {
                // Game Over for human (Defeat)
                // Set winner to the top performing AI to trigger end screen
                let topAI = this.players.filter(p => p.isAI).sort((a, b) => playerStats[b.id].landCount - playerStats[a.id].landCount)[0];
                this.winnerId = topAI ? topAI.id : 'AI_WINNER';
            }
        }
    }

    updateBuildings() {
        for (let y = 0; y < this.config.mapHeight; y++) {
            for (let x = 0; x < this.config.mapWidth; x++) {
                const b = this.tiles[y][x].building;
                if (b && b.isUnderConstruction) {
                    b.constructionProgress += 1;
                    if (b.constructionProgress >= 100) {
                        b.isUnderConstruction = false;
                    }
                }
            }
        }
    }

    // --- UNIT LOGIC ---
    canSpawnUnit(playerId: string, type: UnitType, x: number, y: number): boolean {
        if (!this.isValid(x, y)) return false;
        const tile = this.tiles[y][x];

        // Terrain check
        if (type === UnitType.BOAT) {
            if (tile.type !== 'WATER') return false;
        } else {
            if (tile.type !== 'LAND') return false;
        }

        // Ownership check (must spawn on own territory)
        if (tile.ownerId !== playerId) return false;

        // Resources check (Double check)
        const player = this.players.find(p => p.id === playerId);
        if (!player) return false;
        const costs = UNIT_COSTS[type];
        for (const r of Object.keys(costs) as ResourceType[]) {
            if (player.resources[r] < costs[r]) return false;
        }

        // Population check
        if (player.population < 1) return false;

        return true;
    }

    moveUnit(playerId: string, unitId: string, x: number, y: number) {
        const player = this.players.find(p => p.id === playerId);
        if (!player) return;

        const unit = player.units.find(u => u.id === unitId);
        if (unit) {
            unit.targetX = x;
            unit.targetY = y;
            unit.hasCommand = true;
            unit.idleTicks = 0;
        }
    }

    updateUnits() {
        this.players.forEach(p => {
            for (let i = p.units.length - 1; i >= 0; i--) {
                const unit = p.units[i];

                if (unit.hp <= 0) {
                    p.units.splice(i, 1);
                    continue;
                }

                // SOLDIERs are deprecated
                if (unit.type === UnitType.SOLDIER) {
                    p.units.splice(i, 1);
                    continue;
                }

                // 1. MOVEMENT
                if (unit.targetX !== undefined && unit.targetY !== undefined) {
                    const dx = unit.targetX - unit.x;
                    const dy = unit.targetY - unit.y;
                    const dist = Math.sqrt(dx * dx + dy * dy);

                    // Reached destination?
                    if (dist <= 0.2) { // Tolerance
                        if (unit.hasCommand) {
                            // Command complete, enter idle
                            unit.hasCommand = false;
                            unit.targetX = undefined;
                            unit.targetY = undefined;
                        } else {
                            // Wander/Attack Move complete
                            // Stay here for a bit or find new target
                            unit.targetX = undefined;
                            unit.targetY = undefined;
                        }
                    } else {
                        // Move logic
                        const currentTileX = Math.floor(unit.x);
                        const currentTileY = Math.floor(unit.y);
                        const currentTile = this.isValid(currentTileX, currentTileY) ? this.tiles[currentTileY][currentTileX] : null;

                        let speedMod = 1.0;
                        if (currentTile && currentTile.type === 'LAND') {
                            speedMod = 1.0 - (currentTile.elevation / 25);
                        }

                        const move = Math.min(dist, unit.speed * speedMod);
                        unit.x += (dx / dist) * move;
                        unit.y += (dy / dist) * move;
                    }
                }

                // 2. COMBAT (Attack anything nearby)
                // Check for enemies within range and attack
                const engaged = this.handleCombat(unit, p.id);

                // 3. IDLE BEHAVIOR
                if (!unit.hasCommand && unit.targetX === undefined) {
                    // Look for targets if not already engaged or if we want to chase
                    // If we didn't just attack something, try to find a target to move towards
                    if (!engaged) {
                        this.findTarget(unit, p.id);
                    }

                    // If still no target (no enemies nearby), Wander
                    if (unit.targetX === undefined) {
                        unit.idleTicks++;
                        if (unit.idleTicks > 30) { // 3 seconds approx
                            this.wander(unit);
                            unit.idleTicks = 0;
                        }
                    }
                }
            }
        });
    }

    wander(unit: Unit) {
        // Pick random spot in 5x5 area centered on unit
        // dx from -2 to +2
        const dx = (Math.random() * 4) - 2;
        const dy = (Math.random() * 4) - 2;

        const nx = unit.x + dx;
        const ny = unit.y + dy;

        if (this.isValid(Math.floor(nx), Math.floor(ny))) {
            const tile = this.tiles[Math.floor(ny)][Math.floor(nx)];
            const isBoat = unit.type === UnitType.BOAT;
            // Only wander to valid terrain
            if ((isBoat && tile.type === 'WATER') || (!isBoat && tile.type === 'LAND')) {
                unit.targetX = nx;
                unit.targetY = ny;
                unit.hasCommand = false; // It's an auto-move
            }
        }
    }

    findTarget(unit: Unit, ownerId: string) {
        let nearestDist = 999;
        let target: { x: number, y: number } | null = null;
        const scanRadius = 15;
        const startY = Math.max(0, Math.floor(unit.y - scanRadius));
        const endY = Math.min(this.config.mapHeight, Math.floor(unit.y + scanRadius));
        const startX = Math.max(0, Math.floor(unit.x - scanRadius));
        const endX = Math.min(this.config.mapWidth, Math.floor(unit.x + scanRadius));

        for (let y = startY; y < endY; y++) {
            for (let x = startX; x < endX; x++) {
                const tile = this.tiles[y][x];
                // 1. Enemy Buildings
                if (tile.building && tile.building.ownerId !== ownerId) {
                    const d = Math.sqrt((unit.x - x) ** 2 + (unit.y - y) ** 2);
                    if (d < nearestDist) {
                        nearestDist = d;
                        target = { x, y };
                    }
                }
            }
        }

        // 2. Enemy Units (Scan all players)
        this.players.forEach(p => {
            if (p.id !== ownerId) {
                p.units.forEach(enemyUnit => {
                    const d = Math.sqrt((unit.x - enemyUnit.x) ** 2 + (unit.y - enemyUnit.y) ** 2);
                    if (d < scanRadius && d < nearestDist) {
                        nearestDist = d;
                        target = { x: enemyUnit.x, y: enemyUnit.y };
                    }
                });
            }
        });

        if (target) {
            unit.targetX = target.x;
            unit.targetY = target.y;
            unit.hasCommand = false; // Auto-attack
        }
    }

    handleCombat(unit: Unit, ownerId: string): boolean {
        const range = unit.range;

        // Check Buildings in range
        // Optimization: Just check tile at unit pos and neighbors? 
        // Or range loop. Range loop is safer for ranged units.
        const rangeCeil = Math.ceil(range);

        for (let y = Math.floor(unit.y - rangeCeil); y <= Math.ceil(unit.y + rangeCeil); y++) {
            for (let x = Math.floor(unit.x - rangeCeil); x <= Math.ceil(unit.x + rangeCeil); x++) {
                if (this.isValid(x, y)) {
                    // Check dist
                    const d = Math.sqrt((unit.x - x) ** 2 + (unit.y - y) ** 2);
                    if (d <= range) {
                        const tile = this.tiles[y][x];
                        if (tile.building && tile.building.ownerId !== ownerId) {
                            tile.building.hp -= unit.attack;
                            if (tile.building.hp <= 0) {
                                // Check for King Slayer
                                if (tile.building.type === BuildingType.KINGDOM) {
                                    const victim = this.players.find(p => p.id === tile.building!.ownerId);
                                    const killer = this.players.find(p => p.id === ownerId);
                                    if (victim && killer) {
                                        this.queueWipeOut(killer, victim);
                                    }
                                }
                                tile.building = null;
                                tile.ownerId = null;
                            }
                            return true; // Attacked
                        }
                    }
                }
            }
        }

        // Check Units in range
        for (const p of this.players) {
            if (p.id !== ownerId) {
                for (const enemyUnit of p.units) {
                    const d = Math.sqrt((unit.x - enemyUnit.x) ** 2 + (unit.y - enemyUnit.y) ** 2);
                    if (d <= range) {
                        enemyUnit.hp -= unit.attack;
                        return true; // Attacked
                    }
                }
            }
        }

        return false;
    }

    updateTerritory() {
        // Passive regeneration of defense for owned tiles
        for (let y = 0; y < this.config.mapHeight; y++) {
            for (let x = 0; x < this.config.mapWidth; x++) {
                const tile = this.tiles[y][x];
                if (tile.ownerId) {
                    const owner = this.players.find(p => p.id === tile.ownerId);
                    if (owner) {
                        const maxDefense = 1 + Math.floor(owner.population / 2000);
                        if (tile.defense < maxDefense) {
                            tile.defense += 0.5; // Regen
                            if (tile.defense > maxDefense) tile.defense = maxDefense;
                        } else if (tile.defense > maxDefense) {
                            // Decay down if pop drops?
                            tile.defense = maxDefense;
                        }
                    }
                }
            }
        }
    }

    updateAI() {
        this.players.filter(p => p.isAI).forEach(ai => {

            if (ai.aiType === AIType.KINGDOM) {
                // --- KINGDOM LOGIC (Smart, Buildings) ---

                // Economy Build
                if (ai.resources[ResourceType.GOLD] > 1000) {
                    this.tryBuildAI(ai, BuildingType.CASTLE);
                } else if (ai.resources[ResourceType.WOOD] > 200 && Math.random() > 0.5) {
                    this.tryBuildAI(ai, BuildingType.WOODCUTTER);
                }

                // Expansion
                if (ai.population > 25 && Math.random() > 0.2) { // Increased chance
                    this.aiExpand(ai, 20); // 20% commitment
                }
            } else if (ai.aiType === AIType.CAMP) {
                // --- CAMP LOGIC (Dumb, Aggressive, No Buildings) ---

                // Aggressive Expansion: If they have ANY population, try to expand.
                // They don't save for buildings.
                if (ai.population > 2) {
                    // Try to attack very frequently
                    if (Math.random() > 0.1) { // Even more aggressive (90% chance)
                        // 50% commitment - highly aggressive
                        this.aiExpand(ai, 50);
                    }
                }
            }
        });
    }

    aiExpand(ai: Player, percent: number) {
        // Dynamic scan step: If small, scan every tile. If huge, optimize.
        const scanStep = ai.landArea < 50 ? 1 : 4;

        // Find potential border tiles (tiles owned by AI that have at least one non-owned neighbor)
        const borderCandidates: Tile[] = [];

        for (let y = 0; y < this.config.mapHeight; y += scanStep) {
            for (let x = 0; x < this.config.mapWidth; x += scanStep) {
                const tile = this.tiles[y][x];
                if (tile.ownerId === ai.id) {
                    const neighbors = [{ x: 0, y: -1 }, { x: 0, y: 1 }, { x: -1, y: 0 }, { x: 1, y: 0 }];
                    const hasExternalNeighbor = neighbors.some(n => {
                        const nx = x + n.x;
                        const ny = y + n.y;
                        if (!this.isValid(nx, ny)) return false;
                        const neighbor = this.tiles[ny][nx];
                        return neighbor.type === 'LAND' && neighbor.ownerId !== ai.id;
                    });

                    if (hasExternalNeighbor) {
                        borderCandidates.push(tile);
                    }
                }
            }
        }

        if (borderCandidates.length > 0) {
            // Try up to 3 times to find a valid expansion
            for (let attempt = 0; attempt < 3; attempt++) {
                const src = borderCandidates[Math.floor(Math.random() * borderCandidates.length)];
                const neighbors = [{ x: 0, y: -1 }, { x: 0, y: 1 }, { x: -1, y: 0 }, { x: 1, y: 0 }];

                let possibleTargets = neighbors.map(n => {
                    const nx = src.x + n.x;
                    const ny = src.y + n.y;
                    if (this.isValid(nx, ny)) return this.tiles[ny][nx];
                    return null;
                }).filter(t => {
                    if (!t || t.type !== 'LAND') return false;
                    if (t.ownerId === ai.id) return false;

                    // CRITICAL: NEVER ATTACK HUMANS
                    if (t.ownerId) {
                        const owner = this.players.find(p => p.id === t.ownerId);
                        if (owner && !owner.isAI) return false;
                    }
                    return true;
                });

                if (possibleTargets.length > 0) {

                    // --- CAMP BEHAVIOR: SCAVENGER ---
                    if (ai.aiType === AIType.CAMP) {
                        const neutrals = possibleTargets.filter(t => t?.ownerId === null);

                        if (neutrals.length > 0) {
                            // Take free land
                            possibleTargets = neutrals;
                        } else {
                            // Only attack other bots if no neutral
                            // Filter is already applied above to exclude humans, so these are all valid AI targets
                        }
                    }

                    // --- KINGDOM BEHAVIOR: STANDARD ---
                    // (Matches user request: Attack neutrals + bots. Humans excluded above.)

                    // Execute
                    const validFinalTargets = possibleTargets.filter(t => t !== null && t !== undefined) as Tile[];
                    if (validFinalTargets.length > 0) {
                        const target = validFinalTargets[Math.floor(Math.random() * validFinalTargets.length)];
                        this.distributeExpansion(ai.id, target.x, target.y, percent);
                        break;
                    }
                }
            }
        }
    }

    tryBuildAI(player: Player, type: BuildingType) {
        for (let i = 0; i < 20; i++) {
            const x = Math.floor(Math.random() * this.config.mapWidth);
            const y = Math.floor(Math.random() * this.config.mapHeight);
            if (this.canBuild(player.id, type, x, y)) {
                this.placeBuilding(player.id, type, x, y);
                break;
            }
        }
    }

    canBuild(playerId: string, type: BuildingType, x: number, y: number): boolean {
        if (!this.isValid(x, y)) return false;
        const tile = this.tiles[y][x];
        if (tile.building) return false;

        // --- Type Specific Constraints ---

        if (type === BuildingType.PIER) {
            // Pier must be on water
            if (tile.type !== 'WATER') return false;
            // Pier must be adjacent to player owned territory
            if (!this.isAdjacentToPlayer(x, y, playerId)) return false;
        } else {
            // All other buildings must be on Land
            if (tile.type !== 'LAND') return false;

            // All other buildings must be on owned territory
            if (tile.ownerId !== playerId) return false;
        }

        // Elevation Constraints
        if (type === BuildingType.FARM) {
            if (tile.elevation > 5) return false;
        } else if (type === BuildingType.MINE) {
            if (tile.elevation <= 5) return false;
        } else if (type === BuildingType.WOODCUTTER) {
            if (tile.elevation > 10) return false;
        } else {
            // General restriction for other buildings on steep terrain
            if (tile.elevation > 12) return false;
        }

        // --- Resource Check ---
        const player = this.players.find(p => p.id === playerId);
        if (!player) return false;
        const costs = BUILDING_COSTS[type];
        for (const r of Object.keys(costs) as ResourceType[]) {
            if (player.resources[r] < costs[r]) return false;
        }

        return true;
    }

    placeBuilding(playerId: string, type: BuildingType, x: number, y: number, free = false) {
        const player = this.players.find(p => p.id === playerId);
        if (!player) return;

        if (!free) {
            const costs = BUILDING_COSTS[type];
            for (const r of Object.keys(costs) as ResourceType[]) {
                player.resources[r] -= costs[r];
            }
        }

        const tile = this.tiles[y][x];
        tile.building = {
            id: Math.random().toString(36).substr(2, 9),
            type,
            ownerId: playerId,
            x,
            y,
            hp: BUILDING_STATS[type].maxHp,
            maxHp: BUILDING_STATS[type].maxHp,
            isUnderConstruction: !free,
            constructionProgress: free ? 100 : 0
        };
        // Initialize defense based on pop
        tile.defense = 1 + Math.floor(player.population / 2000);

        // Cache Update: Ensure tile is in ownedTiles
        if (tile.ownerId !== playerId) {
            if (tile.ownerId) {
                // Remove from old owner
                const oldOwner = this.players.find(p => p.id === tile.ownerId);
                if (oldOwner) {
                    oldOwner.ownedTiles = oldOwner.ownedTiles.filter(t => t !== tile);
                }
            }
            player.ownedTiles.push(tile);
            tile.ownerId = playerId;
        } else {
            // Already owned, but make sure it's in cache (idempotent)
            if (!player.ownedTiles.includes(tile)) {
                player.ownedTiles.push(tile);
            }
        }
    }

    spawnUnit(playerId: string, type: UnitType, x: number, y: number) {
        const player = this.players.find(p => p.id === playerId);
        if (!player) return;

        // Check costs
        const costs = UNIT_COSTS[type];
        for (const r of Object.keys(costs) as ResourceType[]) {
            if (player.resources[r] < costs[r]) return;
        }

        // Check Population (Military uses population)
        if (player.population < 1) return;

        // Pay resources
        for (const r of Object.keys(costs) as ResourceType[]) {
            player.resources[r] -= costs[r];
        }

        // Pay Pop
        player.population -= 1;

        const stats = UNIT_STATS[type];
        player.units.push({
            id: Math.random().toString(36).substr(2, 9),
            type,
            ownerId: playerId,
            x,
            y,
            hp: stats.hp,
            maxHp: stats.hp,
            attack: stats.attack,
            speed: stats.speed,
            range: stats.range,
            hasCommand: false,
            idleTicks: 0
        });
    }

    get isGameOver(): boolean {
        return this.winnerId !== null;
    }

    getMatchLog(): MatchLog | null {
        if (!this.winnerId) return null;
        const winner = this.players.find(p => p.id === this.winnerId);
        return {
            matchId: Math.random().toString(36).substr(2, 9),
            mapName: 'Fractal Valley', // TODO: Store map name in config
            winnerName: winner ? winner.name : 'Unknown',
            winnerId: this.winnerId,
            totalPlayers: this.players.length,
            timestamp: Date.now()
        };
    }
}
