import React, { useEffect, useState, useRef } from 'react';
import { GameEngine } from './game/GameEngine';
import { GameCanvas } from './components/GameCanvas';
import { UIOverlay } from './components/UIOverlay';
import { MAP_HEIGHT, MAP_WIDTH, TILE_SIZE, PLAYER_COLORS } from './constants';
import { BuildingType, UnitType, Lobby, PlayerProfile, MatchLog } from './types';
import './index.css'; // Ensure base styles are loaded

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
        setLobbies(prev => prev.map(l => l.id === lobby.id ? { ...l, status: 'IN_PROGRESS' } : l));

        // 2. Fill with Bots
        const roster: PlayerProfile[] = [...lobby.players];
        const humansCount = roster.length;
        const botsNeeded = lobby.maxPlayers - humansCount;

        const shuffledNames = [...AI_NAMES].sort(() => 0.5 - Math.random());

        for (let i = 0; i < botsNeeded; i++) {
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
                setGameStateToken(prev => prev + 1); // Trigger re-render for UI
                if (engine.isGameOver) {
                    setMatchResult(engine.getMatchLog());
                    setView(ViewState.RESULTS);
                }
            }, 100); // Update every 100ms
            return () => clearInterval(interval);
        }
    }, [view, engine]);

    // Game Interaction Handlers
    const handleTileSelect = (x: number, y: number) => {
        // If we have a building or unit selected to place/spawn, those handlers take precedence 
        // (but they are triggered by separate callbacks from GameCanvas usually, 
        //  wait, GameCanvas calls onPlaceBuilding etc if they are selected.
        //  BUT logic in GameCanvas `handleClick`:
        //  PRIORITY 1: Place Building
        //  PRIORITY 2: Select Unit
        //  PRIORITY 3: Normal Tile Select

        // So this function is ONLY called if we are NOT building or selecting a unit.
        // Thus, this is the "Expansion/Attack" click.

        engine.distributeExpansion(PLAYER_ID, x, y, attackPercentage);
        setGameStateToken(prev => prev + 1);
    };

    const handlePlaceBuilding = (x: number, y: number) => {
        if (selectedBuilding) {
            engine.placeBuilding(PLAYER_ID, selectedBuilding, x, y);
            setSelectedBuilding(null); // Clear selection after placing
            setGameStateToken(prev => prev + 1);
        }
    };

    const handleUnitSelect = (unitId: string | null) => {
        setSelectedUnitId(unitId);
    };

    const handleSpawnUnitAt = (x: number, y: number) => {
        if (selectedSpawnUnitType) {
            engine.spawnUnit(PLAYER_ID, selectedSpawnUnitType, x, y);
            setSelectedSpawnUnitType(null); // Clear selection after spawning
            setGameStateToken(prev => prev + 1);
        }
    };

    const handleBuildSelect = (buildingType: BuildingType | null) => {
        setSelectedBuilding(buildingType);
        setSelectedSpawnUnitType(null); // Clear unit spawn selection
    };

    const handleUnitSpawnToggle = (unitType: UnitType | null) => {
        setSelectedSpawnUnitType(unitType);
        setSelectedBuilding(null); // Clear building selection
    };

    const currentPlayer = engine.getPlayer(PLAYER_ID);
    const gameResult = matchResult?.winnerId === PLAYER_ID ? 'VICTORY' : 'DEFEAT';

    // --- COMPONENT RENDER ---

    // 1. IDENTITY VIEW
    if (view === ViewState.IDENTITY) {
        return (
            <div className="w-full h-screen flex items-center justify-center bg-[#0c0a09] relative overflow-hidden">
                {/* Background Animation */}
                <div className="absolute inset-0 z-0 opacity-40">
                    <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-amber-900/40 via-[#1c1917] to-black"></div>
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-amber-600/10 rounded-full blur-[100px]"></div>
                </div>

                <div className="glass-panel p-12 rounded-lg w-full max-w-md z-10 transform transition-all duration-700 hover:scale-105 border-medieval bg-[#1c1917]">
                    <div className="mx-auto w-24 h-24 mb-6 bg-amber-900/20 rounded-full flex items-center justify-center border border-amber-600/40 shadow-[0_0_30px_rgba(245,158,11,0.2)]">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                        </svg>
                    </div>

                    <h1 className="text-5xl font-black text-center mb-2 font-display tracking-tight text-transparent bg-clip-text bg-gradient-to-b from-amber-200 to-amber-600 drop-shadow-md">
                        CASTLEFRONT
                    </h1>
                    <p className="text-center text-amber-700 mb-8 font-serif italic text-lg opacity-80">War of the Eight Kingdoms</p>

                    <form onSubmit={handleNameSubmit} className="space-y-6">
                        <div className="group relative">
                            <input
                                type="text"
                                maxLength={12}
                                value={playerName}
                                onChange={(e) => setPlayerName(e.target.value)}
                                className="w-full bg-[#0c0a09] border border-amber-900/50 text-center text-2xl text-amber-100 py-4 rounded-lg focus:outline-none focus:border-amber-500 transition-all font-display tracking-wider placeholder-amber-900/50 group-hover:bg-[#292524]"
                                placeholder="Your Grace"
                            />
                        </div>

                        <button
                            type="submit"
                            disabled={!playerName.trim()}
                            className="w-full lord-button text-amber-100 font-bold py-4 rounded-lg shadow-lg flex items-center justify-center gap-2 group border-medieval"
                        >
                            <span className="font-display text-xl tracking-widest uppercase">Enter Realm</span>
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5 group-hover:translate-x-1 transition-transform text-amber-200">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                            </svg>
                        </button>
                    </form>
                </div>

                <div className="absolute bottom-4 text-amber-900/40 text-xs font-serif italic">
                    MCDLXXXIV // REALM: UNDISCOVERED
                </div>
            </div>
        );
    }

    // 2. MATCHMAKING VIEW (LOBBY LIST)
    if (view === ViewState.MATCHMAKING) {
        return (
            <div className="w-full h-screen bg-[#0c0a09] overflow-hidden flex flex-col items-center pt-10 relative">
                {/* Background Elements */}
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_var(--tw-gradient-stops))] from-amber-900/20 via-[#1c1917] to-black -z-10"></div>
                <div className="absolute top-0 w-full h-px bg-gradient-to-r from-transparent via-amber-700 to-transparent opacity-50"></div>

                {/* Header */}
                <div className="w-full max-w-5xl flex justify-between items-center mb-8 px-4">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-amber-600 to-red-800 border-2 border-amber-500/30 shadow-lg flex items-center justify-center">
                            <span className="font-bold text-amber-100 text-xl font-display">{playerName.substring(0, 1)}</span>
                        </div>
                        <div>
                            <div className="text-xs text-amber-600 tracking-widest uppercase font-bold">Realm Active</div>
                            <div className="text-2xl text-amber-100 font-display font-bold">{playerName}</div>
                        </div>
                    </div>
                    <div className="flex gap-4">
                        <div className="px-4 py-1 rounded bg-amber-900/20 border border-amber-600/30 text-amber-500 text-xs font-serif italic flex items-center gap-2">
                            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse shadow-[0_0_10px_rgba(34,197,94,0.5)]"></div>
                            Scouting nearby lands...
                        </div>
                    </div>
                </div>

                {/* Lobby Grid */}
                <div className="w-full max-w-5xl grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 px-4 pb-20 overflow-y-auto custom-scrollbar h-full">
                    {/* Create Card */}
                    <button
                        onClick={() => {
                            const newId = Math.random().toString(36).substring(7).toUpperCase();
                            const newLobby = { id: newId, mapName: 'Highlands', players: [{ id: PLAYER_ID, name: playerName, isAI: false, color: PLAYER_COLORS[0] }], maxPlayers: 8, createdAt: Date.now(), expiresAt: Date.now(), status: 'WAITING' } as Lobby;
                            setLobbies([newLobby, ...lobbies]);
                            setActiveLobbyId(newLobby.id);
                            setView(ViewState.LOBBY);
                        }}
                        className="group relative h-48 rounded-lg border-2 border-dashed border-amber-900/30 hover:border-amber-500/50 hover:bg-amber-900/10 transition-all flex flex-col items-center justify-center gap-4"
                    >
                        <div className="w-16 h-16 rounded-full bg-amber-900/20 group-hover:bg-amber-700 group-hover:shadow-[0_0_30px_rgba(180,83,9,0.4)] transition-all flex items-center justify-center">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-8 h-8 text-amber-700 group-hover:text-amber-100">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                            </svg>
                        </div>
                        <span className="text-amber-700 font-display text-lg font-bold tracking-wider group-hover:text-amber-100 transition-colors uppercase">Found New Kingdom</span>
                    </button>

                    {/* Lobby Cards */}
                    {lobbies.map(lobby => (
                        <div key={lobby.id} className="glass-panel p-6 rounded-lg relative group hover:translate-y-[-3px] transition-all duration-300 bg-[#1c1917]">
                            <div className="flex justify-between items-start mb-4">
                                <div className="text-xs text-amber-600 font-bold tracking-widest uppercase">PROVINCE {lobby.id}</div>
                                <div className={`px-2 py-0.5 rounded text-[10px] font-bold border ${lobby.status === 'WAITING' ? 'bg-green-900/20 text-green-400 border-green-800' : 'bg-red-900/20 text-red-400 border-red-800'}`}>
                                    {lobby.status === 'WAITING' ? 'GATHERING' : 'AT WAR'}
                                </div>
                            </div>

                            <h3 className="text-2xl font-bold text-amber-100 mb-1 font-display">{lobby.mapName}</h3>
                            <p className="text-sm text-stone-500 mb-6 font-serif italic">Lord: <span className="text-amber-500">COMMANDER_X</span></p>

                            <div className="flex justify-between items-end">
                                <div className="flex -space-x-2">
                                    {lobby.players.map((p, i) => (
                                        <div key={i} className="w-8 h-8 rounded-full bg-stone-800 border border-stone-950 flex items-center justify-center text-xs text-amber-100 z-10 shadow-lg" title={p.name}>
                                            {p.name.charAt(0)}
                                        </div>
                                    ))}
                                    {Array.from({ length: Math.max(0, 3 - lobby.players.length) }).map((_, i) => (
                                        <div key={`e-${i}`} className="w-8 h-8 rounded-full bg-stone-900/50 border border-dashed border-stone-700 block"></div>
                                    ))}
                                </div>
                                <button
                                    onClick={() => joinLobby(lobby.id)}
                                    disabled={lobby.status !== 'WAITING'}
                                    className="px-6 py-2 bg-stone-800 hover:bg-amber-800 text-amber-100 rounded text-sm font-bold border border-amber-700/30 hover:border-amber-500 transition-all font-display tracking-wider disabled:opacity-50 disabled:cursor-not-allowed shadow-md"
                                >
                                    JOIN WAR
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    // 3. LOBBY VIEW (WAITING ROOM)
    if (view === ViewState.LOBBY) {
        const currentLobby = lobbies.find(l => l.id === activeLobbyId);
        if (!currentLobby) return null;

        return (
            <div className="w-full h-screen bg-[#0c0a09] flex items-center justify-center p-4 relative overflow-hidden">
                {/* Grid Background */}
                <div className="absolute inset-0 bg-[repeating-linear-gradient(45deg,#1c1917_25%,transparent_25%,transparent_75%,#1c1917_75%,#1c1917),repeating-linear-gradient(45deg,#1c1917_25%,#0c0a09_25%,#0c0a09_75%,#1c1917_75%,#1c1917)] bg-[length:40px_40px] opacity-10"></div>

                <div className="glass-panel w-full max-w-4xl min-h-[500px] rounded-lg p-10 relative flex flex-col border-medieval bg-[#1c1917]">
                    <div className="flex justify-between items-center mb-8 border-b border-amber-900/30 pb-6">
                        <div>
                            <h2 className="text-4xl font-black text-amber-100 font-display mb-1 drop-shadow-lg">WAR ROOM</h2>
                            <p className="text-amber-700 text-sm tracking-[0.2em] font-serif uppercase">Province: {activeLobbyId} // The Highlands</p>
                        </div>
                        <div className="text-right">
                            <div className="text-[10px] text-stone-500 uppercase font-bold mb-1">State</div>
                            <div className="text-2xl font-serif text-green-500 italic">Gathering Armies...</div>
                        </div>
                    </div>

                    <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-8">
                        {/* Player List */}
                        <div className="space-y-4">
                            <h3 className="text-sm font-bold text-stone-500 uppercase tracking-widest mb-4 border-b border-stone-800 pb-2">Noble Lords</h3>
                            <div className="flex items-center gap-4 bg-[#292524] p-4 rounded border border-amber-900/20 hover:border-amber-700/50 transition-colors shadow-inner">
                                <div className="w-12 h-12 bg-amber-800 rounded flex items-center justify-center font-bold text-xl text-amber-100 shadow-md border border-amber-600/30 font-display">
                                    {playerName.charAt(0)}
                                </div>
                                <div>
                                    <div className="font-bold text-amber-100 font-display text-lg tracking-wide">{playerName}</div>
                                    <div className="text-xs text-amber-600 font-serif italic">Human Lord</div>
                                </div>
                            </div>
                        </div>

                        {/* Launch Controls */}
                        <div className="flex flex-col justify-end items-center bg-black/20 rounded p-6 border border-amber-900/20">
                            <div className="mb-auto w-full text-center py-8">
                                <div className="text-6xl font-black text-stone-800 font-display tracking-tighter drop-shadow-sm">
                                    00:00
                                </div>
                                <div className="text-xs text-stone-600 font-serif italic mt-2">BATTLE COMMENCES IN...</div>
                            </div>

                            <div className="w-full space-y-3">
                                <button
                                    onClick={() => startGameFromLobby(currentLobby)}
                                    className="w-full py-4 lord-button text-amber-100 font-bold rounded shadow-lg font-display text-xl tracking-widest uppercase border border-amber-500/30"
                                >
                                    Sound the Horns
                                </button>

                                <button
                                    onClick={() => setView(ViewState.MATCHMAKING)}
                                    className="w-full py-3 bg-red-900/10 hover:bg-red-900/20 text-red-800 rounded border border-red-900/20 transition-colors text-sm font-bold font-serif uppercase tracking-widest"
                                >
                                    Retreat
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // 4. GAME PLACEMENT / SPAWN SELECTION
    if (view === ViewState.GAME_PLACEMENT) {
        return (
            <div className="w-full h-screen bg-[#0c0a09] relative">
                <GameCanvas
                    engine={engine}
                    playerId={PLAYER_ID}
                    selectedBuildingType={null}
                    selectedSpawnUnitType={null}
                    selectedUnitId={selectedUnitId}
                    onPlaceBuilding={() => { }}
                    onSpawnUnitAt={() => { }}
                    onSelectUnit={handleUnitSelect}
                    onSelectTile={(x: number, y: number) => {
                        if (engine.spawnHumanBase(PLAYER_ID, x, y)) {
                            engine.startMatch();
                            setView(ViewState.GAME_PLAYING);
                        }
                    }}
                />
                <div className="absolute top-10 left-1/2 -translate-x-1/2 glass-panel px-10 py-6 rounded-lg text-center border-medieval bg-[#1c1917]/95 shadow-2xl">
                    <h2 className="text-amber-100 font-black font-display text-3xl tracking-widest mb-2 drop-shadow-md">CLAIM THY LAND</h2>
                    <p className="text-amber-500 text-sm font-serif italic">Select a fertile province to establish your Keep</p>
                </div>
            </div>
        );
    }

    // 5. GAME PLAYING
    if (view === ViewState.GAME_PLAYING) {
        return (
            <div className="w-full h-screen bg-black relative overflow-hidden">
                <GameCanvas
                    engine={engine}
                    playerId={PLAYER_ID}
                    selectedBuildingType={selectedBuilding}
                    selectedSpawnUnitType={selectedSpawnUnitType}
                    selectedUnitId={selectedUnitId}
                    onSelectUnit={handleUnitSelect}
                    onSelectTile={handleTileSelect}
                    onPlaceBuilding={handlePlaceBuilding}
                    onSpawnUnitAt={handleSpawnUnitAt}
                />
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
            </div>
        );
    }
    // 6. RESULTS
    if (view === ViewState.RESULTS) {
        return (
            <div className="w-screen h-screen flex items-center justify-center relative overflow-hidden bg-[#0c0a09]">
                {/* Dynamic Background based on result */}
                <div className={`absolute inset-0 opacity-30 ${gameResult === 'VICTORY' ? 'bg-amber-900' : 'bg-red-950'}`}></div>

                <div className="glass-panel p-16 rounded-lg text-center z-10 max-w-lg w-full border-medieval shadow-2xl transform scale-100 bg-[#1c1917]">
                    <h1 className={`text-6xl font-black font-display mb-4 tracking-tight drop-shadow-xl ${gameResult === 'VICTORY' ? 'text-amber-400' : 'text-stone-500'}`}>
                        {gameResult === 'VICTORY' ? 'VICTORY' : 'DEFEAT'}
                    </h1>
                    <p className="text-stone-400 font-serif italic text-lg mb-10">
                        {gameResult === 'VICTORY' ? 'Your Kingdom Conquered!' : 'Your reign has ended.'}
                    </p>

                    <div className="grid grid-cols-2 gap-4 mb-10">
                        <div className="bg-black/30 p-4 rounded border border-amber-900/20">
                            <div className="text-xs text-stone-500 uppercase font-bold mb-1">Lands Conquered</div>
                            <div className="text-2xl font-bold text-amber-100 font-display">{currentPlayer?.landArea || 0}</div>
                        </div>
                        <div className="bg-black/30 p-4 rounded border border-amber-900/20">
                            <div className="text-xs text-stone-500 uppercase font-bold mb-1">Armies Raised</div>
                            <div className="text-2xl font-bold text-amber-100 font-display">{currentPlayer?.units.length || 0}</div>
                        </div>
                    </div>

                    <button
                        onClick={handleExitGame}
                        className="w-full py-4 bg-stone-200 text-stone-900 font-bold rounded hover:bg-white transition-colors font-display text-xl tracking-widest shadow-lg border border-stone-400"
                    >
                        Return to Headquarters
                    </button>
                </div>
            </div>
        );
    }

    return null;
};

export default App;