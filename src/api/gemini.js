export const MODELS = [
  { id: 'gemini-3-pro-image-preview', label: 'Nano Banana Pro' },
  { id: 'gemini-3.1-flash-image-preview', label: 'Nano Banana 2' },
];

export const DEFAULT_MODEL = MODELS[0].id;

// Text/audio model (no image generation needed)
const ANALYSIS_MODEL = 'gemini-2.0-flash';

const CHIBI_PROMPT = `Transform the uploaded human photo into a stylized "Urban Cinematic Chibi" character.
STYLE RULES:
- Chibi proportions (head 60–70% of body, small stylized body)
- Large glossy expressive eyes with strong reflections
- Minimal nose, soft detailed lips
- Clean anime line art with soft cinematic shading
- Slight glow highlights on skin and hair
- Maintain likeness and identity of the original person
URBAN CHARACTER DESIGN:
- Modern urban outfit (hoodie, crop top, cargos, streetwear)
- Add subtle gold jewelry (chains, earrings, rings, accessories)
- Confident but emotional expression (nostalgic, introspective, romantic)
LIGHTING:
- Cinematic lighting with soft glow
- Background with depth of field (bokeh, blurred environment)
- Mood-based lighting (rain, sunset, studio, or night city tones)
OUTPUT REQUIREMENT:
Generate a SINGLE IMAGE containing a 9-grid character sheet (3x3 layout).
All frames must be evenly spaced with clean borders and perfectly aligned.
GRID STRUCTURE (STRICT ORDER):
Top Row:
1. Front Full Body — Neutral Mood
2. Side View Walking — Focused Mood
3. Back View Standing — Calm Mood
Middle Row:
4. Close-Up Face — Neutral Mood
5. Close-Up Face — Sad / Nostalgic Mood (slightly teary eyes)
6. Close-Up Face — Happy Mood (warm smile)
Bottom Row:
7. Action Pose — Confident Mood (walking or performing)
8. Sitting Pose — Chill Mood (relaxed, introspective)
9. Style Pose — Fashion Mood (focus on outfit & accessories)
MANDATORY LABELING:
Each frame MUST include a small clean caption at the bottom center using this EXACT format:
Image 1 — Front View | Neutral Mood
Image 2 — Side Walk | Focused Mood
Image 3 — Back View | Calm Mood
Image 4 — Close-Up | Neutral Mood
Image 5 — Close-Up | Sad Mood
Image 6 — Close-Up | Happy Mood
Image 7 — Action Pose | Confident Mood
Image 8 — Sitting Pose | Chill Mood
Image 9 — Style Pose | Fashion Mood
LABEL STYLE:
- Minimal clean font
- White or soft color with slight shadow for readability
- Not intrusive, but clearly readable
- Consistent across all 9 frames
BACKGROUND:
Keep cinematic but subtle (soft blur, bokeh, urban tones).
Do NOT clutter the composition.
CONSISTENCY RULE:
Character must remain IDENTICAL across all 9 frames:
- Same face
- Same hairstyle
- Same outfit system
- Same proportions
QUALITY:
Ultra clean, high resolution, polished illustration.
Consistent lighting and rendering across entire grid.
IMPORTANT:
The result must look like a professional character sheet for a Latin urban anime brand mascot.
Avoid generic cartoon style — must feel cinematic, emotional, and premium.`;

function getApiKey() {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  if (!apiKey || apiKey === 'your_gemini_api_key_here') {
    throw new Error('Missing Gemini API key — add VITE_GEMINI_API_KEY to your .env file');
  }
  return apiKey;
}

function buildUrl(model) {
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${getApiKey()}`;
}

function extractImage(data) {
  const parts = data.candidates?.[0]?.content?.parts ?? [];
  const imagePart = parts.find(p => p.inlineData || p.inline_data);
  if (!imagePart) {
    const textPart = parts.find(p => p.text);
    throw new Error(textPart ? `Gemini refused: ${textPart.text}` : 'No image returned from Gemini');
  }
  const imgData = imagePart.inlineData || imagePart.inline_data;
  return `data:${imgData.mimeType || imgData.mime_type};base64,${imgData.data}`;
}

/** Generate initial 9-grid character sheet from a photo */
export async function generateChibiSheet(imageBase64, mimeType, model = DEFAULT_MODEL) {
  const response = await fetch(buildUrl(model), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        parts: [
          { text: CHIBI_PROMPT },
          { inline_data: { mime_type: mimeType, data: imageBase64 } }
        ]
      }],
      generationConfig: {
        responseModalities: ['image', 'text'],
      }
    })
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.message || `API error ${response.status}`);
  }

  const data = await response.json();
  console.log('Gemini sheet response:', JSON.stringify(data, null, 2));
  return extractImage(data);
}

/**
 * Edit/refine an existing character sheet based on user instructions.
 * Optionally accepts an outfit reference image (e.g. pasted from Pinterest).
 */
export async function editChibiSheet(previousImageBase64, editPrompt, model = DEFAULT_MODEL, outfitRefBase64 = null) {
  const raw = stripDataUrl(previousImageBase64);
  const mimeType = guessMime(previousImageBase64);

  const hasOutfit = !!outfitRefBase64;
  const outfitRaw = hasOutfit ? stripDataUrl(outfitRefBase64) : null;
  const outfitMime = hasOutfit ? guessMime(outfitRefBase64) : null;

  const prompt = hasOutfit
    ? `You previously generated this 9-grid chibi character sheet (IMAGE 1).
The user has also provided an outfit reference image (IMAGE 2).

User instructions: "${editPrompt}"

RULES:
- Adapt the outfit from the reference image onto the chibi character across ALL 9 frames.
- Convert the real-world outfit into the same Urban Cinematic Chibi art style.
- Keep the EXACT same 9-grid layout, same poses, same labels.
- Keep the character's face, hairstyle, and identity IDENTICAL.
- Maintain accessories (jewelry, etc.) unless the user says otherwise.
- Maintain the same cinematic urban chibi style and quality.
- Return a SINGLE IMAGE with the updated 9-grid character sheet.`
    : `You previously generated this 9-grid chibi character sheet.
The user wants the following changes applied:

"${editPrompt}"

RULES:
- Keep the EXACT same 9-grid layout, same poses, same labels.
- Keep the character's face, hairstyle, and identity IDENTICAL.
- ONLY change what the user asked for.
- Maintain the same cinematic urban chibi style and quality.
- Return a SINGLE IMAGE with the updated 9-grid character sheet.`;

  const parts = [
    { text: prompt },
    { inline_data: { mime_type: mimeType, data: raw } },
  ];
  if (hasOutfit) {
    parts.push({ inline_data: { mime_type: outfitMime, data: outfitRaw } });
  }

  const response = await fetch(buildUrl(model), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts }],
      generationConfig: { responseModalities: ['image', 'text'] },
    })
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.message || `API error ${response.status}`);
  }

  const data = await response.json();
  console.log('Gemini edit response:', JSON.stringify(data, null, 2));
  return extractImage(data);
}

function stripDataUrl(dataUrl) {
  return dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
}

function guessMime(dataUrl) {
  if (dataUrl.startsWith('data:image/png')) return 'image/png';
  if (dataUrl.startsWith('data:image/webp')) return 'image/webp';
  return 'image/jpeg';
}

/**
 * Generate the FIRST frame of a scene.
 * characterImages: array of { raw, mimeType } — main character first, tagged extras after.
 */
async function generateFirstFrame(characterImages, scenePrompt, model) {
  const prompt = `You are given ${characterImages.length} character sheet${characterImages.length > 1 ? 's' : ''} as visual reference.
Generate a SINGLE scene illustration — the OPENING frame.

SCENE: "${scenePrompt}"

OPENING FRAME RULES:
- Show the very first moment: set the stage, establish the environment, show where the character(s) are and their initial position/expression.
- Camera angle: wide or medium shot that establishes the scene geography.
- All referenced characters must appear with their EXACT appearance from their sheets.
- Urban cinematic chibi style, 16:9 aspect ratio, cinematic lighting, depth-of-field bokeh.
- High quality, polished, emotional. Clean composition for video keyframe use.`;

  const parts = [
    { text: prompt },
    ...characterImages.map(c => ({ inline_data: { mime_type: c.mimeType, data: c.raw } })),
  ];

  const response = await fetch(buildUrl(model), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts }],
      generationConfig: { responseModalities: ['image', 'text'] },
    })
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.message || `API error ${response.status}`);
  }
  return extractImage(await response.json());
}

/**
 * Generate the LAST frame as a continuation of the first frame from a different angle.
 * firstFrameBase64 is included so the model sees what already happened.
 */
async function generateLastFrame(characterImages, scenePrompt, firstFrameBase64, model) {
  const prompt = `You are given ${characterImages.length} character sheet${characterImages.length > 1 ? 's' : ''} plus the FIRST FRAME of an animated scene.
Generate the LAST FRAME — the closing moment of the same scene.

SCENE: "${scenePrompt}"

LAST FRAME RULES:
- This is the CONTINUATION of what happened in the first frame. Show the result/aftermath.
- MANDATORY: Use a COMPLETELY DIFFERENT camera angle than the first frame.
  • If the first frame was a wide shot → use a close-up or low-angle shot.
  • If the first frame was front-facing → use a side or three-quarter angle.
  • If the first frame was eye-level → use a high or low angle.
- The environment, lighting mood, and characters must remain consistent with the first frame.
- Characters must look IDENTICAL to their reference sheets.
- Urban cinematic chibi style, 16:9 aspect ratio, cinematic lighting, depth-of-field bokeh.
- High quality, polished, emotional. Clean composition for video keyframe use.`;

  const parts = [
    { text: prompt },
    ...characterImages.map(c => ({ inline_data: { mime_type: c.mimeType, data: c.raw } })),
    { inline_data: { mime_type: guessMime(firstFrameBase64), data: stripDataUrl(firstFrameBase64) } },
  ];

  const response = await fetch(buildUrl(model), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts }],
      generationConfig: { responseModalities: ['image', 'text'] },
    })
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.message || `API error ${response.status}`);
  }
  return extractImage(await response.json());
}

/**
 * Regenerate a single frame (used when user deletes and wants to redo just one).
 */
export async function generateSceneFrame(characterImageBase64, scenePrompt, frameType, model) {
  const images = [{ raw: stripDataUrl(characterImageBase64), mimeType: guessMime(characterImageBase64) }];
  if (frameType === 'first') return generateFirstFrame(images, scenePrompt, model);
  // For standalone last-frame regen we don't have the first frame — generate as closing shot
  const prompt = `Generate the CLOSING frame of this scene.
SCENE: "${scenePrompt}"
Use a dramatic close-up or low-angle shot. Show the aftermath/result.
Character must match the reference sheet exactly. Urban cinematic chibi style, 16:9.`;
  const parts = [{ text: prompt }, { inline_data: { mime_type: images[0].mimeType, data: images[0].raw } }];
  const response = await fetch(buildUrl(model), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts }], generationConfig: { responseModalities: ['image', 'text'] } })
  });
  if (!response.ok) { const err = await response.json().catch(() => ({})); throw new Error(err.error?.message || `API error ${response.status}`); }
  return extractImage(await response.json());
}

/**
 * Generate both frames for a story scene.
 * @param characterImageBase64 - main character sheet
 * @param scenePrompt - scene description (may contain @tags)
 * @param model
 * @param taggedCharacters - array of { tag, image } for @mentioned characters
 * Returns { firstFrame, lastFrame, veoPrompt }
 */
export async function generateStoryScene(characterImageBase64, scenePrompt, model = DEFAULT_MODEL, taggedCharacters = []) {
  // Build character image list: main character first, then any @tagged ones
  const characterImages = [
    { raw: stripDataUrl(characterImageBase64), mimeType: guessMime(characterImageBase64) },
    ...taggedCharacters
      .filter(c => c.image)
      .map(c => ({ raw: stripDataUrl(c.image), mimeType: guessMime(c.image) })),
  ];

  // Generate first frame, then last frame using first as reference
  const firstFrame = await generateFirstFrame(characterImages, scenePrompt, model);
  const lastFrame = await generateLastFrame(characterImages, scenePrompt, firstFrame, model);
  const veoPrompt = buildVeoPrompt(scenePrompt);

  return { firstFrame, lastFrame, veoPrompt };
}

/**
 * Build a Veo 3.1-compatible animation prompt from the scene description.
 */
function buildVeoPrompt(scenePrompt) {
  return `Animate this scene in Urban Cinematic Chibi anime style. Smooth, fluid motion with cinematic camera movement. Soft depth-of-field bokeh background. Emotional and expressive character animation.

Scene: ${scenePrompt}

Style: Chibi anime proportions, large glossy eyes, cinematic lighting with neon urban tones. Gold jewelry glints subtly. Hair and clothing move naturally with physics. Mood-driven color grading.

Camera: Start with a slight zoom-in, gentle parallax on background layers. Subtle camera shake for immersion.

Duration: 4-6 seconds. 24fps. High quality rendering.`;
}

/**
 * Analyze an audio track (MP3/WAV) and return a creative brief object.
 */
export async function analyzeAudioTrack(audioBase64, mimeType) {
  const raw = stripDataUrl(audioBase64);
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${ANALYSIS_MODEL}:generateContent?key=${getApiKey()}`;

  const prompt = `Listen to this music track and produce a creative brief for an animated visual story.

Return ONLY a valid JSON object with these fields:
{
  "mood": "primary emotional mood (e.g. melancholic, euphoric, tense, romantic)",
  "energy": "low | medium | high",
  "tempo": "slow | medium | fast",
  "themes": ["theme1", "theme2", "theme3"],
  "setting_suggestions": ["setting1", "setting2"],
  "visual_palette": "short color/lighting description",
  "narrative_arc": "1-2 sentence suggested story arc",
  "character_emotions": ["emotion1", "emotion2", "emotion3"],
  "detected_title": "song title or genre if recognizable, else null"
}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        parts: [
          { text: prompt },
          { inline_data: { mime_type: mimeType, data: raw } },
        ]
      }],
      generationConfig: { responseMimeType: 'application/json' },
    })
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.message || `Audio analysis error ${response.status}`);
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}';
  try { return JSON.parse(text); } catch { return {}; }
}

/**
 * Generate 5 story scene ideas based on audio analysis + existing story nodes.
 * Returns an array of 5 suggestion strings.
 */
export async function generateStorySuggestions(audioAnalysis, existingNodes, characterName, model) {
  const suggestionModel = model || MODELS[0].id;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${suggestionModel}:generateContent?key=${getApiKey()}`;

  const storyContext = existingNodes?.length > 0
    ? `Story so far:\n${existingNodes.map((n, i) => `Scene ${i + 1}: ${n.text}`).join('\n')}`
    : 'No scenes yet — this would be the opening scene.';

  const audioContext = audioAnalysis
    ? `Music analysis:
- Mood: ${audioAnalysis.mood}
- Energy: ${audioAnalysis.energy}
- Themes: ${(audioAnalysis.themes || []).join(', ')}
- Narrative arc: ${audioAnalysis.narrative_arc}
- Visual palette: ${audioAnalysis.visual_palette}
- Character emotions: ${(audioAnalysis.character_emotions || []).join(', ')}`
    : 'No music track provided.';

  const prompt = `You are a creative director building a visual story for an animated music video featuring ${characterName || 'an urban chibi character'}.

${audioContext}

${storyContext}

Generate exactly 5 ideas for the NEXT scene. Each idea must be:
- One vivid sentence describing the visual moment and character action/emotion
- Inspired by the music's mood and themes
- Designed to create a great first-frame → last-frame visual arc
- Building on the story context if scenes already exist

Return ONLY a valid JSON array of exactly 5 strings:
["idea 1", "idea 2", "idea 3", "idea 4", "idea 5"]`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json' },
    })
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.message || `Suggestions error ${response.status}`);
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '[]';
  try { return JSON.parse(text); } catch { return []; }
}
