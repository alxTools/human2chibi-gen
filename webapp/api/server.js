import { createClient } from '@libsql/client';
import express from 'express';
import cors from 'cors';

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

let db;
function getDB() {
  if (!db) {
    db = createClient({
      url: process.env.TURSO_URL,
      authToken: process.env.TURSO_TOKEN,
    });
  }
  return db;
}

// ── Bootstrap tables ──
async function ensureTables() {
  const c = getDB();
  await c.executeMultiple(`
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
    );
    CREATE TABLE IF NOT EXISTS characters (
      tag TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      image TEXT NOT NULL,
      project_id TEXT DEFAULT NULL,
      created_at INTEGER NOT NULL
    );
  `);
}

// ── Projects ──

app.get('/api/projects', async (_req, res) => {
  try {
    await ensureTables();
    const result = await getDB().execute('SELECT * FROM projects ORDER BY updated_at DESC');
    res.json(result.rows.map(dbToProject));
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

app.put('/api/projects/:id', async (req, res) => {
  try {
    await ensureTables();
    const p = req.body;
    p.updatedAt = Date.now();
    await getDB().execute({
      sql: `INSERT INTO projects (id, name, created_at, updated_at, original_photo, model, character_tag, versions, story_nodes, audio_analysis)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              name=excluded.name, updated_at=excluded.updated_at, original_photo=excluded.original_photo,
              model=excluded.model, character_tag=excluded.character_tag, versions=excluded.versions,
              story_nodes=excluded.story_nodes, audio_analysis=excluded.audio_analysis`,
      args: [p.id, p.name || '', p.createdAt, p.updatedAt, p.originalPhoto || '',
             p.model || '', p.characterTag || null,
             JSON.stringify(p.versions || []), JSON.stringify(p.storyNodes || []),
             p.audioAnalysis ? JSON.stringify(p.audioAnalysis) : null],
    });
    res.json(p);
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

app.delete('/api/projects/:id', async (req, res) => {
  try {
    await getDB().execute({ sql: 'DELETE FROM projects WHERE id = ?', args: [req.params.id] });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Characters ──

app.get('/api/characters', async (_req, res) => {
  try {
    await ensureTables();
    const result = await getDB().execute('SELECT * FROM characters ORDER BY created_at DESC');
    res.json(result.rows.map(dbToCharacter));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/characters/:tag', async (req, res) => {
  try {
    await ensureTables();
    const c = req.body;
    await getDB().execute({
      sql: `INSERT INTO characters (tag, name, image, project_id, created_at)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(tag) DO UPDATE SET name=excluded.name, image=excluded.image, project_id=excluded.project_id`,
      args: [c.tag, c.name, c.image, c.projectId || null, c.createdAt || Date.now()],
    });
    res.json(c);
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

app.delete('/api/characters/:tag', async (req, res) => {
  try {
    await getDB().execute({ sql: 'DELETE FROM characters WHERE tag = ?', args: [req.params.tag] });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Helpers ──

function dbToProject(row) {
  return {
    id: row.id, name: row.name,
    createdAt: Number(row.created_at), updatedAt: Number(row.updated_at),
    originalPhoto: row.original_photo, model: row.model, characterTag: row.character_tag,
    versions: JSON.parse(row.versions || '[]'),
    storyNodes: JSON.parse(row.story_nodes || '[]'),
    audioAnalysis: row.audio_analysis ? JSON.parse(row.audio_analysis) : null,
  };
}

function dbToCharacter(row) {
  return { tag: row.tag, name: row.name, image: row.image, projectId: row.project_id, createdAt: Number(row.created_at) };
}

export default app;
