import React, { useState } from 'react';
import { BuildingType, Player, ResourceType, UnitType } from '../types';
import { BUILDING_COSTS, UNIT_COSTS } from '../constants';

const Resources = ({ player }: { player: Player }) => (
  <div className="flex gap-4 bg-gray-900 bg-opacity-80 p-2 rounded-lg text-white text-xs md:text-sm shadow-lg border border-gray-700 pointer-events-auto">
    <div className="flex flex-col items-center">
      <span className="text-yellow-400 font-bold">Gold</span>
      <span>{Math.floor(player.resources.GOLD)} <span className="text-gray-400">(+{player.income.GOLD}/s)</span></span>
    </div>
    <div className="flex flex-col items-center">
      <span className="text-green-400 font-bold">Wood</span>
      <span>{Math.floor(player.resources.WOOD)} <span className="text-gray-400">(+{player.income.WOOD}/s)</span></span>
    </div>
    <div className="flex flex-col items-center">
      <span className="text-gray-400 font-bold">Stone</span>
      <span>{Math.floor(player.resources.STONE)} <span className="text-gray-400">(+{player.income.STONE}/s)</span></span>
    </div>
    <div className="flex flex-col items-center">
      <span className="text-orange-400 font-bold">Food</span>
      <span>{Math.floor(player.resources.FOOD)} <span className="text-gray-400">(+{player.income.FOOD}/s)</span></span>
    </div>
    <div className="flex flex-col items-center ml-2 border-l pl-2 border-gray-600">
      <span className="text-blue-300 font-bold">Pop</span>
      <span>{player.population} / {player.maxPopulation}</span>
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
        flex flex-col items-center justify-center p-2 rounded border w-20 h-20 transition-all
        ${selectedBuilding === type ? 'ring-2 ring-yellow-400 bg-gray-700' : 'bg-gray-800'}
        ${canAfford ? 'hover:bg-gray-700 text-white cursor-pointer' : 'opacity-50 cursor-not-allowed text-gray-500'}
      `}
    >
      <div className="font-bold text-[10px] mb-1">{type}</div>
      <div className="text-[9px] flex flex-wrap justify-center gap-1">
        {cost.GOLD > 0 && <span className="text-yellow-400">{cost.GOLD}G</span>}
        {cost.WOOD > 0 && <span className="text-green-400">{cost.WOOD}W</span>}
      </div>
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
              flex flex-col items-center justify-center p-2 rounded border w-16 h-16 transition-all 
              ${selectedSpawnUnitType === type ? 'ring-2 ring-yellow-400 bg-gray-700' : 'bg-gray-800'}
              ${canAfford ? 'hover:bg-gray-700 text-white cursor-pointer' : 'opacity-50 cursor-not-allowed text-gray-500'}
          `}
       >
           <div className="font-bold text-[10px] mb-1">{type.slice(0, 4)}</div>
           <div className="text-[9px] text-yellow-500">{cost.GOLD}G</div>
       </button>
    )
}

interface UIOverlayProps {
  player: Player | undefined;
  onBuildSelect: (type: BuildingType) => void;
  onUnitSpawn: (type: UnitType) => void;
  selectedBuilding: BuildingType | null;
  selectedSpawnUnitType: UnitType | null;
  attackPercentage: number;
  setAttackPercentage: (val: number) => void;
}

export const UIOverlay: React.FC<UIOverlayProps> = ({ 
  player, 
  onBuildSelect, 
  onUnitSpawn, 
  selectedBuilding,
  selectedSpawnUnitType,
  attackPercentage,
  setAttackPercentage
}) => {
  if (!player) return null;

  return (
    <div className="absolute inset-0 pointer-events-none flex flex-col justify-between p-2">
      {/* Top Bar */}
      <div className="flex justify-center w-full">
        <Resources player={player} />
      </div>

      {/* Right Side: Attack Slider */}
      <div className="absolute right-4 top-1/2 transform -translate-y-1/2 pointer-events-auto flex flex-col items-center bg-gray-900 bg-opacity-80 p-4 rounded-lg border border-gray-700">
          <div className="text-white font-bold mb-2 text-xs uppercase tracking-wider">Attack Power</div>
          <div className="h-48 flex items-center justify-center">
            <input
              type="range"
              min="1"
              max="100"
              value={attackPercentage}
              onChange={(e) => setAttackPercentage(parseInt(e.target.value))}
              className="appearance-none h-48 w-4 bg-gray-700 rounded-lg outline-none slider-vertical"
              style={{ writingMode: 'vertical-lr', direction: 'rtl' }}
            />
          </div>
          <div className="text-yellow-400 font-bold mt-2 text-lg">{attackPercentage}%</div>
          <div className="text-gray-400 text-[10px] mt-1">of Pop</div>
      </div>

      {/* Bottom Bar */}
      <div className="flex flex-col items-center pointer-events-auto">
         <div className="flex gap-2 mb-2 bg-black bg-opacity-50 p-2 rounded">
             {/* Simple toggle for simplicity */}
             <div className="text-white text-xs font-bold mr-2">UNITS:</div>
             {(Object.keys(UnitType) as UnitType[]).map(u => (
                 <UnitButton key={u} type={u} player={player} onUnitSpawn={onUnitSpawn} selectedSpawnUnitType={selectedSpawnUnitType} />
             ))}
         </div>
         
         <div className="bg-gray-900 bg-opacity-90 p-2 rounded-t-xl border-t border-gray-700 flex gap-2 overflow-x-auto max-w-full">
             {(Object.keys(BuildingType) as BuildingType[])
                .filter(b => b !== BuildingType.KINGDOM) // Filter out KINGDOM from UI
                .map(b => (
                 <BuildButton key={b} type={b} player={player} onBuildSelect={onBuildSelect} selectedBuilding={selectedBuilding} />
             ))}
         </div>
      </div>
      
      <style>{`
        input[type=range].slider-vertical {
            -webkit-appearance: slider-vertical;
        }
      `}</style>
    </div>
  );
};