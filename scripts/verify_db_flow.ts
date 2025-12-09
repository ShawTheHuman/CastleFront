import { io } from 'socket.io-client';
import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const SOCKET_URL = 'http://localhost:3002';
const { Pool } = pg;

async function runTest() {
    console.log('Starting DB Flow Verification...');

    // 1. Setup DB Connection
    const pool = new Pool({
        connectionString: process.env.NETLIFY_DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    });

    try {
        // Clear previous test data (optional, or just verify NEW data)
        // Let's just verify new data.

        // 2. Connect Socket Client
        const socket = io(SOCKET_URL);

        await new Promise<void>((resolve, reject) => {
            socket.on('connect', () => {
                console.log('Socket Connected');

                // 3. Register
                socket.emit('register', 'NodeTester');
            });

            socket.on('lobbies_update', (lobbies: any[]) => {
                const pending = lobbies.find(l => l.status === 'WAITING');
                if (pending) {
                    console.log(`Joining lobby ${pending.id}`);
                    socket.emit('join_lobby', pending.id);
                }
            });

            socket.on('lobby_state', (lobby: any) => {
                if (lobby.players.find((p: any) => p.name === 'NodeTester')) {
                    // We are in!
                    console.log('Joined Lobby. Waiting for simulated start...');

                    // Simulate Start (Host can start)
                    // If we are host, start.
                    if (lobby.hostId === lobby.players[0].id) { // simplistic check, logic is complicated
                        console.log('Attempting to start game...');
                        socket.emit('start_game');
                    }
                }
            });

            socket.on('game_start', (data: any) => {
                console.log('Game Started! Sending Snapshot...');

                // 4. Send Snapshot
                const mockSnapshot = { test: true, timestamp: Date.now() };
                socket.emit('save_snapshot', {
                    lobbyId: data.lobby.id,
                    tick: 100,
                    state: mockSnapshot
                });

                // Wait a bit for DB save then check
                setTimeout(async () => {
                    console.log('Checking DB for snapshot...');
                    const res = await pool.query('SELECT * FROM snapshots WHERE game_id = $1', [data.lobby.id]);

                    if (res.rows.length > 0) {
                        console.log('✅ SUCCESS: Snapshot found in DB for game', data.lobby.id);
                        const row = res.rows[0];
                        console.log('Snapshot data:', row.state);
                    } else {
                        console.error('❌ FAILURE: No snapshot found in DB');
                    }

                    socket.disconnect();
                    resolve();
                }, 2000);
            });

            // Timeout safety
            setTimeout(() => {
                console.log('Test timed out waiting for game start/snapshot.');
                socket.disconnect();
                resolve();
            }, 10000);
        });

    } catch (err) {
        console.error('Test Failed:', err);
    } finally {
        await pool.end();
        process.exit();
    }
}

runTest();
