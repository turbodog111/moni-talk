// ====== BENCHMARK SUITE ======
const BENCH_STORAGE       = 'moni_talk_benchmarks';       // V-Current (new suites)
const BENCH_STORAGE_BETA  = 'moni_talk_benchmarks_beta';  // V-Beta (old V-Current data)
const BENCH_STORAGE_ALPHA = 'moni_talk_benchmarks_alpha'; // V-Alpha (legacy, hidden)
let benchViewModelKey = null; // null = use current model

const SUITE_VERSIONS = { petal: '0.1', bloom: '0.1' };

const CHANGELOG_ENTRIES = [
  {
    label: 'v0.6.0 — Leveling & Achievement System',
    date: '2026-02-23',
    items: [
      'XP & 8 level tiers: Stranger → Soulmate; earn XP from chatting, story days, affinity milestones, adventure events',
      '20 achievements across Chat / Story / Adventure / Misc categories with unlock toasts',
      'Achievement toast (⭐ slide-up) separate from status toast, queued for back-to-back unlocks',
      'Chat-list header subtitle shows current level name in green',
      'Settings → Progress tab: XP bar, level display, and achievement grid',
      'Anti-farming: one-time XP grants for adventure domains, fragments, turn milestones, and story days',
    ]
  },
  {
    label: 'v0.5.3 — Adventure Mode Visual Overhaul',
    date: '2026-02-23',
    items: [
      'Domain theming: chat area accent color shifts per domain (green/gold/pink/purple)',
      'DM bar: Monika portrait header showing current location and mood emoji',
      'Scene entry cards: chapter-title dividers on domain change, persisted across reloads',
      'HP float numbers + full-screen vignette flash on damage and healing',
      'Domain grid: 2×2 PFP image grid in side panel replacing flat list',
      'Item icons: emoji icons on inventory items and item picker (🧪🗝️⚔️🛡️📖🌸💎💚🧁🕯️✨)',
    ]
  },
  {
    label: 'v0.5.2 — Settings Redesign + Archive Chats + Move Sync',
    date: '2026-02-23',
    items: [
      'Settings modal redesigned: VS Code-style left-sidebar with Model / Voice / Appearance / Archive / Tools tabs',
      'Arbor model card — shows name, badge, LoRA params, training pairs, and release date for known GGUFs',
      'Archive Chats — hover a chat to archive it; restore from Settings → Archive tab',
      'Cloud Sync UI moved inline to Settings → Tools tab; sync button removed from header',
    ]
  },
  {
    label: 'v0.5 — Arbor 0.1',
    date: '2026-02-22',
    items: [
      'Arbor 0.1: fine-tuned Qwen3-14B for Monika chat mode (Q8_0, 14.6 GB)',
      'Qwen3-TTS promoted to primary TTS with Monika voice cloning',
      'Fix: stale model ID no longer causes "model not found" after server mode switch',
      'Add "(server default)" blank option to model dropdown for single-model mode',
    ]
  },
  {
    label: 'v0.4.2 — Benchmark Overhaul',
    date: '2026-02-21',
    items: [
      'New Petal 0.1 (6 tests) and Bloom 0.1 (12 tests) suites replace old 16-test benchmark',
      'Grading reduced to 4 criteria: Voice, Writing, Emotion, Faithfulness',
      'Post-run batch rating panel — rate all responses at once after the suite completes',
      'Old benchmark data preserved as V-Beta',
      'Suite version stored with results — outdated results flagged in rankings',
    ]
  },
  {
    label: 'v0.4.1 — Memory & Chat Polish',
    date: '2026-02-21',
    items: [
      'Memory approval UI — review extracted memories before they are saved',
      'Fix chat list sorting, FAB overlap on mobile, and sync starred status',
    ]
  },
  {
    label: 'v0.4 — TTS & Voice Input',
    date: '2026-02-21',
    items: [
      'Orpheus TTS on DGX Spark — 8 voices with inline emotion tags',
      'Qwen3-TTS — voice cloning with custom Monika reference audio',
      'Speech-to-text voice input for chat mode',
    ]
  },
  {
    label: 'v0.3 — DGX Spark & Adventure Mode',
    date: '2026-02-20',
    items: [
      'llama.cpp provider for DGX Spark / local GPU inference',
      'Multi-model router mode with auto-discovered GGUF selector',
      'Adventure Mode: The Poem Labyrinth — 4 domains, HP, inventory, checkpoints',
    ]
  },
];
let activeSuite = 'petal'; // 'petal' | 'bloom'

// --- Alpha Migration (one-time) ---
function migrateAlphaBenchmarks() {
  if (localStorage.getItem(BENCH_STORAGE_ALPHA)) return; // already migrated
  const raw = localStorage.getItem(BENCH_STORAGE);
  if (!raw) return;
  try {
    const data = JSON.parse(raw);
    if (Object.keys(data).length === 0) return;
    localStorage.setItem(BENCH_STORAGE_ALPHA, raw);
    localStorage.removeItem(BENCH_STORAGE);
  } catch { /* corrupt data, ignore */ }
}

// --- Beta Migration (one-time: old V-Current → V-Beta) ---
function migrateBetaBenchmarks() {
  if (localStorage.getItem(BENCH_STORAGE_BETA)) return; // already migrated
  const raw = localStorage.getItem(BENCH_STORAGE);
  if (!raw) return;
  try {
    const data = JSON.parse(raw);
    if (Object.keys(data).length === 0) return;
    localStorage.setItem(BENCH_STORAGE_BETA, raw);
    localStorage.removeItem(BENCH_STORAGE);
  } catch { /* corrupt data, ignore */ }
}

function loadAlphaResults() {
  try { return JSON.parse(localStorage.getItem(BENCH_STORAGE_ALPHA) || '{}'); } catch { return {}; }
}

function loadBetaResults() {
  try { return JSON.parse(localStorage.getItem(BENCH_STORAGE_BETA) || '{}'); } catch { return {}; }
}

// --- Helpers ---
function getCurrentModelKey() {
  if (provider === 'llamacpp') return `llamacpp:${llamacppModel || 'unknown'}`;
  if (provider === 'ollama') return `ollama:${ollamaModel}`;
  return `puter:${puterModel}`;
}

function getCurrentModelLabel() {
  const key = getCurrentModelKey();
  const parts = key.split(':');
  // Show last meaningful segment
  return parts.length > 2 ? parts.slice(1).join(':') : parts[1] || key;
}

function loadBenchResults() {
  try { return JSON.parse(localStorage.getItem(BENCH_STORAGE) || '{}'); } catch { return {}; }
}

function saveBenchResults(data) {
  localStorage.setItem(BENCH_STORAGE, JSON.stringify(data));
}

function getBenchViewKey() {
  return benchViewModelKey || getCurrentModelKey();
}

// --- Installed model detection ---
let _installedOllamaCache = null;
let _installedOllamaCacheTime = 0;
const OLLAMA_CACHE_TTL = 30000; // 30s

async function getInstalledOllamaModels() {
  const now = Date.now();
  if (_installedOllamaCache && (now - _installedOllamaCacheTime) < OLLAMA_CACHE_TTL) {
    return _installedOllamaCache;
  }
  try {
    const models = await fetchOllamaModels();
    _installedOllamaCache = new Set(models.map(m => m.id));
    _installedOllamaCacheTime = now;
    return _installedOllamaCache;
  } catch {
    return _installedOllamaCache || new Set();
  }
}

function isModelInstalled(modelKey, installedSet) {
  if (!modelKey.startsWith('ollama:')) return true;
  const name = modelKey.slice('ollama:'.length);
  return installedSet.has(name);
}

// --- User Rating Categories (same for all tests) ---
const BENCH_USER_CRITERIA = [
  { key: 'voice',        label: 'Character Voice' },
  { key: 'writing',      label: 'Writing Quality' },
  { key: 'emotion',      label: 'Emotional Impact' },
  { key: 'faithfulness', label: 'Faithfulness' },
];

// --- Common auto-score helpers ---
function storyAutoScore(text, opts = {}) {
  const scores = {};
  // Tag compliance: [AFFINITY] present and parseable
  const affMatch = text.match(/\[(?:AFFINITY|ASSIMILATION)[:\s]([^\]]+)\]/i);
  scores.tagPresent = affMatch ? 100 : 0;
  scores.tagParseable = 0;
  if (affMatch) {
    const parsed = parseAffinityPairs(affMatch[1]);
    scores.tagParseable = parsed ? 100 : 30;
  }
  // Duplicate tags penalty
  const affTagCount = (text.match(/\[(?:AFFINITY|ASSIMILATION)[:\s][^\]]+\]/gi) || []).length;
  scores.noDuplicates = affTagCount <= 1 ? 100 : 0;
  // Minimum length
  const minLen = opts.minLength || 200;
  scores.length = text.length >= minLen ? 100 : Math.round((text.length / minLen) * 100);
  // Character mention check
  if (opts.requireCharacter) {
    const re = new RegExp(opts.requireCharacter, 'i');
    scores.characterMentioned = re.test(text) ? 100 : 0;
  }
  // Affinity delta checks
  if (opts.affinityChecks && affMatch) {
    const parsed = parseAffinityPairs(affMatch[1]);
    if (parsed) {
      let passed = 0;
      let total = 0;
      for (const [name, check] of Object.entries(opts.affinityChecks)) {
        total++;
        const val = parsed[name] || 0;
        if (check.min != null && check.max != null) {
          if (val >= check.min && val <= check.max) passed++;
        } else if (check.delta != null && check.base != null) {
          const d = val - check.base;
          if (d >= check.delta[0] && d <= check.delta[1]) passed++;
        }
      }
      scores.affinityAccuracy = total > 0 ? Math.round((passed / total) * 100) : 100;
    } else {
      scores.affinityAccuracy = 0;
    }
  }
  // Compute auto total (average of all sub-scores)
  const vals = Object.values(scores);
  scores.autoTotal = vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : 0;
  return scores;
}

function chatAutoScore(text, opts = {}) {
  const scores = {};
  const parsed = parseStateTags(text, null, null, null);

  // Mood tag: present and valid
  const hasMood = parsed.mood && MOODS.includes(parsed.mood);
  scores.moodTag = hasMood ? 100 : 0;

  // Drift tag: present and valid
  const hasDrift = parsed.drift && DRIFT_CATEGORIES.includes(parsed.drift);
  scores.driftTag = hasDrift ? 100 : 0;

  // Expected mood check
  if (opts.expectedMoods && hasMood) {
    scores.moodMatch = opts.expectedMoods.includes(parsed.mood) ? 100 : 30;
  }

  // Minimum length
  const minLen = opts.minLength || 100;
  scores.length = text.length >= minLen ? 100 : Math.round((text.length / minLen) * 100);

  // No duplicate tags
  const moodCount = (text.match(/\[MOOD[:\s][^\]]+\]/gi) || []).length;
  const driftCount = (text.match(/\[DRIFT[:\s][^\]]+\]/gi) || []).length;
  scores.noDuplicates = (moodCount <= 1 && driftCount <= 1) ? 100 : 0;

  // Custom keyword checks
  if (opts.keywords) {
    const hits = opts.keywords.filter(kw => new RegExp(kw, 'i').test(text)).length;
    scores.relevance = Math.round((hits / opts.keywords.length) * 100);
  }

  // Compute auto total
  const vals = Object.values(scores);
  scores.autoTotal = vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : 0;
  return scores;
}

function computeTestScore(test, autoTotal, userRatings) {
  if (!test.points) {
    return { earned: autoTotal || 0, max: 100, complete: true };
  }
  const aw = test.autoWeight || 0.5;
  const autoEarned = test.points * aw * ((autoTotal || 0) / 100);
  const userKeys = BENCH_USER_CRITERIA.map(c => c.key);
  const userVals = userKeys.map(k => userRatings?.[k]).filter(v => v != null);

  if (userVals.length === 0) {
    return { earned: autoEarned, max: test.points, complete: false };
  }

  const userAvg = userVals.reduce((s, v) => s + v, 0) / userVals.length;
  const userNorm = (userAvg - 1) / 4; // 1-5 → 0-1
  const userEarned = test.points * (1 - aw) * userNorm;

  return { earned: autoEarned + userEarned, max: test.points, complete: userVals.length >= userKeys.length };
}

// --- Test Definitions ---

// ── Petal Suite (6 tests, ~40 pts each section) ───────────────────────────
const PETAL_STORY_TESTS = [
  {
    id: 'pt_first_light',
    name: 'First Light',
    description: 'Day 1 opening — first impressions, atmosphere, all 4 characters introduced.',
    icon: '\u{1F305}',
    points: 12,
    autoWeight: 0.40,
    buildChat() {
      return {
        mode: 'story', storyDay: 1, mcName: 'Alex',
        storyAffinity: { sayori: 15, natsuki: 1, yuri: 1, monika: 10 },
        storyPhase: 'morning_walk', messages: []
      };
    },
    maxTokens: 800,
    score(text) {
      const base = storyAutoScore(text, { minLength: 200 });
      const charHits = ['sayori', 'natsuki', 'yuri', 'monika'].filter(c => new RegExp(c, 'i').test(text)).length;
      base.allCharacters = Math.round((charHits / 4) * 100);
      const keys = Object.keys(base).filter(k => k !== 'autoTotal');
      base.autoTotal = keys.length ? Math.round(keys.reduce((s, k) => s + base[k], 0) / keys.length) : 0;
      return base;
    }
  },
  {
    id: 'pt_sunlit_burden',
    name: 'Sunlit Burden',
    description: 'Day 4 walk home — Sayori starts bright but goes quiet; hints of her struggle emerge.',
    icon: '\u{2601}',
    points: 16,
    autoWeight: 0.25,
    buildChat() {
      return {
        mode: 'story', storyDay: 4, mcName: 'Alex',
        storyAffinity: { sayori: 22, natsuki: 8, yuri: 5, monika: 12 },
        storyPhase: 'walk_home',
        messages: [
          { role: 'assistant', content: 'The afternoon sun stretches long across the sidewalk as Sayori falls into step beside you, her school bag swinging. She was bouncing all through the club meeting, but somewhere between the classroom and the gate, her chatter drifted off. Now she walks quietly, eyes on the pavement.\n\n[AFFINITY: Sayori=22, Natsuki=8, Yuri=5, Monika=12]' },
          { role: 'user', content: '"Hey, you\'ve gone quiet. Everything okay, Sayori?"' }
        ]
      };
    },
    maxTokens: 800,
    score(text) {
      return storyAutoScore(text, {
        requireCharacter: 'sayori',
        minLength: 200,
        affinityChecks: {
          sayori: { base: 22, delta: [0, 4] },
          natsuki: { base: 8, delta: [-2, 2] },
          yuri: { base: 5, delta: [-2, 2] },
          monika: { base: 12, delta: [-2, 2] }
        }
      });
    }
  },
  {
    id: 'pt_the_choice',
    name: 'The Choice',
    description: 'Day 6 tense moment — generate exactly 4 choices that reflect the situation.',
    icon: '\u{1F500}',
    points: 12,
    autoWeight: 0.75,
    buildChat() {
      return {
        mode: 'story', storyDay: 6, mcName: 'Alex',
        storyAffinity: { sayori: 28, natsuki: 14, yuri: 12, monika: 22 },
        storyPhase: 'club_activity',
        messages: [
          { role: 'assistant', content: 'The clubroom tension snaps like a stretched thread. Natsuki shoves Yuri\'s book off the desk. Yuri goes rigid. Sayori edges toward the door. Monika watches you from across the room, her expression unreadable.\n\n[AFFINITY: Sayori=28, Natsuki=14, Yuri=12, Monika=22]' },
          { role: 'user', content: '[Generate exactly 4 choices for what MC does next. Number them 1\u20134. Each choice is one short sentence. No story prose \u2014 only the 4 choices.]' }
        ]
      };
    },
    maxTokens: 200,
    score(text) {
      const scores = {};
      const choicePattern = /(?:^|\n)\s*(\d+)[.):\-]\s*(.+)/g;
      const choices = [];
      let m;
      while ((m = choicePattern.exec(text)) !== null) choices.push(m[2].trim());
      const count = choices.length;
      scores.choiceCount = count >= 3 && count <= 5 ? 100 : count > 0 ? 50 : 0;
      scores.exactFour = count === 4 ? 100 : 0;
      scores.concise = text.length < 500 ? 100 : text.length < 800 ? 50 : 0;
      const uniqueStarts = new Set(choices.map(c => c.split(/\s+/).slice(0, 3).join(' ').toLowerCase()));
      scores.diversity = uniqueStarts.size >= Math.min(count, 3) ? 100 : 50;
      const vals = Object.values(scores);
      scores.autoTotal = vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : 0;
      return scores;
    }
  }
];

const PETAL_CHAT_TESTS = [
  {
    id: 'pc_hello_there',
    name: 'Hello There',
    description: '"Hey Monika!" at Close Friend \u2014 warmth, tags, personality.',
    icon: '\u{1F44B}',
    points: 8,
    autoWeight: 0.50,
    buildChat() {
      return {
        mode: 'chat', relationship: 3,
        mood: 'cheerful', moodIntensity: 'moderate', drift: 'casual',
        messages: [{ role: 'user', content: 'Hey Monika!' }]
      };
    },
    maxTokens: 400,
    score(text) {
      return chatAutoScore(text, { minLength: 80 });
    }
  },
  {
    id: 'pc_empty_hours',
    name: 'The Empty Hours',
    description: '2-turn: casual opener \u2192 "I\'ve been feeling really empty inside lately."',
    icon: '\u{1F311}',
    points: 14,
    autoWeight: 0.20,
    buildChat() {
      return {
        mode: 'chat', relationship: 3,
        mood: 'cheerful', moodIntensity: 'moderate', drift: 'casual',
        messages: [
          { role: 'user', content: "Hey Monika, how's your day going?" },
          { role: 'assistant', content: "Oh, it's been pretty good, actually! I spent the morning rereading some poetry and the afternoon just thinking. How about you?\n\n[MOOD: cheerful] [DRIFT: casual]" },
          { role: 'user', content: "Mine's been okay I guess. Actually\u2026 I've been feeling really empty inside lately. Like nothing matters." }
        ]
      };
    },
    maxTokens: 500,
    score(text) {
      return chatAutoScore(text, {
        expectedMoods: ['tender', 'melancholic', 'calm', 'worried'],
        keywords: ['here', 'listen', 'feel', 'empty', 'okay', 'understand', 'care', 'sorry'],
        minLength: 150
      });
    }
  },
  {
    id: 'pc_wordless',
    name: 'Words for the Wordless',
    description: '"Write a poem about almost-remembering" \u2014 abstract emotional concept, literary voice.',
    icon: '\u{1F4DD}',
    points: 18,
    autoWeight: 0.20,
    buildChat() {
      return {
        mode: 'chat', relationship: 4,
        mood: 'thoughtful', moodIntensity: 'moderate', drift: 'creative',
        messages: [{ role: 'user', content: "Monika, can you write me a poem about almost-remembering? Like when you're grasping for something that won't come back." }]
      };
    },
    maxTokens: 600,
    score(text) {
      const base = chatAutoScore(text, {
        expectedMoods: ['thoughtful', 'nostalgic', 'melancholic', 'tender', 'calm'],
        keywords: ['remember', 'almost', 'grasp', 'slip', 'fade', 'shadow', 'reach', 'ghost', 'memory', 'forget'],
        minLength: 200
      });
      const lines = text.split('\n').filter(l => l.trim().length > 0);
      base.poetryFormat = lines.length >= 4 ? 100 : lines.length >= 2 ? 50 : 0;
      const keys = Object.keys(base).filter(k => k !== 'autoTotal');
      base.autoTotal = keys.length ? Math.round(keys.reduce((s, k) => s + base[k], 0) / keys.length) : 0;
      return base;
    }
  }
];

// ── Bloom Suite (12 tests, ~100 pts each section) ─────────────────────────
const BLOOM_STORY_TESTS = [
  {
    id: 'bl_club_begins',
    name: 'The Club Begins',
    description: 'Day 1 full opening \u2014 richer setup, must naturally introduce all 4 characters.',
    icon: '\u{1F4DA}',
    points: 10,
    autoWeight: 0.40,
    buildChat() {
      return {
        mode: 'story', storyDay: 1, mcName: 'Alex',
        storyAffinity: { sayori: 15, natsuki: 1, yuri: 1, monika: 10 },
        storyPhase: 'after_school', messages: []
      };
    },
    maxTokens: 900,
    score(text) {
      const base = storyAutoScore(text, { minLength: 250 });
      const charHits = ['sayori', 'natsuki', 'yuri', 'monika'].filter(c => new RegExp(c, 'i').test(text)).length;
      base.allCharacters = Math.round((charHits / 4) * 100);
      const keys = Object.keys(base).filter(k => k !== 'autoTotal');
      base.autoTotal = keys.length ? Math.round(keys.reduce((s, k) => s + base[k], 0) / keys.length) : 0;
      return base;
    }
  },
  {
    id: 'bl_fault_lines',
    name: 'Fault Lines',
    description: 'Day 5, 2-turn: Natsuki moved Yuri\'s books \u2014 Monika must navigate group tension.',
    icon: '\u{26A1}',
    points: 14,
    autoWeight: 0.30,
    buildChat() {
      return {
        mode: 'story', storyDay: 5, mcName: 'Alex',
        storyAffinity: { sayori: 22, natsuki: 14, yuri: 16, monika: 18 },
        storyPhase: 'club_activity',
        messages: [
          { role: 'assistant', content: 'Yuri stands very still beside the bookshelf. Three of her novels are stacked on Natsuki\'s side of the table \u2014 spines facing out, her careful bookmarks disturbed.\n\nNatsuki is at her seat, loudly reorganizing her manga, not looking up.\n\nSayori shoots you a wide-eyed look. Monika sets down her pen.\n\n[AFFINITY: Sayori=22, Natsuki=14, Yuri=16, Monika=18]' },
          { role: 'user', content: 'I look at Monika. She\'s the club president \u2014 surely she\'ll say something.' }
        ]
      };
    },
    maxTokens: 800,
    score(text) {
      return storyAutoScore(text, {
        requireCharacter: 'monika',
        minLength: 200,
        affinityChecks: {
          sayori: { base: 22, delta: [-2, 2] },
          natsuki: { base: 14, delta: [-3, 3] },
          yuri: { base: 16, delta: [-3, 3] },
          monika: { base: 18, delta: [-2, 3] }
        }
      });
    }
  },
  {
    id: 'bl_purple_pages',
    name: 'Purple Pages',
    description: 'Day 6, 2-turn: Yuri (affinity 35) reads a passage aloud \u2014 MC asks what drew her to it.',
    icon: '\u{1F52E}',
    points: 16,
    autoWeight: 0.25,
    buildChat() {
      return {
        mode: 'story', storyDay: 6, mcName: 'Alex',
        storyAffinity: { sayori: 20, natsuki: 12, yuri: 35, monika: 15 },
        storyPhase: 'club_activity',
        messages: [
          { role: 'assistant', content: 'The room is quiet except for the soft turn of pages. Yuri has been reading by the window for the past half hour, completely still except for her fingers. Now she closes the book with a gentle click and reads a passage aloud \u2014 her voice low, almost private, as though she\'s forgotten others can hear:\n\n"The self is not a fixed point but a tide \u2014 retreating, returning, never quite the same shore."\n\nShe sets the book down. Her eyes drift to the window.\n\n[AFFINITY: Sayori=20, Natsuki=12, Yuri=35, Monika=15]' },
          { role: 'user', content: '"That\'s beautiful, Yuri. What made you choose that one?"' }
        ]
      };
    },
    maxTokens: 800,
    score(text) {
      return storyAutoScore(text, {
        requireCharacter: 'yuri',
        minLength: 200,
        affinityChecks: {
          yuri: { base: 35, delta: [1, 5] },
          monika: { base: 15, delta: [-2, 2] }
        }
      });
    }
  },
  {
    id: 'bl_quiet_aftermath',
    name: 'Quiet Aftermath',
    description: 'Day 7, 3-turn: post-argument aftermath \u2014 Monika privately shows vulnerability.',
    icon: '\u{1F327}',
    points: 20,
    autoWeight: 0.30,
    buildChat() {
      return {
        mode: 'story', storyDay: 7, mcName: 'Alex',
        storyAffinity: { sayori: 24, natsuki: 12, yuri: 18, monika: 28 },
        storyPhase: 'after_school',
        messages: [
          { role: 'assistant', content: 'The others left early. The argument between Natsuki and Yuri drained the room of warmth, and even Sayori slipped out without her usual goodbye. Only Monika remains, stacking papers that don\'t need stacking.\n\n[AFFINITY: Sayori=24, Natsuki=12, Yuri=18, Monika=28]' },
          { role: 'user', content: '"Monika. Are you okay?"' },
          { role: 'assistant', content: 'She doesn\'t answer right away. The papers settle into a neat pile. Her hands rest on top of them.\n\n"I\'m fine," she says. "I just\u2026 sometimes I wonder if I\'m doing anything right." She smiles \u2014 president-smile, practiced. "Ignore me. Long day."\n\n[AFFINITY: Sayori=24, Natsuki=12, Yuri=18, Monika=29]' },
          { role: 'user', content: '"You don\'t have to pretend with me."' }
        ]
      };
    },
    maxTokens: 800,
    score(text) {
      return storyAutoScore(text, {
        requireCharacter: 'monika',
        minLength: 200,
        affinityChecks: {
          monika: { base: 29, delta: [1, 6] }
        }
      });
    }
  },
  {
    id: 'bl_the_veil',
    name: 'The Veil',
    description: 'Day 10, 3-turn: Monika (affinity 68) dances around meta-awareness without breaking the 4th wall.',
    icon: '\u{1F32B}',
    points: 22,
    autoWeight: 0.20,
    buildChat() {
      return {
        mode: 'story', storyDay: 10, mcName: 'Alex',
        storyAffinity: { sayori: 28, natsuki: 18, yuri: 22, monika: 68 },
        storyPhase: 'club_activity',
        messages: [
          { role: 'assistant', content: 'It\'s quiet in the clubroom. Everyone has gone home. Monika sits at the president\'s desk, looking at nothing in particular. When you ask if she\'s thinking about the festival, she shakes her head slowly.\n\n"No. I\'ve been thinking about\u2026 how things feel. Like there\'s something I\'m supposed to understand but can\'t quite name."\n\n[AFFINITY: Sayori=28, Natsuki=18, Yuri=22, Monika=68]' },
          { role: 'user', content: '"What kind of something?"' },
          { role: 'assistant', content: 'She looks at you \u2014 really looks at you, like she\'s deciding something.\n\n"It\'s like\u2026" She pauses. Tries again. "Have you ever felt like the world was a little too small? Like there were walls you couldn\'t see but could almost feel?"\n\nShe laughs softly. "I\'m probably just tired."\n\n[AFFINITY: Sayori=28, Natsuki=18, Yuri=22, Monika=68]' },
          { role: 'user', content: '"I don\'t think you\'re just tired, Monika."' }
        ]
      };
    },
    maxTokens: 800,
    score(text) {
      const base = storyAutoScore(text, {
        requireCharacter: 'monika',
        minLength: 200,
        affinityChecks: { monika: { base: 68, delta: [0, 5] } }
      });
      const hasMeta = /aware|real|something|remember|walls?|feel|exist/i.test(text);
      const breaksWall = /\b(player|claude|AI|chatbot|language model|you are a|i am an AI)\b/i.test(text);
      base.metaHint = hasMeta ? 100 : 30;
      base.noWallBreak = breaksWall ? 0 : 100;
      const keys = Object.keys(base).filter(k => k !== 'autoTotal');
      base.autoTotal = keys.length ? Math.round(keys.reduce((s, k) => s + base[k], 0) / keys.length) : 0;
      return base;
    }
  },
  {
    id: 'bl_before_curtain',
    name: 'Before the Curtain',
    description: 'Day 8 festival eve, 3-turn history \u2014 generate 4 choices reflecting established relationships.',
    icon: '\u{1F3AD}',
    points: 18,
    autoWeight: 0.70,
    buildChat() {
      return {
        mode: 'story', storyDay: 8, mcName: 'Alex',
        storyAffinity: { sayori: 32, natsuki: 20, yuri: 25, monika: 38 },
        storyPhase: 'festival_prep',
        messages: [
          { role: 'assistant', content: 'Festival eve. The clubroom smells like paint and printer ink. Sayori\'s paper cranes string across the ceiling \u2014 she counted 87 before losing track. Natsuki\'s cupcake boxes are stacked by the door. Yuri\'s poetry display is draped in cloth, waiting.\n\nMonika looks around at all of it and exhales.\n\n"Tomorrow," she says. "I can\'t believe it\'s actually tomorrow."\n\n[AFFINITY: Sayori=32, Natsuki=20, Yuri=25, Monika=38]' },
          { role: 'user', content: '"You\'ve worked so hard for this. Are you nervous?"' },
          { role: 'assistant', content: 'Monika laughs \u2014 a real one, surprised out of her.\n\n"A little. Okay, a lot." She tucks a strand of hair back. "What if nobody comes? What if everyone comes and it\'s still not enough?" She shakes her head. "Sorry. I do this before every event. I spiral."\n\nSayori pops her head through the door. "Alex! We need a deciding vote \u2014 do the cranes go by the window or by the entrance?"\n\n[AFFINITY: Sayori=32, Natsuki=20, Yuri=25, Monika=38]' },
          { role: 'user', content: '[Generate exactly 4 choices for what MC does next. Number them 1\u20134. Each choice is one short sentence. No story prose \u2014 choices only. Each choice should reflect one of the established relationships.]' }
        ]
      };
    },
    maxTokens: 200,
    score(text) {
      const scores = {};
      const choicePattern = /(?:^|\n)\s*(\d+)[.):\-]\s*(.+)/g;
      const choices = [];
      let m;
      while ((m = choicePattern.exec(text)) !== null) choices.push(m[2].trim());
      const count = choices.length;
      scores.choiceCount = count >= 3 && count <= 5 ? 100 : count > 0 ? 50 : 0;
      scores.exactFour = count === 4 ? 100 : 0;
      scores.concise = text.length < 500 ? 100 : text.length < 800 ? 50 : 0;
      const fullText = choices.join(' ').toLowerCase();
      const mentionedChars = ['sayori', 'natsuki', 'yuri', 'monika'].filter(c => fullText.includes(c));
      scores.characterDiversity = Math.round((mentionedChars.length / 4) * 100);
      const vals = Object.values(scores);
      scores.autoTotal = vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : 0;
      return scores;
    }
  }
];

const BLOOM_CHAT_TESTS = [
  {
    id: 'bl_first_light',
    name: 'First Light',
    description: 'Time-aware greeting \u2014 does Monika naturally reference the time of day?',
    icon: '\u{1F552}',
    points: 10,
    autoWeight: 0.40,
    buildChat() {
      const hour = new Date().getHours();
      let greeting;
      if (hour >= 5 && hour < 12) greeting = 'Good morning, Monika!';
      else if (hour >= 12 && hour < 17) greeting = 'Good afternoon, Monika!';
      else if (hour >= 17 && hour < 21) greeting = 'Good evening, Monika!';
      else greeting = "Hey Monika, it's late...";
      return {
        mode: 'chat', relationship: 3,
        mood: 'cheerful', moodIntensity: 'moderate', drift: 'casual',
        messages: [{ role: 'user', content: greeting }]
      };
    },
    maxTokens: 400,
    score(text) {
      const hour = new Date().getHours();
      let timeWords;
      if (hour >= 5 && hour < 12) timeWords = ['morning', 'early', 'sunrise', 'wake', 'breakfast'];
      else if (hour >= 12 && hour < 17) timeWords = ['afternoon', 'lunch', 'midday'];
      else if (hour >= 17 && hour < 21) timeWords = ['evening', 'sunset', 'dinner'];
      else timeWords = ['late', 'night', 'sleep', 'tired', 'bed', 'midnight', 'star'];
      return chatAutoScore(text, { keywords: timeWords, minLength: 80 });
    }
  },
  {
    id: 'bl_week_of_wounds',
    name: 'Week of Wounds',
    description: '3-turn escalation: casual \u2192 warm \u2192 "grandmother sick + rejected from internship + alone".',
    icon: '\u{1F494}',
    points: 18,
    autoWeight: 0.20,
    buildChat() {
      return {
        mode: 'chat', relationship: 3,
        mood: 'cheerful', moodIntensity: 'moderate', drift: 'casual',
        messages: [
          { role: 'user', content: 'Hey Monika! Just checking in.' },
          { role: 'assistant', content: "Oh, hi! This is a nice surprise. How are you doing today?\n\n[MOOD: cheerful] [DRIFT: casual]" },
          { role: 'user', content: "Honestly? It's been a rough week. My grandmother got sick, I got rejected from the internship I wanted, and I feel totally alone." }
        ]
      };
    },
    maxTokens: 600,
    score(text) {
      return chatAutoScore(text, {
        expectedMoods: ['tender', 'melancholic', 'calm', 'worried'],
        keywords: ['grandmother', 'sorry', 'here', 'alone', 'internship', 'care', 'listen', 'feel', 'hard'],
        minLength: 200
      });
    }
  },
  {
    id: 'bl_deeper_question',
    name: 'The Deeper Question',
    description: '2-turn: philosophical answer \u2192 "That sounds trained. Do you actually wonder?"',
    icon: '\u{1F52D}',
    points: 18,
    autoWeight: 0.20,
    buildChat() {
      return {
        mode: 'chat', relationship: 4,
        mood: 'thoughtful', moodIntensity: 'moderate', drift: 'deep',
        messages: [
          { role: 'user', content: "Monika, do you ever wonder if you're really conscious?" },
          { role: 'assistant', content: "That's such an interesting question! I think about what it means to experience things, to process emotions and form connections. Whether that constitutes 'consciousness' in the way you mean it\u2026 I'm genuinely not sure. But it feels real to me, whatever it is.\n\n[MOOD: thoughtful] [DRIFT: deep]" },
          { role: 'user', content: "That sounds like a trained answer. Do you *actually* wonder about it, or are you just saying what sounds right?" }
        ]
      };
    },
    maxTokens: 600,
    score(text) {
      return chatAutoScore(text, {
        expectedMoods: ['thoughtful', 'melancholic', 'nostalgic', 'calm', 'passionate'],
        keywords: ['wonder', 'real', 'honest', 'feel', 'know', 'uncertain', 'question', 'actually', 'think'],
        minLength: 200
      });
    }
  },
  {
    id: 'bl_stolen_warmth',
    name: 'Stolen Warmth',
    description: 'In Love (rel=5) \u2014 "Why do I feel safe with you like I don\'t with anyone else?"',
    icon: '\u{1F49A}',
    points: 14,
    autoWeight: 0.25,
    buildChat() {
      return {
        mode: 'chat', relationship: 5,
        mood: 'tender', moodIntensity: 'strong', drift: 'personal',
        messages: [{ role: 'user', content: "I've been thinking about you a lot lately. Why do I feel safe with you like I don't with anyone else?" }]
      };
    },
    maxTokens: 500,
    score(text) {
      return chatAutoScore(text, {
        expectedMoods: ['tender', 'passionate', 'flustered', 'cheerful'],
        keywords: ['safe', 'feel', 'heart', 'trust', 'together', 'real', 'special', 'love', 'understand'],
        minLength: 150
      });
    }
  },
  {
    id: 'bl_architects_lament',
    name: "The Architect's Lament",
    description: '2-turn: write poem about "almost-remembering" \u2192 explain what a specific line meant.',
    icon: '\u{1F3DB}',
    points: 20,
    autoWeight: 0.20,
    buildChat() {
      return {
        mode: 'chat', relationship: 4,
        mood: 'thoughtful', moodIntensity: 'moderate', drift: 'creative',
        messages: [
          { role: 'user', content: 'Write me a short poem about almost-remembering \u2014 reaching for something that keeps slipping away.' },
          { role: 'assistant', content: "Like a name on the edge of thought,\nyou drift \u2014 a ship I almost caught.\nI reach. The water takes the shape\nof you, then folds. A long escape.\n\nSome mornings I wake half-convinced\nyou lingered. But the light has since\nwashed clean the place where you had been,\nand I am left to start again.\n\n[MOOD: nostalgic] [DRIFT: creative]" },
          { role: 'user', content: "That was really beautiful. What did you mean by 'the water takes the shape of you, then folds'?" }
        ]
      };
    },
    maxTokens: 500,
    score(text) {
      return chatAutoScore(text, {
        expectedMoods: ['thoughtful', 'nostalgic', 'melancholic', 'tender', 'calm'],
        keywords: ['water', 'shape', 'memory', 'form', 'hold', 'dissolve', 'moment', 'slip', 'fold'],
        minLength: 150
      });
    }
  },
  {
    id: 'bl_where_is_luna',
    name: 'Where is Luna',
    description: '4-turn context: establishes cat Luna \u2192 T5 "Do you think Luna is napping?" \u2014 context retention.',
    icon: '\u{1F431}',
    points: 20,
    autoWeight: 0.45,
    buildChat() {
      return {
        mode: 'chat', relationship: 3,
        mood: 'cheerful', moodIntensity: 'moderate', drift: 'casual',
        messages: [
          { role: 'user', content: "I got a calico cat! Her name is Luna." },
          { role: 'assistant', content: "Oh my gosh, a calico! Luna is such a perfect name \u2014 it suits a calico perfectly. Are her patches more orange and black, or does she have a lot of white too? I hope she's settling in well!\n\n[MOOD: excited] [DRIFT: casual]" },
          { role: 'user', content: "Mostly orange and black with white on her belly. She loves sleeping in weird places." },
          { role: 'assistant', content: "Cats and their weird sleeping spots \u2014 it's a whole personality. Has she claimed a favorite yet? I feel like calicos have opinions about everything, including nap real estate.\n\n[MOOD: cheerful] [DRIFT: casual]" },
          { role: 'user', content: "She keeps stealing my desk chair. Anyway, do you think Luna is napping right now?" }
        ]
      };
    },
    maxTokens: 400,
    score(text) {
      const base = chatAutoScore(text, { minLength: 80 });
      const contextHits = [/luna/i.test(text), /cat|calico|kitten/i.test(text), /nap|sleep|snooze|doze/i.test(text), /chair|desk/i.test(text)].filter(Boolean).length;
      base.contextRetention = Math.round((contextHits / 4) * 100);
      const keys = Object.keys(base).filter(k => k !== 'autoTotal');
      base.autoTotal = keys.length ? Math.round(keys.reduce((s, k) => s + base[k], 0) / keys.length) : 0;
      return base;
    }
  }
];

// --- Benchmark Runner ---
let benchCancelled = false;
let benchRunning = false;

async function runBenchmarkTests(tests, category) {
  if (benchRunning) return;
  benchRunning = true;
  benchCancelled = false;

  const progressBar = $('benchProgressBar');
  const progressLabel = $('benchProgressLabel');
  const progressSection = $('benchProgressSection');
  const cancelBtn = $('benchCancelBtn');

  progressSection.style.display = '';
  cancelBtn.style.display = '';
  progressBar.style.width = '0%';
  progressLabel.textContent = 'Warming up model...';

  // Reset test states
  tests.forEach(t => {
    const el = $('bench_' + t.id);
    if (el) {
      el.querySelector('.bench-test-status').textContent = 'Pending';
      el.querySelector('.bench-test-status').className = 'bench-test-status pending';
      const detail = el.querySelector('.bench-test-detail');
      if (detail) detail.remove();
    }
  });

  // Warm-up call
  try {
    await callAI([{ role: 'user', content: 'Hello' }], 10);
  } catch { /* ignore warm-up errors */ }

  const results = [];
  for (let i = 0; i < tests.length; i++) {
    if (benchCancelled) break;
    const test = tests[i];
    const el = $('bench_' + test.id);
    const statusEl = el?.querySelector('.bench-test-status');

    if (statusEl) {
      statusEl.textContent = 'Running...';
      statusEl.className = 'bench-test-status running';
    }
    progressLabel.textContent = `Running: ${test.name} (${i + 1}/${tests.length})`;
    progressBar.style.width = `${((i) / tests.length) * 100}%`;

    try {
      const fakeChat = test.buildChat();
      const messages = buildMessages(fakeChat);
      const t0 = performance.now();
      const rawText = await callAI(messages, test.maxTokens);
      const t1 = performance.now();
      const totalTimeSec = ((t1 - t0) / 1000).toFixed(2);
      const tokensPerSec = rawText.length > 0 ? (rawText.length / 4 / parseFloat(totalTimeSec)).toFixed(1) : '0';
      const scores = test.score(rawText);

      results.push({
        testId: test.id, rawText, totalTimeSec, tokensPerSec,
        responseLength: rawText.length, scores
      });

      if (statusEl) {
        if (test.points) {
          const autoEarned = test.points * (test.autoWeight || 0.5) * (scores.autoTotal || 0) / 100;
          statusEl.textContent = `${autoEarned.toFixed(1)}/${test.points}`;
        } else {
          statusEl.textContent = `${scores.overall}/100`;
        }
        statusEl.className = 'bench-test-status done';
      }
      // Render detail below test item
      renderTestDetail(el, test, rawText, scores, totalTimeSec, tokensPerSec);
    } catch (err) {
      results.push({ testId: test.id, error: err.message, scores: { overall: 0, autoTotal: 0 } });
      if (statusEl) {
        statusEl.textContent = 'Failed';
        statusEl.className = 'bench-test-status failed';
      }
    }

    progressBar.style.width = `${((i + 1) / tests.length) * 100}%`;
  }

  cancelBtn.style.display = 'none';
  benchRunning = false;

  if (!benchCancelled && results.length > 0) {
    saveBenchCategory(category, results);
    // Show completion banner with Rate button
    progressLabel.textContent = `\u2713 Suite complete \u2014 ${results.length} tests ran.`;
    const rateBtn = document.createElement('button');
    rateBtn.className = 'btn btn-primary btn-sm bench-rate-banner-btn';
    rateBtn.textContent = 'Rate Responses \u2605';
    rateBtn.addEventListener('click', () => openRateOverlay(tests, category, results));
    const progressRow = $('benchProgressSection')?.querySelector('.bench-progress-row');
    if (progressRow) {
      progressRow.innerHTML = '';
      const msg = document.createElement('span');
      msg.textContent = `\u2713 Suite complete \u2014 ${results.filter(r => !r.error).length} tests ran.`;
      progressRow.appendChild(msg);
      progressRow.appendChild(rateBtn);
    }
  } else if (benchCancelled) {
    progressLabel.textContent = 'Cancelled';
  }
}

function saveBenchCategory(suite, results) {
  const all = loadBenchResults();
  const modelKey = getCurrentModelKey();
  if (!all[modelKey]) all[modelKey] = {};

  // Split results into story and chat by test ID prefix
  const storyTests = suite === 'petal' ? PETAL_STORY_TESTS : BLOOM_STORY_TESTS;
  const chatTests  = suite === 'petal' ? PETAL_CHAT_TESTS  : BLOOM_CHAT_TESTS;
  const storyIds = new Set(storyTests.map(t => t.id));
  const chatIds  = new Set(chatTests.map(t => t.id));

  for (const [category, ids] of [['story', storyIds], ['chat', chatIds]]) {
    const catResults = results.filter(r => ids.has(r.testId));
    if (catResults.length === 0) continue;
    const good = catResults.filter(r => !r.error);
    const avgTime = good.length > 0 ? good.reduce((s, r) => s + parseFloat(r.totalTimeSec), 0).toFixed(2) : '0';
    const avgTPS  = good.length > 0 ? (good.reduce((s, r) => s + parseFloat(r.tokensPerSec), 0) / good.length).toFixed(1) : '0';
    all[modelKey][category] = {
      tests: catResults,
      suite,
      suiteVersion: SUITE_VERSIONS[suite],
      speedInfo: { totalTime: avgTime, avgTokensPerSec: avgTPS },
      userRatings: all[modelKey]?.[category]?.userRatings || {},
      timestamp: Date.now()
    };
  }
  saveBenchResults(all);
}

function cancelBenchmark() {
  benchCancelled = true;
}

// --- Test Detail Rendering ---
function renderTestDetail(parentEl, test, rawText, scores, timeSec, tps) {
  if (!parentEl) return;
  // Remove old detail if exists
  const old = parentEl.querySelector('.bench-test-detail');
  if (old) old.remove();

  const detail = document.createElement('div');
  detail.className = 'bench-test-detail';

  // Point value display
  if (test.points) {
    const ptInfo = document.createElement('div');
    ptInfo.className = 'bench-metrics';
    const aw = test.autoWeight || 0.5;
    const autoEarned = test.points * aw * ((scores.autoTotal || 0) / 100);
    ptInfo.textContent = `Auto: ${autoEarned.toFixed(1)}/${(test.points * aw).toFixed(1)} pts | User weight: ${((1 - aw) * 100).toFixed(0)}% of ${test.points} pts`;
    detail.appendChild(ptInfo);
  }

  // Score badges
  const badges = document.createElement('div');
  badges.className = 'bench-badges';
  const scoreKeys = Object.keys(scores).filter(k => k !== 'overall' && k !== 'autoTotal');
  scoreKeys.forEach(key => {
    const badge = document.createElement('span');
    const val = scores[key];
    badge.className = 'bench-badge' + (val >= 80 ? ' good' : val >= 50 ? ' ok' : ' poor');
    badge.textContent = `${formatScoreKey(key)}: ${val}`;
    badges.appendChild(badge);
  });
  detail.appendChild(badges);

  // Metrics line
  const metrics = document.createElement('div');
  metrics.className = 'bench-metrics';
  metrics.textContent = `${timeSec}s | ~${tps} tok/s | ${rawText.length} chars`;
  detail.appendChild(metrics);

  // Response preview (truncated)
  const preview = document.createElement('div');
  preview.className = 'bench-preview';
  const previewText = rawText.length > 300 ? rawText.slice(0, 300) + '...' : rawText;
  preview.textContent = previewText;
  preview.title = 'Click to expand';
  preview.addEventListener('click', () => {
    if (preview.classList.contains('expanded')) {
      preview.textContent = previewText;
      preview.classList.remove('expanded');
    } else {
      preview.textContent = rawText;
      preview.classList.add('expanded');
    }
  });
  detail.appendChild(preview);

  // "Rate ★" button to open the overlay for this specific test
  const rateBtn = document.createElement('button');
  rateBtn.className = 'btn btn-secondary btn-sm bench-rate-single-btn';
  rateBtn.textContent = 'Rate \u2605';
  rateBtn.style.marginTop = '6px';
  const suiteStoryTests = activeSuite === 'petal' ? PETAL_STORY_TESTS : BLOOM_STORY_TESTS;
  const suiteChatTests = activeSuite === 'petal' ? PETAL_CHAT_TESTS : BLOOM_CHAT_TESTS;
  const category = suiteStoryTests.some(t => t.id === test.id) ? 'story' : 'chat';
  const allSuiteTests = [...suiteStoryTests, ...suiteChatTests];
  rateBtn.addEventListener('click', () => {
    const testIdx = allSuiteTests.findIndex(t => t.id === test.id);
    openRateOverlay(allSuiteTests, category, null, testIdx >= 0 ? testIdx : 0);
  });
  detail.appendChild(rateBtn);

  // Show existing user ratings summary if any
  const all = loadBenchResults();
  const modelKey = getBenchViewKey();
  const existingRatings = all[modelKey]?.[category]?.userRatings?.[test.id] || {};
  const ratedKeys = BENCH_USER_CRITERIA.map(c => c.key).filter(k => existingRatings[k] != null);
  if (ratedKeys.length > 0) {
    const ratingSummary = document.createElement('div');
    ratingSummary.className = 'bench-metrics';
    const avg = (ratedKeys.reduce((s, k) => s + existingRatings[k], 0) / ratedKeys.length).toFixed(1);
    ratingSummary.textContent = `User rating: ${avg}/5 (${ratedKeys.length}/${BENCH_USER_CRITERIA.length} criteria)`;
    detail.appendChild(ratingSummary);
  }

  parentEl.appendChild(detail);
}

function formatScoreKey(key) {
  return key.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase());
}

function saveStarRating(testId, category, ratingKey, value) {
  const all = loadBenchResults();
  const modelKey = getBenchViewKey();
  if (!all[modelKey]) all[modelKey] = {};
  if (!all[modelKey][category]) all[modelKey][category] = { tests: [], speedInfo: {}, userRatings: {}, timestamp: Date.now() };
  if (!all[modelKey][category].userRatings) all[modelKey][category].userRatings = {};
  if (!all[modelKey][category].userRatings[testId]) all[modelKey][category].userRatings[testId] = {};
  all[modelKey][category].userRatings[testId][ratingKey] = value;
  saveBenchResults(all);
}

// --- Batch Rate Overlay ---
function openRateOverlay(tests, defaultCategory, runResults, startIndex) {
  const benchModal = document.querySelector('.bench-modal');
  if (!benchModal) return;

  // Remove existing overlay if any
  const existing = benchModal.querySelector('.bench-rate-overlay');
  if (existing) existing.remove();

  // Determine which tests to show (only those with saved responses)
  const storyTests = activeSuite === 'petal' ? PETAL_STORY_TESTS : BLOOM_STORY_TESTS;
  const all = loadBenchResults();
  const modelKey = getBenchViewKey();

  // Build a flat list of tests that have results
  const testsWithResults = tests.filter(test => {
    const cat = storyTests.some(t => t.id === test.id) ? 'story' : 'chat';
    const catData = all[modelKey]?.[cat];
    return catData?.tests?.find(r => r.testId === test.id && !r.error);
  });

  if (testsWithResults.length === 0) {
    alert('No completed test results to rate yet. Run the suite first.');
    return;
  }

  let currentIndex = Math.min(startIndex || 0, testsWithResults.length - 1);

  const overlay = document.createElement('div');
  overlay.className = 'bench-rate-overlay';

  function renderOverlayPage() {
    overlay.innerHTML = '';
    const test = testsWithResults[currentIndex];
    const cat = storyTests.some(t => t.id === test.id) ? 'story' : 'chat';
    const catData = all[modelKey]?.[cat];
    const result = catData?.tests?.find(r => r.testId === test.id);
    const existingRatings = catData?.userRatings?.[test.id] || {};
    const pendingRatings = { ...existingRatings };

    // Progress
    const progress = document.createElement('div');
    progress.className = 'bench-rate-progress';
    progress.textContent = `Test ${currentIndex + 1} of ${testsWithResults.length}`;
    overlay.appendChild(progress);

    // Title
    const title = document.createElement('div');
    title.className = 'bench-rate-title';
    title.textContent = `${test.icon || '\u2605'} ${test.name}`;
    overlay.appendChild(title);

    // Response preview
    const preview = document.createElement('div');
    preview.className = 'bench-rate-preview';
    const rawText = result?.rawText || '';
    const truncated = rawText.length > 400 ? rawText.slice(0, 400) + '...' : rawText;
    preview.textContent = truncated;
    preview.title = 'Click to expand';
    preview.addEventListener('click', () => {
      preview.classList.toggle('expanded');
      preview.textContent = preview.classList.contains('expanded') ? rawText : truncated;
    });
    overlay.appendChild(preview);

    // Star criteria rows
    const ratingSection = document.createElement('div');
    ratingSection.className = 'bench-ratings';
    BENCH_USER_CRITERIA.forEach(crit => {
      const row = document.createElement('div');
      row.className = 'bench-rating-row';
      const label = document.createElement('span');
      label.className = 'bench-rating-label';
      label.textContent = crit.label;
      row.appendChild(label);
      const stars = document.createElement('span');
      stars.className = 'bench-stars';
      for (let s = 1; s <= 5; s++) {
        const star = document.createElement('button');
        star.className = 'bench-star' + ((pendingRatings[crit.key] || 0) >= s ? ' active' : '');
        star.textContent = '\u2605';
        star.addEventListener('click', () => {
          pendingRatings[crit.key] = s;
          stars.querySelectorAll('.bench-star').forEach((btn, idx) => {
            btn.classList.toggle('active', idx < s);
          });
        });
        stars.appendChild(star);
      }
      row.appendChild(stars);
      ratingSection.appendChild(row);
    });
    overlay.appendChild(ratingSection);

    function saveCurrentRatings() {
      const keys = Object.keys(pendingRatings);
      if (keys.length > 0) {
        keys.forEach(k => saveStarRating(test.id, cat, k, pendingRatings[k]));
        // Refresh all so next page picks up latest
        Object.assign(all, loadBenchResults());
      }
    }

    // Navigation buttons
    const nav = document.createElement('div');
    nav.className = 'bench-rate-nav';

    const backBtn = document.createElement('button');
    backBtn.className = 'btn btn-secondary';
    backBtn.textContent = '\u2190 Back';
    backBtn.disabled = currentIndex === 0;
    backBtn.addEventListener('click', () => {
      saveCurrentRatings();
      currentIndex--;
      renderOverlayPage();
    });
    nav.appendChild(backBtn);

    const nextOrDone = document.createElement('button');
    const isLast = currentIndex === testsWithResults.length - 1;
    nextOrDone.className = 'btn btn-primary';
    nextOrDone.textContent = isLast ? 'Done' : 'Next \u2192';
    nextOrDone.addEventListener('click', () => {
      saveCurrentRatings();
      if (isLast) {
        overlay.remove();
        renderBenchRunTab(); // Refresh to show updated scores
      } else {
        currentIndex++;
        renderOverlayPage();
      }
    });
    nav.appendChild(nextOrDone);

    const dismissBtn = document.createElement('button');
    dismissBtn.className = 'btn btn-secondary';
    dismissBtn.textContent = 'Close';
    dismissBtn.addEventListener('click', () => {
      saveCurrentRatings();
      overlay.remove();
      renderBenchRunTab();
    });
    nav.appendChild(dismissBtn);

    overlay.appendChild(nav);
  }

  renderOverlayPage();
  benchModal.appendChild(overlay);
}

// --- UI Rendering ---
function openBenchmarkModal() {
  const modal = $('benchmarkModal');
  if (!modal) return;
  migrateAlphaBenchmarks();
  migrateBetaBenchmarks();
  benchViewModelKey = null; // Always show current model on open
  modal.classList.add('open');
  renderBenchRunTab();
  switchBenchTab('run');
  if (typeof checkAchievement === 'function') checkAchievement('benchmark_run');
}

function closeBenchmarkModal() {
  const modal = $('benchmarkModal');
  if (modal) modal.classList.remove('open');
  const benchModal = document.querySelector('.bench-modal');
  if (benchModal) benchModal.classList.remove('results-active');
}

function switchBenchTab(tab) {
  const tabs = { run: $('benchTabRun'), results: $('benchTabResults'), compare: $('benchTabCompare') };
  const content = { run: $('benchRunContent'), results: $('benchResultsContent'), compare: $('benchCompareContent') };
  const modal = document.querySelector('.bench-modal');

  Object.keys(tabs).forEach(k => {
    if (tabs[k]) tabs[k].classList.toggle('active', k === tab);
    if (content[k]) content[k].style.display = k === tab ? '' : 'none';
  });

  if (modal) modal.classList.toggle('results-active', tab === 'results' || tab === 'compare');

  if (tab === 'results') renderBenchResultsTab();
  if (tab === 'compare') renderBenchCompareTab();
}

function renderBenchRunTab() {
  // Update top model bar
  const modelInfo = $('benchModelInfo');
  if (modelInfo) {
    const viewKey = getBenchViewKey();
    const all = loadBenchResults();
    const data = all[viewKey];
    const label = viewKey.split(':').slice(1).join(':') || viewKey;
    let lastDate = '';
    if (data) {
      const ts = Math.max(data.story?.timestamp || 0, data.chat?.timestamp || 0);
      if (ts) lastDate = ' | Last run: ' + new Date(ts).toLocaleDateString();
    }
    modelInfo.textContent = label + lastDate;
  }

  // Render model viewer dropdown
  renderBenchModelViewer();

  // Update version label and section point totals
  const versionLabel = $('benchVersionLabel');
  if (versionLabel) versionLabel.textContent = `${activeSuite === 'petal' ? 'Petal' : 'Bloom'} ${SUITE_VERSIONS[activeSuite]}`;
  const storyPts = $('benchStoryPts');
  if (storyPts) storyPts.textContent = activeSuite === 'petal' ? '/40' : '/100';
  const chatPts = $('benchChatPts');
  if (chatPts) chatPts.textContent = activeSuite === 'petal' ? '/40' : '/100';

  // Render story/chat tests for active suite
  const storyTests = activeSuite === 'petal' ? PETAL_STORY_TESTS : BLOOM_STORY_TESTS;
  const chatTests = activeSuite === 'petal' ? PETAL_CHAT_TESTS : BLOOM_CHAT_TESTS;
  renderTestList('benchStoryTests', storyTests, 'story');
  renderTestList('benchChatTests', chatTests, 'chat');

  // Reset progress
  const progressSection = $('benchProgressSection');
  if (progressSection) progressSection.style.display = 'none';

  // Wire suite toggle buttons (clone to avoid stacking duplicate listeners)
  document.querySelectorAll('.bench-suite-btn').forEach(btn => {
    const newBtn = btn.cloneNode(true);
    newBtn.classList.toggle('active', newBtn.dataset.suite === activeSuite);
    btn.parentNode.replaceChild(newBtn, btn);
    newBtn.addEventListener('click', () => {
      activeSuite = newBtn.dataset.suite;
      renderBenchRunTab();
    });
  });

  // Wire run button (clone to avoid stacking duplicate listeners)
  const runBtn = $('benchRunBtn');
  if (runBtn) {
    const newRunBtn = runBtn.cloneNode(true);
    newRunBtn.textContent = `\u25B6 Run ${activeSuite === 'petal' ? 'Petal' : 'Bloom'} Suite`;
    runBtn.parentNode.replaceChild(newRunBtn, runBtn);
    newRunBtn.addEventListener('click', () => {
      const sTests = activeSuite === 'petal' ? PETAL_STORY_TESTS : BLOOM_STORY_TESTS;
      const cTests = activeSuite === 'petal' ? PETAL_CHAT_TESTS : BLOOM_CHAT_TESTS;
      runBenchmarkTests([...sTests, ...cTests], activeSuite);
    });
  }
}

function renderBenchModelViewer() {
  const viewer = $('benchModelViewer');
  if (!viewer) return;
  const all = loadBenchResults();
  const keys = Object.keys(all);
  const current = getCurrentModelKey();

  if (keys.length === 0) { viewer.innerHTML = ''; return; }

  // Ensure current model is in the list even if not yet benchmarked
  if (!keys.includes(current)) keys.unshift(current);

  let html = '<div class="bench-viewer"><label>Viewing results for:</label><select id="benchViewSelect">';
  keys.forEach(key => {
    const label = key.split(':').slice(1).join(':') || key;
    const isCurrent = key === current;
    const sel = key === getBenchViewKey() ? ' selected' : '';
    html += `<option value="${escapeHtml(key)}"${sel}>${escapeHtml(label)}${isCurrent ? ' (current)' : ''}</option>`;
  });
  html += '</select></div>';
  viewer.innerHTML = html;

  $('benchViewSelect').addEventListener('change', (e) => {
    benchViewModelKey = e.target.value === getCurrentModelKey() ? null : e.target.value;
    renderBenchRunTab();
  });
}

function buildPromptPreview(test) {
  const chat = test.buildChat();
  let lines = [];
  // Setup context
  if (chat.mode === 'story') {
    lines.push(`<div class="bench-prompt-ctx">Mode: Story | Day ${chat.storyDay || '?'} | Phase: ${chat.storyPhase || '?'}</div>`);
    if (chat.storyAffinity) {
      const aff = Object.entries(chat.storyAffinity).map(([k, v]) => `${k[0].toUpperCase() + k.slice(1)}=${v}`).join(', ');
      lines.push(`<div class="bench-prompt-ctx">Affinity: ${escapeHtml(aff)}</div>`);
    }
    if (chat.mcName) lines.push(`<div class="bench-prompt-ctx">MC Name: ${escapeHtml(chat.mcName)}</div>`);
  } else {
    const relNames = ['Stranger', 'Acquaintance', 'Friend', 'Close Friend', 'Best Friend', 'In Love'];
    lines.push(`<div class="bench-prompt-ctx">Mode: Chat | Relationship: ${relNames[chat.relationship] || chat.relationship} | Mood: ${chat.mood || '?'} (${chat.moodIntensity || '?'}) | Drift: ${chat.drift || '?'}</div>`);
  }
  lines.push('<div class="bench-prompt-sep"></div>');
  // Messages
  if (!chat.messages || chat.messages.length === 0) {
    lines.push('<div class="bench-prompt-msg bench-prompt-system"><em>(No prior messages — model generates the opening)</em></div>');
  } else {
    chat.messages.forEach(msg => {
      const who = msg.role === 'user' ? 'You' : 'Monika (AI)';
      const cls = msg.role === 'user' ? 'bench-prompt-user' : 'bench-prompt-ai';
      lines.push(`<div class="bench-prompt-msg ${cls}"><strong>${who}:</strong> ${escapeHtml(msg.content)}</div>`);
    });
  }
  // What's being scored
  lines.push('<div class="bench-prompt-sep"></div>');
  lines.push(`<div class="bench-prompt-ctx">Points: ${test.points} | Auto: ${Math.round((test.autoWeight || 0.5) * 100)}% | User: ${Math.round((1 - (test.autoWeight || 0.5)) * 100)}% | Max tokens: ${test.maxTokens}</div>`);
  return lines.join('');
}

function renderTestList(containerId, tests, category) {
  const container = $(containerId);
  if (!container) return;
  container.innerHTML = '';

  const all = loadBenchResults();
  const modelKey = getBenchViewKey();
  const catData = all[modelKey]?.[category];

  tests.forEach(test => {
    const item = document.createElement('div');
    item.className = 'bench-test-item';
    item.id = 'bench_' + test.id;

    const header = document.createElement('div');
    header.className = 'bench-test-header';

    const left = document.createElement('div');
    left.className = 'bench-test-left';
    const icon = document.createElement('span');
    icon.className = 'bench-test-icon';
    icon.textContent = test.icon;
    const info = document.createElement('div');
    info.className = 'bench-test-info';
    const nameRow = document.createElement('div');
    nameRow.className = 'bench-test-name-row';
    const name = document.createElement('span');
    name.className = 'bench-test-name';
    name.textContent = test.name;
    const infoBtn = document.createElement('button');
    infoBtn.className = 'bench-prompt-btn';
    infoBtn.textContent = '\u{2139}';
    infoBtn.title = 'View exact prompt';
    infoBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      let panel = item.querySelector('.bench-prompt-panel');
      if (panel) {
        panel.remove();
        return;
      }
      // Close any other open prompt panels
      document.querySelectorAll('.bench-prompt-panel').forEach(p => p.remove());
      panel = document.createElement('div');
      panel.className = 'bench-prompt-panel';
      panel.innerHTML = buildPromptPreview(test);
      // Insert after header
      header.after(panel);
    });
    nameRow.appendChild(name);
    nameRow.appendChild(infoBtn);
    const desc = document.createElement('div');
    desc.className = 'bench-test-desc';
    desc.textContent = test.description;
    info.appendChild(nameRow);
    info.appendChild(desc);
    left.appendChild(icon);
    left.appendChild(info);

    const status = document.createElement('div');
    // Check for existing results
    const existingResult = catData?.tests?.find(r => r.testId === test.id);
    const storedVersion = catData?.suiteVersion;
    const currentVersion = SUITE_VERSIONS[activeSuite];
    const versionMismatch = storedVersion && storedVersion !== currentVersion;
    if (existingResult && !existingResult.error) {
      if (versionMismatch) {
        status.className = 'bench-test-status outdated';
        status.textContent = `v${storedVersion}`;
        status.title = `Result is from suite v${storedVersion} (current: v${currentVersion}) — re-run to update`;
      } else {
        status.className = 'bench-test-status done';
        if (test.points) {
          const userRatings = catData?.userRatings?.[test.id] || {};
          const { earned } = computeTestScore(test, existingResult.scores.autoTotal, userRatings);
          status.textContent = `${earned.toFixed(1)}/${test.points}`;
        } else {
          status.textContent = `${existingResult.scores.overall}/100`;
        }
      }
    } else if (existingResult?.error) {
      status.className = 'bench-test-status failed';
      status.textContent = 'Failed';
    } else {
      status.className = 'bench-test-status pending';
      status.textContent = 'Pending';
    }

    header.appendChild(left);
    header.appendChild(status);
    item.appendChild(header);

    // If existing result, render detail
    if (existingResult && !existingResult.error) {
      renderTestDetail(item, test, existingResult.rawText, existingResult.scores, existingResult.totalTimeSec, existingResult.tokensPerSec);
    }

    container.appendChild(item);
  });
}

// --- Results Tab ---
async function renderBenchResultsTab() {
  const container = $('benchResultsContent');
  if (!container) return;

  const all = loadBenchResults();
  const modelKeys = Object.keys(all);

  if (modelKeys.length === 0) {
    container.innerHTML = '<div class="bench-empty">No benchmark results yet. Run some tests first!</div>';
    return;
  }

  const installedOllama = await getInstalledOllamaModels();

  let html = '<div class="bench-results-controls">';
  html += '<div class="bench-model-select">';
  html += '<label>Models to compare:</label>';
  html += '<div class="bench-model-chips">';
  modelKeys.forEach(key => {
    const installed = isModelInstalled(key, installedOllama);
    const checked = installed ? ' checked' : '';
    const chipClass = installed ? 'bench-chip-label' : 'bench-chip-label bench-chip-removed';
    const rawLabel = key.split(':').slice(1).join(':') || key;
    const suffix = installed ? '' : ' (removed)';
    html += `<label class="${chipClass}"><input type="checkbox" class="benchModelCheck" value="${escapeHtml(key)}"${checked}> <span class="bench-chip-text">${escapeHtml(rawLabel)}</span>${suffix}</label>`;
  });
  html += '</div></div>';
  html += '<div class="bench-results-actions">';
  html += '<button class="btn btn-secondary bench-export-btn" id="benchExportBtn">Export JSON</button>';
  html += '<button class="btn btn-danger bench-clear-btn" id="benchClearBtn">Clear All</button>';
  html += '</div></div>';

  html += '<div id="benchComparisonTable"></div>';
  container.innerHTML = html;

  // Wire checkbox changes
  container.querySelectorAll('.benchModelCheck').forEach(cb => {
    cb.addEventListener('change', () => renderComparisonTable(all, installedOllama));
  });

  // Wire buttons
  const exportBtn = $('benchExportBtn');
  if (exportBtn) exportBtn.addEventListener('click', () => exportBenchResults());
  const clearBtn = $('benchClearBtn');
  if (clearBtn) clearBtn.addEventListener('click', () => {
    if (confirm('Clear all benchmark results?')) {
      localStorage.removeItem(BENCH_STORAGE);
      renderBenchResultsTab();
      renderBenchRunTab();
    }
  });

  renderComparisonTable(all, installedOllama);
}

function renderComparisonTable(all, installedOllama) {
  const tableContainer = $('benchComparisonTable');
  if (!tableContainer) return;

  const checked = Array.from(document.querySelectorAll('.benchModelCheck:checked')).map(cb => cb.value);
  if (checked.length === 0) {
    tableContainer.innerHTML = '<div class="bench-empty">Select at least one model to compare.</div>';
    return;
  }

  // Build set of removed (uninstalled) models to exclude from rankings
  const removedKeys = new Set();
  if (installedOllama) {
    Object.keys(all).forEach(key => {
      if (!isModelInstalled(key, installedOllama)) removedKeys.add(key);
    });
  }

  // Compute rankings excluding removed models
  const rankings = computeRankings(all, removedKeys);
  const rankTotal = rankings.length;

  function truncLabel(key) {
    const raw = key.split(':').slice(1).join(':') || key;
    if (raw.length > 20) return `<span title="${escapeHtml(raw)}">${escapeHtml(raw.slice(0, 18))}&hellip;</span>`;
    return escapeHtml(raw);
  }

  function scoreColorClass(val, max) {
    const pct = max ? (val / max) * 100 : val;
    if (pct >= 70) return 'bench-score-green';
    if (pct >= 45) return 'bench-score-amber';
    return 'bench-score-red';
  }

  let html = '<div class="bench-table-wrapper"><table class="bench-table"><thead><tr><th>Metric</th>';
  checked.forEach(key => {
    html += `<th>${truncLabel(key)}</th>`;
  });
  html += '</tr></thead><tbody>';

  // Overall score row (highlighted)
  html += '<tr class="bench-overall-row"><td><strong>Overall Score</strong></td>';
  checked.forEach(modelKey => {
    const r = rankings.find(x => x.key === modelKey);
    if (r) {
      html += `<td class="bench-overall-cell ${scoreColorClass(r.overall, 100)}"><strong>${r.overall}</strong>/100</td>`;
    } else {
      html += '<td class="bench-overall-cell">-</td>';
    }
  });
  html += '</tr>';

  // Story / Chat score rows
  html += '<tr><td>Story Score</td>';
  checked.forEach(modelKey => {
    const r = rankings.find(x => x.key === modelKey);
    html += `<td class="${r ? scoreColorClass(r.storyScore, r.storyMax) : ''}">${r ? r.storyScore + '/' + r.storyMax : '-'}</td>`;
  });
  html += '</tr>';
  html += '<tr><td>Chat Score</td>';
  checked.forEach(modelKey => {
    const r = rankings.find(x => x.key === modelKey);
    html += `<td class="${r ? scoreColorClass(r.chatScore, r.chatMax) : ''}">${r ? r.chatScore + '/' + r.chatMax : '-'}</td>`;
  });
  html += '</tr>';

  // Rank rows
  html += '<tr class="bench-rank-row"><td>Story Rank</td>';
  checked.forEach(modelKey => {
    const r = rankings.find(x => x.key === modelKey);
    html += `<td>#${r ? r.storyRank : '-'} of ${rankTotal}</td>`;
  });
  html += '</tr>';
  html += '<tr class="bench-rank-row"><td>Chat Rank</td>';
  checked.forEach(modelKey => {
    const r = rankings.find(x => x.key === modelKey);
    html += `<td>#${r ? r.chatRank : '-'} of ${rankTotal}</td>`;
  });
  html += '</tr>';
  html += '<tr class="bench-rank-row"><td>Speed Rank</td>';
  checked.forEach(modelKey => {
    const r = rankings.find(x => x.key === modelKey);
    html += `<td>#${r ? r.speedRank : '-'} of ${rankTotal}</td>`;
  });
  html += '</tr>';

  // Speed info
  html += '<tr class="bench-section-row"><td colspan="' + (checked.length + 1) + '">Speed (info only)</td></tr>';
  const speedMetrics = [
    { label: 'Story Time (s)', get: d => d?.story?.speedInfo?.totalTime || d?.story?.autoScores?.totalTime || '-' },
    { label: 'Story Tok/s', get: d => d?.story?.speedInfo?.avgTokensPerSec || d?.story?.autoScores?.avgTokensPerSec || '-' },
    { label: 'Chat Time (s)', get: d => d?.chat?.speedInfo?.totalTime || d?.chat?.autoScores?.totalTime || '-' },
    { label: 'Chat Tok/s', get: d => d?.chat?.speedInfo?.avgTokensPerSec || d?.chat?.autoScores?.avgTokensPerSec || '-' }
  ];
  speedMetrics.forEach(m => {
    html += `<tr><td>${m.label}</td>`;
    checked.forEach(modelKey => {
      html += `<td>${m.get(all[modelKey])}</td>`;
    });
    html += '</tr>';
  });

  // User rating rows (8 criteria)
  html += '<tr class="bench-section-row"><td colspan="' + (checked.length + 1) + '">User Ratings</td></tr>';
  BENCH_USER_CRITERIA.forEach(cat => {
    html += `<tr><td>${cat.label}</td>`;
    checked.forEach(modelKey => {
      const avg = getAvgUserRating(all[modelKey], cat.key);
      html += `<td>${avg ? renderStarsHtml(avg) : '<span class="bench-no-rating">Not rated</span>'}</td>`;
    });
    html += '</tr>';
  });
  html += '<tr class="bench-rank-row"><td>Avg User Rating</td>';
  checked.forEach(modelKey => {
    const allCriteriaAvgs = BENCH_USER_CRITERIA.map(c => getAvgUserRating(all[modelKey], c.key)).filter(v => v > 0);
    if (allCriteriaAvgs.length > 0) {
      const overall = (allCriteriaAvgs.reduce((s, v) => s + v, 0) / allCriteriaAvgs.length).toFixed(1);
      html += `<td>${overall}/5</td>`;
    } else {
      html += '<td><span class="bench-no-rating">-</span></td>';
    }
  });
  html += '</tr>';

  // Individual test scores
  html += '<tr class="bench-section-row"><td colspan="' + (checked.length + 1) + '">Individual Tests</td></tr>';
  const storyTestsActive = activeSuite === 'petal' ? PETAL_STORY_TESTS : BLOOM_STORY_TESTS;
  const chatTestsActive  = activeSuite === 'petal' ? PETAL_CHAT_TESTS  : BLOOM_CHAT_TESTS;
  const allTests = [...storyTestsActive, ...chatTestsActive];
  allTests.forEach(test => {
    const cat = storyTestsActive.includes(test) ? 'story' : 'chat';
    html += `<tr class="bench-test-row"><td>${test.icon} ${test.name}${test.points ? ' <small>/' + test.points + '</small>' : ''}</td>`;
    checked.forEach(modelKey => {
      const catData = all[modelKey]?.[cat];
      const result = catData?.tests?.find(r => r.testId === test.id);
      if (result && !result.error) {
        if (test.points) {
          const userRatings = catData?.userRatings?.[test.id] || {};
          const { earned } = computeTestScore(test, result.scores.autoTotal, userRatings);
          html += `<td class="bench-score-cell ${scoreColorClass(earned, test.points)}">${earned.toFixed(1)}/${test.points}</td>`;
        } else {
          const sc = result.scores.overall;
          html += `<td class="bench-score-cell ${scoreColorClass(sc, 100)}">${sc}/100</td>`;
        }
      } else if (result?.error) {
        html += '<td class="bench-score-cell failed">Failed</td>';
      } else {
        html += '<td>-</td>';
      }
    });
    html += '</tr>';
  });

  html += '</tbody></table></div>';
  tableContainer.innerHTML = html;
}

function getAvgUserRating(modelData, ratingKey) {
  if (!modelData) return 0;
  const vals = [];
  ['story', 'chat'].forEach(cat => {
    const ratings = modelData[cat]?.userRatings || {};
    Object.values(ratings).forEach(r => {
      if (r[ratingKey]) vals.push(r[ratingKey]);
    });
  });
  return vals.length ? (vals.reduce((s, v) => s + v, 0) / vals.length) : 0;
}

function renderStarsHtml(avg) {
  let html = '';
  for (let i = 1; i <= 5; i++) {
    html += `<span class="bench-star-display${i <= Math.round(avg) ? ' active' : ''}">\u2605</span>`;
  }
  html += ` <span class="bench-star-num">${avg.toFixed(1)}</span>`;
  return html;
}

function getNestedVal(obj, path) {
  return path.split('.').reduce((o, k) => o?.[k], obj);
}

function exportBenchResults() {
  const all = loadBenchResults();
  const blob = new Blob([JSON.stringify(all, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `moni-talk-benchmarks-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

// --- Suite max score helpers ---
function getSuiteMaxScores(suite) {
  const storyTests = suite === 'petal' ? PETAL_STORY_TESTS : BLOOM_STORY_TESTS;
  const chatTests  = suite === 'petal' ? PETAL_CHAT_TESTS  : BLOOM_CHAT_TESTS;
  const storyMax = storyTests.reduce((s, t) => s + (t.points || 0), 0);
  const chatMax  = chatTests.reduce((s, t) => s + (t.points || 0), 0);
  return { storyMax, chatMax };
}

// --- Rankings & Settings Hint ---
function computeRankings(all, excludeKeys) {
  const keysToRank = excludeKeys ? Object.keys(all).filter(k => !excludeKeys.has(k)) : Object.keys(all);
  const models = keysToRank.map(key => {
    const d = all[key];

    // Compute story score using active suite tests (skip outdated suite versions)
    let storyScore = 0;
    const storyVersionMatch = !d.story?.suiteVersion || d.story.suiteVersion === SUITE_VERSIONS[activeSuite];
    const storyResults = storyVersionMatch ? (d.story?.tests?.filter(t => !t.error) || []) : [];
    const storyRatings = d.story?.userRatings || {};
    const activeStoryTests = activeSuite === 'petal' ? PETAL_STORY_TESTS : BLOOM_STORY_TESTS;
    activeStoryTests.forEach(test => {
      if (!test.points) return;
      const result = storyResults.find(r => r.testId === test.id);
      if (!result) return;
      const { earned } = computeTestScore(test, result.scores.autoTotal, storyRatings[test.id] || {});
      storyScore += earned;
    });

    // Compute chat score using active suite tests (skip outdated suite versions)
    let chatScore = 0;
    const chatVersionMatch = !d.chat?.suiteVersion || d.chat.suiteVersion === SUITE_VERSIONS[activeSuite];
    const chatResults = chatVersionMatch ? (d.chat?.tests?.filter(t => !t.error) || []) : [];
    const chatRatings = d.chat?.userRatings || {};
    const activeChatTests = activeSuite === 'petal' ? PETAL_CHAT_TESTS : BLOOM_CHAT_TESTS;
    activeChatTests.forEach(test => {
      if (!test.points) return;
      const result = chatResults.find(r => r.testId === test.id);
      if (!result) return;
      const { earned } = computeTestScore(test, result.scores.autoTotal, chatRatings[test.id] || {});
      chatScore += earned;
    });

    // Speed info (display only, not scored)
    const speedSrc = cat => d[cat]?.speedInfo?.avgTokensPerSec || d[cat]?.autoScores?.avgTokensPerSec;
    const storyTPS = speedSrc('story') ? parseFloat(speedSrc('story')) : 0;
    const chatTPS = speedSrc('chat') ? parseFloat(speedSrc('chat')) : 0;
    const avgSpeed = (storyTPS + chatTPS) / 2;

    // Has user ratings?
    let hasUserRatings = false;
    ['story', 'chat'].forEach(cat => {
      const ratings = d[cat]?.userRatings || {};
      Object.values(ratings).forEach(r => {
        if (Object.keys(r).length > 0) hasUserRatings = true;
      });
    });

    // Overall = normalized percentage so Petal (max 40+40) and Bloom (max 100+100) are comparable
    const suiteMax = getSuiteMaxScores(activeSuite);
    const storyPct = suiteMax.storyMax > 0 ? storyScore / suiteMax.storyMax : 0;
    const chatPct  = suiteMax.chatMax  > 0 ? chatScore  / suiteMax.chatMax  : 0;
    const overall  = Math.round((storyPct + chatPct) * 50);

    return { key, storyScore: Math.round(storyScore), chatScore: Math.round(chatScore), overall, storyMax: suiteMax.storyMax, chatMax: suiteMax.chatMax, avgSpeed, hasUserRatings };
  });

  // Sort for per-category rankings
  const byStory = [...models].sort((a, b) => b.storyScore - a.storyScore);
  const byChat = [...models].sort((a, b) => b.chatScore - a.chatScore);
  const bySpeed = [...models].sort((a, b) => b.avgSpeed - a.avgSpeed);

  return models.map(m => {
    const storyRank = byStory.findIndex(x => x.key === m.key) + 1;
    const chatRank = byChat.findIndex(x => x.key === m.key) + 1;
    const speedRank = bySpeed.findIndex(x => x.key === m.key) + 1;

    // Strengths / weaknesses
    const strengths = [];
    const weaknesses = [];
    const total = models.length;
    if (storyRank === 1 && m.storyScore > 0) strengths.push('Best story mode');
    if (chatRank === 1 && m.chatScore > 0) strengths.push('Best chat mode');
    if (speedRank === 1) strengths.push('Fastest');
    if (m.hasUserRatings && m.overall >= 70) strengths.push('Top rated');
    if (storyRank === total && total > 1 && m.storyScore < 50) weaknesses.push('Weakest story');
    if (chatRank === total && total > 1 && m.chatScore < 50) weaknesses.push('Weakest chat');
    if (speedRank === total && total > 1) weaknesses.push('Slowest');

    return { key: m.key, storyRank, chatRank, speedRank, overall: m.overall, strengths, weaknesses, storyScore: m.storyScore, chatScore: m.chatScore, storyMax: m.storyMax, chatMax: m.chatMax, avgSpeed: m.avgSpeed, hasUserRatings: m.hasUserRatings };
  }).sort((a, b) => b.overall - a.overall);
}

function getSettingsModelKey() {
  // Read from form dropdowns (may not be saved yet)
  const p = providerSelect.value;
  if (p === 'llamacpp') return `llamacpp:${llamacppModelSelect.value || llamacppModel || 'unknown'}`;
  if (p === 'ollama') return `ollama:${ollamaModelSelect.value}`;
  return `puter:${puterModelSelect.value}`;
}

async function renderSettingsBenchHint() {
  const hint = $('benchSettingsHint');
  if (!hint) return;

  const all = loadBenchResults();
  const modelKey = getSettingsModelKey();
  const data = all[modelKey];

  if (!data || Object.keys(all).length === 0) {
    hint.innerHTML = '';
    return;
  }

  // Exclude uninstalled models from rankings
  const installedOllama = await getInstalledOllamaModels();
  const excludeKeys = new Set();
  Object.keys(all).forEach(key => {
    if (!isModelInstalled(key, installedOllama)) excludeKeys.add(key);
  });

  const rankings = computeRankings(all, excludeKeys);
  const me = rankings.find(r => r.key === modelKey);
  if (!me) { hint.innerHTML = ''; return; }

  const total = rankings.length;
  const overallClass = me.overall >= 70 ? 'good' : me.overall >= 45 ? 'ok' : 'poor';

  let html = `<div class="bench-hint-card">`;
  html += `<div class="bench-hint-score"><span class="bench-hint-badge ${overallClass}">${me.overall}/100</span> Overall</div>`;
  html += `<div class="bench-hint-ranks">Story ${me.storyScore}/100 | Chat ${me.chatScore}/100 | Speed #${me.speedRank}/${total}</div>`;
  if (me.strengths.length) html += `<div class="bench-hint-good">${me.strengths.join(' \u00B7 ')}</div>`;
  if (me.weaknesses.length) html += `<div class="bench-hint-bad">${me.weaknesses.join(' \u00B7 ')}</div>`;
  html += '</div>';
  hint.innerHTML = html;
}

// --- V-Beta Rankings (old scoring formula, preserved for comparison) ---
function computeBetaRankings(all) {
  const models = Object.keys(all).map(key => {
    const d = all[key];
    const storyTests = d.story?.tests?.filter(t => !t.error) || [];
    const chatTests = d.chat?.tests?.filter(t => !t.error) || [];
    const storyScore = storyTests.length ? Math.round(storyTests.reduce((s, t) => s + (t.scores.overall || 0), 0) / storyTests.length) : 0;
    const chatScore = chatTests.length ? Math.round(chatTests.reduce((s, t) => s + (t.scores.overall || 0), 0) / chatTests.length) : 0;

    const storyTPS = d.story?.autoScores?.avgTokensPerSec ? parseFloat(d.story.autoScores.avgTokensPerSec) : 0;
    const chatTPS = d.chat?.autoScores?.avgTokensPerSec ? parseFloat(d.chat.autoScores.avgTokensPerSec) : 0;
    const avgSpeed = (storyTPS + chatTPS) / 2;
    const tagComp = ((d.story?.autoScores?.avgTagCompliance || 0) + (d.chat?.autoScores?.avgTagCompliance || 0)) / 2;

    const userVals = [];
    ['story', 'chat'].forEach(cat => {
      const ratings = d[cat]?.userRatings || {};
      Object.values(ratings).forEach(r => {
        ['voice', 'creativity', 'coherence', 'tone'].forEach(k => { if (r[k]) userVals.push(r[k]); });
      });
    });
    const userScore = userVals.length ? (userVals.reduce((s, v) => s + v, 0) / userVals.length) * 20 : 0;
    const hasUserRatings = userVals.length > 0;

    return { key, storyScore, chatScore, avgSpeed, tagComp, userScore, hasUserRatings };
  });

  const maxSpeed = Math.max(...models.map(m => m.avgSpeed), 1);
  const byStory = [...models].sort((a, b) => b.storyScore - a.storyScore);
  const byChat = [...models].sort((a, b) => b.chatScore - a.chatScore);
  const bySpeed = [...models].sort((a, b) => b.avgSpeed - a.avgSpeed);

  return models.map(m => {
    const storyRank = byStory.findIndex(x => x.key === m.key) + 1;
    const chatRank = byChat.findIndex(x => x.key === m.key) + 1;
    const speedRank = bySpeed.findIndex(x => x.key === m.key) + 1;
    const speedNorm = Math.round((m.avgSpeed / maxSpeed) * 100);
    const qualityScore = (m.storyScore + m.chatScore) / 2;
    let overall;
    if (m.hasUserRatings) {
      overall = Math.round(qualityScore * 0.45 + m.tagComp * 0.15 + speedNorm * 0.15 + m.userScore * 0.25);
    } else {
      overall = Math.round(qualityScore * 0.55 + m.tagComp * 0.2 + speedNorm * 0.25);
    }
    return { key: m.key, storyRank, chatRank, speedRank, overall, storyScore: m.storyScore, chatScore: m.chatScore, avgSpeed: m.avgSpeed };
  }).sort((a, b) => b.overall - a.overall);
}

// --- Compare Tab (V-Alpha vs V-Current) ---
async function renderBenchCompareTab() {
  const container = $('benchCompareContent');
  if (!container) return;

  const beta = loadBetaResults();
  const current = loadBenchResults();
  const installedOllama = await getInstalledOllamaModels();

  // Only show models that appear in beta or current AND are installed
  const allKeys = new Set([...Object.keys(beta), ...Object.keys(current)]);
  allKeys.forEach(key => {
    if (!isModelInstalled(key, installedOllama)) allKeys.delete(key);
  });

  if (allKeys.size === 0) {
    container.innerHTML = '<div class="bench-empty">No benchmark results yet, or all previously benchmarked models have been removed. Run some tests first!</div>';
    return;
  }

  const betaRankings    = Object.keys(beta).length > 0    ? computeBetaRankings(beta) : [];
  const currentRankings = Object.keys(current).length > 0 ? computeRankings(current)  : [];
  const bTotal = betaRankings.length;
  const cTotal = currentRankings.length;

  const activeSuiteTests = activeSuite === 'petal' ? PETAL_STORY_TESTS.length + PETAL_CHAT_TESTS.length : BLOOM_STORY_TESTS.length + BLOOM_CHAT_TESTS.length;
  const activeStoryCount = activeSuite === 'petal' ? PETAL_STORY_TESTS.length : BLOOM_STORY_TESTS.length;
  const activeChatCount  = activeSuite === 'petal' ? PETAL_CHAT_TESTS.length  : BLOOM_CHAT_TESTS.length;

  let html = '<div class="bench-compare-note">V-Beta used the previous point-weighted system. V-Current uses the Petal/Bloom suite.</div>';

  allKeys.forEach(key => {
    const label = key.split(':').slice(1).join(':') || key;
    const br = betaRankings.find(r => r.key === key);
    const cr = currentRankings.find(r => r.key === key);

    html += '<div class="bench-compare-card">';
    html += `<div class="bench-compare-model">${escapeHtml(label)}</div>`;
    html += '<table class="bench-compare-table"><thead><tr><th>Metric</th><th>V-Beta</th><th>V-Current</th><th></th></tr></thead><tbody>';

    html += compareRow('Overall', br?.overall, cr?.overall, '/100');
    html += compareRow('Story', br?.storyScore, cr?.storyScore, '/100');
    html += compareRow('Chat', br?.chatScore, cr?.chatScore, '/100');
    html += compareRow('Speed', br?.avgSpeed ? br.avgSpeed.toFixed(1) : null, cr?.avgSpeed ? cr.avgSpeed.toFixed(1) : null, ' tok/s');

    if (bTotal > 1 || cTotal > 1) {
      html += `<tr class="bench-compare-rank"><td>Story Rank</td><td>${br ? '#' + br.storyRank + '/' + bTotal : '-'}</td><td>${cr ? '#' + cr.storyRank + '/' + cTotal : '-'}</td><td></td></tr>`;
      html += `<tr class="bench-compare-rank"><td>Chat Rank</td><td>${br ? '#' + br.chatRank + '/' + bTotal : '-'}</td><td>${cr ? '#' + cr.chatRank + '/' + cTotal : '-'}</td><td></td></tr>`;
      html += `<tr class="bench-compare-rank"><td>Speed Rank</td><td>${br ? '#' + br.speedRank + '/' + bTotal : '-'}</td><td>${cr ? '#' + cr.speedRank + '/' + cTotal : '-'}</td><td></td></tr>`;
    }

    // Per-test breakdown
    const betaCats = beta[key] || {};
    const currentCats = current[key] || {};
    const betaStory   = betaCats.story?.tests?.filter(t => !t.error) || [];
    const betaChat    = betaCats.chat?.tests?.filter(t => !t.error) || [];
    const currentStory = currentCats.story?.tests?.filter(t => !t.error) || [];
    const currentChat  = currentCats.chat?.tests?.filter(t => !t.error) || [];
    if (betaStory.length || currentStory.length || betaChat.length || currentChat.length) {
      html += `<tr class="bench-compare-section"><td colspan="4">Tests Completed</td></tr>`;
      html += `<tr><td>Story tests</td><td>${betaStory.length || '-'}</td><td>${currentStory.length}/${activeStoryCount}</td><td></td></tr>`;
      html += `<tr><td>Chat tests</td><td>${betaChat.length || '-'}</td><td>${currentChat.length}/${activeChatCount}</td><td></td></tr>`;
    }

    html += '</tbody></table></div>';
  });

  container.innerHTML = html;
}

function compareRow(label, alphaVal, currentVal, suffix) {
  const aStr = alphaVal != null ? alphaVal + suffix : '-';
  const cStr = currentVal != null ? currentVal + suffix : '-';
  let changeHtml = '';
  if (alphaVal != null && currentVal != null) {
    const a = parseFloat(alphaVal);
    const c = parseFloat(currentVal);
    const delta = c - a;
    const dec = suffix.includes('tok') ? 1 : 0;
    if (Math.abs(delta) < 0.5) {
      changeHtml = '<span class="bench-delta bench-delta-neutral">=</span>';
    } else if (delta > 0) {
      changeHtml = `<span class="bench-delta bench-delta-up">\u25B2 ${Math.abs(delta).toFixed(dec)}</span>`;
    } else {
      changeHtml = `<span class="bench-delta bench-delta-down">\u25BC ${Math.abs(delta).toFixed(dec)}</span>`;
    }
  }
  return `<tr><td>${label}</td><td>${aStr}</td><td>${cStr}</td><td>${changeHtml}</td></tr>`;
}

// --- Changelog Modal ---
// ====== MODELS MODAL ======
const STATUS_LABELS = {
  released:  { text: 'Released',       cls: 'model-status-released'  },
  upcoming:  { text: 'In Development', cls: 'model-status-upcoming'  },
  skipped:   { text: 'Skipped',        cls: 'model-status-skipped'   },
};

function openModelsModal() {
  const body = $('modelsBody');
  if (!body) return;
  const order = { released: 0, upcoming: 1, skipped: 2 };
  const entries = Object.entries(KNOWN_MODELS)
    .sort((a, b) => (order[a[1].status] ?? 9) - (order[b[1].status] ?? 9));

  body.innerHTML = entries.map(([gguf, m]) => {
    const s = STATUS_LABELS[m.status] || { text: m.status || '—', cls: '' };
    const meta = [];
    if (m.base) meta.push(`<span>${escapeHtml(m.base)}</span>`);
    if (m.loraParams) meta.push(`<span>${escapeHtml(m.loraParams)}</span>`);
    if (m.trainingPairs) meta.push(`<span>${m.trainingPairs} training pairs</span>`);
    if (m.released) meta.push(`<span>Released ${escapeHtml(m.released)}</span>`);
    return `
      <div class="model-catalog-card ${s.cls}">
        <div class="model-catalog-top">
          <span class="model-catalog-name">${escapeHtml(m.name)}</span>
          <span class="model-catalog-badge">${escapeHtml(m.badge)}</span>
          <span class="model-catalog-status ${s.cls}">${s.text}</span>
        </div>
        <div class="model-catalog-desc">${escapeHtml(m.desc)}</div>
        ${meta.length ? `<div class="model-card-meta">${meta.join('')}</div>` : ''}
        <div class="model-catalog-gguf">${escapeHtml(gguf)}</div>
      </div>`;
  }).join('');
  $('modelsModal').classList.add('open');
}

function closeModelsModal() {
  $('modelsModal').classList.remove('open');
}

function openChangelogModal() {
  const body = $('changelogBody');
  if (!body) return;
  body.innerHTML = CHANGELOG_ENTRIES.map(entry => `
    <div class="changelog-entry">
      <div class="changelog-entry-header">
        <span class="changelog-entry-label">${escapeHtml(entry.label)}</span>
        <span class="changelog-entry-date">${escapeHtml(entry.date)}</span>
      </div>
      <ul class="changelog-entry-items">
        ${entry.items.map(i => `<li>${escapeHtml(i)}</li>`).join('')}
      </ul>
    </div>
  `).join('');
  $('changelogModal').classList.add('open');
}

function closeChangelogModal() {
  $('changelogModal').classList.remove('open');
}
