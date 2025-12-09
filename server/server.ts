import express from 'express';
import { createServer } from 'http';
import { Server, Socket } from 'socket.io';
import { v4 as uuidv4 } from 'uuid';
import { dbSavePlayer, dbCreateGame, dbUpdateGameStatus, dbGetRandomMap, dbSaveSnapshot } from './db.ts';

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
    maxHttpBufferSize: 1e8, // 100 MB
    cors: {
        origin: "*", // Allow all origins for dev
        methods: ["GET", "POST"]
    }
});

const PORT = 3002;

import { PlayerProfile, Lobby, AIType } from '../types.ts';

// --- TYPES ---
interface ServerPlayer extends PlayerProfile {
    socketId: string;
    lobbyId: string | null;
}

interface ServerLobby extends Omit<Lobby, 'players'> {
    hostId: string;
    players: ServerPlayer[];
}

// --- STATE ---
const players: Record<string, ServerPlayer> = {}; // Mapped by socket.id
const lobbies: Record<string, ServerLobby> = {};
const lobbyMaps: Record<string, any> = {}; // Store map data for lobbies

// --- LOGIC ---

io.on('connection', (socket: Socket) => {
    console.log(`Client connected: ${socket.id}`);

    // 1. REGISTER PLAYER
    socket.on('register', (name: string) => {
        const pid = uuidv4();
        const pname = name || `Commander-${socket.id.substr(0, 4)}`;

        // Persist to DB
        dbSavePlayer(pid, pname);

        players[socket.id] = {
            id: pid,
            name: pname,
            isAI: false,
            aiType: 'HUMAN' as any, // Cast to AIType
            color: ['#ef4444', '#3b82f6', '#22c5e', '#eab308', '#a855f7'][Math.floor(Math.random() * 5)], // Random persistent color
            socketId: socket.id,
            lobbyId: null
        };
        socket.emit('registered', players[socket.id]);
        socket.emit('lobbies_update', Object.values(lobbies));
    });

    // 2. CREATE LOBBY
    socket.on('create_lobby', async (mapName: string) => {
        const player = players[socket.id];
        if (!player) return;

        const lobbyId = uuidv4().substr(0, 6).toUpperCase();

        // Fetch Random Map
        let map = await dbGetRandomMap();
        if (!map) {
            map = { id: 'default', name: 'Unknown Lands', tiles: [] };
        }
        const mName = map.name;

        // Persist Game
        dbCreateGame(lobbyId, mName, 'WAITING');

        const newLobby: ServerLobby = {
            id: lobbyId,
            hostId: player.id,
            mapId: map.id,
            mapName: mName,
            players: [player],
            maxPlayers: 8,
            status: 'WAITING',
            createdAt: Date.now(),
            expiresAt: Date.now() + 60000
        };

        lobbies[lobbyId] = newLobby;
        lobbyMaps[lobbyId] = map;
        player.lobbyId = lobbyId;

        socket.join(lobbyId); // Socket.io room
        io.emit('lobbies_update', Object.values(lobbies)); // Broadcast to all
        io.to(lobbyId).emit('lobby_state', newLobby);
    });

    // 3. JOIN LOBBY
    socket.on('join_lobby', (lobbyId: string) => {
        const player = players[socket.id];
        const lobby = lobbies[lobbyId];

        if (!player || player.lobbyId || !lobby) return;
        if (lobby.status !== 'WAITING') return;
        if (lobby.players.length >= lobby.maxPlayers) return;

        // If this is a server-generated lobby, assign first joiner as host
        if (lobby.hostId === 'SERVER') {
            lobby.hostId = player.id;
        }

        lobby.players.push(player);
        player.lobbyId = lobbyId;

        socket.join(lobbyId);
        io.emit('lobbies_update', Object.values(lobbies));
        io.to(lobbyId).emit('lobby_state', lobby);
    });

    // 4. LEAVE LOBBY
    socket.on('leave_lobby', () => {
        handlePlayerDisconnect(socket);
    });

    // 5. START GAME
    socket.on('start_game', () => {
        console.log(`Received start_game request from ${socket.id}`);
        const player = players[socket.id];
        if (!player) {
            console.log(`Player not found for socket ${socket.id}`);
            return;
        }
        if (!player.lobbyId) {
            console.log(`Player ${player.name} is not in a lobby`);
            return;
        }

        const lobby = lobbies[player.lobbyId];
        if (!lobby) {
            console.log(`Lobby ${player.lobbyId} not found`);
            return;
        }

        // console.log(`Start Game Request - Player: ${player.id}, Host: ${lobby.hostId}, Lobby Status: ${lobby.status}`);

        if (lobby.hostId === player.id) {
            lobby.status = 'IN_PROGRESS';

            // Persist Update
            dbUpdateGameStatus(lobby.id, 'IN_PROGRESS');

            io.emit('lobbies_update', Object.values(lobbies));
            io.to(lobby.id).emit('game_start', {
                lobby,
                mapData: lobbyMaps[lobby.id]
            });
            console.log(`Game started for lobby ${lobby.id}`);
        } else {
            console.log(`Player ${player.id} is not host of lobby ${lobby.id} (Host: ${lobby.hostId})`);
        }
    });

    // 6. SAVE SNAPSHOT
    socket.on('save_snapshot', (data: { lobbyId: string, tick: number, state: any }) => {
        if (data.lobbyId && data.state) {
            import('./db.ts').then(db => {
                db.dbSaveSnapshot(data.lobbyId, data.tick, data.state);
            });
        }
    });

    // DISCONNECT
    socket.on('disconnect', () => {
        console.log(`Client disconnected: ${socket.id}`);
        handlePlayerDisconnect(socket);
    });
});

// --- HELPER FUNC ---
function handlePlayerDisconnect(socket: Socket) {
    const player = players[socket.id];
    if (player && player.lobbyId) {
        const lobby = lobbies[player.lobbyId];
        if (lobby) {
            lobby.players = lobby.players.filter(p => p.id !== player.id);
            socket.leave(player.lobbyId);

            // If lobby empty, maybe close it? Or Keep for auto-regen logic?
            // If empty and NOT static server lobby, delete.
            // But for now, let's just delete empty lobbies to keep list clean,
            // and let auto-regen create new ones.
            if (lobby.players.length === 0) {
                delete lobbies[lobby.id];
            } else {
                if (lobby.hostId === player.id) {
                    lobby.hostId = lobby.players[0].id; // Assign new host
                }
                io.to(lobby.id).emit('lobby_state', lobby);
            }
            io.emit('lobbies_update', Object.values(lobbies));
        }
    }
    delete players[socket.id];
}

// --- SERVER LOOP ---
setInterval(async () => {
    // Ensure at least one WAITING lobby exists
    const waitingLobbies = Object.values(lobbies).filter(l => l.status === 'WAITING');
    if (waitingLobbies.length === 0) {
        const lobbyId = uuidv4().substr(0, 6).toUpperCase();

        // Fetch Random Map
        let map = await dbGetRandomMap();
        if (!map) {
            // Fallback if DB empty
            map = { id: 'default', name: 'Unknown Lands', tiles: [] };
        }

        const mName = map.name;

        dbCreateGame(lobbyId, mName, 'WAITING');

        const newLobby: ServerLobby = {
            id: lobbyId,
            hostId: 'SERVER',
            mapId: map.id,
            mapName: mName,
            players: [],
            maxPlayers: 40,
            status: 'WAITING',
            createdAt: Date.now(),
            expiresAt: Date.now() + 60000 // 60s countdown
        };
        lobbies[lobbyId] = newLobby;
        lobbyMaps[lobbyId] = map; // Store data

        io.emit('lobbies_update', Object.values(lobbies));
        console.log(`Auto-created lobby: ${lobbyId} with map: ${mName}`);
    }
}, 5000);

httpServer.listen(PORT, () => {
    console.log(`Socket.io server running on port ${PORT}`);
});
