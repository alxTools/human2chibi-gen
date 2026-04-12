import React, { useState, useEffect, useRef } from 'react';
import { Send, Check, UploadCloud, Pencil, Shirt, X } from 'lucide-react';

export default function EditPanel({
  versions,
  isEditing,
  characterTag,
  onEdit,
  onFinalize,
  onRevert,
  onUploadAnother,
  onUnfinalize,
}) {
  const [editText, setEditText] = useState('');
  const [charName, setCharName] = useState('');
  const [showFinalizeForm, setShowFinalizeForm] = useState(false);

  // Outfit reference image
  const [outfitRef, setOutfitRef] = useState(null); // data-url
  const outfitInputRef = useRef(null);

  // Global paste listener for outfit images when edit panel is active
  useEffect(() => {
    if (characterTag || isEditing) return; // skip if finalized or busy
    const handlePaste = (e) => {
      // Only intercept if there's already an edit in progress or outfit zone is shown
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          fileToDataUrl(file).then(url => setOutfitRef(url));
          return;
        }
      }
    };
    // We DON'T add global paste here — let UploadSection own global paste when no project.
    // Instead the outfit zone has its own paste via onPaste.
    return undefined;
  }, [characterTag, isEditing]);

  const handleSubmit = () => {
    if (!editText.trim() || isEditing) return;
    onEdit(editText.trim(), outfitRef || null);
    setEditText('');
    setOutfitRef(null);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleFinalize = () => {
    if (!charName.trim()) return;
    const tag = charName.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9\-]/g, '');
    onFinalize(charName.trim(), tag);
    setShowFinalizeForm(false);
    setCharName('');
  };

  const handleFinalizeKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleFinalize();
    }
  };

  // Outfit drop/paste handlers
  const handleOutfitDrag = (e) => { e.preventDefault(); e.stopPropagation(); };
  const handleOutfitDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) {
      fileToDataUrl(file).then(url => setOutfitRef(url));
    }
  };
  const handleOutfitPaste = (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        e.stopPropagation();
        const file = item.getAsFile();
        fileToDataUrl(file).then(url => setOutfitRef(url));
        return;
      }
    }
  };
  const handleOutfitFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) fileToDataUrl(file).then(url => setOutfitRef(url));
  };

  const hasFinal = !!characterTag;

  return (
    <div className="glass-panel animate-slide-up" style={{ animationDelay: '0.15s', margin: '2rem 0' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div>
          <h2 style={{ fontSize: '1.5rem', marginBottom: '0.25rem' }}>
            {hasFinal ? (
              <>
                <span style={{ color: 'var(--accent)' }}>@{characterTag}</span>
                {' '}
                <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 400 }}>finalized</span>
              </>
            ) : 'Edit Character'}
          </h2>
          {!hasFinal && (
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
              Describe changes or paste an outfit reference — iterate until you're happy, then finalize.
            </p>
          )}
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button className="btn-secondary" onClick={onUploadAnother} disabled={isEditing} style={{ padding: '0.5rem 0.85rem', fontSize: '0.8rem', gap: '0.35rem' }}>
            <UploadCloud size={14} /> Upload Another
          </button>
          {!hasFinal && versions.length > 0 && !showFinalizeForm && (
            <button className="btn-primary" onClick={() => setShowFinalizeForm(true)} disabled={isEditing} style={{ padding: '0.5rem 0.85rem', fontSize: '0.8rem', gap: '0.35rem' }}>
              <Check size={14} /> Finalize
            </button>
          )}
          {hasFinal && (
            <button className="btn-secondary" onClick={onUnfinalize} disabled={isEditing} style={{ padding: '0.5rem 0.85rem', fontSize: '0.8rem', gap: '0.35rem' }}>
              <Pencil size={14} /> Keep Editing
            </button>
          )}
        </div>
      </div>

      {/* Finalize form — name input */}
      {showFinalizeForm && !hasFinal && (
        <div className="finalize-form" style={{ marginBottom: '1.5rem' }}>
          <label style={{ color: 'var(--text-muted)', fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.4rem' }}>
            Character Name (used as @tag)
          </label>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <span style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--accent)', fontWeight: 700, fontSize: '1rem' }}>@</span>
              <input
                type="text"
                className="char-name-input"
                placeholder="galantito"
                value={charName}
                onChange={(e) => setCharName(e.target.value)}
                onKeyDown={handleFinalizeKeyDown}
                autoFocus
              />
            </div>
            <button className="btn-primary" onClick={handleFinalize} disabled={!charName.trim()} style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }}>
              Save
            </button>
            <button className="btn-secondary" onClick={() => { setShowFinalizeForm(false); setCharName(''); }} style={{ padding: '0.5rem 0.75rem', fontSize: '0.85rem' }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Version history */}
      {versions.length > 1 && (
        <div className="version-history" style={{ marginBottom: '1.5rem' }}>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginBottom: '0.5rem' }}>
            Version History ({versions.length})
          </p>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {versions.map((v, i) => (
              <button
                key={v.id}
                className={i === versions.length - 1 ? 'version-chip active' : 'version-chip'}
                onClick={() => onRevert(i)}
                disabled={isEditing}
                title={v.prompt || 'Initial generation'}
              >
                v{i + 1}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Edit prompts log */}
      {versions.length > 1 && (
        <div style={{ marginBottom: '1.5rem', maxHeight: '150px', overflowY: 'auto' }}>
          {versions.slice(1).map((v, i) => (
            <div key={v.id} style={{
              fontSize: '0.85rem',
              padding: '0.5rem 0.75rem',
              borderLeft: '2px solid var(--accent)',
              marginBottom: '0.5rem',
              color: 'var(--text-muted)',
            }}>
              <span style={{ color: 'var(--accent)', fontWeight: 600 }}>v{i + 2}:</span> {v.prompt}
              {v.hadOutfitRef && <span style={{ color: 'var(--secondary)', marginLeft: '0.5rem' }}>[outfit ref]</span>}
            </div>
          ))}
        </div>
      )}

      {/* Edit area — available when not finalized */}
      {!hasFinal && (
        <>
          {/* Outfit reference zone */}
          <div style={{ marginBottom: '1rem' }}>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <Shirt size={14} /> Outfit Reference <span style={{ fontWeight: 400 }}>(optional — paste or drop an image)</span>
            </p>
            {!outfitRef ? (
              <div
                className="outfit-dropzone"
                onDragEnter={handleOutfitDrag}
                onDragOver={handleOutfitDrag}
                onDrop={handleOutfitDrop}
                onPaste={handleOutfitPaste}
                onClick={() => outfitInputRef.current?.click()}
                tabIndex={0}
              >
                <input
                  ref={outfitInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleOutfitFileChange}
                  style={{ display: 'none' }}
                />
                <Shirt size={24} style={{ color: 'var(--accent)', opacity: 0.6 }} />
                <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                  Paste from Pinterest · Drop image · Click to browse
                </span>
              </div>
            ) : (
              <div className="outfit-dropzone has-image" style={{ position: 'relative' }}>
                <img src={outfitRef} alt="Outfit reference" />
                <button
                  onClick={(e) => { e.stopPropagation(); setOutfitRef(null); }}
                  style={{
                    position: 'absolute', top: '0.5rem', right: '0.5rem',
                    background: 'rgba(0,0,0,0.7)', border: 'none', borderRadius: '50%',
                    width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    cursor: 'pointer', color: 'white',
                  }}
                >
                  <X size={14} />
                </button>
              </div>
            )}
          </div>

          {/* Text edit input */}
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
            <textarea
              className="story-input"
              style={{ minHeight: '70px' }}
              placeholder={outfitRef
                ? "e.g. Adapt this outfit to my character, keep the gold chains..."
                : "e.g. Make the hoodie longer, change sneakers to boots, add a beanie..."}
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isEditing}
            />
            <button
              className="btn-primary"
              style={{ padding: '0.85rem', height: 'auto', alignSelf: 'stretch' }}
              onClick={handleSubmit}
              disabled={isEditing || !editText.trim()}
            >
              {isEditing ? (
                <div className="loader" style={{ width: '20px', height: '20px', margin: 0, borderWidth: '2px' }} />
              ) : (
                <Send size={20} />
              )}
            </button>
          </div>
        </>
      )}

      {isEditing && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '1rem', color: 'var(--primary)' }}>
          <div className="loader" style={{ width: '18px', height: '18px', margin: 0, borderWidth: '2px' }} />
          <span style={{ fontSize: '0.9rem' }}>Applying edits...</span>
        </div>
      )}
    </div>
  );
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
