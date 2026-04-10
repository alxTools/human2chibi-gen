import React, { useState, useRef, useEffect } from 'react';
import { UploadCloud } from 'lucide-react';
import { generateChibiSheet } from '../api/gemini';

export default function UploadSection({ model, onUploaded }) {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [dragActive, setDragActive] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState(null);
  const fileInputRef = useRef(null);

  // Listen for paste globally (Ctrl+V screenshot)
  useEffect(() => {
    const handlePaste = (e) => {
      if (isProcessing) return;
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          e.preventDefault();
          handleFile(item.getAsFile());
          return;
        }
      }
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [isProcessing]);

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') setDragActive(true);
    else if (e.type === 'dragleave') setDragActive(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files?.[0]) handleFile(e.dataTransfer.files[0]);
  };

  const handleChange = (e) => {
    e.preventDefault();
    if (e.target.files?.[0]) handleFile(e.target.files[0]);
  };

  const handleFile = (selectedFile) => {
    setFile(selectedFile);
    setPreview(URL.createObjectURL(selectedFile));
    setError(null);
  };

  const handleTransform = async () => {
    if (!file) return;
    setIsProcessing(true);
    setError(null);

    try {
      const base64 = await fileToBase64(file);
      const originalPhotoUrl = `data:${file.type};base64,${base64}`;
      const chibiImageUrl = await generateChibiSheet(base64, file.type, model);
      onUploaded(chibiImageUrl, originalPhotoUrl);
    } catch (err) {
      setError(err.message);
      setIsProcessing(false);
    }
  };

  return (
    <div className="glass-panel animate-slide-up" style={{ padding: '3rem', margin: '2rem 0' }}>
      <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>Upload Human Photo</h2>
        <p style={{ color: 'var(--text-muted)' }}>
          We will apply the "Galantito" style using{' '}
          <span style={{ color: 'var(--primary)', fontWeight: 600 }}>Nano Banana Pro</span>.
        </p>
      </div>

      {!preview ? (
        <div
          className="dropzone"
          style={dragActive ? { borderColor: 'var(--primary)', background: 'rgba(131,82,253,0.08)' } : {}}
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleChange}
            style={{ display: 'none' }}
          />
          <UploadCloud className="icon" />
          <div>
            <h3>Drag & Drop your photo here</h3>
            <p style={{ color: 'var(--text-muted)' }}>or click to browse · <strong>Ctrl+V</strong> to paste a screenshot</p>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2rem' }}>
          <div style={{
            width: '250px', height: '250px',
            borderRadius: 'var(--radius-lg)',
            overflow: 'hidden',
            border: '2px solid var(--primary)',
            boxShadow: 'var(--shadow-glow)',
            position: 'relative'
          }}>
            <img src={preview} alt="Human" className="image-preview" />
            {isProcessing && (
              <div style={{
                position: 'absolute', inset: 0,
                background: 'rgba(0,0,0,0.6)',
                backdropFilter: 'blur(4px)',
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center',
                gap: '1rem'
              }}>
                <div className="loader" />
                <span style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.8)', textAlign: 'center', padding: '0 1rem' }}>
                  Generating chibi sheet…
                </span>
              </div>
            )}
          </div>

          {error && (
            <p style={{ color: 'var(--secondary)', fontSize: '0.9rem', textAlign: 'center', maxWidth: '400px' }}>
              {error}
            </p>
          )}

          <div style={{ display: 'flex', gap: '1rem' }}>
            <button className="btn-secondary" onClick={() => { setPreview(null); setFile(null); setError(null); }} disabled={isProcessing}>
              Choose Another
            </button>
            <button className="btn-primary" onClick={handleTransform} disabled={isProcessing}>
              <SparklesIcon /> {isProcessing ? 'Generating…' : 'Transform to Chibi!'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function SparklesIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z" />
    </svg>
  );
}
