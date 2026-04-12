// Turso HTTP API — no native deps, works in any serverless runtime
const TURSO_URL = (process.env.TURSO_URL || process.env.VITE_TURSO_URL)?.replace(/^libsql:\/\//, 'https://');
const TURSO_TOKEN = process.env.TURSO_TOKEN || process.env.VITE_TURSO_TOKEN;

if (!TURSO_URL || !TURSO_TOKEN) {
  console.error('TURSO_URL or TURSO_TOKEN missing from environment variables');
}

async function sql(statements) {
  // statements: array of { q: string, params: array }
  const requests = statements.map(s => ({
    type: 'execute',
    stmt: {
      sql: s.q,
      args: (s.params || []).map(v =>
        v === null ? { type: 'null' }
        : typeof v === 'number' ? { type: 'integer', value: String(v) }
        : { type: 'text', value: String(v) }
      ),
    },
  }));

  const res = await fetch(`${TURSO_URL}/v2/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TURSO_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ requests }),
  });
  if (!res.ok) throw new Error(`Turso HTTP ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.results;
}

async function query(q, params = []) {
  const results = await sql([{ q, params }]);
  const r = results[0];
  if (r.type === 'error') throw new Error(r.error.message);
  const cols = r.response.result.cols.map(c => c.name);
  return r.response.result.rows.map(row =>
    Object.fromEntries(cols.map((c, i) => [c, row[i]?.value ?? null]))
  );
}

async function exec(q, params = []) {
  const results = await sql([{ q, params }]);
  const r = results[0];
  if (r.type === 'error') throw new Error(r.error.message);
  return r;
}

// Tables already exist (created during migration) — no need to create on every request

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
  return new Promise(resolve => {
    let data = '';
    req.on('data', chunk => { data += chunk; });
    req.on('end', () => { try { resolve(JSON.parse(data)); } catch { resolve({}); } });
  });
}

// Ensure tables exist
async function ensureTables() {
  await exec(`
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
  await exec(`
    CREATE TABLE IF NOT EXISTS characters (
      tag TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      image TEXT NOT NULL,
      project_id TEXT DEFAULT NULL,
      created_at INTEGER NOT NULL
    )
  `);
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  await ensureTables().catch(e => console.error('Table init error:', e));

  const url = req.url.replace(/\?.*$/, '');

  if (url === '/api/debug') {
    return res.status(200).json({
      TURSO_URL: TURSO_URL ? TURSO_URL.slice(0, 40) + '...' : 'MISSING',
      TURSO_TOKEN: TURSO_TOKEN ? 'SET' : 'MISSING',
    });
  }

  try {

    // GET /api/projects
    if (req.method === 'GET' && url === '/api/projects') {
      const rows = await query('SELECT * FROM projects ORDER BY updated_at DESC');
      return res.status(200).json(rows.map(dbToProject));
    }

    // PUT /api/projects/:id
    if (req.method === 'PUT' && url.match(/^\/api\/projects\/[^/]+$/)) {
      const id = url.split('/').pop();
      const p = await parseBody(req);
      p.updatedAt = Date.now();
      await exec(
        `INSERT INTO projects (id,name,created_at,updated_at,original_photo,model,character_tag,versions,story_nodes,audio_analysis)
         VALUES (?,?,?,?,?,?,?,?,?,?)
         ON CONFLICT(id) DO UPDATE SET
           name=excluded.name,updated_at=excluded.updated_at,original_photo=excluded.original_photo,
           model=excluded.model,character_tag=excluded.character_tag,versions=excluded.versions,
           story_nodes=excluded.story_nodes,audio_analysis=excluded.audio_analysis`,
        [id, p.name||'', p.createdAt||Date.now(), p.updatedAt,
         p.originalPhoto||'', p.model||'', p.characterTag||null,
         JSON.stringify(p.versions||[]), JSON.stringify(p.storyNodes||[]),
         p.audioAnalysis ? JSON.stringify(p.audioAnalysis) : null]
      );
      return res.status(200).json(p);
    }

    // DELETE /api/projects/:id
    if (req.method === 'DELETE' && url.match(/^\/api\/projects\/[^/]+$/)) {
      await exec('DELETE FROM projects WHERE id=?', [url.split('/').pop()]);
      return res.status(200).json({ ok: true });
    }

    // GET /api/characters
    if (req.method === 'GET' && url === '/api/characters') {
      const rows = await query('SELECT * FROM characters ORDER BY created_at DESC');
      return res.status(200).json(rows.map(dbToCharacter));
    }

    // PUT /api/characters/:tag
    if (req.method === 'PUT' && url.match(/^\/api\/characters\/[^/]+$/)) {
      const tag = url.split('/').pop();
      const c = await parseBody(req);
      await exec(
        `INSERT INTO characters (tag,name,image,project_id,created_at)
         VALUES (?,?,?,?,?)
         ON CONFLICT(tag) DO UPDATE SET name=excluded.name,image=excluded.image,project_id=excluded.project_id`,
        [tag, c.name, c.image, c.projectId||null, c.createdAt||Date.now()]
      );
      return res.status(200).json(c);
    }

    // DELETE /api/characters/:tag
    if (req.method === 'DELETE' && url.match(/^\/api\/characters\/[^/]+$/)) {
      await exec('DELETE FROM characters WHERE tag=?', [url.split('/').pop()]);
      return res.status(200).json({ ok: true });
    }

    res.status(404).json({ error: 'Not found' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
}
