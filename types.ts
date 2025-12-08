
export enum ResourceType {
  GOLD = 'GOLD',
  WOOD = 'WOOD',
  STONE = 'STONE',
  FOOD = 'FOOD'
}

export enum BuildingType {
  KINGDOM = 'KINGDOM',
  CASTLE = 'CASTLE',
  MARKET = 'MARKET',
  WOODCUTTER = 'WOODCUTTER',
  MINE = 'MINE',
  FARM = 'FARM',
  BARRACKS = 'BARRACKS',
  PIER = 'PIER',
  TOWN = 'TOWN'
}

export enum UnitType {
  SOLDIER = 'SOLDIER', // Basic pop
  SWORDSMAN = 'SWORDSMAN',
  ARCHER = 'ARCHER',
  HORSE = 'HORSE',
  TREBUCHET = 'TREBUCHET',
  BOAT = 'BOAT'
}

export interface Coordinates {
  x: number;
  y: number;
}

export interface Player {
  id: string;
  name: string; // Added Name
  color: string;
  isAI: boolean;
  resources: Record<ResourceType, number>;
  income: Record<ResourceType, number>;
  population: number;
  maxPopulation: number;
  militaryPopulation: number;
  attackTarget: string | null;
  units: Unit[];
  // For Map Labels
  center: Coordinates;
  landArea: number;
}

// Used for passing config from Lobby to Game Engine
export interface PlayerProfile {
  id: string;
  name: string;
  isAI: boolean;
  color: string;
}

export interface Tile {
  x: number;
  y: number;
  type: 'LAND' | 'WATER';
  elevation: number; // 0 for water, 1-15 for land
  ownerId: string | null;
  building: Building | null;
  defense: number; // For territory wars
}

export interface Building {
  id: string;
  type: BuildingType;
  ownerId: string;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  isUnderConstruction: boolean;
  constructionProgress: number;
}

export interface Unit {
  id: string;
  type: UnitType;
  ownerId: string;
  x: number;
  y: number;
  targetX?: number;
  targetY?: number;
  hasCommand: boolean; // True if moving to a user-defined location
  idleTicks: number;   // Count ticks to trigger wander behavior
  hp: number;
  maxHp: number;
  attack: number;
  speed: number;
  range: number;
}

export interface AttackWave {
  id: string;
  ownerId: string;
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  power: number;
  speed: number;
  color: string;
}

export interface GameConfig {
  mapWidth: number;
  mapHeight: number;
  tileSize: number;
}

export interface Camera {
  x: number;
  y: number;
  zoom: number;
}

// --- MATCHMAKING TYPES ---

export interface Lobby {
  id: string;
  mapName: string;
  players: PlayerProfile[];
  maxPlayers: number;
  createdAt: number;
  expiresAt: number; // Timestamp when it force starts
  status: 'WAITING' | 'STARTING' | 'IN_PROGRESS';
}

export interface MatchLog {
  matchId: string;
  mapName: string;
  winnerName: string;
  winnerId: string;
  totalPlayers: number;
  timestamp: number;
}
