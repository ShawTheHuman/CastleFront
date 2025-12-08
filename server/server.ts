import express from 'express';
import { createServer } from 'http';
import { Server, Socket } from 'socket.io';
import { v4 as uuidv4 } from 'uuid';

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: {
        origin: "*", // Allow all origins for dev
        methods: ["GET", "POST"]
    }
});

const PORT = 3002;

// --- TYPES ---
interface Player {
    id: string;
    name: string;
    socketId: string;
    lobbyId: string | null;
}

interface Lobby {
    id: string;
    hostId: string;
    mapName: string;
    players: Player[];
    maxPlayers: number;
    status: 'WAITING' | 'STARTING' | 'IN_PROGRESS';
    createdAt: number;
}

// --- STATE ---
const players: Record<string, Player> = {}; // Mapped by socket.id
const lobbies: Record<string, Lobby> = {};

// --- LOGIC ---

io.on('connection', (socket: Socket) => {
    console.log(`Client connected: ${socket.id}`);

    // 1. REGISTER PLAYER
    socket.on('register', (name: string) => {
        players[socket.id] = {
            id: uuidv4(),
            name: name || `Commander-${socket.id.substr(0, 4)}`,
            socketId: socket.id,
            lobbyId: null
        };
        socket.emit('registered', players[socket.id]);
        socket.emit('lobbies_update', Object.values(lobbies));
    });

    // 2. CREATE LOBBY
    socket.on('create_lobby', (mapName: string) => {
        const player = players[socket.id];
        if (!player || player.lobbyId) return;

        const lobbyId = uuidv4().substr(0, 6).toUpperCase();
        const newLobby: Lobby = {
            id: lobbyId,
            hostId: player.id,
            mapName: mapName || 'Fractal Valley',
            players: [player],
            maxPlayers: 8,
            status: 'WAITING',
            createdAt: Date.now()
        };

        lobbies[lobbyId] = newLobby;
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
        const player = players[socket.id];
        if (!player || !player.lobbyId) return;

        const lobby = lobbies[player.lobbyId];
        if (lobby && lobby.hostId === player.id) {
            lobby.status = 'IN_PROGRESS';
            io.emit('lobbies_update', Object.values(lobbies));
            io.to(lobby.id).emit('game_start', { lobby });
        }
    });

    // DISCONNECT
    socket.on('disconnect', () => {
        console.log(`Client disconnected: ${socket.id}`);
        handlePlayerDisconnect(socket);
        delete players[socket.id];
    });
});

function handlePlayerDisconnect(socket: Socket) {
    const player = players[socket.id];
    if (!player || !player.lobbyId) return;

    const lobbyId = player.lobbyId;
    const lobby = lobbies[lobbyId];

    if (lobby) {
        // Remove player
        lobby.players = lobby.players.filter(p => p.id !== player.id);
        player.lobbyId = null;
        socket.leave(lobbyId);

        if (lobby.players.length === 0) {
            // Close lobby if empty
            delete lobbies[lobbyId];
            io.emit('lobbies_update', Object.values(lobbies));
        } else {
            // If host left, assign new host
            if (lobby.hostId === player.id) {
                lobby.hostId = lobby.players[0].id;
            }
            io.to(lobbyId).emit('lobby_state', lobby);
            io.emit('lobbies_update', Object.values(lobbies));
        }
    }
}

httpServer.listen(PORT, () => {
    console.log(`Socket.io server running on port ${PORT}`);
});
