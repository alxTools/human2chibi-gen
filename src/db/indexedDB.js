const IS_DEV = import.meta.env.DEV;
const LOCAL_API = 'http://localhost:3001/api';
const TURSO_URL = import.meta.env.VITE_TURSO_URL?.replace(/^libsql:\/\//, 'https://');
const TURSO_TOKEN = import.meta.env.VITE_TURSO_TOKEN;


// ─── localStorage cache (stale-while-revalidate) ───────────────────────────
// List endpoints (/projects, /characters) are cached so they return instantly
// on repeat visits. The cache is silently refreshed after each remote fetch.
const CACHE_KEYS = { '/projects': 'h2c_cache_projects', '/characters': 'h2c_cache_characters' };

function cacheRead(path) {
  const key = CACHE_KEYS[path];
  if (!key) return null;
  try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
}
function cacheWrite(path, data) {
  const key = CACHE_KEYS[path];
  if (!key || !Array.isArray(data)) return;
  try { localStorage.setItem(key, JSON.stringify(data)); } catch {}
}

// In prod: hit Vercel Serverless Function (proxy to Turso). In dev: hit local Express/SQLite.
async function apiFetch(path, opts = {}) {
  // Ensure path starts with /api (local server already includes it in LOCAL_API)
  const apiPath = path.startsWith('/api') ? path : `/api${path}`;
  const url = IS_DEV ? `${LOCAL_API}${path}` : apiPath;

  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `API error ${res.status}`);
  }
  const data = await res.json();
  cacheWrite(path, data);
  return data;
}

// Stale-while-revalidate: return cache instantly, refresh in background.
// Used only for list GETs — mutations always go through apiFetch directly.
async function apiFetchSWR(path) {
  const cached = cacheRead(path);
  if (cached) {
    // Return cache now, silently refresh in background
    apiFetch(path).catch(() => {});
    return cached;
  }
  // No cache: wait for real fetch
  return apiFetch(path);
}

async function tursoSQL(statements) {
  const res = await fetch(`${TURSO_URL}/v2/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TURSO_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      requests: statements.map(s => ({
        type: 'execute',
        stmt: {
          sql: s.q,
          args: (s.params || []).map(v =>
            v === null ? { type: 'null' }
            : typeof v === 'number' ? { type: 'integer', value: String(v) }
            : { type: 'text', value: String(v) }
          ),
        },
      })),
    }),
  });
  if (!res.ok) throw new Error(`Turso ${res.status}: ${await res.text()}`);
  return (await res.json()).results;
}

// Warm up Turso 3s after page load so the DB is hot by the time History opens.
// Re-ping every 4 minutes to keep it warm while the tab stays open.
if (!IS_DEV && TURSO_URL && TURSO_TOKEN) {
  const warmup = () => tursoSQL([{ q: 'SELECT 1', params: [] }]).catch(() => {});
  setTimeout(warmup, 3000);
  setInterval(warmup, 4 * 60 * 1000);
}

async function tursoQuery(q, params = []) {
  const results = await tursoSQL([{ q, params }]);
  const r = results[0];
  if (r.type === 'error') throw new Error(r.error.message);
  const cols = r.response.result.cols.map(c => c.name);
  return r.response.result.rows.map(row =>
    Object.fromEntries(cols.map((c, i) => [c, row[i]?.value ?? null]))
  );
}

async function tursoExec(q, params = []) {
  const results = await tursoSQL([{ q, params }]);
  const r = results[0];
  if (r.type === 'error') throw new Error(r.error.message);
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

async function tursoFetch(path, opts = {}) {
  const method = opts.method || 'GET';
  const body = opts.body ? JSON.parse(opts.body) : null;

  // Projects
  if (method === 'GET' && path === '/projects') {
    const rows = await tursoQuery('SELECT * FROM projects ORDER BY updated_at DESC');
    return rows.map(dbToProject);
  }
  if (method === 'PUT' && path.startsWith('/projects/')) {
    const id = path.split('/').pop();
    const p = body; p.updatedAt = Date.now();
    await tursoExec(
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
    return p;
  }
  if (method === 'DELETE' && path.startsWith('/projects/')) {
    await tursoExec('DELETE FROM projects WHERE id=?', [path.split('/').pop()]);
    return { ok: true };
  }

  // Characters
  if (method === 'GET' && path === '/characters') {
    const rows = await tursoQuery('SELECT * FROM characters ORDER BY created_at DESC');
    return rows.map(dbToCharacter);
  }
  if (method === 'PUT' && path.startsWith('/characters/')) {
    const tag = path.split('/').pop();
    const c = body;
    await tursoExec(
      `INSERT INTO characters (tag,name,image,project_id,created_at)
       VALUES (?,?,?,?,?)
       ON CONFLICT(tag) DO UPDATE SET name=excluded.name,image=excluded.image,project_id=excluded.project_id`,
      [tag, c.name, c.image, c.projectId||null, c.createdAt||Date.now()]
    );
    return c;
  }
  if (method === 'DELETE' && path.startsWith('/characters/')) {
    await tursoExec('DELETE FROM characters WHERE tag=?', [path.split('/').pop()]);
    return { ok: true };
  }

  throw new Error(`Unknown route: ${method} ${path}`);
}

/**
 * Project shape:
 * {
 *   id: string,
 *   name: string,
 *   createdAt: number,
 *   updatedAt: number,
 *   originalPhoto: string,
 *   model: string,
 *   characterTag: string|null,
 *   versions: [{ id, prompt, image, timestamp, isFinal }],
 *   storyNodes: [{ text, image, firstFrame, lastFrame, veoPrompt, timestamp }],
 *   audioAnalysis: object|null,
 * }
 *
 * Character shape (finalized):
 * {
 *   tag: string,
 *   name: string,
 *   image: string,
 *   projectId: string,
 *   createdAt: number,
 * }
 */

// ─── Projects ───

export async function saveProject(project) {
  project.updatedAt = Date.now();
  return apiFetch(`/projects/${project.id}`, {
    method: 'PUT',
    body: JSON.stringify(project),
  });
}

export async function getProject(id) {
  return apiFetch(`/projects/${id}`);
}

export async function listProjects() {
  return apiFetchSWR('/projects');
}

export async function deleteProject(id) {
  return apiFetch(`/projects/${id}`, { method: 'DELETE' });
}

export function createProject(originalPhoto, model) {
  return {
    id: crypto.randomUUID(),
    name: `Chibi ${new Date().toLocaleString()}`,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    originalPhoto,
    model,
    characterTag: null,
    versions: [],
    storyNodes: [],
  };
}

// ─── Characters (finalized, named) ───

export async function saveCharacter(character) {
  return apiFetch(`/characters/${character.tag}`, {
    method: 'PUT',
    body: JSON.stringify(character),
  });
}

export async function getCharacter(tag) {
  return apiFetch(`/characters/${tag}`);
}

export async function listCharacters() {
  return apiFetchSWR('/characters');
}

export async function deleteCharacter(tag) {
  return apiFetch(`/characters/${tag}`, { method: 'DELETE' });
}
