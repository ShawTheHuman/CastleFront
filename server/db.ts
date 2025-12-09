import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

let pool: pg.Pool | null = null;
export let isDbConnected = false;

if (process.env.NETLIFY_DATABASE_URL) {
    pool = new Pool({
        connectionString: process.env.NETLIFY_DATABASE_URL,
        ssl: {
            rejectUnauthorized: false
        }
    });

    // Test connection
    pool.connect().then(() => {
        console.log('Connected to Neon Database');
        isDbConnected = true;
        initDB();
    }).catch(err => {
        console.error('Failed to connect to Neon Database:', err.message);
        pool = null;
    });
} else {
    console.warn('NETLIFY_DATABASE_URL not found. Running in in-memory mode.');
}

async function initDB() {
    if (!pool) return;
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS players (
                id UUID PRIMARY KEY,
                name TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT NOW(),
                last_seen TIMESTAMP DEFAULT NOW()
            );
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS games (
                id TEXT PRIMARY KEY,
                map_name TEXT NOT NULL,
                status TEXT NOT NULL,
                winner_id UUID REFERENCES players(id),
                created_at TIMESTAMP DEFAULT NOW(),
                ended_at TIMESTAMP
            );
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS snapshots (
                id SERIAL PRIMARY KEY,
                game_id TEXT REFERENCES games(id),
                tick INTEGER,
                state JSONB,
                created_at TIMESTAMP DEFAULT NOW()
            );
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS maps (
                id UUID PRIMARY KEY,
                name TEXT NOT NULL,
                width INTEGER NOT NULL,
                height INTEGER NOT NULL,
                tiles JSONB NOT NULL,
                created_at TIMESTAMP DEFAULT NOW()
            );
        `);

        console.log('Database tables initialized.');
    } catch (err: any) {
        console.error('Error initializing DB tables:', err.message);
    }
}

// --- DATA ACCESS METHODS ---

export async function dbSaveSnapshot(gameId: string, tick: number, state: any) {
    if (!pool) return;
    try {
        await pool.query(`
            INSERT INTO snapshots (game_id, tick, state)
            VALUES ($1, $2, $3)
        `, [gameId, tick, JSON.stringify(state)]);
    } catch (err: any) {
        console.error('dbSaveSnapshot error:', err.message);
    }
}

export async function dbSavePlayer(id: string, name: string) {
    if (!pool) return;
    try {
        await pool.query(`
            INSERT INTO players (id, name, last_seen)
            VALUES ($1, $2, NOW())
            ON CONFLICT (id) DO UPDATE SET last_seen = NOW(), name = $2
        `, [id, name]);
    } catch (err: any) {
        console.error('dbSavePlayer error:', err.message);
    }
}

export async function dbGetPlayer(id: string) {
    if (!pool) return null;
    try {
        const res = await pool.query(`SELECT * FROM players WHERE id = $1`, [id]);
        return res.rows[0] || null;
    } catch (err: any) {
        console.error('dbGetPlayer error:', err.message);
        return null;
    }
}

export async function dbCreateGame(id: string, mapName: string, status: string) {
    if (!pool) return;
    try {
        await pool.query(`
            INSERT INTO games (id, map_name, status)
            VALUES ($1, $2, $3)
            ON CONFLICT (id) DO NOTHING
        `, [id, mapName, status]);
    } catch (err: any) {
        console.error('dbCreateGame error:', err.message);
    }
}

export async function dbUpdateGameStatus(id: string, status: string, winnerId: string | null = null) {
    if (!pool) return;
    try {
        if (winnerId) {
            await pool.query(`UPDATE games SET status = $1, winner_id = $2, ended_at = NOW() WHERE id = $3`, [status, winnerId, id]);
        } else {
            await pool.query(`UPDATE games SET status = $1 WHERE id = $2`, [status, id]);
        }
    } catch (err: any) {
        console.error('dbUpdateGameStatus error:', err.message);
    }
}

// --- MAP PERSISTENCE ---

export interface MapData {
    id: string;
    name: string;
    width: number;
    height: number;
    tiles: any[]; // JSON serialized tiles
}

export async function dbSaveMap(map: MapData) {
    if (!pool) return;
    try {
        await pool.query(`
            INSERT INTO maps (id, name, width, height, tiles)
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (id) DO NOTHING
        `, [map.id, map.name, map.width, map.height, JSON.stringify(map.tiles)]);
        console.log(`Saved map: ${map.name}`);
    } catch (err: any) {
        console.error('dbSaveMap error:', err.message);
    }
}

export async function dbGetRandomMap() {
    if (!pool) return null;
    try {
        const res = await pool.query(`SELECT * FROM maps ORDER BY RANDOM() LIMIT 1`);
        if (res.rows.length > 0) {
            return res.rows[0]; // { id, name, tiles, ... }
        }
        return null;
    } catch (err: any) {
        console.error('dbGetRandomMap error:', err.message);
        return null;
    }
}
