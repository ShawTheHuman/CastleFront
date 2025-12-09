import React, { useState } from 'react';
import { BuildingType, Player, ResourceType, UnitType } from '../types';
import { BUILDING_COSTS, UNIT_COSTS } from '../constants';

const getResourceColor = (res: ResourceType): string => {
  switch (res) {
    case ResourceType.GOLD: return 'yellow';
    case ResourceType.WOOD: return 'green';
    case ResourceType.STONE: return 'zinc';
    case ResourceType.FOOD: return 'red';
    default: return 'gray';
  }
};

const Resources = ({ player }: { player: Player }) => (
  <div className="flex items-center gap-6 bg-[#1c1917]/95 backdrop-blur-md px-6 py-3 rounded-xl text-amber-100 text-sm shadow-xl border-2 border-amber-900/40 pointer-events-auto transition-all hover:scale-105 hover:bg-[#292524]">
    <div className="flex flex-col items-center">
      <span className="text-amber-500 font-bold font-display text-xs tracking-wider">GOLD</span>
      <span className="font-serif">{Math.floor(player.resources.GOLD)} <span className="text-stone-500 text-[10px]">(+{player.income.GOLD})</span></span>
    </div>
    <div className="w-px h-6 bg-amber-900/30"></div>
    <div className="flex gap-4 bg-[#1c1917]/95 backdrop-blur-md px-6 py-3 rounded-xl text-amber-100 text-sm shadow-xl border-2 border-amber-900/40 pointer-events-auto transition-all hover:scale-105 hover:bg-[#292524]">
      {/* Resource Items */}
      {Object.entries(player.resources).map(([res, amount]) => (
        <div key={res} className="flex items-center gap-2 bg-stone-900/80 px-3 py-1.5 rounded border border-stone-700 shadow-sm transition-all hover:bg-stone-800">
          <span className={`text-${getResourceColor(res as ResourceType)}-500 font-bold text-xs uppercase tracking-wider`}>{res}</span>
          <span className="text-stone-200 font-mono font-bold">{Math.floor(amount)}</span>
          <span className="text-xs text-stone-500 font-mono">+{Math.floor(player.income[res as ResourceType] || 0)}/t</span>
        </div>
      ))}

      {/* Population Display */}
      <div className="flex items-center gap-2 bg-indigo-900/30 px-3 py-1.5 rounded border border-indigo-700/50">
        <span className="text-indigo-400 font-bold text-xs uppercase tracking-wider">POP</span>
        <span className="text-indigo-100 font-mono font-bold">{Math.floor(player.population)} / {player.maxPopulation}</span>
      </div>
    </div>
  </div>
);

const BuildButton: React.FC<{
  type: BuildingType;
  player: Player;
  onBuildSelect: (type: BuildingType) => void;
  selectedBuilding: BuildingType | null;
}> = ({ type, player, onBuildSelect, selectedBuilding }) => {
  const cost = BUILDING_COSTS[type];
  const canAfford =
    player.resources.GOLD >= cost.GOLD &&
    player.resources.WOOD >= cost.WOOD &&
    player.resources.STONE >= cost.STONE &&
    player.resources.FOOD >= cost.FOOD;

  return (
    <button
      onClick={() => onBuildSelect(type)}
      disabled={!canAfford}
      className={`
        relative group flex flex-col items-center justify-center p-2 rounded w-20 h-20 transition-all duration-200 border-2
        ${selectedBuilding === type
          ? 'bg-amber-900 border-amber-400 shadow-[0_0_15px_rgba(245,158,11,0.4)] transform scale-105 z-10'
          : 'bg-[#292524] border-amber-900/30 hover:bg-[#44403c] hover:border-amber-600/50'
        }
        ${!canAfford && 'opacity-40 cursor-not-allowed grayscale'}
`}
    >
      <div className="font-bold text-[10px] mb-1 font-display tracking-wider text-amber-100">{type}</div>
      <div className="text-[9px] flex flex-wrap justify-center gap-1 opacity-80 group-hover:opacity-100 font-serif">
        {cost.GOLD > 0 && <span className="text-yellow-500">{cost.GOLD}G</span>}
        {cost.WOOD > 0 && <span className="text-green-600">{cost.WOOD}W</span>}
      </div>

      {/* Decorative Corners */}
      <div className={`absolute top-0 left-0 w-1.5 h-1.5 border-t border-l ${selectedBuilding === type ? 'border-amber-200' : 'border-transparent'}`}></div>
      <div className={`absolute bottom-0 right-0 w-1.5 h-1.5 border-b border-r ${selectedBuilding === type ? 'border-amber-200' : 'border-transparent'}`}></div>
    </button>
  );
};

const UnitButton: React.FC<{
  type: UnitType;
  player: Player;
  onUnitSpawn: (type: UnitType) => void;
  selectedSpawnUnitType: UnitType | null;
}> = ({ type, player, onUnitSpawn, selectedSpawnUnitType }) => {
  const cost = UNIT_COSTS[type];
  const canAfford =
    player.resources.GOLD >= cost.GOLD &&
    player.resources.WOOD >= cost.WOOD &&
    player.resources.STONE >= cost.STONE &&
    player.resources.FOOD >= cost.FOOD;

  return (
    <button
      onClick={() => onUnitSpawn(type)}
      disabled={!canAfford}
      className={`
              relative group flex flex-col items-center justify-center p-2 rounded w-16 h-16 transition-all duration-200 border-2
              ${selectedSpawnUnitType === type
          ? 'bg-red-900 border-red-500 shadow-[0_0_15px_rgba(220,38,38,0.4)] transform scale-105 z-10'
          : 'bg-[#292524] border-amber-900/30 hover:bg-[#44403c] hover:border-amber-600/50'
        }
              ${!canAfford && 'opacity-40 cursor-not-allowed grayscale'}
`}
    >
      <div className="font-bold text-[10px] mb-1 font-display tracking-wider text-amber-100">{type.slice(0, 4)}</div>
      <div className="text-[9px] text-yellow-600 font-serif font-bold">{cost.GOLD}G</div>
    </button>
  )
};

import { GameEngine } from '../game/GameEngine';

interface UIOverlayProps {
  engine: GameEngine;
  playerId: string;
  onBuildSelect: (type: BuildingType) => void;
  onUnitSpawn: (type: UnitType) => void;
  selectedBuilding: BuildingType | null;
  selectedSpawnUnitType: UnitType | null;
  attackPercentage: number;
  setAttackPercentage: (val: number) => void;
  onExit: () => void;
}

export const UIOverlay: React.FC<UIOverlayProps> = ({
  engine,
  playerId,
  onBuildSelect,
  onUnitSpawn,
  selectedBuilding,
  selectedSpawnUnitType,
  attackPercentage,
  setAttackPercentage,
  onExit
}) => {
  const [tick, setTick] = useState(0);

  // High frequency update loop specifically for UI (Resources etc)
  React.useEffect(() => {
    const interval = setInterval(() => {
      setTick(t => t + 1);
    }, 100);
    return () => clearInterval(interval);
  }, []);

  const player = engine.getPlayer(playerId);
  if (!player) return null;

  return (
    <div className="absolute inset-0 pointer-events-none flex flex-col justify-between p-4 pb-6">
      {/* Top Bar */}
      <div className="flex justify-center w-full relative pt-2">
        <Resources player={player} />

        {/* Return to Lobby Button */}
        <button
          onClick={onExit}
          className="absolute right-0 top-0 pointer-events-auto bg-red-900/90 hover:bg-red-800 backdrop-blur text-red-100 p-2 px-4 rounded shadow-lg border border-red-700 transition-all transform hover:scale-105 flex items-center gap-2 group"
          title="Retreat from Battle"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4 group-hover:rotate-90 transition-transform">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" />
          </svg>
          <span className="hidden md:inline text-xs font-bold font-display tracking-wider uppercase">Retreat</span>
        </button>
      </div>



      {/* Bottom Bar (Controls) */}
      <div className="flex flex-col items-center pointer-events-auto">
        {/* Units Panel */}
        <div className="flex gap-2 mb-3 items-stretch">

          {/* Attack Slider (Horizontal) */}
          <div className="bg-[#1c1917]/90 backdrop-blur-md p-2 rounded-lg border border-amber-900/40 shadow-lg flex flex-col justify-center gap-1 min-w-[140px] px-3 transform translate-y-2 hover:translate-y-0 transition-transform">
            <div className="flex justify-between items-center w-full">
              <span className="text-[10px] text-amber-700 font-bold uppercase tracking-widest font-display">Aggression</span>
              <span className="text-amber-500 font-bold text-xs font-display">{attackPercentage}%</span>
            </div>

            <div className="h-3 w-full bg-[#0c0a09] rounded-full relative overflow-hidden border border-amber-900/30">
              <div
                className="absolute left-0 h-full bg-gradient-to-r from-red-900 via-amber-600 to-yellow-400 transition-all duration-200"
                style={{ width: `${attackPercentage}%` }}
              ></div>
              <input
                type="range"
                min="1"
                max="100"
                value={attackPercentage}
                onChange={(e) => setAttackPercentage(parseInt(e.target.value))}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-50"
              />
            </div>
          </div>

          {/* Units Panel */}
          <div className="flex gap-2 bg-[#1c1917]/90 backdrop-blur-md p-2 rounded-lg border border-amber-900/40 shadow-lg transform translate-y-2 hover:translate-y-0 transition-transform">
            <div className="flex flex-col justify-center px-2 border-r border-amber-900/30">
              <span className="text-[10px] text-amber-600 uppercase font-bold tracking-wider font-display">Raise</span>
              <span className="text-[10px] text-amber-600 uppercase font-bold tracking-wider font-display">Army</span>
            </div>
            {(Object.keys(UnitType) as UnitType[]).map(u => (
              <UnitButton key={u} type={u} player={player} onUnitSpawn={onUnitSpawn} selectedSpawnUnitType={selectedSpawnUnitType} />
            ))}
          </div>
        </div>

        {/* Build Panel */}
        <div className="bg-[#1c1917]/95 backdrop-blur-xl p-3 px-6 rounded-t-xl border-t-2 border-l border-r border-amber-900/50 shadow-[0_-10px_40px_rgba(0,0,0,0.5)] flex gap-3 overflow-x-auto max-w-full">
          <div className="flex flex-col justify-center mr-2 border-r border-amber-900/30 pr-4">
            <span className="text-xs text-amber-500 uppercase font-bold tracking-widest font-display">Erect</span>
            <span className="text-[10px] text-stone-500 font-serif italic">Defense</span>
          </div>
          {(Object.keys(BuildingType) as BuildingType[])
            .filter(b => b !== BuildingType.KINGDOM)
            .map(b => (
              <BuildButton key={b} type={b} player={player} onBuildSelect={onBuildSelect} selectedBuilding={selectedBuilding} />
            ))}
        </div>
      </div>
    </div>
  );
};