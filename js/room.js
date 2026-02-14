// ====== ROOM MODE — MAS-STYLE ENGINE ======

// Sprite image cache
const masImageCache = {};
let masImagesLoaded = false;
let masLoadingPromise = null;

// Dialogue queue state
let roomDialogueLines = [];
let roomDialogueIndex = -1;
let roomDialogueActive = false;
let roomClickHandlersInit = false;

// Canvas ref
let masCanvas = null;
let masCtx = null;

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
  { type: 'ribbonback', file: 'sprites/monika/a/ribbon_def/0.png' },
  { type: 'hairback',   file: 'sprites/monika/h/def/0.png' },
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
      resolve(null); // Missing sprites shouldn't crash
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

    // Face parts: nose + all expression variants
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
  const dpr = window.devicePixelRatio || 1;
  const rect = container.getBoundingClientRect();

  const scale = Math.min(rect.width / MAS_W, rect.height / MAS_H);
  const drawW = Math.floor(MAS_W * scale);
  const drawH = Math.floor(MAS_H * scale);

  masCanvas.width = drawW * dpr;
  masCanvas.height = drawH * dpr;
  masCanvas.style.width = drawW + 'px';
  masCanvas.style.height = drawH + 'px';
  masCtx.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0);
}

function drawLayer(src) {
  const img = masImageCache[src];
  if (img) masCtx.drawImage(img, 0, 0, MAS_W, MAS_H);
}

function drawMasSprite(expressionName) {
  if (!masCtx || !masCanvas) return;

  const expr = MAS_EXPRESSIONS[expressionName] || MAS_EXPRESSIONS.happy;

  masCtx.clearRect(0, 0, MAS_W, MAS_H);

  // 1. Background — stretched to fill canvas (1280x720 → 1280x850)
  const bgFile = getMasBgFile();
  drawLayer(bgFile);

  // 2. Draw character layers in order, inserting face parts after bodyhead
  for (const layer of MAS_LAYER_ORDER) {
    drawLayer(layer.file);

    // After bodyhead, draw face parts
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
    return { mood, moodIntensity, drift, dialogueLines: [{ expression: 'happy', text: rawText.trim() || '...' }] };
  }

  // Check if ANY line has a tag
  const hasAnyTags = rawLines.some(l => tagRe.test(l));

  if (hasAnyTags) {
    for (const line of rawLines) {
      const m = line.match(tagRe);
      if (m) {
        const exprName = m[1].toLowerCase();
        const expr = MAS_EXPRESSIONS[exprName] ? exprName : lastExpr;
        lastExpr = expr;
        dialogueLines.push({ expression: expr, text: m[2].trim() });
      } else {
        dialogueLines.push({ expression: lastExpr, text: line });
      }
    }
  } else {
    // No tags — split by sentences and use keyword detection
    const fullText = rawLines.join(' ');
    const sentences = fullText.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [fullText];
    for (const sentence of sentences) {
      const trimmed = sentence.trim();
      if (!trimmed) continue;
      dialogueLines.push({ expression: detectExpression(trimmed), text: trimmed });
    }
  }

  if (dialogueLines.length === 0) {
    dialogueLines.push({ expression: 'happy', text: text });
  }

  return { mood, moodIntensity, drift, dialogueLines };
}

function detectExpression(text) {
  const priority = ['cry', 'laugh', 'flirty', 'angry', 'surprised', 'wink', 'pout', 'nervous', 'smug', 'tender', 'worried', 'sad', 'think', 'happy'];
  for (const name of priority) {
    if (EXPRESSION_KEYWORDS[name] && EXPRESSION_KEYWORDS[name].test(text)) return name;
  }
  return 'happy';
}

// ====== LIVE STREAMING DISPLAY ======
// Strip mood/drift/expression tags for live display
function liveStripRoomTags(text) {
  return text
    .replace(/^\[MOOD:\s*\w+(?::\s*\w+)?\]\s*(?:\[DRIFT:\s*\w+\]\s*)?/i, '')
    .replace(/^\[(\w+)\]\s*/gm, '')
    .trim();
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

  // Keep the last expression on screen
  if (roomDialogueLines.length > 0) {
    drawMasSprite(roomDialogueLines[roomDialogueLines.length - 1].expression);
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

  // Show dialogue box for live streaming text
  const textEl = $('roomDialogueText');
  const box = $('roomDialogueBox');
  const hint = $('roomAdvanceHint');
  if (box) box.style.display = '';
  if (textEl) textEl.textContent = '...';
  if (hint) hint.style.display = 'none';

  try {
    let fullText = '';
    let updatePending = false;

    // Stream text live into the dialogue box
    await callProviderStreaming(chat, (chunk) => {
      fullText += chunk;
      if (!updatePending) {
        updatePending = true;
        requestAnimationFrame(() => {
          if (textEl) textEl.textContent = liveStripRoomTags(fullText);
          updatePending = false;
        });
      }
    });

    const rawReply = fullText.trim();
    if (!rawReply) throw new Error('Got an empty response. Try again.');

    // Hide dialogue box briefly, then start click-to-advance
    if (box) box.style.display = 'none';

    // Parse response
    const { mood, moodIntensity, drift, dialogueLines } = parseRoomResponse(rawReply);

    // Update chat state
    chat.mood = mood;
    chat.moodIntensity = moodIntensity;
    chat.drift = drift;
    chat.lastActiveTime = Date.now();
    chat.lastExpression = dialogueLines[dialogueLines.length - 1]?.expression || 'happy';

    // Store clean reply for history
    const cleanReply = dialogueLines.map(l => `[${l.expression}] ${l.text}`).join('\n');
    chat.messages.push({ role: 'assistant', content: cleanReply });
    saveChats();
    updateChatHeader(chat);

    // Start click-to-advance dialogue queue
    startRoomDialogue(dialogueLines);

  } catch (err) {
    showToast(err.message || 'Something went wrong.');
    if (box) box.style.display = 'none';
    userInput.disabled = false;
    sendBtn.disabled = false;
    drawMasSprite(chat.lastExpression || 'happy');
  } finally {
    isGenerating = false;
  }
}

// ====== CLICK/TAP/KEY HANDLERS ======
function initRoomClickHandlers() {
  if (roomClickHandlersInit) return;
  roomClickHandlersInit = true;

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
      if (e.target.closest('.room-dialogue-box') || e.target.closest('.input-area')) return;
      if (roomDialogueActive) advanceRoomDialogue();
    });
  }

  // Keyboard: Space or Enter to advance (only when dialogue is active and not typing)
  document.addEventListener('keydown', (e) => {
    if (!roomDialogueActive) return;
    const chat = getChat();
    if (!chat || chat.mode !== 'room') return;
    if (e.key === ' ' || e.key === 'Enter') {
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

  await preloadMasImages();
  loadingEl.style.display = 'none';

  // Setup canvas
  resizeMasCanvas();

  // Draw initial expression (restore last from chat history)
  let lastExpr = chat.lastExpression || 'happy';
  if (chat.messages.length > 0) {
    const lastAssistant = [...chat.messages].reverse().find(m => m.role === 'assistant');
    if (lastAssistant) {
      const { dialogueLines } = parseRoomResponse(lastAssistant.content);
      if (dialogueLines.length > 0) lastExpr = dialogueLines[dialogueLines.length - 1].expression;
    }
  }
  drawMasSprite(lastExpr);

  // Resize handler
  window.addEventListener('resize', resizeMasCanvas);

  // Init click handlers (once)
  initRoomClickHandlers();
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
