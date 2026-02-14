// ====== ROOM MODE — MAS-STYLE ENGINE ======

// Sprite image cache
const masImageCache = {};
let masImagesLoaded = false;
let masLoadingPromise = null;

// Canvas ref
let masCanvas = null;
let masCtx = null;

// Current expression for redrawing on resize
let currentRoomExpression = 'happy';

// Canonical canvas size — all layers drawn at this size
const MAS_W = 1280, MAS_H = 850;

// Layer ordering for MAS sprite compositing
// Depth numbers from MAS filenames: 0=back, 5=mid, 10=front
const MAS_LAYER_ORDER = [
  { type: 'chair',      file: 'sprites/monika/t/chair-def.png' },
  { type: 'body',       file: 'sprites/monika/b/body-def-0.png' },
  { type: 'body',       file: 'sprites/monika/b/body-def-1.png' },
  { type: 'clothes0',   file: 'sprites/monika/c/def/clothes-0.png' },
  { type: 'clothes1',   file: 'sprites/monika/c/def/clothes-1.png' },
  { type: 'arms',       file: 'sprites/monika/b/arms-steepling-10.png' },
  { type: 'armclothes', file: 'sprites/monika/c/def/arms-steepling-10.png' },
  { type: 'hairback',   file: 'sprites/monika/h/def/0.png' },
  { type: 'ribbonback', file: 'sprites/monika/a/ribbon_def/0.png' },
  { type: 'bodyhead',   file: 'sprites/monika/b/body-def-head.png' },
  // Face parts inserted dynamically after bodyhead
  { type: 'ribbonfront',file: 'sprites/monika/a/ribbon_def/5.png' },
  { type: 'hairfront',  file: 'sprites/monika/h/def/10.png' },
  { type: 'table',      file: 'sprites/monika/t/table-def.png' }
];

// Background files
const MAS_BG_DAY = 'sprites/location/spaceroom.png';
const MAS_BG_NIGHT = 'sprites/location/spaceroom-n.png';

// ====== IMAGE LOADING ======
function getMasBgFile() {
  const hour = new Date().getHours();
  return (hour >= 18 || hour < 6) ? MAS_BG_NIGHT : MAS_BG_DAY;
}

function loadImage(src) {
  if (masImageCache[src]) return Promise.resolve(masImageCache[src]);
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => { masImageCache[src] = img; resolve(img); };
    img.onerror = () => {
      console.warn('[ROOM] Failed to load:', src);
      resolve(null);
    };
    img.src = src;
  });
}

async function preloadMasImages() {
  if (masImagesLoaded) return;
  if (masLoadingPromise) return masLoadingPromise;

  masLoadingPromise = (async () => {
    const files = new Set();
    files.add(MAS_BG_DAY);
    files.add(MAS_BG_NIGHT);
    MAS_LAYER_ORDER.forEach(l => files.add(l.file));
    files.add('sprites/monika/f/face-nose-def.png');
    for (const [, expr] of Object.entries(MAS_EXPRESSIONS)) {
      files.add(`sprites/monika/f/face-eyes-${expr.eyes}.png`);
      files.add(`sprites/monika/f/face-eyebrows-${expr.eyebrows}.png`);
      files.add(`sprites/monika/f/face-mouth-${expr.mouth}.png`);
      if (expr.blush) files.add(`sprites/monika/f/face-blush-${expr.blush}.png`);
      if (expr.tears) files.add(`sprites/monika/f/face-tears-${expr.tears}.png`);
      if (expr.sweat) files.add(`sprites/monika/f/face-sweatdrop-${expr.sweat}.png`);
    }
    await Promise.all([...files].map(f => loadImage(f)));
    masImagesLoaded = true;
    masLoadingPromise = null;
  })();

  return masLoadingPromise;
}

// ====== CANVAS DRAWING ======
function resizeMasCanvas() {
  masCanvas = $('masCanvas');
  if (!masCanvas) return;
  masCtx = masCanvas.getContext('2d');

  const container = masCanvas.parentElement;
  if (!container) return;
  const rect = container.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return;

  const dpr = window.devicePixelRatio || 1;
  const scale = Math.min(rect.width / MAS_W, rect.height / MAS_H);
  const drawW = Math.floor(MAS_W * scale);
  const drawH = Math.floor(MAS_H * scale);

  masCanvas.width = drawW * dpr;
  masCanvas.height = drawH * dpr;
  masCanvas.style.width = drawW + 'px';
  masCanvas.style.height = drawH + 'px';
  masCtx.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0);

  // Redraw current expression after resize (canvas clears when dimensions change)
  if (masImagesLoaded) drawMasSprite(currentRoomExpression);
}

function drawLayer(src) {
  const img = masImageCache[src];
  if (img) masCtx.drawImage(img, 0, 0, MAS_W, MAS_H);
}

function drawMasSprite(expressionName) {
  if (!masCtx || !masCanvas) return;

  const expr = MAS_EXPRESSIONS[expressionName] || MAS_EXPRESSIONS.happy;
  currentRoomExpression = expressionName;

  masCtx.clearRect(0, 0, MAS_W, MAS_H);

  // 1. Background — stretched to fill canvas (1280x720 → 1280x850)
  drawLayer(getMasBgFile());

  // 2. Character layers with face parts inserted after bodyhead
  for (const layer of MAS_LAYER_ORDER) {
    drawLayer(layer.file);

    if (layer.type === 'bodyhead') {
      drawLayer(`sprites/monika/f/face-eyes-${expr.eyes}.png`);
      drawLayer(`sprites/monika/f/face-eyebrows-${expr.eyebrows}.png`);
      drawLayer('sprites/monika/f/face-nose-def.png');
      drawLayer(`sprites/monika/f/face-mouth-${expr.mouth}.png`);
      if (expr.blush) drawLayer(`sprites/monika/f/face-blush-${expr.blush}.png`);
      if (expr.tears) drawLayer(`sprites/monika/f/face-tears-${expr.tears}.png`);
      if (expr.sweat) drawLayer(`sprites/monika/f/face-sweatdrop-${expr.sweat}.png`);
    }
  }
}

// ====== EXPRESSION PICKER (separate AI call) ======
const EXPRESSION_PICKER_PROMPT = `Pick the single facial expression that best matches this message and mood. Reply with ONLY the expression name, nothing else.

Expressions: happy, sad, angry, surprised, flirty, smug, laugh, tender, think, worried, cry, pout, wink, nervous`;

async function pickExpressionAI(responseText, mood, intensity) {
  try {
    const messages = [
      { role: 'system', content: EXPRESSION_PICKER_PROMPT },
      { role: 'user', content: `Mood: ${mood} (${intensity})\nMessage: "${responseText.slice(0, 300)}"` }
    ];
    const result = await callAI(messages, 10);
    const name = result.trim().toLowerCase().replace(/[^a-z]/g, '');
    return MAS_EXPRESSIONS[name] ? name : null;
  } catch {
    return null;
  }
}

// Mood-to-expression mapping for instant fallback
function moodToExpression(mood) {
  const map = {
    cheerful: 'happy', playful: 'smug', thoughtful: 'think', melancholic: 'sad',
    excited: 'surprised', tender: 'tender', teasing: 'wink', curious: 'think',
    nostalgic: 'tender', flustered: 'nervous', calm: 'happy', passionate: 'flirty'
  };
  return map[mood] || 'happy';
}

// Update expression: immediate mood fallback, then async AI refinement
async function updateRoomExpression(responseText, mood, intensity) {
  // Immediate: use mood mapping
  const moodExpr = moodToExpression(mood);
  drawMasSprite(moodExpr);

  // Async: ask AI for better expression
  const aiExpr = await pickExpressionAI(responseText, mood, intensity);
  // Only update if user hasn't started another message
  if (!isGenerating && aiExpr) drawMasSprite(aiExpr);

  return aiExpr || moodExpr;
}

// ====== INIT / TEARDOWN ======
async function initRoomMode(chat) {
  const scene = $('roomScene');
  if (!scene) return;
  scene.style.display = '';

  // Show loading text
  let loadingEl = scene.querySelector('.room-loading-text');
  if (!loadingEl) {
    loadingEl = document.createElement('div');
    loadingEl.className = 'room-loading-text';
    loadingEl.textContent = 'Loading sprites...';
    scene.appendChild(loadingEl);
  }
  loadingEl.style.display = '';

  await preloadMasImages();
  loadingEl.style.display = 'none';

  resizeMasCanvas();

  // Restore last expression
  const lastExpr = chat.lastExpression || 'happy';
  drawMasSprite(lastExpr);

  window.addEventListener('resize', resizeMasCanvas);
}

function teardownRoomMode() {
  const scene = $('roomScene');
  if (scene) scene.style.display = 'none';
  window.removeEventListener('resize', resizeMasCanvas);
}

// Strip expression tags for legacy room mode messages
function stripRoomTags(text) {
  return text.replace(/^\[(\w+)\]\s*/gm, '').trim();
}
