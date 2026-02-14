// ====== ROOM MODE — MAS-STYLE ENGINE ======

// Sprite image cache
const masImageCache = {};
let masImagesLoaded = false;
let masLoadingPromise = null;

// Dialogue queue state
let roomDialogueLines = [];
let roomDialogueIndex = -1;
let roomDialogueActive = false;

// Canvas ref
let masCanvas = null;
let masCtx = null;

// Layer ordering for MAS sprite compositing
const MAS_LAYER_ORDER = [
  // Background drawn separately (spaceroom)
  { type: 'table',    file: 'sprites/monika/t/chair-def.png' },
  { type: 'body',     file: 'sprites/monika/b/body-def-0.png' },
  { type: 'body',     file: 'sprites/monika/b/body-def-1.png' },
  { type: 'clothes0', file: 'sprites/monika/c/def/0.png' },
  { type: 'clothes1', file: 'sprites/monika/c/def/1.png' },
  { type: 'hairback', file: 'sprites/monika/h/def/0.png' },
  { type: 'bodyhead', file: 'sprites/monika/b/body-def-head.png' },
  // Face parts inserted dynamically after bodyhead (eyes, eyebrows, nose, mouth, blush, tears, sweat)
  { type: 'hairfront',file: 'sprites/monika/h/def/10.png' },
  { type: 'table',    file: 'sprites/monika/t/table-def.png' }
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
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => { masImageCache[src] = img; resolve(img); };
    img.onerror = () => {
      console.warn('[ROOM] Failed to load:', src);
      resolve(null); // Don't reject — missing sprites shouldn't crash
    };
    img.src = src;
  });
}

async function preloadMasImages() {
  if (masImagesLoaded) return;
  if (masLoadingPromise) return masLoadingPromise;

  masLoadingPromise = (async () => {
    const files = new Set();

    // Backgrounds
    files.add(MAS_BG_DAY);
    files.add(MAS_BG_NIGHT);

    // Static layers
    MAS_LAYER_ORDER.forEach(l => files.add(l.file));

    // All face part variants used by expressions
    const faceFiles = new Set();
    faceFiles.add('sprites/monika/f/face-nose-def.png');
    for (const [, expr] of Object.entries(MAS_EXPRESSIONS)) {
      faceFiles.add(`sprites/monika/f/face-eyes-${expr.eyes}.png`);
      faceFiles.add(`sprites/monika/f/face-eyebrows-${expr.eyebrows}.png`);
      faceFiles.add(`sprites/monika/f/face-mouth-${expr.mouth}.png`);
      if (expr.blush) faceFiles.add(`sprites/monika/f/face-blush-${expr.blush}.png`);
      if (expr.tears) faceFiles.add(`sprites/monika/f/face-tears-${expr.tears}.png`);
      if (expr.sweat) faceFiles.add(`sprites/monika/f/face-sweatdrop-${expr.sweat}.png`);
    }
    faceFiles.forEach(f => files.add(f));

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
  const dpr = window.devicePixelRatio || 1;
  const rect = container.getBoundingClientRect();

  // Native resolution of MAS sprites
  const nativeW = 1280, nativeH = 850;
  const scale = Math.min(rect.width / nativeW, rect.height / nativeH);
  const drawW = Math.floor(nativeW * scale);
  const drawH = Math.floor(nativeH * scale);

  masCanvas.width = drawW * dpr;
  masCanvas.height = drawH * dpr;
  masCanvas.style.width = drawW + 'px';
  masCanvas.style.height = drawH + 'px';
  masCtx.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0);
}

function drawMasSprite(expressionName) {
  if (!masCtx || !masCanvas) return;

  const expr = MAS_EXPRESSIONS[expressionName] || MAS_EXPRESSIONS.happy;
  const W = 1280, H = 850;

  masCtx.clearRect(0, 0, W, H);

  // 1. Background
  const bgFile = getMasBgFile();
  const bgImg = masImageCache[bgFile];
  if (bgImg) masCtx.drawImage(bgImg, 0, 0, W, H);

  // 2. Draw static layers in order, inserting face parts after bodyhead
  for (const layer of MAS_LAYER_ORDER) {
    const img = masImageCache[layer.file];
    if (img) masCtx.drawImage(img, 0, 0, W, H);

    // After bodyhead, draw face parts
    if (layer.type === 'bodyhead') {
      drawFaceParts(expr);
    }
  }
}

function drawFaceParts(expr) {
  const W = 1280, H = 850;

  // Eyes
  const eyesImg = masImageCache[`sprites/monika/f/face-eyes-${expr.eyes}.png`];
  if (eyesImg) masCtx.drawImage(eyesImg, 0, 0, W, H);

  // Eyebrows
  const ebImg = masImageCache[`sprites/monika/f/face-eyebrows-${expr.eyebrows}.png`];
  if (ebImg) masCtx.drawImage(ebImg, 0, 0, W, H);

  // Nose
  const noseImg = masImageCache['sprites/monika/f/face-nose-def.png'];
  if (noseImg) masCtx.drawImage(noseImg, 0, 0, W, H);

  // Mouth
  const mouthImg = masImageCache[`sprites/monika/f/face-mouth-${expr.mouth}.png`];
  if (mouthImg) masCtx.drawImage(mouthImg, 0, 0, W, H);

  // Optional extras
  if (expr.blush) {
    const blushImg = masImageCache[`sprites/monika/f/face-blush-${expr.blush}.png`];
    if (blushImg) masCtx.drawImage(blushImg, 0, 0, W, H);
  }
  if (expr.tears) {
    const tearsImg = masImageCache[`sprites/monika/f/face-tears-${expr.tears}.png`];
    if (tearsImg) masCtx.drawImage(tearsImg, 0, 0, W, H);
  }
  if (expr.sweat) {
    const sweatImg = masImageCache[`sprites/monika/f/face-sweatdrop-${expr.sweat}.png`];
    if (sweatImg) masCtx.drawImage(sweatImg, 0, 0, W, H);
  }
}

// ====== RESPONSE PARSING ======
function parseRoomResponse(rawText) {
  // 1. Strip mood/drift tags
  const { mood, moodIntensity, drift, text } = parseStateTags(
    rawText,
    'cheerful', 'moderate', 'casual'
  );

  // 2. Split into lines
  const rawLines = text.split('\n').map(l => l.trim()).filter(Boolean);

  // 3. Parse expression tags from each line
  const tagRe = /^\[(\w+)\]\s*(.+)$/;
  const dialogueLines = [];
  let lastExpr = 'happy';

  if (rawLines.length === 0) {
    // Fallback: single empty response
    return { mood, moodIntensity, drift, dialogueLines: [{ expression: 'happy', text: rawText.trim() || '...' }] };
  }

  // Check if ANY line has a tag
  const hasAnyTags = rawLines.some(l => tagRe.test(l));

  if (hasAnyTags) {
    // Tagged format
    for (const line of rawLines) {
      const m = line.match(tagRe);
      if (m) {
        const exprName = m[1].toLowerCase();
        const expr = MAS_EXPRESSIONS[exprName] ? exprName : lastExpr;
        lastExpr = expr;
        dialogueLines.push({ expression: expr, text: m[2].trim() });
      } else {
        // No tag — inherit previous
        dialogueLines.push({ expression: lastExpr, text: line });
      }
    }
  } else {
    // No tags at all — split by sentences and use keyword detection
    const fullText = rawLines.join(' ');
    const sentences = fullText.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [fullText];
    for (const sentence of sentences) {
      const trimmed = sentence.trim();
      if (!trimmed) continue;
      const expr = detectExpression(trimmed);
      dialogueLines.push({ expression: expr, text: trimmed });
    }
  }

  // Ensure at least one line
  if (dialogueLines.length === 0) {
    dialogueLines.push({ expression: 'happy', text: text });
  }

  return { mood, moodIntensity, drift, dialogueLines };
}

function detectExpression(text) {
  // Check keywords in priority order (more specific first)
  const priority = ['cry', 'laugh', 'flirty', 'angry', 'surprised', 'wink', 'pout', 'nervous', 'smug', 'tender', 'worried', 'sad', 'think', 'happy'];
  for (const name of priority) {
    if (EXPRESSION_KEYWORDS[name] && EXPRESSION_KEYWORDS[name].test(text)) {
      return name;
    }
  }
  return 'happy'; // default
}

// ====== DIALOGUE QUEUE ======
function startRoomDialogue(lines) {
  roomDialogueLines = lines;
  roomDialogueIndex = 0;
  roomDialogueActive = true;
  showRoomLine(0);
}

function showRoomLine(index) {
  if (index < 0 || index >= roomDialogueLines.length) return;

  const line = roomDialogueLines[index];
  const textEl = $('roomDialogueText');
  const box = $('roomDialogueBox');
  const hint = $('roomAdvanceHint');

  if (!textEl || !box) return;

  // Update sprite expression
  drawMasSprite(line.expression);

  // Update dialogue text
  textEl.textContent = line.text;
  box.style.display = '';

  // Show/hide advance indicator
  const isLast = index >= roomDialogueLines.length - 1;
  hint.textContent = isLast ? '' : '\u25BC';
  hint.style.display = isLast ? 'none' : '';
}

function advanceRoomDialogue() {
  if (!roomDialogueActive) return;

  roomDialogueIndex++;
  if (roomDialogueIndex >= roomDialogueLines.length) {
    finishRoomDialogue();
    return;
  }
  showRoomLine(roomDialogueIndex);
}

function finishRoomDialogue() {
  roomDialogueActive = false;
  roomDialogueIndex = -1;

  const box = $('roomDialogueBox');
  if (box) box.style.display = 'none';

  // Re-enable input
  const input = $('userInput');
  const btn = $('sendBtn');
  if (input) { input.disabled = false; input.focus(); }
  if (btn) btn.disabled = false;

  // Draw the last expression (stays on screen)
  if (roomDialogueLines.length > 0) {
    const lastExpr = roomDialogueLines[roomDialogueLines.length - 1].expression;
    drawMasSprite(lastExpr);
  }
}

// ====== SEND FLOW ======
async function sendRoomMessage() {
  const text = userInput.value.trim();
  if (!text || isGenerating) return;
  const chat = getChat();
  if (!chat) return;
  if (provider === 'openrouter' && !apiKey) { openSettings(); showToast('Enter your OpenRouter API key first.'); return; }
  if (provider === 'gemini' && !geminiKey) { openSettings(); showToast('Enter your Gemini API key first.'); return; }

  // Push user message
  chat.messages.push({ role: 'user', content: text });
  saveChats();
  userInput.value = '';
  userInput.style.height = 'auto';

  // Disable input, show thinking expression
  userInput.disabled = true;
  sendBtn.disabled = true;
  isGenerating = true;
  drawMasSprite('think');

  try {
    // Collect full response (no streaming display for room mode)
    let fullText = '';
    await callProviderStreaming(chat, (chunk) => {
      fullText += chunk;
    });

    const rawReply = fullText.trim();
    if (!rawReply) throw new Error('Got an empty response. Try again.');

    // Parse response
    const { mood, moodIntensity, drift, dialogueLines } = parseRoomResponse(rawReply);

    // Update chat state
    chat.mood = mood;
    chat.moodIntensity = moodIntensity;
    chat.drift = drift;
    chat.lastActiveTime = Date.now();
    chat.lastExpression = dialogueLines[dialogueLines.length - 1]?.expression || 'happy';

    // Store the raw reply for history, but strip mood/drift tags
    const cleanReply = dialogueLines.map(l => `[${l.expression}] ${l.text}`).join('\n');
    chat.messages.push({ role: 'assistant', content: cleanReply });
    saveChats();
    updateChatHeader(chat);

    // Start dialogue queue
    startRoomDialogue(dialogueLines);

  } catch (err) {
    showToast(err.message || 'Something went wrong.');
    userInput.disabled = false;
    sendBtn.disabled = false;
    // Restore last expression
    drawMasSprite(chat.lastExpression || 'happy');
  } finally {
    isGenerating = false;
  }
}

// ====== CLICK/TAP/KEY HANDLERS ======
function initRoomClickHandlers() {
  const scene = $('roomScene');
  const box = $('roomDialogueBox');

  if (box) {
    box.addEventListener('click', (e) => {
      e.stopPropagation();
      if (roomDialogueActive) advanceRoomDialogue();
    });
  }

  if (scene) {
    scene.addEventListener('click', (e) => {
      // Don't advance if clicking inside dialogue box (handled above) or input
      if (e.target.closest('.room-dialogue-box') || e.target.closest('.input-area')) return;
      if (roomDialogueActive) advanceRoomDialogue();
    });
  }

  // Keyboard: Space or Enter to advance (only when dialogue is active)
  document.addEventListener('keydown', (e) => {
    if (!roomDialogueActive) return;
    const chat = getChat();
    if (!chat || chat.mode !== 'room') return;

    if (e.key === ' ' || e.key === 'Enter') {
      // Don't capture if typing in input
      if (document.activeElement === $('userInput')) return;
      e.preventDefault();
      advanceRoomDialogue();
    }
  });
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

  // Preload sprites
  await preloadMasImages();
  loadingEl.style.display = 'none';

  // Setup canvas
  resizeMasCanvas();

  // Draw initial expression
  const lastExpr = chat.lastExpression || 'happy';
  drawMasSprite(lastExpr);

  // Resize handler
  window.addEventListener('resize', resizeMasCanvas);

  // If chat has messages, replay the last assistant message's last expression
  if (chat.messages.length > 0) {
    const lastAssistant = [...chat.messages].reverse().find(m => m.role === 'assistant');
    if (lastAssistant) {
      const { dialogueLines } = parseRoomResponse(lastAssistant.content);
      if (dialogueLines.length > 0) {
        const expr = dialogueLines[dialogueLines.length - 1].expression;
        drawMasSprite(expr);
      }
    }
  }
}

function teardownRoomMode() {
  const scene = $('roomScene');
  if (scene) scene.style.display = 'none';

  const box = $('roomDialogueBox');
  if (box) box.style.display = 'none';

  roomDialogueActive = false;
  roomDialogueLines = [];
  roomDialogueIndex = -1;

  window.removeEventListener('resize', resizeMasCanvas);
}

// Strip expression tags for chat list preview
function stripRoomTags(text) {
  return text.replace(/^\[(\w+)\]\s*/gm, '').trim();
}

// Initialize click handlers once on load
document.addEventListener('DOMContentLoaded', initRoomClickHandlers);
// Fallback if DOMContentLoaded already fired
if (document.readyState !== 'loading') initRoomClickHandlers();
