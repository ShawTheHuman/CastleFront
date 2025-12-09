
import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
const { Pool } = pg;

async function run() {
    console.log("Initializing Database Schema...");

    if (!process.env.NETLIFY_DATABASE_URL) {
        console.error("NETLIFY_DATABASE_URL is missing!");
        process.exit(1);
    }

    const pool = new Pool({
        connectionString: process.env.NETLIFY_DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    });

    try {
        await pool.connect();

        console.log("Creating 'players' table...");
        await pool.query(`
            CREATE TABLE IF NOT EXISTS players (
                id UUID PRIMARY KEY,
                name TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT NOW(),
                last_seen TIMESTAMP DEFAULT NOW()
            );
        `);

        console.log("Creating 'games' table...");
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

        // Snapshots table REMOVED

        console.log("Database Schema Initialized Successfully.");
    } catch (err: any) {
        console.error("Error initializing DB:", err.message);
    } finally {
        await pool.end();
    }
}

run();
