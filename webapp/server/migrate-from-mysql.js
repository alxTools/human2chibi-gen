/**
 * One-time script: pull all data from MySQL (db.artistaviral.com) into local SQLite.
 * Run: node server/migrate-from-mysql.js
 */
import 'dotenv/config';

const MYSQL_API = 'http://localhost:3001';

// We'll hit the still-running MySQL API to grab the data, then write directly to SQLite.
// But the MySQL server is gone now, so let's connect directly.

import mysql from 'mysql2/promise';
import Database from 'better-sqlite3';
import { mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = join(__dirname, '..', 'data', 'chibi-gen.db');
mkdirSync(join(__dirname, '..', 'data'), { recursive: true });

async function migrate() {
  console.log('Connecting to MySQL...');
  const pool = await mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    port: Number(process.env.DB_PORT) || 3306,
  });

  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');

  // Create tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY, name TEXT, created_at INTEGER, updated_at INTEGER,
      original_photo TEXT, model TEXT, character_tag TEXT,
      versions TEXT DEFAULT '[]', story_nodes TEXT DEFAULT '[]', audio_analysis TEXT
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS characters (
      tag TEXT PRIMARY KEY, name TEXT, image TEXT, project_id TEXT, created_at INTEGER
    )
  `);

  // Pull projects
  const [projects] = await pool.query('SELECT * FROM projects');
  console.log(`Found ${projects.length} projects in MySQL`);

  const insertProject = db.prepare(`
    INSERT OR REPLACE INTO projects (id, name, created_at, updated_at, original_photo, model, character_tag, versions, story_nodes, audio_analysis)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const p of projects) {
    insertProject.run(
      p.id, p.name, p.created_at, p.updated_at, p.original_photo,
      p.model, p.character_tag,
      typeof p.versions === 'string' ? p.versions : JSON.stringify(p.versions || []),
      typeof p.story_nodes === 'string' ? p.story_nodes : JSON.stringify(p.story_nodes || []),
      p.audio_analysis ? (typeof p.audio_analysis === 'string' ? p.audio_analysis : JSON.stringify(p.audio_analysis)) : null
    );
    console.log(`  ✓ Project: ${p.name}`);
  }

  // Pull characters
  const [characters] = await pool.query('SELECT * FROM characters_');
  console.log(`Found ${characters.length} characters in MySQL`);

  const insertChar = db.prepare(`
    INSERT OR REPLACE INTO characters (tag, name, image, project_id, created_at)
    VALUES (?, ?, ?, ?, ?)
  `);

  for (const c of characters) {
    insertChar.run(c.tag, c.name, c.image, c.project_id, c.created_at);
    console.log(`  ✓ Character: @${c.tag}`);
  }

  await pool.end();
  db.close();
  console.log(`\n=== Done! SQLite DB at ${DB_PATH} ===`);
}

migrate().catch(e => { console.error(e); process.exit(1); });
