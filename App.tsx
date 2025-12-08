import React, { useEffect, useState, useRef } from 'react';
import { GameEngine } from './game/GameEngine';
import { GameCanvas } from './components/GameCanvas';
import { UIOverlay } from './components/UIOverlay';
import { MAP_HEIGHT, MAP_WIDTH, TILE_SIZE } from './constants';
import { BuildingType, UnitType } from './types';

const App: React.FC = () => {
  const [engine] = useState(() => new GameEngine({
    mapWidth: MAP_WIDTH,
    mapHeight: MAP_HEIGHT,
    tileSize: TILE_SIZE
  }));

  const [gameStateToken, setGameStateToken] = useState(0); // Force re-render for UI updates
  const [playerId] = useState('Player1');
  const [selectedBuilding, setSelectedBuilding] = useState<BuildingType | null>(null);
  const [selectedSpawnUnitType, setSelectedSpawnUnitType] = useState<UnitType | null>(null);
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);
  const [gamePhase, setGamePhase] = useState<'MENU' | 'LOBBY' | 'PLAYING'>('MENU');
  const [countdown, setCountdown] = useState(20);
  const [attackPercentage, setAttackPercentage] = useState(20);

  // Initialize Game on start
  const startGame = () => {
      // Spawn bots, generate map
      engine.init(playerId, 7); // Increased bot count to 7
      setGamePhase('LOBBY');
      setCountdown(20);
      setGameStateToken(prev => prev + 1);
  };

  // Lobby Timer
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (gamePhase === 'LOBBY') {
        interval = setInterval(() => {
            setCountdown(prev => {
                if (prev <= 1) {
                    // Time up! Auto spawn
                    engine.spawnHumanRandomly(playerId);
                    setGamePhase('PLAYING');
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
    }
    return () => clearInterval(interval);
  }, [gamePhase, engine, playerId]);

  // Main Game Loop
  useEffect(() => {
    if (gamePhase === 'PLAYING') {
      const interval = setInterval(() => {
        engine.update(100);
        setGameStateToken(prev => prev + 1); // Trigger UI React update
      }, 100);
      
      return () => clearInterval(interval);
    }
  }, [engine, gamePhase]);

  const handleTileSelect = (x: number, y: number) => {
      if (gamePhase === 'LOBBY') {
          // Attempt to spawn
          const success = engine.spawnHumanBase(playerId, x, y);
          if (success) {
              setGamePhase('PLAYING');
          } else {
              // Feedback? 
              // console.log("Invalid spawn location");
          }
      } else if (gamePhase === 'PLAYING') {
          if (selectedUnitId) {
              // Command Move
              engine.moveUnit(playerId, selectedUnitId, x, y);
              // Deselect after move command
              setSelectedUnitId(null); 
          } else {
              // Attack / Expand (Population)
              // OLD: engine.dispatchAttack(playerId, x, y, attackPercentage);
              // NEW: Global expansion trigger
              engine.distributeExpansion(playerId, x, y, attackPercentage);
          }
      }
  };

  const handleSpawnUnitAt = (x: number, y: number) => {
      if (!selectedSpawnUnitType) return;
      
      if (engine.canSpawnUnit(playerId, selectedSpawnUnitType, x, y)) {
          engine.spawnUnit(playerId, selectedSpawnUnitType, x, y);
          setSelectedSpawnUnitType(null); // Deselect spawn mode
      }
  };

  const handleUnitSelect = (unitId: string | null) => {
      if (gamePhase !== 'PLAYING') return;
      setSelectedUnitId(unitId);
      // Clear other modes if we select a unit
      if (unitId) {
          setSelectedBuilding(null);
          setSelectedSpawnUnitType(null);
      }
  };

  const handleBuildSelect = (type: BuildingType) => {
      if (gamePhase !== 'PLAYING') return;
      setSelectedBuilding(type);
      // Clear other modes
      setSelectedSpawnUnitType(null);
      setSelectedUnitId(null);
  }

  const handlePlaceBuilding = (x: number, y: number) => {
    if (gamePhase !== 'PLAYING') return;

    if (selectedBuilding) {
      if (engine.canBuild(playerId, selectedBuilding, x, y)) {
        engine.placeBuilding(playerId, selectedBuilding, x, y);
        setSelectedBuilding(null); // Deselect after build
      } else {
        console.log("Cannot build here");
      }
    }
  };

  const handleUnitSpawnToggle = (type: UnitType) => {
      if (gamePhase !== 'PLAYING') return;
      
      if (selectedSpawnUnitType === type) {
          setSelectedSpawnUnitType(null);
      } else {
          setSelectedSpawnUnitType(type);
          setSelectedBuilding(null);
          setSelectedUnitId(null);
      }
  };
  
  if (gamePhase === 'MENU') {
    return (
      <div className="flex items-center justify-center h-screen w-screen bg-gray-900 text-white">
        <div className="text-center">
          <h1 className="text-6xl font-bold mb-4 text-blue-500">CastleFront</h1>
          <p className="mb-8 text-gray-400">Expand, Build, Conquer.</p>
          <button 
            onClick={startGame}
            className="px-8 py-4 bg-blue-600 hover:bg-blue-500 rounded text-xl font-bold transition-transform transform hover:scale-105"
          >
            Enter Lobby
          </button>
        </div>
      </div>
    );
  }

  const currentPlayer = engine.players.find(p => p.id === playerId);

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-black">
      <GameCanvas 
        engine={engine} 
        playerId={playerId}
        selectedBuildingType={selectedBuilding}
        onSelectTile={handleTileSelect}
        onPlaceBuilding={handlePlaceBuilding}
        selectedUnitId={selectedUnitId}
        onSelectUnit={handleUnitSelect}
        selectedSpawnUnitType={selectedSpawnUnitType}
        onSpawnUnitAt={handleSpawnUnitAt}
      />
      
      {gamePhase === 'LOBBY' && (
          <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-start pt-20 bg-black bg-opacity-30">
              <div className="bg-gray-800 p-6 rounded-lg shadow-2xl border-2 border-blue-500 pointer-events-auto text-center">
                  <h2 className="text-2xl text-white font-bold mb-2">Choose Your Starting Location</h2>
                  <p className="text-gray-300 mb-4">Tap on any valid empty land to place your castle.</p>
                  <div className="text-4xl font-mono text-yellow-400 mb-2">
                      00:{countdown < 10 ? `0${countdown}` : countdown}
                  </div>
                  <div className="text-sm text-gray-500">Bots have already claimed their territories.</div>
              </div>
          </div>
      )}

      {gamePhase === 'PLAYING' && (
        <UIOverlay 
            player={currentPlayer}
            onBuildSelect={handleBuildSelect}
            onUnitSpawn={handleUnitSpawnToggle}
            selectedBuilding={selectedBuilding}
            selectedSpawnUnitType={selectedSpawnUnitType}
            attackPercentage={attackPercentage}
            setAttackPercentage={setAttackPercentage}
        />
      )}
    </div>
  );
};

export default App;
