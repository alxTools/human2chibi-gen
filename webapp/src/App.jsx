import React, { useState, useEffect } from 'react';
import UploadSection from './components/UploadSection';
import CharacterGrid from './components/CharacterGrid';
import EditPanel from './components/EditPanel';
import StoryMaker from './components/StoryMaker';
import { Home } from 'lucide-react';
import { MODELS, DEFAULT_MODEL, editChibiSheet } from './api/gemini';
import {
  saveProject, listProjects, deleteProject, createProject,
  saveCharacter, listCharacters, deleteCharacter,
} from './db/indexedDB';

function App() {
  const [model, setModel] = useState(DEFAULT_MODEL);
  const [project, setProject] = useState(null);
  const [currentVersionIdx, setCurrentVersionIdx] = useState(-1);
  const [isEditing, setIsEditing] = useState(false);

  // Show upload even when a project is loaded (for "Upload Another")
  const [showUpload, setShowUpload] = useState(false);

  // Project history sidebar
  const [savedProjects, setSavedProjects] = useState([]);
  const [showHistory, setShowHistory] = useState(false);

  // Saved characters (finalized)
  const [characters, setCharacters] = useState([]);

  useEffect(() => { loadProjectList(); loadCharacterList(); }, []);

  async function loadProjectList() {
    try { setSavedProjects(await listProjects()); } catch (e) { console.error(e); }
  }

  async function loadCharacterList() {
    try { setCharacters(await listCharacters()); } catch (e) { console.error(e); }
  }

  // Persist project to IndexedDB whenever it changes
  async function persist(proj) {
    setProject(proj);
    try { await saveProject(proj); await loadProjectList(); } catch (e) { console.error('DB save error:', e); }
  }

  // Called when UploadSection finishes generating the first sheet
  function handleUploaded(chibiImageUrl, originalPhotoUrl) {
    const proj = createProject(originalPhotoUrl || '', model);
    proj.versions.push({
      id: crypto.randomUUID(),
      prompt: null,
      image: chibiImageUrl,
      timestamp: Date.now(),
      isFinal: false,
    });
    setCurrentVersionIdx(0);
    setShowUpload(false);
    persist(proj);
  }

  // Edit character sheet (optionally with outfit reference image)
  async function handleEdit(editPrompt, outfitRefBase64 = null) {
    if (!project || isEditing) return;
    const currentImage = project.versions[currentVersionIdx]?.image;
    if (!currentImage) return;

    setIsEditing(true);
    try {
      const newImage = await editChibiSheet(currentImage, editPrompt, model, outfitRefBase64);
      const newVersion = {
        id: crypto.randomUUID(),
        prompt: editPrompt,
        image: newImage,
        timestamp: Date.now(),
        isFinal: false,
        hadOutfitRef: !!outfitRefBase64,
      };
      const updated = { ...project, versions: [...project.versions, newVersion] };
      setCurrentVersionIdx(updated.versions.length - 1);
      await persist(updated);
    } catch (err) {
      alert(`Edit failed: ${err.message}`);
    } finally {
      setIsEditing(false);
    }
  }

  // Finalize: save character with name + tag
  async function handleFinalize(name, tag) {
    if (!project) return;
    const currentImage = project.versions[currentVersionIdx]?.image;
    if (!currentImage) return;

    // Mark version as final
    const updated = {
      ...project,
      characterTag: tag,
      name: name,
      versions: project.versions.map((v, i) => ({
        ...v,
        isFinal: i === currentVersionIdx,
      })),
    };
    await persist(updated);

    // Save to characters store
    await saveCharacter({
      tag,
      name,
      image: currentImage,
      projectId: project.id,
      createdAt: Date.now(),
    });
    await loadCharacterList();
  }

  // Unfinalize: allow more edits
  function handleUnfinalize() {
    if (!project) return;
    const updated = {
      ...project,
      characterTag: null,
      versions: project.versions.map(v => ({ ...v, isFinal: false })),
    };
    persist(updated);
  }

  // Revert to a previous version
  function handleRevert(idx) {
    setCurrentVersionIdx(idx);
  }

  // Update story nodes on project
  function handleStoryUpdate(storyNodes) {
    if (!project) return;
    persist({ ...project, storyNodes });
  }

  // Save audio analysis to project
  function handleAudioUpload(analysis) {
    if (!project) return;
    persist({ ...project, audioAnalysis: analysis });
  }

  // Upload another human — show upload section while keeping project
  function handleUploadAnother() {
    setShowUpload(true);
  }

  // Load a saved project
  function handleLoadProject(proj) {
    setProject(proj);
    setModel(proj.model || DEFAULT_MODEL);
    const finalIdx = proj.versions.findIndex(v => v.isFinal);
    setCurrentVersionIdx(finalIdx >= 0 ? finalIdx : proj.versions.length - 1);
    setShowHistory(false);
    setShowUpload(false);
  }

  async function handleDeleteProject(id) {
    try {
      await deleteProject(id);
      await loadProjectList();
      if (project?.id === id) { setProject(null); setCurrentVersionIdx(-1); }
    } catch (e) { console.error(e); }
  }

  async function handleDeleteCharacter(tag) {
    try {
      await deleteCharacter(tag);
      // Also clear characterTag on the linked project so it's no longer marked as finalized
      const linked = savedProjects.find(p => p.characterTag === tag);
      if (linked) {
        await saveProject({
          ...linked,
          characterTag: null,
          versions: linked.versions.map(v => ({ ...v, isFinal: false })),
        });
        if (project?.characterTag === tag) {
          setProject(prev => ({ ...prev, characterTag: null, versions: prev.versions.map(v => ({ ...v, isFinal: false })) }));
        }
      }
      await loadCharacterList();
      await loadProjectList();
    } catch (e) { console.error(e); }
  }

  // Start new
  function handleNewProject() {
    setProject(null);
    setCurrentVersionIdx(-1);
    setShowUpload(false);
  }

  const currentImage = project?.versions?.[currentVersionIdx]?.image;

  return (
    <div className="container">
      <header style={{ textAlign: 'center', marginBottom: '2rem', paddingTop: '2rem' }} className="animate-slide-up">
        <h1>Human to Chibi Generator</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '1.1rem', maxWidth: '600px', margin: '0 auto' }}>
          Upload your photo, get your persona, and create an epic visual story.
        </p>
      </header>

      {/* Top bar: model selector + project history */}
      <div className="top-bar animate-slide-up" style={{ animationDelay: '0.05s' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          <label style={{ color: 'var(--text-muted)', fontSize: '0.85rem', fontWeight: 600 }}>Model:</label>
          <select
            className="model-select"
            value={model}
            onChange={(e) => setModel(e.target.value)}
          >
            {MODELS.map(m => (
              <option key={m.id} value={m.id}>{m.label}</option>
            ))}
          </select>

          {/* Show saved characters count */}
          {characters.length > 0 && (
            <span style={{ color: 'var(--accent)', fontSize: '0.8rem', fontWeight: 600 }}>
              {characters.length} character{characters.length !== 1 ? 's' : ''} saved
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          {project && (
            <button className="btn-secondary" onClick={handleNewProject} title="Go to homepage" style={{ padding: '0.5rem 0.75rem', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <Home size={15} /> Home
            </button>
          )}
          <button
            className="btn-secondary"
            onClick={() => { const next = !showHistory; setShowHistory(next); if (next) { loadProjectList(); loadCharacterList(); } }}
            style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }}
          >
            {showHistory ? 'Close' : `History (${savedProjects.length})`}
          </button>
        </div>
      </div>

      {/* Project history — avatar card row */}
      {showHistory && (
        <div className="glass-panel animate-slide-up" style={{ margin: '0.5rem 0 1.5rem', padding: '1.25rem' }}>

          {/* ── Finalized Characters ── */}
          {characters.length > 0 && (
            <div style={{ marginBottom: '1.5rem' }}>
              <h3 style={{ fontSize: '0.8rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--accent)', marginBottom: '0.75rem' }}>
                Characters
              </h3>
              <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                {characters.map(c => (
                  <div key={c.tag} className="project-card">
                    <div className="project-card__avatar" style={{ borderColor: 'var(--accent)' }}>
                      <img src={c.image} alt={c.name} />
                    </div>
                    <div className="project-card__info">
                      <span className="project-card__tag">@{c.tag}</span>
                      <span className="project-card__name">{c.name}</span>
                    </div>
                    <button
                      className="project-card__delete"
                      onClick={async (e) => { e.stopPropagation(); await handleDeleteCharacter(c.tag); }}
                      title="Remove character"
                    >
                      🗑
                    </button>
                  </div>
                ))}
              </div>
              <div style={{ borderBottom: '1px solid var(--glass-border)', marginTop: '1.25rem' }} />
            </div>
          )}

          {/* ── All Projects ── */}
          <h3 style={{ fontSize: '0.8rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
            Projects
          </h3>
          {savedProjects.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>No saved projects yet.</p>
          ) : (
            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', overflowX: 'auto' }}>
              {savedProjects.map(p => {
                const thumb = p.versions?.find(v => v.isFinal)?.image || p.versions?.[p.versions.length - 1]?.image;
                const isActive = project?.id === p.id;
                return (
                  <div
                    key={p.id}
                    className={`project-card ${isActive ? 'project-card--active' : ''}`}
                    onClick={() => handleLoadProject(p)}
                  >
                    <div className="project-card__avatar">
                      {thumb
                        ? <img src={thumb} alt={p.name} />
                        : <div className="project-card__avatar-placeholder">?</div>
                      }
                    </div>
                    <div className="project-card__info">
                      {p.characterTag && (
                        <span className="project-card__tag">@{p.characterTag}</span>
                      )}
                      <span className="project-card__name">{p.characterTag ? p.name : p.name.replace(/^Chibi /, '')}</span>
                      <span className="project-card__meta">v{p.versions.length} · {p.storyNodes.length} scenes</span>
                    </div>
                    <button
                      className="project-card__delete"
                      onClick={(e) => { e.stopPropagation(); handleDeleteProject(p.id); }}
                      title="Delete project"
                    >
                      ✕
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Upload section — show if no project, or "Upload Another" was clicked */}
      {(!project || showUpload) && (
        <UploadSection model={model} onUploaded={handleUploaded} />
      )}

      {/* Character sheet + edit panel + story */}
      {project && currentImage && (
        <>
          <CharacterGrid
            baseImage={currentImage}
            characterTag={project.characterTag}
            characterName={project.characterTag ? project.name : null}
          />
          <EditPanel
            versions={project.versions}
            isEditing={isEditing}
            characterTag={project.characterTag}
            onEdit={handleEdit}
            onFinalize={handleFinalize}
            onRevert={handleRevert}
            onUploadAnother={handleUploadAnother}
            onUnfinalize={handleUnfinalize}
          />
          <StoryMaker
            baseChibiImage={currentImage}
            model={model}
            storyNodes={project.storyNodes || []}
            onStoryUpdate={handleStoryUpdate}
            characters={characters}
            audioAnalysis={project.audioAnalysis || null}
            onAudioUpload={handleAudioUpload}
            characterName={project.name || null}
          />
        </>
      )}
    </div>
  );
}

export default App;
