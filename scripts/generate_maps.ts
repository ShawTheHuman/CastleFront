
import { v4 as uuidv4 } from 'uuid';
import { dbSaveMap } from '../server/db.ts';
import type { MapData } from '../server/db.ts';
import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';

// Manual DB setup for script execution context
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
const { Pool } = pg;

const FINAL_WIDTH = 512;
const FINAL_HEIGHT = 512;

// Tile Types
interface SimpleTile {
    x: number;
    y: number;
    type: 'LAND' | 'WATER';
    elevation: number;
}

// --- NOISE HELPERS (Standalone Perlin Implementation) ---
class FastNoise {
    p: number[] = [];
    constructor(seed: number = Math.random()) {
        this.p = new Array(512);
        const permutation = new Array(256);
        for (let i = 0; i < 256; i++) permutation[i] = i;

        // Shuffle
        for (let i = 255; i > 0; i--) {
            const r = Math.floor((seed * (i + 1) * 123.456) % (i + 1));
            [permutation[i], permutation[r]] = [permutation[r], permutation[i]];
            // mix seed
            seed = Math.sin(seed) * 10000;
            seed -= Math.floor(seed);
        }

        for (let i = 0; i < 512; i++) {
            this.p[i] = permutation[i % 256];
        }
    }

    fade(t: number) { return t * t * t * (t * (t * 6 - 15) + 10); }
    lerp(t: number, a: number, b: number) { return a + t * (b - a); }
    grad(hash: number, x: number, y: number, z: number) {
        const h = hash & 15;
        const u = h < 8 ? x : y;
        const v = h < 4 ? y : h === 12 || h === 14 ? x : z;
        return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
    }

    noise(x: number, y: number, z: number) {
        const X = Math.floor(x) & 255;
        const Y = Math.floor(y) & 255;
        const Z = Math.floor(z) & 255;

        x -= Math.floor(x);
        y -= Math.floor(y);
        z -= Math.floor(z);

        const u = this.fade(x);
        const v = this.fade(y);
        const w = this.fade(z);

        const A = this.p[X] + Y, AA = this.p[A] + Z, AB = this.p[A + 1] + Z;
        const B = this.p[X + 1] + Y, BA = this.p[B] + Z, BB = this.p[B + 1] + Z;

        return this.lerp(w, this.lerp(v, this.lerp(u, this.grad(this.p[AA], x, y, z),
            this.grad(this.p[BA], x - 1, y, z)),
            this.lerp(u, this.grad(this.p[AB], x, y - 1, z),
                this.grad(this.p[BB], x - 1, y - 1, z))),
            this.lerp(v, this.lerp(u, this.grad(this.p[AA + 1], x, y, z - 1),
                this.grad(this.p[BA + 1], x - 1, y, z - 1)),
                this.lerp(u, this.grad(this.p[AB + 1], x, y - 1, z - 1),
                    this.grad(this.p[BB + 1], x - 1, y - 1, z - 1))));
    }
}

// FBM Helper
function fbm(noise: FastNoise, x: number, y: number, octaves: number, persistence: number, lacunarity: number) {
    let total = 0;
    let amplitude = 1;
    let frequency = 1;
    let maxValue = 0;  // Used for normalizing result to 0.0 - 1.0
    for (let i = 0; i < octaves; i++) {
        total += noise.noise(x * frequency, y * frequency, 0) * amplitude;
        maxValue += amplitude;
        amplitude *= persistence;
        frequency *= lacunarity;
    }
    return (total / maxValue) + 0.5; // Shift to 0-1 range roughly
}

// --- GENERATOR ---

// 1 = LAND, 0 = WATER
function generateMap(style: 'ARCHIPELAGO' | 'PANGEA' | 'RIVERS' | 'ISLANDS'): number[] {
    const tiles: number[] = []; // Flat array [type, elev, type, elev...]
    const noise = new FastNoise(Math.random());
    const detailNoise = new FastNoise(Math.random() + 1);

    for (let y = 0; y < FINAL_HEIGHT; y++) {
        for (let x = 0; x < FINAL_WIDTH; x++) {
            const nx = x / FINAL_WIDTH;
            const ny = y / FINAL_HEIGHT;

            // FBM for main terrain
            let scale = 4;
            if (style === 'PANGEA') scale = 2;
            if (style === 'ARCHIPELAGO') scale = 8;
            if (style === 'ISLANDS') scale = 5;

            let elevation = fbm(noise, nx * scale, ny * scale, 6, 0.5, 2.0);

            // Shape Masks
            const dx = nx - 0.5;
            const dy = ny - 0.5;
            const dist = Math.sqrt(dx * dx + dy * dy) * 2;

            if (style === 'PANGEA') {
                elevation -= dist * 0.5;
            } else if (style === 'ISLANDS') {
                elevation -= dist * 0.3;
            }

            // Rivers logic
            if (style === 'RIVERS') {
                const rVal = Math.abs(noise.noise(nx * 10, ny * 10, 0));
                if (rVal < 0.05) elevation -= 0.3;
            }

            // Detail pass
            const detail = fbm(detailNoise, nx * 20, ny * 20, 2, 0.5, 2.0) * 0.1;
            elevation += detail;

            // Normalize
            elevation = Math.max(0, Math.min(1, elevation));

            const isLand = elevation > 0.45;
            let landHeight = 0;
            if (isLand) {
                landHeight = Math.floor(((elevation - 0.45) / 0.55) * 15) + 1;
                landHeight = Math.max(1, Math.min(15, landHeight));
            }

            // Push Type (1/0) and Elevation
            tiles.push(isLand ? 1 : 0);
            tiles.push(landHeight);
        }
    }
    return tiles;
}

async function clearExistingMaps(pool: pg.Pool) {
    console.log("Ensuring maps table exists...");
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
    console.log("Clearing existing maps...");
    await pool.query('DELETE FROM maps');
    console.log("Maps table cleared.");
}

async function run() {
    console.log("Starting Advanced Map Generation...");

    // Setup direct pool for clearing
    const pool = new Pool({
        connectionString: process.env.NETLIFY_DATABASE_URL,
        ssl: {
            rejectUnauthorized: false
        }
    });

    await pool.connect();
    await clearExistingMaps(pool);

    const styles = ['PANGEA', 'ARCHIPELAGO', 'ISLANDS', 'RIVERS'] as const;

    for (let i = 0; i < 4; i++) { // Generate 4 high quality maps
        const style = styles[i % styles.length];
        const name = `${style} Region ${i + 1}`;
        console.log(`Generating ${name} (${FINAL_WIDTH}x${FINAL_HEIGHT})...`);

        const tiles = generateMap(style);

        const mapData: MapData = {
            id: uuidv4(),
            name: name,
            width: FINAL_WIDTH,
            height: FINAL_HEIGHT,
            tiles: tiles
        };

        // Use the db module for consistency
        await dbSaveMap(mapData);
    }

    console.log("Done! Generated 4 maps.");
    process.exit(0);
}

run();
