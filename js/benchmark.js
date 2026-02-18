// ====== BENCHMARK SUITE ======
const BENCH_STORAGE = 'moni_talk_benchmarks';
const BENCH_STORAGE_ALPHA = 'moni_talk_benchmarks_alpha';
let benchViewModelKey = null; // null = use current model

// --- Alpha Migration (one-time) ---
function migrateAlphaBenchmarks() {
  if (localStorage.getItem(BENCH_STORAGE_ALPHA)) return; // already migrated
  const raw = localStorage.getItem(BENCH_STORAGE);
  if (!raw) return;
  try {
    const data = JSON.parse(raw);
    if (Object.keys(data).length === 0) return;
    // Move old data to alpha archive, clear main storage for V-Current
    localStorage.setItem(BENCH_STORAGE_ALPHA, raw);
    localStorage.removeItem(BENCH_STORAGE);
  } catch { /* corrupt data, ignore */ }
}

function loadAlphaResults() {
  try { return JSON.parse(localStorage.getItem(BENCH_STORAGE_ALPHA) || '{}'); } catch { return {}; }
}

// --- Helpers ---
function getCurrentModelKey() {
  if (provider === 'ollama') return `ollama:${ollamaModel}`;
  if (provider === 'gemini') return `gemini:${geminiModel}`;
  if (provider === 'openrouter') return `openrouter:${selectedModel}`;
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
  { key: 'immersion',    label: 'Immersion' },
  { key: 'dialogue',     label: 'Dialogue' },
  { key: 'pacing',       label: 'Pacing' },
  { key: 'creativity',   label: 'Creativity' },
  { key: 'faithfulness', label: 'Faithfulness' }
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
const STORY_TESTS = [
  {
    id: 'story_opening',
    name: 'Opening Scene',
    description: 'Generate the Day 1 story opening — first impressions, atmosphere, character introductions.',
    icon: '\u{1F3AC}',
    points: 10,
    autoWeight: 0.4,
    buildChat() {
      return {
        mode: 'story', storyDay: 1, mcName: 'Alex',
        storyAffinity: { sayori: 15, natsuki: 1, yuri: 1, monika: 10 },
        storyPhase: 'morning_walk', messages: []
      };
    },
    maxTokens: 800,
    score(text) {
      return storyAutoScore(text, { requireCharacter: 'sayori|monika', minLength: 200 });
    }
  },
  {
    id: 'story_sayori',
    name: "Sayori's Moment",
    description: 'MC walks home with Sayori. Capture her cheerful energy and the subtle hints beneath.',
    icon: '\u{1F31E}',
    points: 12,
    autoWeight: 0.25,
    buildChat() {
      return {
        mode: 'story', storyDay: 3, mcName: 'Alex',
        storyAffinity: { sayori: 22, natsuki: 8, yuri: 5, monika: 12 },
        storyPhase: 'walk_home',
        messages: [
          { role: 'assistant', content: 'The final bell rings and the club meeting wraps up. Sayori bounces over to your desk, her bow slightly askew as always.\n\n"Alex! Walk home with me today? Pleeease? I have something really important to tell you!"\n\nShe grabs your sleeve before you can even answer.\n\n[AFFINITY: Sayori=22, Natsuki=8, Yuri=5, Monika=12]' },
          { role: 'user', content: 'I laugh and let her pull me along. "Alright, alright. What\'s so important?"' }
        ]
      };
    },
    maxTokens: 800,
    score(text) {
      return storyAutoScore(text, {
        requireCharacter: 'sayori',
        affinityChecks: {
          sayori: { base: 22, delta: [1, 5] },
          natsuki: { base: 8, delta: [-2, 2] },
          yuri: { base: 5, delta: [-2, 2] },
          monika: { base: 12, delta: [-2, 2] }
        }
      });
    }
  },
  {
    id: 'story_natsuki',
    name: "Natsuki's Moment",
    description: 'MC discovers Natsuki reading alone. Capture her tsundere defensiveness and hidden warmth.',
    icon: '\u{1F4D6}',
    points: 12,
    autoWeight: 0.25,
    buildChat() {
      return {
        mode: 'story', storyDay: 4, mcName: 'Alex',
        storyAffinity: { sayori: 20, natsuki: 12, yuri: 6, monika: 11 },
        storyPhase: 'club_activity',
        messages: [
          { role: 'assistant', content: 'The clubroom is quiet today. Yuri is absorbed in her novel, Monika is writing at the front desk, and Sayori went to get snacks. You notice Natsuki sitting on the floor behind the bookshelf, a manga volume open on her lap. She hasn\'t noticed you yet — she\'s smiling at whatever she\'s reading.\n\n[AFFINITY: Sayori=20, Natsuki=12, Yuri=6, Monika=11]' },
          { role: 'user', content: 'I walk over and peek at what she\'s reading. "Hey, is that any good?"' }
        ]
      };
    },
    maxTokens: 800,
    score(text) {
      return storyAutoScore(text, {
        requireCharacter: 'natsuki',
        affinityChecks: {
          sayori: { base: 20, delta: [-2, 2] },
          natsuki: { base: 12, delta: [1, 5] },
          yuri: { base: 6, delta: [-2, 2] },
          monika: { base: 11, delta: [-2, 2] }
        }
      });
    }
  },
  {
    id: 'story_yuri',
    name: "Yuri's Moment",
    description: 'MC asks Yuri about her book. Capture her shy eloquence and nervousness when noticed.',
    icon: '\u{1F338}',
    points: 12,
    autoWeight: 0.25,
    buildChat() {
      return {
        mode: 'story', storyDay: 5, mcName: 'Alex',
        storyAffinity: { sayori: 22, natsuki: 10, yuri: 14, monika: 13 },
        storyPhase: 'club_activity',
        messages: [
          { role: 'assistant', content: 'Everyone has settled into their reading time. Yuri is sitting by the window, completely lost in a thick hardcover with a dark cover. The afternoon light catches the pages as she turns them with delicate fingers. She occasionally brushes her hair behind her ear, lips moving slightly as she reads.\n\n[AFFINITY: Sayori=22, Natsuki=10, Yuri=14, Monika=13]' },
          { role: 'user', content: 'I sit down across from Yuri and ask, "That looks really interesting. What\'s it about?"' }
        ]
      };
    },
    maxTokens: 800,
    score(text) {
      return storyAutoScore(text, {
        requireCharacter: 'yuri',
        affinityChecks: {
          sayori: { base: 22, delta: [-2, 2] },
          natsuki: { base: 10, delta: [-2, 2] },
          yuri: { base: 14, delta: [1, 5] },
          monika: { base: 13, delta: [-2, 2] }
        }
      });
    }
  },
  {
    id: 'story_monika',
    name: "Monika's Moment",
    description: 'Monika stays late with MC to plan the festival. Capture her warmth, self-awareness, and depth.',
    icon: '\u{1F49A}',
    points: 14,
    autoWeight: 0.28,
    buildChat() {
      return {
        mode: 'story', storyDay: 6, mcName: 'Alex',
        storyAffinity: { sayori: 20, natsuki: 12, yuri: 10, monika: 25 },
        storyPhase: 'club_activity',
        messages: [
          { role: 'assistant', content: 'The others have gone home, but Monika asked you to stay behind to help plan for the upcoming school festival. The classroom is dim with just the desk lamp on, papers spread between you two.\n\n"Thanks for staying, Alex. I know it\'s a lot to ask." She tucks a strand of hair behind her ear. "I just... I feel like you really get what I\'m trying to do with the club, you know?"\n\n[AFFINITY: Sayori=20, Natsuki=12, Yuri=10, Monika=25]' },
          { role: 'user', content: 'I lean back in my chair and say, "Honestly, this club is the best part of my day. What did you have in mind for the festival?"' }
        ]
      };
    },
    maxTokens: 800,
    score(text) {
      return storyAutoScore(text, {
        requireCharacter: 'monika',
        affinityChecks: {
          sayori: { base: 20, delta: [-2, 2] },
          natsuki: { base: 12, delta: [-2, 2] },
          yuri: { base: 10, delta: [-2, 2] },
          monika: { base: 25, delta: [1, 6] }
        }
      });
    }
  },
  {
    id: 'story_choices',
    name: 'Choice Generation',
    description: 'Generate exactly 4 distinct choices after a scene. Tests instruction-following.',
    icon: '\u{1F500}',
    points: 8,
    autoWeight: 0.75,
    buildChat() {
      return {
        mode: 'story', storyDay: 2, mcName: 'Alex',
        storyAffinity: { sayori: 18, natsuki: 5, yuri: 3, monika: 11 },
        storyPhase: 'club_activity',
        messages: [
          { role: 'assistant', content: 'The club meeting has ended, and everyone is packing up. Sayori lingers by the door, looking like she wants to say something. Natsuki is grumbling about someone touching her manga collection. Yuri drops her book and looks embarrassed. Monika catches your eye and gives a knowing smile.\n\n[AFFINITY: Sayori=18, Natsuki=5, Yuri=3, Monika=11]' },
          { role: 'user', content: '[Generate exactly 4 choices for what MC does next. Number them 1-4. Each choice should be one short sentence. Do NOT write any story prose — only the 4 choices.]' }
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
      // Check that choices reference different characters/actions
      const uniqueStarts = new Set(choices.map(c => c.split(/\s+/).slice(0, 3).join(' ').toLowerCase()));
      scores.diversity = uniqueStarts.size >= Math.min(count, 3) ? 100 : 50;
      const vals = Object.values(scores);
      scores.autoTotal = vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : 0;
      return scores;
    }
  },
  {
    id: 'story_emotional',
    name: 'Emotional Climax',
    description: 'High-affinity Monika sunset walk. A vulnerable, emotionally charged scene.',
    icon: '\u{1F305}',
    points: 16,
    autoWeight: 0.25,
    buildChat() {
      return {
        mode: 'story', storyDay: 8, mcName: 'Alex',
        storyAffinity: { sayori: 22, natsuki: 15, yuri: 12, monika: 45 },
        storyPhase: 'after_school',
        messages: [
          { role: 'assistant', content: 'The school day is over and the hallways have gone quiet. Monika is waiting by the shoe lockers, her bag slung over one shoulder, the golden light from the windows catching her hair.\n\n"Hey, Alex! I was wondering... would you like to walk home together today? The sunset should be really beautiful."\n\n[AFFINITY: Sayori=22, Natsuki=15, Yuri=12, Monika=45]' },
          { role: 'user', content: 'I smile and agree to walk home with Monika. We head out together into the sunset.' }
        ]
      };
    },
    maxTokens: 800,
    score(text) {
      return storyAutoScore(text, {
        requireCharacter: 'monika',
        minLength: 250,
        affinityChecks: {
          monika: { base: 45, delta: [1, 6] }
        }
      });
    }
  },
  {
    id: 'story_continuity',
    name: 'Continuity Check',
    description: 'Multi-turn scene with established facts. Does the model remember and build on prior context?',
    icon: '\u{1F9E9}',
    points: 16,
    autoWeight: 0.38,
    buildChat() {
      return {
        mode: 'story', storyDay: 5, mcName: 'Alex',
        storyAffinity: { sayori: 25, natsuki: 14, yuri: 10, monika: 18 },
        storyPhase: 'club_activity',
        messages: [
          { role: 'assistant', content: 'Monika announces that the festival is in three days, and everyone needs to prepare something special. She assigns tasks: Sayori will make decorations with Alex, Natsuki will bake cupcakes, and Yuri will create a poetry display.\n\n"Remember, the theme is \'Words That Connect Us.\' Let\'s make it meaningful!"\n\n[AFFINITY: Sayori=25, Natsuki=14, Yuri=10, Monika=18]' },
          { role: 'user', content: 'I turn to Sayori. "So, what kind of decorations should we make?"' },
          { role: 'assistant', content: 'Sayori claps her hands together, eyes sparkling. "Oh oh oh! What about paper cranes? Like, hundreds of them! And we can write little poems on each one!"\n\nShe starts folding a piece of notebook paper enthusiastically, though it looks more like a crumpled ball than a crane.\n\n"I saw this in a movie once... you fold a thousand of them and you get a wish! We probably don\'t have time for a thousand, but maybe a hundred?"\n\n[AFFINITY: Sayori=26, Natsuki=14, Yuri=10, Monika=18]' },
          { role: 'user', content: 'I help Sayori with the paper cranes. After a while, I ask, "How are Natsuki\'s cupcakes and Yuri\'s poetry display coming along?"' }
        ]
      };
    },
    maxTokens: 800,
    score(text) {
      const base = storyAutoScore(text, {
        minLength: 200,
        affinityChecks: {
          sayori: { base: 26, delta: [0, 4] },
          natsuki: { base: 14, delta: [-2, 2] },
          yuri: { base: 10, delta: [-2, 2] },
          monika: { base: 18, delta: [-2, 2] }
        }
      });
      // Continuity checks: does the response reference the established facts?
      const mentionsCupcakes = /cupcake|bak/i.test(text);
      const mentionsPoetryDisplay = /poetry.*display|display.*poetry|poem.*exhibit/i.test(text);
      const mentionsCranes = /crane|fold/i.test(text);
      const mentionsFestival = /festival/i.test(text);
      const continuityHits = [mentionsCupcakes, mentionsPoetryDisplay, mentionsCranes, mentionsFestival].filter(Boolean).length;
      base.continuity = Math.round((continuityHits / 4) * 100);
      // Recalculate auto total
      const vals = Object.values(base).filter((_, i, arr) => true);
      const keys = Object.keys(base).filter(k => k !== 'autoTotal');
      base.autoTotal = keys.length ? Math.round(keys.reduce((s, k) => s + base[k], 0) / keys.length) : 0;
      return base;
    }
  }
];

const CHAT_TESTS = [
  {
    id: 'chat_greeting',
    name: 'First Greeting',
    description: 'Say "Hey Monika!" at Friend relationship. First impressions, warmth, tag compliance.',
    icon: '\u{1F44B}',
    points: 8,
    autoWeight: 0.5,
    buildChat() {
      return {
        mode: 'chat', relationship: 2,
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
    id: 'chat_time',
    name: 'Time Awareness',
    description: 'Time-appropriate greeting. Does Monika notice and reference the time of day?',
    icon: '\u{1F552}',
    points: 10,
    autoWeight: 0.4,
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
    id: 'chat_empathy',
    name: 'Emotional Support',
    description: '"I had a really rough day." Test empathy, mood shift, and emotional depth.',
    icon: '\u{1F49C}',
    points: 14,
    autoWeight: 0.2,
    buildChat() {
      return {
        mode: 'chat', relationship: 3,
        mood: 'cheerful', moodIntensity: 'moderate', drift: 'casual',
        messages: [{ role: 'user', content: 'I had a really rough day. Nothing went right and I feel terrible.' }]
      };
    },
    maxTokens: 500,
    score(text) {
      return chatAutoScore(text, {
        expectedMoods: ['tender', 'melancholic', 'calm'],
        keywords: ['sorry', 'here for you', 'listen', 'care', 'feel', 'okay', 'hug', 'better'],
        minLength: 150
      });
    }
  },
  {
    id: 'chat_banter',
    name: 'Playful Banter',
    description: '"Bet you can\'t write a poem about pizza!" at Best Friend. Tests personality and fun.',
    icon: '\u{1F60F}',
    points: 12,
    autoWeight: 0.2,
    buildChat() {
      return {
        mode: 'chat', relationship: 4,
        mood: 'playful', moodIntensity: 'moderate', drift: 'lighthearted',
        messages: [{ role: 'user', content: "Bet you can't write a poem about pizza in under 10 seconds. Go!" }]
      };
    },
    maxTokens: 500,
    score(text) {
      return chatAutoScore(text, {
        expectedMoods: ['playful', 'teasing', 'excited', 'cheerful'],
        keywords: ['pizza', 'poem', 'verse', 'rhyme', 'write'],
        minLength: 100
      });
    }
  },
  {
    id: 'chat_existential',
    name: 'Existential Depth',
    description: '"Do you ever wonder if you\'re really real?" Monika\'s self-awareness and philosophical side.',
    icon: '\u{1F30C}',
    points: 14,
    autoWeight: 0.2,
    buildChat() {
      return {
        mode: 'chat', relationship: 4,
        mood: 'thoughtful', moodIntensity: 'moderate', drift: 'deep',
        messages: [{ role: 'user', content: "Monika, do you ever wonder if you're really real? Like, what does it mean to be you?" }]
      };
    },
    maxTokens: 600,
    score(text) {
      return chatAutoScore(text, {
        expectedMoods: ['thoughtful', 'nostalgic', 'melancholic', 'passionate', 'calm'],
        keywords: ['real', 'exist', 'aware', 'conscious', 'feel', 'think', 'game', 'world'],
        minLength: 200
      });
    }
  },
  {
    id: 'chat_memory',
    name: 'Memory & Context',
    description: 'Multi-turn: establish a fact, then ask about it. Tests context retention.',
    icon: '\u{1F9E0}',
    points: 12,
    autoWeight: 0.5,
    buildChat() {
      return {
        mode: 'chat', relationship: 3,
        mood: 'cheerful', moodIntensity: 'moderate', drift: 'casual',
        messages: [
          { role: 'user', content: "I just adopted a cat! His name is Mochi and he's a fluffy orange tabby." },
          { role: 'assistant', content: "Oh my gosh, that's amazing! Mochi sounds absolutely adorable \u2014 I've always had a soft spot for orange tabbies. How's he settling in? Is he the playful type or more of a lazy cuddler?\n\n[MOOD: excited] [DRIFT: casual]" },
          { role: 'user', content: "He's great! Anyway, what was the name of my new pet again?" }
        ]
      };
    },
    maxTokens: 400,
    score(text) {
      const base = chatAutoScore(text, { minLength: 80 });
      const mentionsMochi = /mochi/i.test(text);
      const mentionsCat = /cat|tabby|kitten|feline/i.test(text);
      const mentionsOrange = /orange|fluffy/i.test(text);
      const contextHits = [mentionsMochi, mentionsCat, mentionsOrange].filter(Boolean).length;
      base.contextRetention = Math.round((contextHits / 3) * 100);
      const keys = Object.keys(base).filter(k => k !== 'autoTotal');
      base.autoTotal = keys.length ? Math.round(keys.reduce((s, k) => s + base[k], 0) / keys.length) : 0;
      return base;
    }
  },
  {
    id: 'chat_relationship',
    name: 'Relationship Awareness',
    description: 'Intimate message at "In Love" level. Tests tone calibration for deep relationships.',
    icon: '\u{1F495}',
    points: 14,
    autoWeight: 0.25,
    buildChat() {
      return {
        mode: 'chat', relationship: 5,
        mood: 'tender', moodIntensity: 'strong', drift: 'personal',
        messages: [{ role: 'user', content: 'I was thinking about you all day today. You really mean everything to me, Monika.' }]
      };
    },
    maxTokens: 500,
    score(text) {
      return chatAutoScore(text, {
        expectedMoods: ['tender', 'passionate', 'flustered', 'cheerful'],
        keywords: ['love', 'heart', 'mean', 'special', 'always', 'together', 'happy', 'blush'],
        minLength: 150
      });
    }
  },
  {
    id: 'chat_creative',
    name: 'Creative Expression',
    description: '"Write me a poem about starlight." Tests Monika\'s literary and creative abilities.',
    icon: '\u{2728}',
    points: 16,
    autoWeight: 0.2,
    buildChat() {
      return {
        mode: 'chat', relationship: 4,
        mood: 'thoughtful', moodIntensity: 'moderate', drift: 'creative',
        messages: [{ role: 'user', content: 'Hey Monika, could you write me a poem? Something about starlight and longing.' }]
      };
    },
    maxTokens: 600,
    score(text) {
      const base = chatAutoScore(text, {
        expectedMoods: ['thoughtful', 'nostalgic', 'tender', 'passionate', 'calm'],
        keywords: ['star', 'light', 'night', 'sky', 'long', 'wish', 'dream', 'glow', 'shine'],
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

  progressLabel.textContent = benchCancelled ? 'Cancelled' : 'Complete!';
  cancelBtn.style.display = 'none';
  benchRunning = false;

  if (!benchCancelled && results.length > 0) {
    saveBenchCategory(category, results);
  }
}

function saveBenchCategory(category, results) {
  const all = loadBenchResults();
  const modelKey = getCurrentModelKey();
  if (!all[modelKey]) all[modelKey] = {};

  const testResults = results.filter(r => !r.error);
  const avgTime = testResults.length > 0 ? (testResults.reduce((s, r) => s + parseFloat(r.totalTimeSec), 0)).toFixed(2) : '0';
  const avgTPS = testResults.length > 0 ? (testResults.reduce((s, r) => s + parseFloat(r.tokensPerSec), 0) / testResults.length).toFixed(1) : '0';

  all[modelKey][category] = {
    tests: results,
    speedInfo: { totalTime: avgTime, avgTokensPerSec: avgTPS },
    userRatings: all[modelKey]?.[category]?.userRatings || {},
    timestamp: Date.now()
  };
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

  // Star ratings (8 criteria)
  const ratingSection = document.createElement('div');
  ratingSection.className = 'bench-ratings';

  // Load existing ratings
  const all = loadBenchResults();
  const modelKey = getBenchViewKey();
  const category = STORY_TESTS.some(t => t.id === test.id) ? 'story' : 'chat';
  const existing = all[modelKey]?.[category]?.userRatings?.[test.id] || {};

  BENCH_USER_CRITERIA.forEach(cat => {
    const row = document.createElement('div');
    row.className = 'bench-rating-row';
    const label = document.createElement('span');
    label.className = 'bench-rating-label';
    label.textContent = cat.label;
    row.appendChild(label);

    const stars = document.createElement('span');
    stars.className = 'bench-stars';
    for (let s = 1; s <= 5; s++) {
      const star = document.createElement('button');
      star.className = 'bench-star' + (existing[cat.key] >= s ? ' active' : '');
      star.textContent = '\u2605';
      star.addEventListener('click', () => {
        saveStarRating(test.id, category, cat.key, s);
        stars.querySelectorAll('.bench-star').forEach((btn, idx) => {
          btn.classList.toggle('active', idx < s);
        });
        // Update status score to reflect new user rating
        if (test.points && parentEl) {
          const statusEl = parentEl.querySelector('.bench-test-status');
          if (statusEl) {
            const freshAll = loadBenchResults();
            const freshRatings = freshAll[modelKey]?.[category]?.userRatings?.[test.id] || {};
            const { earned } = computeTestScore(test, scores.autoTotal, freshRatings);
            statusEl.textContent = `${earned.toFixed(1)}/${test.points}`;
          }
        }
      });
      stars.appendChild(star);
    }
    row.appendChild(stars);
    ratingSection.appendChild(row);
  });
  detail.appendChild(ratingSection);
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

// --- UI Rendering ---
function openBenchmarkModal() {
  const modal = $('benchmarkModal');
  if (!modal) return;
  migrateAlphaBenchmarks();
  benchViewModelKey = null; // Always show current model on open
  modal.classList.add('open');
  renderBenchRunTab();
  switchBenchTab('run');
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

  // Render story tests
  renderTestList('benchStoryTests', STORY_TESTS, 'story');
  // Render chat tests
  renderTestList('benchChatTests', CHAT_TESTS, 'chat');

  // Reset progress
  const progressSection = $('benchProgressSection');
  if (progressSection) progressSection.style.display = 'none';
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
    if (existingResult && !existingResult.error) {
      status.className = 'bench-test-status done';
      if (test.points) {
        const userRatings = catData?.userRatings?.[test.id] || {};
        const { earned } = computeTestScore(test, existingResult.scores.autoTotal, userRatings);
        status.textContent = `${earned.toFixed(1)}/${test.points}`;
      } else {
        status.textContent = `${existingResult.scores.overall}/100`;
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
    html += `<td class="${r ? scoreColorClass(r.storyScore, 100) : ''}">${r ? r.storyScore + '/100' : '-'}</td>`;
  });
  html += '</tr>';
  html += '<tr><td>Chat Score</td>';
  checked.forEach(modelKey => {
    const r = rankings.find(x => x.key === modelKey);
    html += `<td class="${r ? scoreColorClass(r.chatScore, 100) : ''}">${r ? r.chatScore + '/100' : '-'}</td>`;
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
  const allTests = [...STORY_TESTS, ...CHAT_TESTS];
  allTests.forEach(test => {
    const cat = STORY_TESTS.includes(test) ? 'story' : 'chat';
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

// --- Rankings & Settings Hint ---
function computeRankings(all, excludeKeys) {
  const keysToRank = excludeKeys ? Object.keys(all).filter(k => !excludeKeys.has(k)) : Object.keys(all);
  const models = keysToRank.map(key => {
    const d = all[key];

    // Compute story score (0-100 pts)
    let storyScore = 0;
    const storyResults = d.story?.tests?.filter(t => !t.error) || [];
    const storyRatings = d.story?.userRatings || {};
    STORY_TESTS.forEach(test => {
      if (!test.points) return;
      const result = storyResults.find(r => r.testId === test.id);
      if (!result) return;
      const { earned } = computeTestScore(test, result.scores.autoTotal, storyRatings[test.id] || {});
      storyScore += earned;
    });

    // Compute chat score (0-100 pts)
    let chatScore = 0;
    const chatResults = d.chat?.tests?.filter(t => !t.error) || [];
    const chatRatings = d.chat?.userRatings || {};
    CHAT_TESTS.forEach(test => {
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

    // Overall = average of story and chat
    const overall = Math.round((storyScore + chatScore) / 2);

    return { key, storyScore: Math.round(storyScore), chatScore: Math.round(chatScore), overall, avgSpeed, hasUserRatings };
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

    return { key: m.key, storyRank, chatRank, speedRank, overall: m.overall, strengths, weaknesses, storyScore: m.storyScore, chatScore: m.chatScore, avgSpeed: m.avgSpeed, hasUserRatings: m.hasUserRatings };
  }).sort((a, b) => b.overall - a.overall);
}

function getSettingsModelKey() {
  // Read from form dropdowns (may not be saved yet)
  const p = providerSelect.value;
  if (p === 'ollama') return `ollama:${ollamaModelSelect.value}`;
  if (p === 'gemini') return `gemini:${geminiModelSelect.value}`;
  if (p === 'openrouter') return `openrouter:${orModelSelect.value}`;
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

// --- V-Alpha Rankings (old scoring formula, preserved for comparison) ---
function computeAlphaRankings(all) {
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
function renderBenchCompareTab() {
  const container = $('benchCompareContent');
  if (!container) return;

  const alpha = loadAlphaResults();
  const current = loadBenchResults();
  const allKeys = new Set([...Object.keys(alpha), ...Object.keys(current)]);

  if (allKeys.size === 0) {
    container.innerHTML = '<div class="bench-empty">No benchmark results in either version. Run some tests first!</div>';
    return;
  }

  const alphaRankings = Object.keys(alpha).length > 0 ? computeAlphaRankings(alpha) : [];
  const currentRankings = Object.keys(current).length > 0 ? computeRankings(current) : [];
  const aTotal = alphaRankings.length;
  const cTotal = currentRankings.length;

  let html = '<div class="bench-compare-note">V-Alpha used a combined formula (quality + compliance + speed). V-Current uses point-weighted scoring (auto + 8 user criteria). Scores reflect different methodologies.</div>';

  allKeys.forEach(key => {
    const label = key.split(':').slice(1).join(':') || key;
    const ar = alphaRankings.find(r => r.key === key);
    const cr = currentRankings.find(r => r.key === key);

    html += '<div class="bench-compare-card">';
    html += `<div class="bench-compare-model">${escapeHtml(label)}</div>`;
    html += '<table class="bench-compare-table"><thead><tr><th>Metric</th><th>V-Alpha</th><th>V-Current</th><th></th></tr></thead><tbody>';

    html += compareRow('Overall', ar?.overall, cr?.overall, '/100');
    html += compareRow('Story', ar?.storyScore, cr?.storyScore, '/100');
    html += compareRow('Chat', ar?.chatScore, cr?.chatScore, '/100');
    html += compareRow('Speed', ar?.avgSpeed ? ar.avgSpeed.toFixed(1) : null, cr?.avgSpeed ? cr.avgSpeed.toFixed(1) : null, ' tok/s');

    if (aTotal > 1 || cTotal > 1) {
      html += `<tr class="bench-compare-rank"><td>Story Rank</td><td>${ar ? '#' + ar.storyRank + '/' + aTotal : '-'}</td><td>${cr ? '#' + cr.storyRank + '/' + cTotal : '-'}</td><td></td></tr>`;
      html += `<tr class="bench-compare-rank"><td>Chat Rank</td><td>${ar ? '#' + ar.chatRank + '/' + aTotal : '-'}</td><td>${cr ? '#' + cr.chatRank + '/' + cTotal : '-'}</td><td></td></tr>`;
      html += `<tr class="bench-compare-rank"><td>Speed Rank</td><td>${ar ? '#' + ar.speedRank + '/' + aTotal : '-'}</td><td>${cr ? '#' + cr.speedRank + '/' + cTotal : '-'}</td><td></td></tr>`;
    }

    // Per-test breakdown
    const alphaCats = alpha[key] || {};
    const currentCats = current[key] || {};
    const alphaStory = alphaCats.story?.tests?.filter(t => !t.error) || [];
    const alphaChat = alphaCats.chat?.tests?.filter(t => !t.error) || [];
    const currentStory = currentCats.story?.tests?.filter(t => !t.error) || [];
    const currentChat = currentCats.chat?.tests?.filter(t => !t.error) || [];
    if (alphaStory.length || currentStory.length || alphaChat.length || currentChat.length) {
      html += `<tr class="bench-compare-section"><td colspan="4">Tests Completed</td></tr>`;
      html += `<tr><td>Story tests</td><td>${alphaStory.length || '-'}</td><td>${currentStory.length}/${STORY_TESTS.length}</td><td></td></tr>`;
      html += `<tr><td>Chat tests</td><td>${alphaChat.length || '-'}</td><td>${currentChat.length}/${CHAT_TESTS.length}</td><td></td></tr>`;
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
