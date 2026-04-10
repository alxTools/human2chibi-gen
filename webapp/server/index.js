import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = join(__dirname, '..', 'data', 'chibi-gen.db');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// ── Ensure data dir exists ──
import { mkdirSync } from 'fs';
mkdirSync(join(__dirname, '..', 'data'), { recursive: true });

// ── SQLite ──
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');

// ── Create tables ──
db.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    original_photo TEXT,
    model TEXT DEFAULT '',
    character_tag TEXT DEFAULT NULL,
    versions TEXT NOT NULL DEFAULT '[]',
    story_nodes TEXT NOT NULL DEFAULT '[]',
    audio_analysis TEXT DEFAULT NULL
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS characters (
    tag TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    image TEXT NOT NULL,
    project_id TEXT DEFAULT NULL,
    created_at INTEGER NOT NULL
  )
`);

console.log(`SQLite DB at ${DB_PATH}`);

// ── Prepared statements (fast) ──
const stmts = {
  listProjects: db.prepare('SELECT * FROM projects ORDER BY updated_at DESC'),
  getProject: db.prepare('SELECT * FROM projects WHERE id = ?'),
  upsertProject: db.prepare(`
    INSERT INTO projects (id, name, created_at, updated_at, original_photo, model, character_tag, versions, story_nodes, audio_analysis)
    VALUES (@id, @name, @createdAt, @updatedAt, @originalPhoto, @model, @characterTag, @versions, @storyNodes, @audioAnalysis)
    ON CONFLICT(id) DO UPDATE SET
      name=excluded.name, updated_at=excluded.updated_at, original_photo=excluded.original_photo,
      model=excluded.model, character_tag=excluded.character_tag, versions=excluded.versions,
      story_nodes=excluded.story_nodes, audio_analysis=excluded.audio_analysis
  `),
  deleteProject: db.prepare('DELETE FROM projects WHERE id = ?'),
  listCharacters: db.prepare('SELECT * FROM characters ORDER BY created_at DESC'),
  getCharacter: db.prepare('SELECT * FROM characters WHERE tag = ?'),
  upsertCharacter: db.prepare(`
    INSERT INTO characters (tag, name, image, project_id, created_at)
    VALUES (@tag, @name, @image, @projectId, @createdAt)
    ON CONFLICT(tag) DO UPDATE SET name=excluded.name, image=excluded.image, project_id=excluded.project_id
  `),
  deleteCharacter: db.prepare('DELETE FROM characters WHERE tag = ?'),
};

// ── Projects CRUD ──

app.get('/api/projects', (_req, res) => {
  res.json(stmts.listProjects.all().map(dbToProject));
});

app.get('/api/projects/:id', (req, res) => {
  const row = stmts.getProject.get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json(dbToProject(row));
});

app.put('/api/projects/:id', (req, res) => {
  const p = req.body;
  p.updatedAt = Date.now();
  stmts.upsertProject.run({
    id: p.id,
    name: p.name || '',
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    originalPhoto: p.originalPhoto || '',
    model: p.model || '',
    characterTag: p.characterTag || null,
    versions: JSON.stringify(p.versions || []),
    storyNodes: JSON.stringify(p.storyNodes || []),
    audioAnalysis: p.audioAnalysis ? JSON.stringify(p.audioAnalysis) : null,
  });
  res.json(p);
});

app.delete('/api/projects/:id', (req, res) => {
  stmts.deleteProject.run(req.params.id);
  res.json({ ok: true });
});

// ── Characters CRUD ──

app.get('/api/characters', (_req, res) => {
  res.json(stmts.listCharacters.all().map(dbToCharacter));
});

app.put('/api/characters/:tag', (req, res) => {
  const c = req.body;
  stmts.upsertCharacter.run({
    tag: c.tag,
    name: c.name,
    image: c.image,
    projectId: c.projectId || null,
    createdAt: c.createdAt || Date.now(),
  });
  res.json(c);
});

app.delete('/api/characters/:tag', (req, res) => {
  stmts.deleteCharacter.run(req.params.tag);
  res.json({ ok: true });
});

// ── Helpers ──

function dbToProject(row) {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    originalPhoto: row.original_photo,
    model: row.model,
    characterTag: row.character_tag,
    versions: JSON.parse(row.versions || '[]'),
    storyNodes: JSON.parse(row.story_nodes || '[]'),
    audioAnalysis: row.audio_analysis ? JSON.parse(row.audio_analysis) : null,
  };
}

function dbToCharacter(row) {
  return {
    tag: row.tag,
    name: row.name,
    image: row.image,
    projectId: row.project_id,
    createdAt: row.created_at,
  };
}

// ── Start ──
const PORT = Number(process.env.API_PORT) || 3001;
app.listen(PORT, () => console.log(`API server on http://localhost:${PORT}`));
