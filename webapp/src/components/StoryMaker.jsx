import React, { useState, useRef } from 'react';
import { Send, Copy, Check, RefreshCw, Music, Lightbulb, X } from 'lucide-react';
import { generateStoryScene, generateSceneFrame, analyzeAudioTrack, generateStorySuggestions } from '../api/gemini';

export default function StoryMaker({
  baseChibiImage, model, storyNodes, onStoryUpdate, characters,
  audioAnalysis, onAudioUpload, characterName,
}) {
  const [inputText, setInputText] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [copiedIdx, setCopiedIdx] = useState(null);

  // Per-node, per-frame regen prompt state
  const [regenText, setRegenText] = useState({});
  const [regenLoading, setRegenLoading] = useState(new Set());
  const [editingFrames, setEditingFrames] = useState(new Set());
  const [lightbox, setLightbox] = useState(null);

  // Audio
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [audioFileName, setAudioFileName] = useState(null);
  const audioInputRef = useRef(null);

  // Story suggestions
  const [suggestions, setSuggestions] = useState([]);
  const [isFetchingSuggestions, setIsFetchingSuggestions] = useState(false);

  // @mention autocomplete
  const [mentionQuery, setMentionQuery] = useState(null);
  const [mentionIdx, setMentionIdx] = useState(0);
  const textareaRef = useRef(null);

  const mentionResults = mentionQuery !== null
    ? (characters || []).filter(c => c.tag.startsWith(mentionQuery) || c.name.toLowerCase().startsWith(mentionQuery))
    : [];

  // ── Audio upload ──
  const handleAudioFile = async (file) => {
    if (!file) return;
    setAudioFileName(file.name);
    setIsAnalyzing(true);
    setSuggestions([]);
    try {
      const base64 = await fileToBase64(file);
      const analysis = await analyzeAudioTrack(base64, file.type);
      onAudioUpload(analysis);
    } catch (err) {
      alert(`Audio analysis failed: ${err.message}`);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleAudioDrop = (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file && (file.type.startsWith('audio/') || file.name.match(/\.(mp3|wav|m4a|ogg|flac)$/i))) {
      handleAudioFile(file);
    }
  };

  // ── Story suggestions ──
  const handleGetSuggestions = async () => {
    setIsFetchingSuggestions(true);
    setSuggestions([]);
    try {
      const ideas = await generateStorySuggestions(audioAnalysis, storyNodes, characterName, model);
      setSuggestions(ideas);
    } catch (err) {
      alert(`Suggestions failed: ${err.message}`);
    } finally {
      setIsFetchingSuggestions(false);
    }
  };

  const handlePickSuggestion = (idea) => {
    setInputText(idea);
    setSuggestions([]);
    textareaRef.current?.focus();
  };

  // ── Scene generation ──
  const handleInputChange = (e) => {
    const val = e.target.value;
    setInputText(val);
    const cursor = e.target.selectionStart;
    const before = val.slice(0, cursor);
    const atMatch = before.match(/@([a-z0-9\-]*)$/i);
    if (atMatch) { setMentionQuery(atMatch[1].toLowerCase()); setMentionIdx(0); }
    else setMentionQuery(null);
  };

  const insertMention = (tag) => {
    const textarea = textareaRef.current;
    const cursor = textarea.selectionStart;
    const before = inputText.slice(0, cursor);
    const after = inputText.slice(cursor);
    const atPos = before.lastIndexOf('@');
    const newText = before.slice(0, atPos) + `@${tag} ` + after;
    setInputText(newText);
    setMentionQuery(null);
    setTimeout(() => {
      const newCursor = atPos + tag.length + 2;
      textarea.focus();
      textarea.setSelectionRange(newCursor, newCursor);
    }, 0);
  };

  const handleGenerate = async () => {
    if (!inputText.trim() || isGenerating) return;
    const currentInput = inputText;
    setInputText('');
    setMentionQuery(null);
    setSuggestions([]);
    setIsGenerating(true);
    try {
      const mentionedTags = [...currentInput.matchAll(/@([a-z0-9\-]+)/gi)].map(m => m[1].toLowerCase());
      const taggedCharacters = (characters || [])
        .filter(c => mentionedTags.includes(c.tag))
        .map(c => ({ tag: c.tag, image: c.image }));

      const { firstFrame, lastFrame, veoPrompt } = await generateStoryScene(baseChibiImage, currentInput, model, taggedCharacters);
      onStoryUpdate([...storyNodes, { text: currentInput, firstFrame, lastFrame, veoPrompt, image: firstFrame, timestamp: Date.now() }]);
    } catch (err) {
      alert(`Scene generation failed: ${err.message}`);
      setInputText(currentInput);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleKeyDown = (e) => {
    if (mentionQuery !== null && mentionResults.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setMentionIdx(i => Math.min(i + 1, mentionResults.length - 1)); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setMentionIdx(i => Math.max(i - 1, 0)); return; }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); insertMention(mentionResults[mentionIdx].tag); return; }
      if (e.key === 'Escape') { e.preventDefault(); setMentionQuery(null); return; }
    }
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleGenerate(); }
  };

  // ── Frame actions ──
  const handleDeleteFrame = (nodeIdx, frameType) => {
    const updated = storyNodes.map((node, i) => {
      if (i !== nodeIdx) return node;
      return { ...node, [frameType === 'first' ? 'firstFrame' : 'lastFrame']: null };
    });
    onStoryUpdate(updated);
    setRegenText(prev => ({ ...prev, [`${nodeIdx}-${frameType}`]: storyNodes[nodeIdx].text }));
  };

  const handleRegenFrame = async (nodeIdx, frameType) => {
    const key = `${nodeIdx}-${frameType}`;
    const prompt = regenText[key]?.trim();
    if (!prompt) return;
    setRegenLoading(prev => new Set(prev).add(key));
    try {
      const newImage = await generateSceneFrame(baseChibiImage, prompt, frameType, model);
      const updated = storyNodes.map((node, i) => {
        if (i !== nodeIdx) return node;
        const frameKey = frameType === 'first' ? 'firstFrame' : 'lastFrame';
        return { ...node, [frameKey]: newImage, image: frameType === 'first' ? newImage : node.image };
      });
      onStoryUpdate(updated);
      setRegenText(prev => { const next = { ...prev }; delete next[key]; return next; });
    } catch (err) {
      alert(`Frame regeneration failed: ${err.message}`);
    } finally {
      setRegenLoading(prev => { const next = new Set(prev); next.delete(key); return next; });
    }
  };

  function copyVeoPrompt(idx, prompt) {
    navigator.clipboard.writeText(prompt);
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 2000);
  }

  function renderTextWithMentions(text) {
    return text.split(/(@[a-z0-9\-]+)/gi).map((part, i) =>
      part.startsWith('@')
        ? <span key={i} style={{ color: 'var(--accent)', fontWeight: 600 }}>{part}</span>
        : part
    );
  }

  function FrameBox({ nodeIdx, frameType, src }) {
    const key = `${nodeIdx}-${frameType}`;
    const isLoading = regenLoading.has(key);
    const label = frameType === 'first' ? 'First Frame' : 'Last Frame';

    if (!src) {
      return (
        <div className="frame-box frame-box--empty">
          <span className="frame-label">{label}</span>
          <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Describe what you want for this frame:</p>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input
                type="text"
                className="char-name-input"
                style={{ flex: 1, paddingLeft: '0.75rem' }}
                placeholder={frameType === 'first' ? 'wide shot, city skyline at dusk...' : 'close-up, rain falling on face...'}
                value={regenText[key] || ''}
                onChange={e => setRegenText(prev => ({ ...prev, [key]: e.target.value }))}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleRegenFrame(nodeIdx, frameType); } }}
                disabled={isLoading}
              />
              <button className="btn-primary" style={{ padding: '0.4rem 0.65rem' }} onClick={() => handleRegenFrame(nodeIdx, frameType)} disabled={isLoading || !regenText[key]?.trim()}>
                {isLoading ? <div className="loader" style={{ width: '14px', height: '14px', margin: 0, borderWidth: '2px' }} /> : <RefreshCw size={14} />}
              </button>
            </div>
          </div>
        </div>
      );
    }

    const isEditing = editingFrames.has(key);

    const toggleEdit = () => {
      setEditingFrames(prev => {
        const next = new Set(prev);
        if (next.has(key)) { next.delete(key); } else {
          next.add(key);
          setRegenText(p => p[key] !== undefined ? p : { ...p, [key]: storyNodes[nodeIdx].text });
        }
        return next;
      });
    };

    const handleEditRegen = async () => {
      await handleRegenFrame(nodeIdx, frameType);
      setEditingFrames(prev => { const next = new Set(prev); next.delete(key); return next; });
    };

    return (
      <div className="frame-box">
        <span className="frame-label">{label}</span>
        <img src={src} alt={label} style={{ opacity: isLoading ? 0.4 : 1, transition: 'opacity 0.2s', cursor: 'zoom-in' }} onClick={() => !isLoading && setLightbox(src)} />
        <div className="frame-actions">
          <button className="frame-action-btn" onClick={toggleEdit} title="Edit frame">✏️</button>
          <button className="frame-action-btn" onClick={() => handleDeleteFrame(nodeIdx, frameType)} title="Delete frame">🗑️</button>
        </div>
        {isLoading && (
          <div className="frame-loading-overlay">
            <div className="loader" style={{ width: '28px', height: '28px', margin: 0, borderWidth: '3px' }} />
          </div>
        )}
        {isEditing && !isLoading && (
          <div className="frame-edit-overlay">
            <div style={{ display: 'flex', gap: '0.4rem', width: '100%' }}>
              <input
                type="text"
                className="char-name-input"
                style={{ flex: 1, paddingLeft: '0.75rem', fontSize: '0.8rem' }}
                placeholder={frameType === 'first' ? 'wide shot, city skyline...' : 'close-up, rain on face...'}
                value={regenText[key] || ''}
                onChange={e => setRegenText(prev => ({ ...prev, [key]: e.target.value }))}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleEditRegen(); } if (e.key === 'Escape') toggleEdit(); }}
                autoFocus
              />
              <button className="btn-primary" style={{ padding: '0.35rem 0.55rem' }} onClick={handleEditRegen} disabled={!regenText[key]?.trim()}><RefreshCw size={13} /></button>
              <button className="btn-secondary" style={{ padding: '0.35rem 0.55rem' }} onClick={toggleEdit}>✕</button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="glass-panel animate-slide-up" style={{ animationDelay: '0.4s', margin: '2rem 0' }}>
      <div style={{ marginBottom: '1.5rem' }}>
        <h2 style={{ fontSize: '2rem', marginBottom: '0.25rem' }}>Story Mode</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
          Each scene generates a <strong>first-frame</strong> + <strong>last-frame</strong> pair with a <span style={{ color: 'var(--accent)' }}>Veo 3.1</span> prompt.
          {characters?.length > 0 && <> Type <span style={{ color: 'var(--accent)', fontWeight: 600 }}>@</span> to tag characters.</>}
        </p>
      </div>

      {/* ── Audio track upload ── */}
      <div style={{ marginBottom: '1.5rem' }}>
        <div
          className={`audio-dropzone ${audioAnalysis ? 'audio-dropzone--loaded' : ''}`}
          onDragOver={e => e.preventDefault()}
          onDrop={handleAudioDrop}
          onClick={() => !isAnalyzing && audioInputRef.current?.click()}
        >
          <input
            ref={audioInputRef}
            type="file"
            accept="audio/mp3,audio/mpeg,audio/wav,audio/wave,audio/x-wav,audio/ogg,audio/flac,audio/m4a,audio/mp4,.mp3,.wav,.ogg,.flac,.m4a"
            style={{ display: 'none' }}
            onChange={e => handleAudioFile(e.target.files?.[0])}
          />
          {isAnalyzing ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: 'var(--primary)' }}>
              <div className="loader" style={{ width: '18px', height: '18px', margin: 0, borderWidth: '2px' }} />
              <span style={{ fontSize: '0.85rem' }}>Analyzing track with Gemini...</span>
            </div>
          ) : audioAnalysis ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', width: '100%', flexWrap: 'wrap' }}>
              <Music size={18} style={{ color: 'var(--accent)', flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--text-main)' }}>
                  {audioAnalysis.detected_title || audioFileName || 'Track loaded'}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.1rem' }}>
                  {[audioAnalysis.mood, audioAnalysis.energy, audioAnalysis.tempo].filter(Boolean).join(' · ')}
                  {audioAnalysis.themes?.length > 0 && <> · {audioAnalysis.themes.slice(0, 3).join(', ')}</>}
                </div>
              </div>
              <button
                className="btn-secondary"
                style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem', flexShrink: 0 }}
                onClick={e => { e.stopPropagation(); audioInputRef.current?.click(); }}
              >
                Change
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: 'var(--text-muted)' }}>
              <Music size={18} style={{ color: 'var(--primary)', opacity: 0.7 }} />
              <span style={{ fontSize: '0.85rem' }}>
                Drop MP3 / WAV · or click to browse — Gemini will analyze the track to guide your story
              </span>
            </div>
          )}
        </div>
      </div>

      {/* ── Story timeline ── */}
      <div className="story-timeline" style={{ marginBottom: '2rem' }}>
        {storyNodes.length === 0 && !isGenerating && (
          <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)', border: '1px dashed var(--glass-border)', borderRadius: 'var(--radius-sm)' }}>
            Start the journey. Where is your character right now?
          </div>
        )}
        {storyNodes.map((node, i) => (
          <div key={i} className="story-node animate-slide-up">
            <p style={{ fontSize: '1.1rem', fontStyle: 'italic', borderLeft: '3px solid var(--secondary)', paddingLeft: '1rem' }}>
              "{renderTextWithMentions(node.text)}"
            </p>
            <div className="frame-pair">
              <FrameBox nodeIdx={i} frameType="first" src={node.firstFrame || node.image} />
              <FrameBox nodeIdx={i} frameType="last" src={node.lastFrame} />
            </div>
            {node.veoPrompt && (
              <div className="veo-prompt-box">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                  <span style={{ color: 'var(--accent)', fontWeight: 700, fontSize: '0.8rem', letterSpacing: '0.05em' }}>VEO 3.1 PROMPT</span>
                  <button className="btn-copy" onClick={() => copyVeoPrompt(i, node.veoPrompt)}>
                    {copiedIdx === i ? <><Check size={12} /> Copied</> : <><Copy size={12} /> Copy</>}
                  </button>
                </div>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{node.veoPrompt}</p>
              </div>
            )}
          </div>
        ))}
        {isGenerating && (
          <div className="story-node">
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', color: 'var(--primary)' }}>
              <div className="loader" style={{ width: '20px', height: '20px', margin: 0, borderWidth: '2px' }} />
              <span>Generating first-frame & last-frame pair...</span>
            </div>
          </div>
        )}
      </div>

      {/* ── Input area ── */}
      <div style={{ position: 'relative' }}>

        {/* Suggestions row */}
        {suggestions.length > 0 && (
          <div className="suggestions-row">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <Lightbulb size={13} style={{ color: 'var(--accent)' }} />
              <span style={{ color: 'var(--accent)', fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.04em' }}>IDEAS</span>
              <button className="btn-copy" style={{ marginLeft: 'auto' }} onClick={() => setSuggestions([])}>
                <X size={11} /> Dismiss
              </button>
            </div>
            {suggestions.map((idea, i) => (
              <button key={i} className="suggestion-chip" onClick={() => handlePickSuggestion(idea)}>
                {idea}
              </button>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
          <div style={{ flex: 1, position: 'relative' }}>
            <textarea
              ref={textareaRef}
              className="story-input"
              placeholder={audioAnalysis ? `@character walks through ${audioAnalysis.setting_suggestions?.[0] || 'the city'}...` : 'E.g., @galantito suddenly hears a loud crash from the dark forest...'}
              value={inputText}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              disabled={isGenerating}
            />
            {/* Ideas button inside textarea bottom-right */}
            <button
              className="btn-ideas"
              onClick={handleGetSuggestions}
              disabled={isFetchingSuggestions || isGenerating}
              title="Get 5 AI story ideas based on your track"
            >
              {isFetchingSuggestions
                ? <div className="loader" style={{ width: '12px', height: '12px', margin: 0, borderWidth: '2px' }} />
                : <><Lightbulb size={13} /> Ideas</>}
            </button>
          </div>
          <button
            className="btn-primary"
            style={{ padding: '1rem', height: 'auto', alignSelf: 'stretch' }}
            onClick={handleGenerate}
            disabled={isGenerating || !inputText.trim()}
          >
            <Send size={24} />
          </button>
        </div>

        {mentionQuery !== null && mentionResults.length > 0 && (
          <div className="mention-dropdown">
            {mentionResults.map((c, i) => (
              <div
                key={c.tag}
                className={`mention-item ${i === mentionIdx ? 'active' : ''}`}
                onMouseDown={e => { e.preventDefault(); insertMention(c.tag); }}
                onMouseEnter={() => setMentionIdx(i)}
              >
                <span style={{ color: 'var(--accent)', fontWeight: 700 }}>@{c.tag}</span>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginLeft: '0.5rem' }}>{c.name}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Lightbox */}
      {lightbox && (
        <div className="lightbox-backdrop" onClick={() => setLightbox(null)}>
          <div className="lightbox-content" onClick={e => e.stopPropagation()}>
            <img src={lightbox} alt="Frame expanded" />
            <button className="lightbox-close" onClick={() => setLightbox(null)}>✕</button>
          </div>
        </div>
      )}
    </div>
  );
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
