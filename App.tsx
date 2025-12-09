import React, { useEffect, useState, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { v4 as uuidv4 } from 'uuid';
import { GameEngine } from './game/GameEngine';
import { GameCanvas } from './components/GameCanvas';
import { UIOverlay } from './components/UIOverlay';
import { MAP_HEIGHT, MAP_WIDTH, TILE_SIZE, PLAYER_COLORS, getRandomName, CAMP_NAMES, KINGDOM_NAMES } from './constants';
import { BuildingType, UnitType, Lobby, PlayerProfile, MatchLog, ViewState } from './types';
import './index.css';

const LobbyCountdown = ({ expiresAt, onExpire }: { expiresAt: number, onExpire?: () => void }) => {
    const [timeLeft, setTimeLeft] = useState(Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000)));

    useEffect(() => {
        const interval = setInterval(() => {
            const t = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));
            setTimeLeft(t);
            if (t <= 0) {
                clearInterval(interval);
                onExpire?.();
            }
        }, 1000);
        return () => clearInterval(interval);
    }, [expiresAt]);

    const mins = Math.floor(timeLeft / 60);
    const secs = timeLeft % 60;
    return <>{`${mins < 10 ? '0' : ''}${mins}:${secs < 10 ? '0' : ''}${secs}`}</>;
};

// --- MAIN APP CONTENT ---
const AppContent = ({ engine }: { engine: GameEngine }) => {
    // --- STATE ---
    const [view, setView] = useState<ViewState>(ViewState.IDENTITY);

    const [playerName, setPlayerName] = useState<string>('');
    const [playerId, setPlayerId] = useState<string>('');
    const [lobbies, setLobbies] = useState<Lobby[]>([]);
    const [activeLobbyId, setActiveLobbyId] = useState<string | null>(null);

    // Game Client State
    const [selectedBuilding, setSelectedBuilding] = useState<BuildingType | null>(null);
    const [selectedSpawnUnitType, setSelectedSpawnUnitType] = useState<UnitType | null>(null);
    const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);
    const [attackPercentage, setAttackPercentage] = useState<number>(100);
    const [spawnCountdown, setSpawnCountdown] = useState<number>(0);
    const [matchResult, setMatchResult] = useState<MatchLog | null>(null);
    const [gameStateToken, setGameStateToken] = useState<number>(0); // Force re-render

    const PLAYER_ID = playerId || playerName; // Use UUID if available!

    // Ref for ActiveLobbyId to avoid socket re-init
    const activeLobbyIdRef = useRef<string | null>(null);
    const playerNameRef = useRef<string>('');

    // Sync Ref
    useEffect(() => {
        activeLobbyIdRef.current = activeLobbyId;
    }, [activeLobbyId]);

    // Sync Player Name Ref
    useEffect(() => {
        playerNameRef.current = playerName;
    }, [playerName]);

    const handleExitGame = () => {
        engine.isGameActive = false;
        setView(ViewState.LOBBY);
        socketRef.current?.emit('leave_game');
    };

    // Socket Ref
    const socketRef = useRef<any | null>(null);

    // Initialize Socket
    useEffect(() => {
        // Connect to real server
        const newSocket = io('http://localhost:3002');
        socketRef.current = newSocket;

        if (newSocket) {
            newSocket.on('connect', () => {
                console.log('Connected to Game Server');
                // Auto-register if we have a name (Reconnection Logic)
                if (playerNameRef.current) {
                    console.log('Auto-registering on reconnect:', playerNameRef.current);
                    newSocket.emit('register', playerNameRef.current);
                }
            });

            newSocket.on('lobbies_update', (list: Lobby[]) => {
                setLobbies(list);
            });

            newSocket.on('lobby_state', (lobby: Lobby) => {
                // ...
            });

            newSocket.on('registered', (player: PlayerProfile) => {
                console.log('Registered with Server. ID:', player.id);
                setPlayerId(player.id);
            });

            newSocket.on('game_start', (data: { lobby: Lobby, mapData: any }) => {
                console.log('CLIENT RECEIVED game_start!', data);
                // Use Ref to check if this is our lobby
                if (data.lobby.id === activeLobbyIdRef.current) {
                    console.log('Lobby ID Matches! Starting game...');
                    startGameFromLobby(data.lobby, data.mapData);
                } else {
                    console.warn('Lobby ID Mismatch in game_start:', data.lobby.id, 'vs', activeLobbyIdRef.current);
                }
            });
        }

        return () => {
            // newSocket.disconnect();
        };
    }, []); // STABLE SOCKET: No dependencies, runs once.

    // ... Identity Logic ...
    // Update Identity to REGISTER with server
    const handleNameSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (playerName.trim().length > 0) {
            localStorage.setItem('castlefront_player_name', playerName.trim());
            socketRef.current?.emit('register', playerName.trim()); // Register with DB
            setView(ViewState.MATCHMAKING);
        }
    };

    // Auto-register if name exists
    /*
    useEffect(() => {
        const savedName = localStorage.getItem('castlefront_player_name');
        if (savedName) {
            setPlayerName(savedName);
            // Ensure socket is ready implies we need to wait / checking ref.
            if (socketRef.current) {
                socketRef.current.emit('register', savedName);
                setView(ViewState.MATCHMAKING);
            } else {
                // Retry or wait. Simplest is to just register when socket connects if name exists.
            }
        }
    }, [socketRef.current]); 
    */

    // --- LOBBY ACTIONS ---
    const createLobby = () => {
        // socketRef.current?.emit('create_lobby', 'Fractal Valley');
        // Actually user wanted "Found New Kingdom" removed.
        // But if I strictly removed it, how do we create games?
        // The server auto-creates them in my previous logic!
        // The "Found New Kingdom" button was removed from UI, but the logic might still be needed if invalid?
        // Wait, the SERVER logic I wrote has `socket.on('create_lobby')` but DOES IT AUTO GENERATE?
        // My previous server code `App.tsx` (fake server) had auto-generation.
        // My REAL server `server.ts` DOES NOT have auto-generation loop properly implemented yet!
        // I need to update `server.ts` to auto-generate lobbies if I want that behavior.
        // OR I can let the client create one if none exist?
        // The user said "display only games that are actively accepting players".
        // And "Found New Kingdom" button was removed. 
        // So the SERVER must be responsible for creating lobbies.
        // I should stick to Client impl here. Client just joins.
    };

    const joinLobby = (lobbyId: string) => {
        socketRef.current?.emit('join_lobby', lobbyId);
        setActiveLobbyId(lobbyId);
        setView(ViewState.LOBBY);
    };

    const startGameFromLobby = (lobby: Lobby, mapData?: any) => {
        if (!engine) return;

        // Re-init engine with players
        console.log("Starting match with map:", mapData?.name || "Procedural");

        // Add Bots
        const roster = [...lobby.players];
        // Add 30 Camps
        for (let i = 0; i < 30; i++) {
            roster.push({
                id: `CAMP_${i} `,
                name: getRandomName(CAMP_NAMES),
                isAI: true,
                aiType: 'CAMP' as any,
                color: '#57534e'
            });
        }
        // Add Kingdoms
        const kingdomsNeeded = Math.min(8, lobby.maxPlayers - roster.length);
        for (let i = 0; i < kingdomsNeeded; i++) {
            roster.push({
                id: `KINGDOM_${i} `,
                name: KINGDOM_NAMES[i % KINGDOM_NAMES.length],
                isAI: true,
                aiType: 'KINGDOM' as any,
                color: PLAYER_COLORS[(roster.length) % PLAYER_COLORS.length]
            });
        }

        engine.init(roster, mapData);
        setSpawnCountdown(20);
        setView(ViewState.GAME_PLACEMENT);
    };

    // ... Gameplay Loop with SNAPSHOT ...
    // 2. GAME PLAYING LOOP (LOGIC ONLY)
    useEffect(() => {
        if (view === ViewState.GAME_PLAYING) {
            const interval = setInterval(() => {
                engine.update(100);
                // setGameStateToken(p => p + 1); // REMOVED: No longer forcing App re-render

                // Auto-Save Snapshot
                if (engine.tickCount % 100 === 0 && activeLobbyId) {
                    const snapshot = {
                        players: engine.players.map(p => ({ id: p.id, pop: p.population, mil: p.militaryPopulation })),
                    };
                    socketRef.current?.emit('save_snapshot', {
                        lobbyId: activeLobbyId,
                        tick: engine.tickCount,
                        state: snapshot
                    });
                }

                if (engine.isGameOver) {
                    setMatchResult(engine.getMatchLog());
                    setView(ViewState.RESULTS);
                }
            }, 100);
            return () => clearInterval(interval);
        }
    }, [view, engine, activeLobbyId]);

    // ... (skipping to render) ...



    // ... Rest of the file ...

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

    // 1. IDENTITY VIEW (ENTER NAME)
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
                    {/* Lobby Cards */}
                    {lobbies.filter(l => l.status === 'WAITING').map(lobby => {
                        const timeLeft = Math.max(0, Math.ceil((lobby.expiresAt - Date.now()) / 1000));
                        return (
                            <div key={lobby.id} className="glass-panel p-6 rounded-lg relative group hover:translate-y-[-3px] transition-all duration-300 bg-[#1c1917] border-2 border-amber-900/20 hover:border-amber-500/50">
                                <div className="flex justify-between items-start mb-4">
                                    <div className="text-xs text-amber-600 font-bold tracking-widest uppercase">PROVINCE {lobby.id}</div>
                                    <div className="px-2 py-0.5 rounded text-[10px] font-bold border bg-green-900/20 text-green-400 border-green-800 flex items-center gap-2">
                                        <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></div>
                                        GATHERING ARMIES
                                    </div>
                                </div>

                                <h3 className="text-3xl font-black text-amber-100 mb-1 font-display tracking-tight">{lobby.mapName}</h3>
                                <div className="flex items-center gap-2 mb-6">
                                    <div className="text-sm text-stone-500 font-serif italic">Battle commences in:</div>
                                    <div className="text-xl font-bold text-amber-500 font-display tabular-nums">
                                        <LobbyCountdown expiresAt={lobby.expiresAt} />
                                    </div>
                                </div>

                                <div className="flex justify-between items-end">
                                    <div className="flex -space-x-2">
                                        {lobby.players.map((p, i) => (
                                            <div key={i} className="w-8 h-8 rounded-full bg-stone-800 border-2 border-stone-950 flex items-center justify-center text-xs text-amber-100 z-10 shadow-lg" title={p.name}>
                                                {p.name.charAt(0)}
                                            </div>
                                        ))}
                                        {Array.from({ length: Math.max(0, 3 - lobby.players.length) }).map((_, i) => (
                                            <div key={`e - ${i} `} className="w-8 h-8 rounded-full bg-stone-900/50 border border-dashed border-stone-700 block"></div>
                                        ))}
                                    </div>
                                    <button
                                        onClick={() => joinLobby(lobby.id)}
                                        className="px-8 py-3 bg-amber-700 hover:bg-amber-600 text-white rounded text-sm font-bold border border-amber-500 shadow-[0_4px_14px_rgba(245,158,11,0.4)] transition-all font-display tracking-wider hover:scale-105 active:scale-95"
                                    >
                                        ENTER WAR
                                    </button>
                                </div>

                                {/* Progress Bar for Timer */}
                                <div className="absolute bottom-0 left-0 h-1 bg-amber-900/50 w-full rounded-b-lg overflow-hidden">
                                    <div
                                        className="h-full bg-amber-500 transition-all duration-1000 ease-linear"
                                        style={{ width: `${(timeLeft / 40) * 100}% ` }}
                                    ></div>
                                </div>
                            </div>
                        )
                    })}
                </div>
            </div >
        );
    }

    // 3. LOBBY VIEW (WAITING ROOM)
    if (view === ViewState.LOBBY) {
        const currentLobby = lobbies.find(l => l.id === activeLobbyId);
        if (!currentLobby) return null;

        const timeLeft = Math.max(0, Math.ceil((currentLobby.expiresAt - Date.now()) / 1000));
        const formatTime = (s: number) => {
            const mins = Math.floor(s / 60);
            const secs = s % 60;
            return `${mins < 10 ? '0' : ''}${mins}:${secs < 10 ? '0' : ''}${secs} `;
        };

        return (
            <div className="w-full h-screen bg-[#0c0a09] flex items-center justify-center p-4 relative overflow-hidden">
                {/* Grid Background */}
                <div className="absolute inset-0 bg-[repeating-linear-gradient(45deg,#1c1917_25%,transparent_25%,transparent_75%,#1c1917_75%,#1c1917),repeating-linear-gradient(45deg,#1c1917_25%,#0c0a09_25%,#0c0a09_75%,#1c1917_75%,#1c1917)] bg-[length:40px_40px] opacity-10"></div>

                <div className="glass-panel w-full max-w-4xl min-h-[500px] rounded-lg p-10 relative flex flex-col border-medieval bg-[#1c1917]">
                    <div className="flex justify-between items-center mb-8 border-b border-amber-900/30 pb-6">
                        <div>
                            <h2 className="text-4xl font-black text-amber-100 font-display mb-1 drop-shadow-lg">WAR ROOM</h2>
                            <p className="text-amber-700 text-sm tracking-[0.2em] font-serif uppercase">Province: {activeLobbyId} // The Highlands</p>
                            <p className="text-xs text-stone-600">DEBUG: Host={currentLobby.hostId} | Me={PLAYER_ID} | Match={currentLobby.hostId === PLAYER_ID ? 'YES' : 'NO'}</p>
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
                                    <LobbyCountdown expiresAt={currentLobby.expiresAt} />
                                </div>
                                <div className="text-xs text-stone-600 font-serif italic mt-2">BATTLE COMMENCES IN...</div>
                            </div>

                            <div className="w-full space-y-3">
                                <button
                                    onClick={() => {
                                        console.log('CLICKED SOUND HORNS. Socket:', socketRef.current?.id);
                                        socketRef.current?.emit('start_game');
                                    }}
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

                            setGameStateToken(uuidv4()); // Force re-render
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
                    width={MAP_WIDTH * TILE_SIZE}
                    height={MAP_HEIGHT * TILE_SIZE}
                    tileSize={TILE_SIZE}
                    currentPlayerId={PLAYER_ID}
                    selectedBuildingType={selectedBuilding}
                    onSelectTile={handleTileSelect}
                    onPlaceBuilding={handlePlaceBuilding}
                    onSpawnUnitAt={handleSpawnUnitAt}
                />
                <UIOverlay
                    engine={engine}
                    playerId={PLAYER_ID}
                    selectedBuilding={selectedBuilding}
                    onBuildSelect={handleBuildSelect}
                    selectedSpawnUnitType={selectedSpawnUnitType}
                    onUnitSpawnToggle={handleUnitSpawnToggle}
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
                <div className={`absolute inset - 0 opacity - 30 ${gameResult === 'VICTORY' ? 'bg-amber-900' : 'bg-red-950'} `}></div>

                <div className="glass-panel p-16 rounded-lg text-center z-10 max-w-lg w-full border-medieval shadow-2xl transform scale-100 bg-[#1c1917]">
                    <h1 className={`text - 6xl font - black font - display mb - 4 tracking - tight drop - shadow - xl ${gameResult === 'VICTORY' ? 'text-amber-400' : 'text-stone-500'} `}>
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

const App = () => {
    const [engine] = useState(() => {
        try {
            return new GameEngine({
                mapWidth: MAP_WIDTH,
                mapHeight: MAP_HEIGHT,
                tileSize: TILE_SIZE
            });
        } catch (e) {
            console.error("Engine Init Failed:", e);
            return null;
        }
    });

    if (!engine) {
        return <div className="text-white text-4xl p-10">GAME ENGINE CRASHED ON INIT. CHECK CONSOLE.</div>;
    }

    return <AppContent engine={engine} />;
};

export default App;