/**
 * chess.js — Moni-Talk chess minigame
 * Board rendering, clock logic, Stockfish glue, multi-segment time controls.
 */

import { Chess } from 'https://cdn.jsdelivr.net/npm/chess.js@1.0.0/dist/esm/chess.js';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const LIGHT_SQ        = '#FFF8F9';
const DARK_SQ         = '#F5A7B8';
const SEL_COLOR       = 'rgba(255,214,0,0.50)';
const LASTMOVE_COLOR  = 'rgba(220,150,170,0.55)';
const DOT_EMPTY       = 'rgba(0,0,0,0.16)';
const DOT_CAPTURE     = 'rgba(0,0,0,0.13)';

// Unicode pieces: color + lowercase type → symbol
const PIECE = {
  wk:'♔', wq:'♕', wr:'♖', wb:'♗', wn:'♘', wp:'♙',
  bk:'♚', bq:'♛', br:'♜', bb:'♝', bn:'♞', bp:'♟',
};

// Approximate ELO per Stockfish skill level 0–20
const ELO_TABLE = [
  500, 600, 700, 800, 900, 1000, 1100, 1200,
  1350, 1500, 1600, 1700, 1800, 1900, 2000,
  2100, 2200, 2400, 2700, 3000, 3200
];

const COMMENTARY_ENABLED = false;

// ─────────────────────────────────────────────────────────────────────────────
// App State
// ─────────────────────────────────────────────────────────────────────────────

// Setup
let segments    = [];
let chosenColor = 'white';   // 'white' | 'black' | 'random'
let skillLevel  = 20;

// Game
let chess        = null;
let canvas       = null;
let ctx          = null;
let worker       = null;
let workerReady  = false;
let boardFlipped = false;
let gameOver     = false;

// Board interaction
let selectedSq    = null;
let legalTargets  = [];
let lastMoveFrom  = null;
let lastMoveTo    = null;
let engineThinking = false;

// Pending promotion
let pendingPromoFrom = null;
let pendingPromoTo   = null;

// Clocks
let clockRunning  = false;
let clockRaf      = null;
let lastTickMs    = 0;
let wClockMs      = 0;
let bClockMs      = 0;
let wDelayMs      = 0;
let bDelayMs      = 0;

// Game tracking
let playerSide  = 'w';   // human's chess color: 'w' | 'b'
let totalPlies  = 0;     // half-moves completed
let segmentIdx  = 0;

// Engine timing (minimum display delay)
let engineRequestTime = 0;

// ─────────────────────────────────────────────────────────────────────────────
// Initialization
// ─────────────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  canvas = document.getElementById('chessCanvas');
  ctx    = canvas.getContext('2d');

  initSegments();
  bindSetupUI();
  bindGameUI();
  window.addEventListener('resize', onResize);
});

// ─────────────────────────────────────────────────────────────────────────────
// Segment Data Model
// ─────────────────────────────────────────────────────────────────────────────

function makeSegment(movesThreshold) {
  return {
    moves: movesThreshold,                  // null = runs to end
    white: { h:0, m:10, s:0 },
    black: { h:0, m:10, s:0 },
    blackTimeDirty: false,
    incType: 'none',                        // 'none' | 'fischer' | 'delay'
    incWhite: 0,                            // seconds
    incBlack: 0,
    blackIncDirty: false,
  };
}

function initSegments() {
  segments = [makeSegment(null)];
  renderSegments();
}

function addSegment() {
  // Give the current last segment a move threshold
  const prev = segments[segments.length - 1];
  if (prev.moves === null) prev.moves = 40;
  segments.push(makeSegment(null));
  renderSegments();
}

function removeSegment(idx) {
  segments.splice(idx, 1);
  segments[segments.length - 1].moves = null;  // last always runs to end
  renderSegments();
}

function renderSegments() {
  const list = document.getElementById('segmentList');
  list.innerHTML = '';

  segments.forEach((seg, i) => {
    const isFirst = i === 0;
    const isLast  = i === segments.length - 1;
    const div = document.createElement('div');
    div.className = 'segment-block';

    div.innerHTML = `
      <div class="segment-header">
        <span class="segment-title">${isFirst ? 'Starting Time' : `Segment ${i + 1}`}</span>
        ${!isFirst ? `<button class="remove-segment-btn" data-idx="${i}">&#10005; Remove</button>` : ''}
      </div>
      ${!isLast ? `
        <div class="segment-moves-row">
          <label>After</label>
          <input type="number" class="seg-moves-input" data-seg="${i}" value="${seg.moves || 40}" min="1" max="9999">
          <label>full moves, add:</label>
        </div>
      ` : ''}
      <div class="time-grid">
        <div class="time-side-label">White</div>
        <div class="hms-group">
          <input type="number" class="hms-input" data-seg="${i}" data-side="white" data-field="h" value="${seg.white.h}" min="0" max="9">
          <span class="hms-sep">h</span>
          <input type="number" class="hms-input" data-seg="${i}" data-side="white" data-field="m" value="${seg.white.m}" min="0" max="59">
          <span class="hms-sep">m</span>
          <input type="number" class="hms-input" data-seg="${i}" data-side="white" data-field="s" value="${seg.white.s}" min="0" max="59">
          <span class="hms-sep">s</span>
        </div>
        <div class="time-side-label">Black</div>
        <div class="hms-group">
          <input type="number" class="hms-input" data-seg="${i}" data-side="black" data-field="h" value="${seg.black.h}" min="0" max="9">
          <span class="hms-sep">h</span>
          <input type="number" class="hms-input" data-seg="${i}" data-side="black" data-field="m" value="${seg.black.m}" min="0" max="59">
          <span class="hms-sep">m</span>
          <input type="number" class="hms-input" data-seg="${i}" data-side="black" data-field="s" value="${seg.black.s}" min="0" max="59">
          <span class="hms-sep">s</span>
        </div>
      </div>
      <div class="inc-row">
        <div class="inc-type-group">
          <label class="inc-radio-label">
            <input type="radio" name="incType_${i}" value="none" ${seg.incType==='none'?'checked':''}> None
          </label>
          <label class="inc-radio-label">
            <input type="radio" name="incType_${i}" value="fischer" ${seg.incType==='fischer'?'checked':''}> Fischer
          </label>
          <label class="inc-radio-label">
            <input type="radio" name="incType_${i}" value="delay" ${seg.incType==='delay'?'checked':''}> Delay
          </label>
        </div>
        <div class="inc-value-group" style="${seg.incType==='none'?'display:none':''}">
          <label>White:</label>
          <input type="number" class="inc-input" data-seg="${i}" data-side="white" value="${seg.incWhite}" min="0" max="999">
          <span>s</span>
          <label>Black:</label>
          <input type="number" class="inc-input" data-seg="${i}" data-side="black" value="${seg.incBlack}" min="0" max="999">
          <span>s</span>
        </div>
      </div>
    `;
    list.appendChild(div);
  });

  // Bind events on freshly rendered inputs
  list.querySelectorAll('.remove-segment-btn').forEach(btn => {
    btn.addEventListener('click', () => removeSegment(parseInt(btn.dataset.idx)));
  });

  list.querySelectorAll('.seg-moves-input').forEach(inp => {
    inp.addEventListener('change', () => {
      const idx = parseInt(inp.dataset.seg);
      segments[idx].moves = Math.max(1, parseInt(inp.value) || 40);
    });
  });

  list.querySelectorAll('.hms-input').forEach(inp => {
    inp.addEventListener('change', () => {
      const idx   = parseInt(inp.dataset.seg);
      const side  = inp.dataset.side;
      const field = inp.dataset.field;
      const seg   = segments[idx];
      let val = parseInt(inp.value) || 0;
      if (field === 'm' || field === 's') val = Math.min(59, Math.max(0, val));
      else val = Math.max(0, val);
      inp.value = val;
      seg[side][field] = val;

      if (side === 'white' && !seg.blackTimeDirty) {
        seg.black.h = seg.white.h;
        seg.black.m = seg.white.m;
        seg.black.s = seg.white.s;
        renderSegments();
      } else if (side === 'black') {
        seg.blackTimeDirty = true;
      }
    });
  });

  list.querySelectorAll('.inc-input').forEach(inp => {
    inp.addEventListener('change', () => {
      const idx  = parseInt(inp.dataset.seg);
      const side = inp.dataset.side;
      const seg  = segments[idx];
      const val  = Math.max(0, parseInt(inp.value) || 0);
      inp.value = val;
      const key = 'inc' + side.charAt(0).toUpperCase() + side.slice(1);
      seg[key] = val;
      if (side === 'white' && !seg.blackIncDirty) {
        seg.incBlack = val;
        renderSegments();
      } else if (side === 'black') {
        seg.blackIncDirty = true;
      }
    });
  });

  list.querySelectorAll('input[type="radio"]').forEach(radio => {
    radio.addEventListener('change', () => {
      const m = radio.name.match(/incType_(\d+)/);
      if (!m) return;
      segments[parseInt(m[1])].incType = radio.value;
      renderSegments();
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Setup UI Bindings
// ─────────────────────────────────────────────────────────────────────────────

function bindSetupUI() {
  document.querySelectorAll('.color-pill').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.color-pill').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      chosenColor = btn.dataset.color;
    });
  });

  document.querySelectorAll('.difficulty-pill').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.difficulty-pill').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      skillLevel = parseInt(btn.dataset.skill);
      document.getElementById('skillSlider').value = skillLevel;
      updateSkillLabel();
    });
  });

  const slider = document.getElementById('skillSlider');
  slider.addEventListener('input', () => {
    skillLevel = parseInt(slider.value);
    document.querySelectorAll('.difficulty-pill').forEach(btn => {
      btn.classList.toggle('active', parseInt(btn.dataset.skill) === skillLevel);
    });
    updateSkillLabel();
  });

  document.getElementById('addSegmentBtn').addEventListener('click', addSegment);
  document.getElementById('startGameBtn').addEventListener('click', startGame);
}

function updateSkillLabel() {
  const elo = ELO_TABLE[Math.min(skillLevel, 20)];
  document.getElementById('skillLabel').textContent =
    `Skill Level ${skillLevel} — ~${elo} ELO`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Game UI Bindings
// ─────────────────────────────────────────────────────────────────────────────

function bindGameUI() {
  canvas.addEventListener('click', onBoardClick);
  document.getElementById('resignBtn').addEventListener('click', onResign);
  document.getElementById('newGameBtn').addEventListener('click', goToSetup);
  document.getElementById('flipBoardBtn').addEventListener('click', () => {
    boardFlipped = !boardFlipped;
    drawBoard();
  });
  document.getElementById('playAgainBtn').addEventListener('click', goToSetup);
}

// ─────────────────────────────────────────────────────────────────────────────
// Start Game
// ─────────────────────────────────────────────────────────────────────────────

function startGame() {
  // Resolve color
  let side = chosenColor;
  if (side === 'random') side = Math.random() < 0.5 ? 'white' : 'black';
  playerSide   = side === 'white' ? 'w' : 'b';
  boardFlipped = playerSide === 'b';

  // Fresh chess game
  chess          = new Chess();
  selectedSq     = null;
  legalTargets   = [];
  lastMoveFrom   = null;
  lastMoveTo     = null;
  engineThinking = false;
  totalPlies     = 0;
  segmentIdx     = 0;
  gameOver       = false;
  pendingPromoFrom = null;
  pendingPromoTo   = null;

  // Init clocks from first segment
  const seg0 = segments[0];
  wClockMs = hmsToMs(seg0.white);
  bClockMs = hmsToMs(seg0.black);
  wDelayMs = seg0.incType === 'delay' ? seg0.incWhite * 1000 : 0;
  bDelayMs = seg0.incType === 'delay' ? seg0.incBlack * 1000 : 0;

  // Delay bar visibility
  const showDelay = seg0.incType === 'delay';
  document.getElementById('opponentDelayWrap').style.display = showDelay ? 'block' : 'none';
  document.getElementById('playerDelayWrap').style.display   = showDelay ? 'block' : 'none';

  // Clear move history
  document.getElementById('moveHistoryInner').innerHTML =
    '<div class="move-history-empty">No moves yet.</div>';

  // Show game view
  document.getElementById('setupView').style.display  = 'none';
  document.getElementById('gameView').style.display   = 'flex';
  document.getElementById('gameOverOverlay').style.display = 'none';
  document.getElementById('promotionOverlay').style.display = 'none';

  onResize();
  updateClockDisplay();

  // Init Stockfish
  initWorker();

  // Start clock for White (who moves first)
  startClock();

  if (playerSide === 'b') {
    // Engine plays White's first move
    setStatus('Monika is thinking\u2026');
    requestEngineMove();
  } else {
    setStatus('Your turn');
  }
}

function goToSetup() {
  stopClock();
  terminateWorker();
  document.getElementById('gameView').style.display  = 'none';
  document.getElementById('setupView').style.display = 'flex';
  gameOver = false;
}

// ─────────────────────────────────────────────────────────────────────────────
// Stockfish Worker
// ─────────────────────────────────────────────────────────────────────────────

function initWorker() {
  terminateWorker();
  workerReady = false;
  worker = new Worker(new URL('./stockfish-worker.js', import.meta.url));
  worker.onmessage = e => handleWorkerMsg(e.data);
  worker.postMessage('uci');
  worker.postMessage(`setoption name Skill Level value ${skillLevel}`);
  worker.postMessage('isready');
}

function terminateWorker() {
  if (worker) { worker.terminate(); worker = null; }
  workerReady = false;
}

function handleWorkerMsg(msg) {
  if (typeof msg !== 'string') return;
  if (msg === 'readyok') { workerReady = true; return; }
  if (msg.startsWith('bestmove')) {
    const parts = msg.split(' ');
    const uciMove = parts[1];
    if (!uciMove || uciMove === '(none)') return;
    const elapsed = performance.now() - engineRequestTime;
    setTimeout(() => applyEngineMove(uciMove), Math.max(600 - elapsed, 0));
  }
}

function requestEngineMove() {
  if (!chess || gameOver) return;
  engineThinking = true;
  engineRequestTime = performance.now();

  const seg = segments[segmentIdx];
  worker.postMessage(`position fen ${chess.fen()}`);

  let goCmd;
  if (seg.incType === 'fischer') {
    goCmd = `go wtime ${Math.max(1, Math.round(wClockMs))} btime ${Math.max(1, Math.round(bClockMs))} winc ${seg.incWhite * 1000} binc ${seg.incBlack * 1000}`;
  } else {
    goCmd = `go wtime ${Math.max(1, Math.round(wClockMs))} btime ${Math.max(1, Math.round(bClockMs))}`;
  }
  worker.postMessage(goCmd);
}

function applyEngineMove(uciMove) {
  if (!chess || gameOver) return;
  const from  = uciMove.slice(0, 2);
  const to    = uciMove.slice(2, 4);
  const promo = uciMove.length > 4 ? uciMove[4] : undefined;

  let moveObj;
  try {
    moveObj = chess.move({ from, to, promotion: promo || 'q' });
  } catch (e) {
    console.warn('Engine move failed:', uciMove, e);
    return;
  }
  if (!moveObj) return;

  lastMoveFrom   = from;
  lastMoveTo     = to;
  engineThinking = false;
  selectedSq     = null;
  legalTargets   = [];

  // The engine was playing the current chess.turn() BEFORE the move
  // After move, chess.turn() is the next player. Ply was made by the other side.
  const movedSide = chess.turn() === 'w' ? 'b' : 'w';
  onPlyMade(movedSide);

  updateMoveHistory();
  drawBoard();
  checkGameEnd();

  if (!gameOver) {
    setStatus('Your turn');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Player Move
// ─────────────────────────────────────────────────────────────────────────────

function onBoardClick(e) {
  if (gameOver || engineThinking) return;
  if (chess.turn() !== playerSide) return;
  if (pendingPromoFrom) return;

  const rect   = canvas.getBoundingClientRect();
  const scaleX = canvas.width  / rect.width;
  const scaleY = canvas.height / rect.height;
  const x  = (e.clientX - rect.left) * scaleX;
  const y  = (e.clientY - rect.top)  * scaleY;
  const sq = pixelToSquare(x, y);
  if (!sq) return;

  if (selectedSq === null) {
    trySelectSquare(sq);
  } else if (sq === selectedSq) {
    deselect();
  } else if (legalTargets.includes(sq)) {
    attemptPlayerMove(selectedSq, sq);
  } else {
    // Try selecting a different own piece
    const piece = chess.get(sq);
    if (piece && piece.color === playerSide) {
      trySelectSquare(sq);
    } else {
      deselect();
    }
  }
}

function trySelectSquare(sq) {
  const piece = chess.get(sq);
  if (!piece || piece.color !== playerSide) return;
  selectedSq   = sq;
  const moves  = chess.moves({ square: sq, verbose: true });
  legalTargets = moves.map(m => m.to);
  drawBoard();
}

function deselect() {
  selectedSq   = null;
  legalTargets = [];
  drawBoard();
}

function attemptPlayerMove(from, to) {
  const piece   = chess.get(from);
  const isPromo = piece && piece.type === 'p' &&
    ((playerSide === 'w' && to[1] === '8') || (playerSide === 'b' && to[1] === '1'));

  if (isPromo) {
    showPromoDialog(from, to);
  } else {
    executePlayerMove(from, to, 'q');
  }
}

function executePlayerMove(from, to, promotion) {
  let moveObj;
  try {
    moveObj = chess.move({ from, to, promotion });
  } catch (e) {
    console.warn('Player move failed:', from, to, e);
    return;
  }
  if (!moveObj) return;

  lastMoveFrom = from;
  lastMoveTo   = to;
  selectedSq   = null;
  legalTargets = [];

  const movedSide = chess.turn() === 'w' ? 'b' : 'w';
  onPlyMade(movedSide);

  updateMoveHistory();
  drawBoard();
  checkGameEnd();

  if (!gameOver) {
    setStatus('Monika is thinking\u2026');
    requestEngineMove();
  }
}

function showPromoDialog(from, to) {
  pendingPromoFrom = from;
  pendingPromoTo   = to;

  const overlay  = document.getElementById('promotionOverlay');
  const choices  = document.getElementById('promotionChoices');
  const c        = playerSide;
  const syms     = { q: c==='w'?'♕':'♛', r: c==='w'?'♖':'♜', b: c==='w'?'♗':'♝', n: c==='w'?'♘':'♞' };

  choices.innerHTML = '';
  ['q','r','b','n'].forEach(p => {
    const btn = document.createElement('button');
    btn.className   = 'promo-btn';
    btn.textContent = syms[p];
    btn.addEventListener('click', () => {
      overlay.style.display = 'none';
      const f = pendingPromoFrom;
      const t = pendingPromoTo;
      pendingPromoFrom = null;
      pendingPromoTo   = null;
      executePlayerMove(f, t, p);
    });
    choices.appendChild(btn);
  });

  overlay.style.display = 'flex';
}

// ─────────────────────────────────────────────────────────────────────────────
// Clock Logic
// ─────────────────────────────────────────────────────────────────────────────

function hmsToMs({ h, m, s }) {
  return ((h * 3600) + (m * 60) + s) * 1000;
}

function msToDisplay(ms) {
  if (ms <= 0) return '0:00:00';
  const totalSec = Math.ceil(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

function startClock() {
  if (clockRunning) return;
  clockRunning = true;
  lastTickMs   = performance.now();
  clockRaf     = requestAnimationFrame(clockTick);
}

function stopClock() {
  clockRunning = false;
  if (clockRaf) { cancelAnimationFrame(clockRaf); clockRaf = null; }
}

function clockTick() {
  if (!clockRunning) return;

  const now   = performance.now();
  const delta = now - lastTickMs;
  lastTickMs  = now;

  // chess.turn() tells us whose clock should be running
  const turn = chess ? chess.turn() : 'w';

  if (turn === 'w') {
    if (wDelayMs > 0) {
      wDelayMs = Math.max(0, wDelayMs - delta);
    } else {
      wClockMs -= delta;
      if (wClockMs <= 0) {
        wClockMs = 0;
        stopClock();
        updateClockDisplay();
        endGame({ reason: 'timeout', loser: 'w' });
        return;
      }
    }
  } else {
    if (bDelayMs > 0) {
      bDelayMs = Math.max(0, bDelayMs - delta);
    } else {
      bClockMs -= delta;
      if (bClockMs <= 0) {
        bClockMs = 0;
        stopClock();
        updateClockDisplay();
        endGame({ reason: 'timeout', loser: 'b' });
        return;
      }
    }
  }

  updateClockDisplay();
  clockRaf = requestAnimationFrame(clockTick);
}

/**
 * Called right after a half-move is applied to the chess object.
 * movedSide: 'w' or 'b' — the side that just moved.
 * At this point, chess.turn() is already the NEXT player.
 */
function onPlyMade(movedSide) {
  totalPlies++;

  const seg = segments[segmentIdx];

  // Fischer increment: add to the player who just moved
  if (seg.incType === 'fischer') {
    if (movedSide === 'w') wClockMs += seg.incWhite * 1000;
    else                   bClockMs += seg.incBlack * 1000;
  }

  // NA Delay: reset delay for the NEXT player (who just became active)
  if (seg.incType === 'delay') {
    const nextSide = movedSide === 'w' ? 'b' : 'w';
    if (nextSide === 'w') wDelayMs = seg.incWhite * 1000;
    else                  bDelayMs = seg.incBlack * 1000;
  }

  // Segment boundary: both players have made N full moves after 2N plies
  if (seg.moves !== null && totalPlies >= seg.moves * 2 && segmentIdx < segments.length - 1) {
    segmentIdx++;
    const nextSeg = segments[segmentIdx];
    wClockMs += hmsToMs(nextSeg.white);
    bClockMs += hmsToMs(nextSeg.black);

    // Update delay bar visibility for new segment
    const showDelay = nextSeg.incType === 'delay';
    document.getElementById('opponentDelayWrap').style.display = showDelay ? 'block' : 'none';
    document.getElementById('playerDelayWrap').style.display   = showDelay ? 'block' : 'none';
  }
}

function updateClockDisplay() {
  const oppSide  = playerSide === 'w' ? 'b' : 'w';
  const oppMs    = oppSide === 'w' ? wClockMs : bClockMs;
  const playMs   = playerSide === 'w' ? wClockMs : bClockMs;
  const oppDly   = oppSide === 'w' ? wDelayMs : bDelayMs;
  const playDly  = playerSide === 'w' ? wDelayMs : bDelayMs;

  document.getElementById('opponentClockDisplay').textContent = msToDisplay(oppMs);
  document.getElementById('playerClockDisplay').textContent   = msToDisplay(playMs);

  // Active clock: follow chess.turn()
  const turn = chess ? chess.turn() : 'w';
  document.getElementById('opponentClockBlock').classList.toggle('active-clock', turn === oppSide);
  document.getElementById('playerClockBlock').classList.toggle('active-clock',  turn === playerSide);

  // Delay bars
  const seg       = segments[segmentIdx] || segments[segments.length - 1];
  const oppMaxDly  = seg.incType === 'delay' ? (oppSide === 'w'    ? seg.incWhite : seg.incBlack) * 1000 : 1;
  const playMaxDly = seg.incType === 'delay' ? (playerSide === 'w' ? seg.incWhite : seg.incBlack) * 1000 : 1;
  document.getElementById('opponentDelayBar').style.width = `${Math.min(1, oppDly  / oppMaxDly)  * 100}%`;
  document.getElementById('playerDelayBar').style.width   = `${Math.min(1, playDly / playMaxDly) * 100}%`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Board Drawing
// ─────────────────────────────────────────────────────────────────────────────

function onResize() {
  if (!chess) return;
  const container = document.getElementById('boardContainer');
  const size = Math.min(container.clientWidth, container.clientHeight);
  canvas.width  = size;
  canvas.height = size;
  drawBoard();
}

// Square name → {row, col} in canvas coordinates
function sqToRC(sq) {
  const file = sq.charCodeAt(0) - 97;  // a=0 … h=7
  const rank = sq.charCodeAt(1) - 49;  // '1'=0 … '8'=7
  if (!boardFlipped) {
    return { row: 7 - rank, col: file };
  } else {
    return { row: rank, col: 7 - file };
  }
}

// Canvas (row, col) → square name, or null if out of bounds
function pixelToSquare(x, y) {
  const sqSz = canvas.width / 8;
  const col  = Math.floor(x / sqSz);
  const row  = Math.floor(y / sqSz);
  if (col < 0 || col > 7 || row < 0 || row > 7) return null;
  let file, rank;
  if (!boardFlipped) {
    file = col;
    rank = 7 - row;
  } else {
    file = 7 - col;
    rank = row;
  }
  return String.fromCharCode(97 + file) + (rank + 1);
}

function drawBoard() {
  if (!ctx || !chess) return;

  const size = canvas.width;
  const sz   = size / 8;
  ctx.clearRect(0, 0, size, size);

  // 1. Squares + highlights
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const isLight = (row + col) % 2 === 0;
      ctx.fillStyle = isLight ? LIGHT_SQ : DARK_SQ;
      ctx.fillRect(col * sz, row * sz, sz, sz);

      const sq = pixelToSquare(col * sz + sz * 0.5, row * sz + sz * 0.5);
      if (!sq) continue;

      // Last-move highlight
      if (sq === lastMoveFrom || sq === lastMoveTo) {
        ctx.fillStyle = LASTMOVE_COLOR;
        ctx.fillRect(col * sz, row * sz, sz, sz);
      }
      // Selection highlight
      if (sq === selectedSq) {
        ctx.fillStyle = SEL_COLOR;
        ctx.fillRect(col * sz, row * sz, sz, sz);
      }
    }
  }

  // 2. Legal move indicators
  legalTargets.forEach(sq => {
    const { row, col } = sqToRC(sq);
    const cx = (col + 0.5) * sz;
    const cy = (row + 0.5) * sz;
    const hasPiece = !!chess.get(sq);

    if (hasPiece) {
      // Capture ring
      ctx.strokeStyle = DOT_CAPTURE;
      ctx.lineWidth   = sz * 0.1;
      ctx.beginPath();
      ctx.arc(cx, cy, sz * 0.44, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      // Empty dot
      ctx.fillStyle = DOT_EMPTY;
      ctx.beginPath();
      ctx.arc(cx, cy, sz * 0.15, 0, Math.PI * 2);
      ctx.fill();
    }
  });

  // 3. Pieces
  const board = chess.board();  // board[rankIdx][fileIdx], rankIdx 0=rank8
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';

  for (let ri = 0; ri < 8; ri++) {
    for (let fi = 0; fi < 8; fi++) {
      const piece = board[ri][fi];
      if (!piece) continue;

      const sq       = String.fromCharCode(97 + fi) + (8 - ri);
      const { row, col } = sqToRC(sq);
      const cx = (col + 0.5) * sz;
      const cy = (row + 0.5) * sz;
      const sym = PIECE[piece.color + piece.type];
      if (!sym) continue;

      ctx.font = `${sz * 0.74}px serif`;

      // Drop shadow
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ctx.fillText(sym, cx + sz * 0.03, cy + sz * 0.04);

      // Stroke outline for readability
      ctx.strokeStyle = piece.color === 'w' ? 'rgba(120,40,60,0.55)' : 'rgba(255,220,230,0.5)';
      ctx.lineWidth   = sz * 0.04;
      ctx.strokeText(sym, cx, cy);

      // Fill
      ctx.fillStyle = piece.color === 'w' ? '#ffffff' : '#1a1a1a';
      ctx.fillText(sym, cx, cy);
    }
  }

  // 4. Rank / file labels
  ctx.font = `bold ${sz * 0.18}px Nunito, sans-serif`;
  for (let i = 0; i < 8; i++) {
    const rankNum    = boardFlipped ? i + 1    : 8 - i;
    const fileLetter = String.fromCharCode(97 + (boardFlipped ? 7 - i : i));

    // Label square for rank: (row=i, col=0)
    const rankLightSq = (i + (boardFlipped ? 7 : 0)) % 2 === 0;
    ctx.fillStyle    = rankLightSq ? '#c0607a' : '#ffe0e8';
    ctx.textAlign    = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(rankNum, 3, i * sz + 2);

    // Label square for file: (row=7, col=i)
    const fileLightSq = (7 + i) % 2 === (boardFlipped ? 1 : 0);
    ctx.fillStyle    = fileLightSq ? '#c0607a' : '#ffe0e8';
    ctx.textAlign    = 'right';
    ctx.textBaseline = 'bottom';
    ctx.fillText(fileLetter, (i + 1) * sz - 3, 8 * sz - 2);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Move History
// ─────────────────────────────────────────────────────────────────────────────

function updateMoveHistory() {
  const history = chess.history({ verbose: true });
  const inner   = document.getElementById('moveHistoryInner');
  inner.innerHTML = '';

  if (history.length === 0) {
    inner.innerHTML = '<div class="move-history-empty">No moves yet.</div>';
    return;
  }

  const table = document.createElement('div');
  table.className = 'move-table';

  for (let i = 0; i < history.length; i += 2) {
    const row = document.createElement('div');
    row.className = 'move-row';
    const num = Math.floor(i / 2) + 1;
    row.innerHTML = `
      <span class="move-num">${num}.</span>
      <span class="move-san">${history[i].san}</span>
      <span class="move-san">${history[i + 1] ? history[i + 1].san : ''}</span>
    `;
    table.appendChild(row);
  }

  inner.appendChild(table);
  inner.scrollTop = inner.scrollHeight;
}

// ─────────────────────────────────────────────────────────────────────────────
// Game End
// ─────────────────────────────────────────────────────────────────────────────

function checkGameEnd() {
  if (!chess.isGameOver()) return;

  let result, detail;
  if (chess.isCheckmate()) {
    const winner = chess.turn() === 'w' ? 'b' : 'w';  // loser is chess.turn()
    result = winner === playerSide ? 'You Win!' : 'Monika Wins';
    detail = 'by checkmate';
  } else if (chess.isStalemate()) {
    result = 'Draw';
    detail = 'by stalemate';
  } else if (chess.isThreefoldRepetition()) {
    result = 'Draw';
    detail = 'by threefold repetition';
  } else if (chess.isInsufficientMaterial()) {
    result = 'Draw';
    detail = 'by insufficient material';
  } else {
    result = 'Draw';
    detail = 'by 50-move rule';
  }

  endGame({ result, detail });
}

/**
 * End the game. Accepts { result, detail } for explicit result,
 * or { reason: 'timeout', loser } to compute result from timeout.
 */
function endGame({ result, detail, reason, loser } = {}) {
  if (gameOver) return;
  gameOver = true;
  stopClock();

  if (reason === 'timeout') {
    const winner = loser === 'w' ? 'b' : 'w';
    result = winner === playerSide ? 'You Win!' : 'Monika Wins';
    detail = 'on time';
  }

  document.getElementById('gameOverResult').textContent = result || 'Game Over';
  document.getElementById('gameOverDetail').textContent = detail || '';
  document.getElementById('gameOverOverlay').style.display = 'flex';
}

function onResign() {
  if (gameOver) return;
  if (!confirm('Resign this game?')) return;
  endGame({ result: 'Monika Wins', detail: 'by resignation' });
}

// ─────────────────────────────────────────────────────────────────────────────
// Commentary (stub — enabled when Spark is back online)
// ─────────────────────────────────────────────────────────────────────────────

async function requestCommentary(fen, moveSan, evalCp) {  // eslint-disable-line no-unused-vars
  if (!COMMENTARY_ENABLED) return;
  // TODO: wire up to LLM provider when Spark is back online
  // const prompt = `[Chess position FEN: ${fen}]\nMove just played: ${moveSan}\n` +
  //   `Stockfish eval: ${evalCp > 0 ? '+' : ''}${(evalCp / 100).toFixed(1)}\n\n` +
  //   `Comment on this move as Monika — brief, in-character, specific.`;
  // ...
}

// ─────────────────────────────────────────────────────────────────────────────
// Utility
// ─────────────────────────────────────────────────────────────────────────────

function setStatus(text) {
  document.getElementById('statusText').textContent = text;
}
