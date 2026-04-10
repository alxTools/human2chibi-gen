import mysql from 'mysql2/promise';
import express from 'express';
import cors from 'cors';

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

let pool;
function getPool() {
  if (!pool) {
    pool = mysql.createPool({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASS,
      database: process.env.DB_NAME,
      port: Number(process.env.DB_PORT) || 3306,
      waitForConnections: true,
      connectionLimit: 5,
    });
  }
  return pool;
}

// ── Projects ──

app.get('/api/projects', async (_req, res) => {
  try {
    const [rows] = await getPool().query('SELECT * FROM projects ORDER BY updated_at DESC');
    res.json(rows.map(dbToProject));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/projects/:id', async (req, res) => {
  try {
    const p = req.body;
    p.updatedAt = Date.now();
    await getPool().query(
      `INSERT INTO projects (id, name, created_at, updated_at, original_photo, model, character_tag, versions, story_nodes, audio_analysis)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         name=VALUES(name), updated_at=VALUES(updated_at), original_photo=VALUES(original_photo),
         model=VALUES(model), character_tag=VALUES(character_tag), versions=VALUES(versions),
         story_nodes=VALUES(story_nodes), audio_analysis=VALUES(audio_analysis)`,
      [p.id, p.name || '', p.createdAt, p.updatedAt, p.originalPhoto || '',
       p.model || '', p.characterTag || null,
       JSON.stringify(p.versions || []), JSON.stringify(p.storyNodes || []),
       p.audioAnalysis ? JSON.stringify(p.audioAnalysis) : null]
    );
    res.json(p);
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

app.delete('/api/projects/:id', async (req, res) => {
  try {
    await getPool().query('DELETE FROM projects WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Characters ──

app.get('/api/characters', async (_req, res) => {
  try {
    const [rows] = await getPool().query('SELECT * FROM characters_ ORDER BY created_at DESC');
    res.json(rows.map(dbToCharacter));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/characters/:tag', async (req, res) => {
  try {
    const c = req.body;
    await getPool().query(
      `INSERT INTO characters_ (tag, name, image, project_id, created_at)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE name=VALUES(name), image=VALUES(image), project_id=VALUES(project_id)`,
      [c.tag, c.name, c.image, c.projectId || null, c.createdAt || Date.now()]
    );
    res.json(c);
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

app.delete('/api/characters/:tag', async (req, res) => {
  try {
    await getPool().query('DELETE FROM characters_ WHERE tag = ?', [req.params.tag]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Helpers ──

function dbToProject(row) {
  return {
    id: row.id, name: row.name,
    createdAt: Number(row.created_at), updatedAt: Number(row.updated_at),
    originalPhoto: row.original_photo, model: row.model, characterTag: row.character_tag,
    versions: typeof row.versions === 'string' ? JSON.parse(row.versions) : (row.versions || []),
    storyNodes: typeof row.story_nodes === 'string' ? JSON.parse(row.story_nodes) : (row.story_nodes || []),
    audioAnalysis: row.audio_analysis ? (typeof row.audio_analysis === 'string' ? JSON.parse(row.audio_analysis) : row.audio_analysis) : null,
  };
}

function dbToCharacter(row) {
  return { tag: row.tag, name: row.name, image: row.image, projectId: row.project_id, createdAt: Number(row.created_at) };
}

export default app;
