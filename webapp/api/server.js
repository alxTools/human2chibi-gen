import { createClient } from '@libsql/client';

let _db;
function getDB() {
  if (!_db) {
    _db = createClient({
      url: process.env.TURSO_URL,
      authToken: process.env.TURSO_TOKEN,
    });
  }
  return _db;
}

let _tablesReady = false;
async function ensureTables() {
  if (_tablesReady) return;
  await getDB().executeMultiple(`
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
  _tablesReady = true;
}

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

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

async function parseBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', chunk => { data += chunk; });
    req.on('end', () => { try { resolve(JSON.parse(data)); } catch { resolve({}); } });
  });
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const url = req.url.replace(/\?.*$/, '');

  // Debug: check env vars
  if (url === '/api/debug') {
    return res.status(200).json({
      TURSO_URL: process.env.TURSO_URL ? process.env.TURSO_URL.slice(0, 30) + '...' : 'MISSING',
      TURSO_TOKEN: process.env.TURSO_TOKEN ? 'SET' : 'MISSING',
      NODE_ENV: process.env.NODE_ENV,
    });
  }

  try {
    await ensureTables();
    const db = getDB();

    // GET /api/projects
    if (req.method === 'GET' && url === '/api/projects') {
      const result = await db.execute('SELECT * FROM projects ORDER BY updated_at DESC');
      return res.status(200).json(result.rows.map(dbToProject));
    }

    // PUT /api/projects/:id
    if (req.method === 'PUT' && url.match(/^\/api\/projects\/[^/]+$/)) {
      const id = url.split('/').pop();
      const p = await parseBody(req);
      p.updatedAt = Date.now();
      await db.execute({
        sql: `INSERT INTO projects (id, name, created_at, updated_at, original_photo, model, character_tag, versions, story_nodes, audio_analysis)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT(id) DO UPDATE SET
                name=excluded.name, updated_at=excluded.updated_at, original_photo=excluded.original_photo,
                model=excluded.model, character_tag=excluded.character_tag, versions=excluded.versions,
                story_nodes=excluded.story_nodes, audio_analysis=excluded.audio_analysis`,
        args: [id, p.name || '', p.createdAt || Date.now(), p.updatedAt,
               p.originalPhoto || '', p.model || '', p.characterTag || null,
               JSON.stringify(p.versions || []), JSON.stringify(p.storyNodes || []),
               p.audioAnalysis ? JSON.stringify(p.audioAnalysis) : null],
      });
      return res.status(200).json(p);
    }

    // DELETE /api/projects/:id
    if (req.method === 'DELETE' && url.match(/^\/api\/projects\/[^/]+$/)) {
      const id = url.split('/').pop();
      await db.execute({ sql: 'DELETE FROM projects WHERE id = ?', args: [id] });
      return res.status(200).json({ ok: true });
    }

    // GET /api/characters
    if (req.method === 'GET' && url === '/api/characters') {
      const result = await db.execute('SELECT * FROM characters ORDER BY created_at DESC');
      return res.status(200).json(result.rows.map(dbToCharacter));
    }

    // PUT /api/characters/:tag
    if (req.method === 'PUT' && url.match(/^\/api\/characters\/[^/]+$/)) {
      const tag = url.split('/').pop();
      const c = await parseBody(req);
      await db.execute({
        sql: `INSERT INTO characters (tag, name, image, project_id, created_at)
              VALUES (?, ?, ?, ?, ?)
              ON CONFLICT(tag) DO UPDATE SET name=excluded.name, image=excluded.image, project_id=excluded.project_id`,
        args: [tag, c.name, c.image, c.projectId || null, c.createdAt || Date.now()],
      });
      return res.status(200).json(c);
    }

    // DELETE /api/characters/:tag
    if (req.method === 'DELETE' && url.match(/^\/api\/characters\/[^/]+$/)) {
      const tag = url.split('/').pop();
      await db.execute({ sql: 'DELETE FROM characters WHERE tag = ?', args: [tag] });
      return res.status(200).json({ ok: true });
    }

    res.status(404).json({ error: 'Not found' });
  } catch (e) {
    console.error('Handler error:', e);
    res.status(500).json({ error: e.message, stack: e.stack?.split('\n').slice(0,3) });
  }
}
