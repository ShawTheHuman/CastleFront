
import { BuildingType, ResourceType, UnitType } from './types';

export const GAME_TICK_RATE = 100; // ms per tick for logic (10 ticks per second)
export const RENDER_FPS = 60;
export const TILE_SIZE = 2; // Smaller tiles for higher resolution map

export const MAP_WIDTH = 256; // Significantly larger map (2x for finer grid)
export const MAP_HEIGHT = 256;

export const BUILDING_COSTS: Record<BuildingType, Record<ResourceType, number>> = {
  [BuildingType.KINGDOM]: { [ResourceType.GOLD]: 5000, [ResourceType.WOOD]: 2000, [ResourceType.STONE]: 2000, [ResourceType.FOOD]: 1000 },
  [BuildingType.CASTLE]: { [ResourceType.GOLD]: 1000, [ResourceType.WOOD]: 500, [ResourceType.STONE]: 500, [ResourceType.FOOD]: 200 },
  [BuildingType.MARKET]: { [ResourceType.GOLD]: 100, [ResourceType.WOOD]: 50, [ResourceType.STONE]: 0, [ResourceType.FOOD]: 0 },
  [BuildingType.WOODCUTTER]: { [ResourceType.GOLD]: 50, [ResourceType.WOOD]: 0, [ResourceType.STONE]: 0, [ResourceType.FOOD]: 20 },
  [BuildingType.MINE]: { [ResourceType.GOLD]: 100, [ResourceType.WOOD]: 100, [ResourceType.STONE]: 0, [ResourceType.FOOD]: 50 },
  [BuildingType.FARM]: { [ResourceType.GOLD]: 50, [ResourceType.WOOD]: 20, [ResourceType.STONE]: 0, [ResourceType.FOOD]: 0 },
  [BuildingType.TOWN]: { [ResourceType.GOLD]: 200, [ResourceType.WOOD]: 200, [ResourceType.STONE]: 50, [ResourceType.FOOD]: 100 },
  [BuildingType.BARRACKS]: { [ResourceType.GOLD]: 300, [ResourceType.WOOD]: 200, [ResourceType.STONE]: 200, [ResourceType.FOOD]: 100 },
  [BuildingType.PIER]: { [ResourceType.GOLD]: 200, [ResourceType.WOOD]: 300, [ResourceType.STONE]: 50, [ResourceType.FOOD]: 50 },
};

export const BUILDING_STATS: Record<BuildingType, { maxHp: number, income: Partial<Record<ResourceType, number>>, popCap: number }> = {
  [BuildingType.KINGDOM]: { maxHp: 15000, income: { [ResourceType.GOLD]: 20, [ResourceType.FOOD]: 10, [ResourceType.STONE]: 5, [ResourceType.WOOD]: 5 }, popCap: 10000 },
  [BuildingType.CASTLE]: { maxHp: 5000, income: { [ResourceType.GOLD]: 5, [ResourceType.FOOD]: 2 }, popCap: 10000 },
  [BuildingType.MARKET]: { maxHp: 500, income: { [ResourceType.GOLD]: 10 }, popCap: 0 },
  [BuildingType.WOODCUTTER]: { maxHp: 300, income: { [ResourceType.WOOD]: 5 }, popCap: 0 },
  [BuildingType.MINE]: { maxHp: 400, income: { [ResourceType.STONE]: 3 }, popCap: 0 },
  [BuildingType.FARM]: { maxHp: 200, income: { [ResourceType.FOOD]: 8 }, popCap: 0 },
  [BuildingType.TOWN]: { maxHp: 800, income: {}, popCap: 5000 },
  [BuildingType.BARRACKS]: { maxHp: 1000, income: {}, popCap: 0 },
  [BuildingType.PIER]: { maxHp: 600, income: {}, popCap: 0 },
};

export const UNIT_COSTS: Record<UnitType, Record<ResourceType, number>> = {
  [UnitType.SOLDIER]: { [ResourceType.GOLD]: 0, [ResourceType.WOOD]: 0, [ResourceType.STONE]: 0, [ResourceType.FOOD]: 0 }, // Free, represents raw pop
  [UnitType.SWORDSMAN]: { [ResourceType.GOLD]: 50, [ResourceType.WOOD]: 0, [ResourceType.STONE]: 10, [ResourceType.FOOD]: 20 },
  [UnitType.ARCHER]: { [ResourceType.GOLD]: 60, [ResourceType.WOOD]: 40, [ResourceType.STONE]: 0, [ResourceType.FOOD]: 20 },
  [UnitType.HORSE]: { [ResourceType.GOLD]: 100, [ResourceType.WOOD]: 0, [ResourceType.STONE]: 0, [ResourceType.FOOD]: 60 },
  [UnitType.TREBUCHET]: { [ResourceType.GOLD]: 200, [ResourceType.WOOD]: 300, [ResourceType.STONE]: 50, [ResourceType.FOOD]: 50 },
  [UnitType.BOAT]: { [ResourceType.GOLD]: 150, [ResourceType.WOOD]: 200, [ResourceType.STONE]: 0, [ResourceType.FOOD]: 50 },
};

// Speed and Range doubled to account for TILE_SIZE reduction (4->2) and Map Increase
export const UNIT_STATS: Record<UnitType, { hp: number, attack: number, speed: number, range: number }> = {
  [UnitType.SOLDIER]: { hp: 50, attack: 5, speed: 0.1, range: 1 },
  [UnitType.SWORDSMAN]: { hp: 120, attack: 15, speed: 0.08, range: 1 },
  [UnitType.ARCHER]: { hp: 80, attack: 12, speed: 0.1, range: 6 },
  [UnitType.HORSE]: { hp: 200, attack: 20, speed: 0.16, range: 1 },
  [UnitType.TREBUCHET]: { hp: 300, attack: 50, speed: 0.04, range: 12 },
  [UnitType.BOAT]: { hp: 400, attack: 30, speed: 0.12, range: 8 },
};

export const PLAYER_COLORS = [
  '#ef4444', // Red 500
  '#3b82f6', // Blue 500
  '#22c55e', // Green 500
  '#eab308', // Yellow 500
  '#a855f7', // Purple 500
  '#ec4899', // Pink 500
  '#f97316', // Orange 500
  '#06b6d4', // Cyan 500
  '#8b5cf6', // Violet 500
  '#64748b', // Slate 500
  '#14b8a6', // Teal 500
  '#84cc16', // Lime 500
  '#f43f5e', // Rose 500
  '#6366f1', // Indigo 500
  '#d946ef', // Fuchsia 500
  '#0ea5e9', // Sky 500
  '#10b981', // Emerald 500
  '#f59e0b', // Amber 500
  '#78716c', // Stone 500
  '#b91c1c', // Red 700
  '#1d4ed8', // Blue 700
  '#15803d', // Green 700
  '#a16207', // Yellow 700
  '#7e22ce', // Purple 700
];

export const CAMP_NAMES = [
  "Bandits", "Outlaws", "Raiders", "Rebels", "Exiles", "Rogues", "Marauders", "Vagabonds"
];

export const KINGDOM_NAMES = [
  "North", "South", "East", "West", "Highlands", "Lowlands", "Riverlands", "Coast"
];

export function getRandomName(names: string[]): string {
  return names[Math.floor(Math.random() * names.length)];
}
