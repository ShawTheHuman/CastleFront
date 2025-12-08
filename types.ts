
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
  color: string;
  isAI: boolean;
  resources: Record<ResourceType, number>;
  income: Record<ResourceType, number>;
  population: number;
  maxPopulation: number;
  militaryPopulation: number; // Pop allocated for attacks but not yet deployed
  attackTarget: string | null; // The ownerID we are currently targeting (null for Neutral)
  units: Unit[];
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
