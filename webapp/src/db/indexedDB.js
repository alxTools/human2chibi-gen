const API = import.meta.env.DEV ? 'http://localhost:3001/api' : '/api';

async function apiFetch(path, opts = {}) {
  const res = await fetch(`${API}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `API error ${res.status}`);
  }
  return res.json();
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
  return apiFetch('/projects');
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
  return apiFetch('/characters');
}

export async function deleteCharacter(tag) {
  return apiFetch(`/characters/${tag}`, { method: 'DELETE' });
}
