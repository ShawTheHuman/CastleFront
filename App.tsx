import React, { useEffect, useState, useRef } from 'react';
import { GameEngine } from './game/GameEngine';
import { GameCanvas } from './components/GameCanvas';
import { UIOverlay } from './components/UIOverlay';
import { MAP_HEIGHT, MAP_WIDTH, TILE_SIZE, PLAYER_COLORS } from './constants';
import { BuildingType, UnitType, Lobby, PlayerProfile, MatchLog } from './types';

// Enums for UI phases
enum ViewState {
    IDENTITY = 'IDENTITY',
    MATCHMAKING = 'MATCHMAKING',
    LOBBY = 'LOBBY',
    GAME_PLACEMENT = 'GAME_PLACEMENT', // "Lobby" inside the game engine (choosing spawn)
    GAME_PLAYING = 'GAME_PLAYING',
    RESULTS = 'RESULTS'
}

const PLAYER_ID = 'HUMAN_PLAYER';

const AI_NAMES = [
  "Cyber_Baron", "Techno_King", "Silicon_Duke", "Data_Lord", 
  "Quantum_Queen", "Circuit_Prince", "Binary_General", "Logic_Commander", 
  "Pixel_Warlord", "Voxel_Valkyrie", "Neural_Knight", "Android_Assassin", 
  "Robot_Rogue", "Mecha_Mage", "Giga_Giant", "Tera_Titan", 
  "Nano_Ninja", "Macro_Monk", "Echo_Element", "Vector_Viper"
];

const App: React.FC = () => {
  const [engine] = useState(() => new GameEngine({
    mapWidth: MAP_WIDTH,
    mapHeight: MAP_HEIGHT,
    tileSize: TILE_SIZE
  }));

  // --- STATE ---
  const [view, setView] = useState<ViewState>(ViewState.IDENTITY);
  const [playerName, setPlayerName] = useState<string>('');
  
  // Fake Server State
  const [lobbies, setLobbies] = useState<Lobby[]>([]);
  const [activeLobbyId, setActiveLobbyId] = useState<string | null>(null);
  
  // Game State
  const [gameStateToken, setGameStateToken] = useState(0); 
  const [selectedBuilding, setSelectedBuilding] = useState<BuildingType | null>(null);
  const [selectedSpawnUnitType, setSelectedSpawnUnitType] = useState<UnitType | null>(null);
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);
  const [spawnCountdown, setSpawnCountdown] = useState(20);
  const [attackPercentage, setAttackPercentage] = useState(20);
  const [matchResult, setMatchResult] = useState<MatchLog | null>(null);

  // --- IDENTITY SYSTEM ---
  useEffect(() => {
      const savedName = localStorage.getItem('castlefront_player_name');
      if (savedName) {
          setPlayerName(savedName);
          setView(ViewState.MATCHMAKING);
      }
  }, []);

  const handleNameSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      if (playerName.trim().length > 0) {
          localStorage.setItem('castlefront_player_name', playerName.trim());
          setView(ViewState.MATCHMAKING);
      }
  };

  // --- FAKE SERVER: LOBBY & MATCHMAKING LOGIC ---
  useEffect(() => {
      // Runs every 1 second to simulate server ticks
      const interval = setInterval(() => {
          const now = Date.now();
          setLobbies(prevLobbies => {
              let updatedLobbies = [...prevLobbies];

              // 1. Clean up old/started lobbies
              updatedLobbies = updatedLobbies.filter(l => l.status !== 'IN_PROGRESS' || l.id === activeLobbyId);

              // 2. Continuous Lobby Generation
              const waitingLobbies = updatedLobbies.filter(l => l.status === 'WAITING');
              if (waitingLobbies.length === 0) {
                  const newLobby: Lobby = {
                      id: Math.random().toString(36).substr(2, 6).toUpperCase(),
                      mapName: `Fractal Isles ${Math.floor(Math.random() * 100)}`,
                      maxPlayers: 20, // Increased max players for more AI
                      players: [],
                      createdAt: now,
                      expiresAt: now + 40000, // 40s wait
                      status: 'WAITING'
                  };
                  updatedLobbies.push(newLobby);
              }

              // 3. Update Timers & Status
              updatedLobbies = updatedLobbies.map(lobby => {
                  if (lobby.status === 'WAITING') {
                      // Check for start conditions
                      if (now >= lobby.expiresAt || lobby.players.length >= lobby.maxPlayers) {
                          return { ...lobby, status: 'STARTING' };
                      }
                  }
                  return lobby;
              });
              
              return updatedLobbies;
          });
      }, 1000);
      return () => clearInterval(interval);
  }, [activeLobbyId]);

  // Handle auto-starting game when my lobby starts
  useEffect(() => {
      if (activeLobbyId) {
          const lobby = lobbies.find(l => l.id === activeLobbyId);
          if (lobby && lobby.status === 'STARTING') {
             startGameFromLobby(lobby);
          }
      }
  }, [lobbies, activeLobbyId]);

  const joinLobby = (lobbyId: string) => {
      setLobbies(prev => prev.map(l => {
          if (l.id === lobbyId && l.status === 'WAITING' && l.players.length < l.maxPlayers) {
              // Add me
              return {
                  ...l,
                  players: [...l.players, {
                      id: PLAYER_ID,
                      name: playerName,
                      isAI: false,
                      color: PLAYER_COLORS[0]
                  }]
              };
          }
          return l;
      }));
      setActiveLobbyId(lobbyId);
      setView(ViewState.LOBBY);
  };

  const startGameFromLobby = (lobby: Lobby) => {
      // 1. Mark lobby as in progress locally (server would do this)
      setLobbies(prev => prev.map(l => l.id === lobby.id ? {...l, status: 'IN_PROGRESS'} : l));

      // 2. Fill with Bots
      const roster: PlayerProfile[] = [...lobby.players];
      const humansCount = roster.length;
      const botsNeeded = lobby.maxPlayers - humansCount;
      
      const shuffledNames = [...AI_NAMES].sort(() => 0.5 - Math.random());

      for(let i=0; i<botsNeeded; i++) {
          roster.push({
              id: `BOT_${i}`,
              name: shuffledNames[i % shuffledNames.length],
              isAI: true,
              color: PLAYER_COLORS[(humansCount + i) % PLAYER_COLORS.length]
          });
      }

      // 3. Initialize Engine
      engine.init(roster);

      // 4. Transition UI
      setSpawnCountdown(20);
      setView(ViewState.GAME_PLACEMENT);
  };

  const handleExitGame = () => {
      engine.isGameActive = false;
      setActiveLobbyId(null);
      setMatchResult(null);
      setView(ViewState.MATCHMAKING);
  };

  // --- GAMEPLAY LOGIC ---
  
  // Spawn Timer
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (view === ViewState.GAME_PLACEMENT) {
        interval = setInterval(() => {
            setSpawnCountdown(prev => {
                if (prev <= 1) {
                    engine.spawnHumanRandomly(PLAYER_ID);
                    engine.startMatch();
                    setView(ViewState.GAME_PLAYING);
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
    }
    return () => clearInterval(interval);
  }, [view, engine]);

  // Game Loop
  useEffect(() => {
    if (view === ViewState.GAME_PLAYING || view === ViewState.GAME_PLACEMENT) {
      const interval = setInterval(() => {
        engine.update(100);
        
        if (engine.winnerId) {
            handleGameEnd(engine.winnerId);
        }

        setGameStateToken(prev => prev + 1);
      }, 100);
      return () => clearInterval(interval);
    }
  }, [engine, view]);

  const handleGameEnd = (winnerId: string) => {
      const winner = engine.players.find(p => p.id === winnerId);
      const lobby = lobbies.find(l => l.id === activeLobbyId);
      
      // Log Match
      const log: MatchLog = {
          matchId: activeLobbyId || 'unknown',
          mapName: lobby ? lobby.mapName : 'Unknown Map',
          winnerName: winner ? winner.name : 'Unknown',
          totalPlayers: engine.players.length,
          timestamp: Date.now()
      };
      
      // Send to "Server" (Console for now)
      console.log("MATCH COMPLETED:", log);
      setMatchResult(log);
      
      // Cleanup
      setActiveLobbyId(null);
      setView(ViewState.RESULTS);
  };

  // --- INPUT HANDLERS ---

  const handleTileSelect = (x: number, y: number) => {
      if (view === ViewState.GAME_PLACEMENT) {
          const success = engine.spawnHumanBase(PLAYER_ID, x, y);
          if (success) {
              engine.startMatch();
              setView(ViewState.GAME_PLAYING);
          }
      } else if (view === ViewState.GAME_PLAYING) {
          if (selectedUnitId) {
              engine.moveUnit(PLAYER_ID, selectedUnitId, x, y);
              setSelectedUnitId(null); 
          } else {
              engine.distributeExpansion(PLAYER_ID, x, y, attackPercentage);
          }
      }
  };

  const handleSpawnUnitAt = (x: number, y: number) => {
      if (!selectedSpawnUnitType) return;
      if (engine.canSpawnUnit(PLAYER_ID, selectedSpawnUnitType, x, y)) {
          engine.spawnUnit(PLAYER_ID, selectedSpawnUnitType, x, y);
          setSelectedSpawnUnitType(null);
      }
  };

  const handleUnitSelect = (unitId: string | null) => {
      if (view !== ViewState.GAME_PLAYING) return;
      setSelectedUnitId(unitId);
      if (unitId) {
          setSelectedBuilding(null);
          setSelectedSpawnUnitType(null);
      }
  };

  const handleBuildSelect = (type: BuildingType) => {
      if (view !== ViewState.GAME_PLAYING) return;
      setSelectedBuilding(type);
      setSelectedSpawnUnitType(null);
      setSelectedUnitId(null);
  }

  const handlePlaceBuilding = (x: number, y: number) => {
    if (view !== ViewState.GAME_PLAYING) return;
    if (selectedBuilding) {
      if (engine.canBuild(PLAYER_ID, selectedBuilding, x, y)) {
        engine.placeBuilding(PLAYER_ID, selectedBuilding, x, y);
        setSelectedBuilding(null);
      }
    }
  };

  const handleUnitSpawnToggle = (type: UnitType) => {
      if (view !== ViewState.GAME_PLAYING) return;
      if (selectedSpawnUnitType === type) {
          setSelectedSpawnUnitType(null);
      } else {
          setSelectedSpawnUnitType(type);
          setSelectedBuilding(null);
          setSelectedUnitId(null);
      }
  };

  const currentPlayer = engine.players.find(p => p.id === PLAYER_ID);

  // --- RENDER ---

  if (view === ViewState.IDENTITY) {
      return (
          <div className="flex items-center justify-center h-screen w-screen bg-gray-900 text-white">
             <form onSubmit={handleNameSubmit} className="bg-gray-800 p-8 rounded-lg shadow-xl border border-gray-700 text-center">
                 <h1 className="text-4xl font-bold mb-6 text-blue-500">CastleFront</h1>
                 <label className="block text-left mb-2 text-gray-400">Enter Player Name</label>
                 <input 
                    type="text" 
                    maxLength={15}
                    value={playerName}
                    onChange={(e) => setPlayerName(e.target.value)}
                    className="w-full bg-gray-700 text-white p-3 rounded mb-6 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Commander Name"
                 />
                 <button 
                    type="submit"
                    className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded transition-all"
                 >
                     Enter Barracks
                 </button>
             </form>
          </div>
      );
  }

  if (view === ViewState.MATCHMAKING) {
      return (
          <div className="flex flex-col h-screen w-screen bg-gray-900 text-white p-4">
              <header className="flex justify-between items-center mb-8 border-b border-gray-700 pb-4">
                  <h1 className="text-3xl font-bold text-blue-500">Matchmaking</h1>
                  <div className="text-gray-400">Logged in as: <span className="text-white font-bold">{playerName}</span></div>
              </header>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {lobbies.filter(l => l.status === 'WAITING').map(lobby => {
                      const timeLeft = Math.max(0, Math.floor((lobby.expiresAt - Date.now()) / 1000));
                      return (
                          <div key={lobby.id} onClick={() => joinLobby(lobby.id)} className="bg-gray-800 hover:bg-gray-700 cursor-pointer p-6 rounded-lg border border-gray-700 transition-all transform hover:scale-105">
                              <div className="flex justify-between mb-2">
                                  <span className="font-bold text-xl text-yellow-500">{lobby.mapName}</span>
                                  <span className="text-sm bg-blue-900 px-2 py-1 rounded">ID: {lobby.id}</span>
                              </div>
                              <div className="flex justify-between items-center mt-4">
                                  <div className="text-gray-300">
                                      Players: <span className="font-bold text-white">{lobby.players.length} / {lobby.maxPlayers}</span>
                                  </div>
                                  <div className={`font-mono font-bold text-lg ${timeLeft < 10 ? 'text-red-500' : 'text-green-500'}`}>
                                      00:{timeLeft < 10 ? `0${timeLeft}` : timeLeft}
                                  </div>
                              </div>
                          </div>
                      );
                  })}
              </div>
          </div>
      );
  }

  if (view === ViewState.LOBBY) {
      const activeLobby = lobbies.find(l => l.id === activeLobbyId);
      if (!activeLobby) return <div>Lobby Error</div>; // Should not happen
      
      const timeLeft = Math.max(0, Math.floor((activeLobby.expiresAt - Date.now()) / 1000));

      return (
          <div className="flex items-center justify-center h-screen w-screen bg-gray-900 text-white">
              <div className="bg-gray-800 p-8 rounded-lg shadow-2xl border-2 border-blue-500 w-full max-w-2xl">
                  <h2 className="text-3xl font-bold mb-2 text-center">{activeLobby.mapName}</h2>
                  <div className="text-center mb-6 text-gray-400">Lobby ID: {activeLobby.id}</div>
                  
                  <div className="bg-gray-900 p-4 rounded mb-6 h-64 overflow-y-auto">
                      <h3 className="text-gray-500 text-sm uppercase mb-2">Roster ({activeLobby.players.length}/{activeLobby.maxPlayers})</h3>
                      {activeLobby.players.map((p, idx) => (
                          <div key={idx} className="flex items-center py-2 border-b border-gray-800">
                              <div className="w-3 h-3 rounded-full mr-3" style={{backgroundColor: p.color}}></div>
                              <span className="font-bold">{p.name}</span>
                          </div>
                      ))}
                      {[...Array(activeLobby.maxPlayers - activeLobby.players.length)].map((_, idx) => (
                           <div key={`empty-${idx}`} className="flex items-center py-2 border-b border-gray-800 opacity-30">
                              <div className="w-3 h-3 rounded-full mr-3 bg-gray-600"></div>
                              <span className="italic">Searching...</span>
                           </div>
                      ))}
                  </div>

                  <div className="text-center">
                      <div className="text-sm text-gray-400 mb-1">Game Starts In</div>
                      <div className="text-5xl font-mono text-yellow-400">
                          {activeLobby.status === 'STARTING' ? 'LAUNCHING...' : `00:${timeLeft < 10 ? `0${timeLeft}` : timeLeft}`}
                      </div>
                  </div>
              </div>
          </div>
      );
  }
  
  if (view === ViewState.RESULTS) {
       return (
          <div className="flex items-center justify-center h-screen w-screen bg-gray-900 text-white">
            <div className="bg-gray-800 p-8 rounded-xl border-4 border-yellow-500 text-center shadow-2xl max-w-lg w-full">
              <h1 className="text-6xl font-bold mb-4">
                {matchResult?.winnerName === playerName ? <span className="text-green-500">VICTORY!</span> : <span className="text-red-500">DEFEAT</span>}
              </h1>
              <p className="text-xl text-gray-300 mb-8">
                 Winner: <span className="font-bold text-white">{matchResult?.winnerName}</span>
              </p>
              
              <div className="bg-gray-700 p-4 rounded mb-8 text-left text-sm">
                  <div><span className="text-gray-400">Map:</span> {matchResult?.mapName}</div>
                  <div><span className="text-gray-400">Total Players:</span> {matchResult?.totalPlayers}</div>
                  <div><span className="text-gray-400">Match ID:</span> {matchResult?.matchId}</div>
              </div>

              <button 
                onClick={() => setView(ViewState.MATCHMAKING)}
                className="w-full px-6 py-3 bg-blue-600 hover:bg-blue-500 rounded text-white font-bold text-lg transition-transform transform hover:scale-105"
              >
                Return to Lobby
              </button>
            </div>
          </div>
       );
  }

  // GAME VIEW (Placement or Playing)
  return (
    <div className="relative w-screen h-screen overflow-hidden bg-black">
      <GameCanvas 
        engine={engine} 
        playerId={PLAYER_ID}
        selectedBuildingType={selectedBuilding}
        onSelectTile={handleTileSelect}
        onPlaceBuilding={handlePlaceBuilding}
        selectedUnitId={selectedUnitId}
        onSelectUnit={handleUnitSelect}
        selectedSpawnUnitType={selectedSpawnUnitType}
        onSpawnUnitAt={handleSpawnUnitAt}
      />
      
      {view === ViewState.GAME_PLACEMENT && (
          <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-start pt-20 bg-black bg-opacity-30">
              <div className="bg-gray-800 p-6 rounded-lg shadow-2xl border-2 border-blue-500 pointer-events-auto text-center">
                  <h2 className="text-2xl text-white font-bold mb-2">Choose Your Starting Location</h2>
                  <p className="text-gray-300 mb-4">Tap on any valid empty land to place your castle.</p>
                  <div className="text-4xl font-mono text-yellow-400 mb-2">
                      00:{spawnCountdown < 10 ? `0${spawnCountdown}` : spawnCountdown}
                  </div>
              </div>
          </div>
      )}

      {view === ViewState.GAME_PLAYING && (
        <UIOverlay 
            player={currentPlayer}
            onBuildSelect={handleBuildSelect}
            onUnitSpawn={handleUnitSpawnToggle}
            selectedBuilding={selectedBuilding}
            selectedSpawnUnitType={selectedSpawnUnitType}
            attackPercentage={attackPercentage}
            setAttackPercentage={setAttackPercentage}
            onExit={handleExitGame}
        />
      )}
    </div>
  );
};

export default App;