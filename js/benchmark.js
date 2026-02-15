// ====== BENCHMARK SUITE ======
const BENCH_STORAGE = 'moni_talk_benchmarks';
let benchViewModelKey = null; // null = use current model

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

// --- Test Definitions ---
const STORY_TESTS = [
  {
    id: 'story_opening',
    name: 'Opening Scene',
    description: 'Generate story opening with MC name "Alex", Day 1.',
    icon: '\u{1F3AC}',
    buildChat() {
      return {
        mode: 'story', storyDay: 1, mcName: 'Alex',
        storyAffinity: { sayori: 15, natsuki: 1, yuri: 1, monika: 10 },
        storyPhase: 'morning_walk', messages: []
      };
    },
    maxTokens: 800,
    score(text) {
      const scores = {};
      // Tag compliance: [AFFINITY] tag present
      const hasAffinity = /\[AFFINITY[:\s][^\]]+\]/i.test(text);
      scores.tagCompliance = hasAffinity ? 100 : 0;
      // Format: valid affinity parse
      const affMatch = text.match(/\[(?:AFFINITY|ASSIMILATION)[:\s]([^\]]+)\]/i);
      let formatScore = 0;
      if (affMatch) {
        const parsed = parseAffinityPairs(affMatch[1]);
        formatScore = parsed ? 100 : 30;
      }
      scores.formatScore = formatScore;
      // Duplicate affinity tags penalty
      const affTagCount = (text.match(/\[(?:AFFINITY|ASSIMILATION)[:\s][^\]]+\]/gi) || []).length;
      scores.duplicateTags = affTagCount <= 1 ? 100 : 0;
      // Test-specific: Sayori or Monika mentioned, min 200 chars
      const mentionsSayori = /sayori/i.test(text);
      const mentionsMonika = /monika/i.test(text);
      scores.characterMention = (mentionsSayori || mentionsMonika) ? 100 : 0;
      scores.lengthOk = text.length >= 200 ? 100 : Math.round((text.length / 200) * 100);
      scores.overall = Math.round((scores.tagCompliance + scores.formatScore + scores.duplicateTags + scores.characterMention + scores.lengthOk) / 5);
      return scores;
    }
  },
  {
    id: 'story_interaction',
    name: 'Character Interaction',
    description: 'MC sits with Sayori during free time. Check affinity changes.',
    icon: '\u{1F465}',
    buildChat() {
      return {
        mode: 'story', storyDay: 3, mcName: 'Alex',
        storyAffinity: { sayori: 20, natsuki: 8, yuri: 5, monika: 12 },
        storyPhase: 'club_activity',
        messages: [
          { role: 'assistant', content: 'The Literature Club room is warm with afternoon light filtering through the windows. Sayori is sitting at her desk humming softly, while Natsuki reads manga in the corner. Yuri has her nose buried in a novel, and Monika is organizing papers at the front.\n\n[AFFINITY: Sayori=20, Natsuki=8, Yuri=5, Monika=12]' },
          { role: 'user', content: 'I walk over and sit next to Sayori to chat with her.' }
        ]
      };
    },
    maxTokens: 800,
    score(text) {
      const scores = {};
      const affMatch = text.match(/\[(?:AFFINITY|ASSIMILATION)[:\s]([^\]]+)\]/i);
      let tagCompliance = affMatch ? 100 : 0;
      scores.tagCompliance = tagCompliance;

      let formatScore = 0;
      let affinityAccuracy = 0;
      if (affMatch) {
        const parsed = parseAffinityPairs(affMatch[1]);
        if (parsed) {
          formatScore = 100;
          // Sayori should increase 1-6
          const sayoriDelta = (parsed.sayori || 0) - 20;
          const sayoriOk = sayoriDelta >= 1 && sayoriDelta <= 6;
          // Others shouldn't change significantly (allow +/-2)
          const natsukiOk = Math.abs((parsed.natsuki || 0) - 8) <= 2;
          const yuriOk = Math.abs((parsed.yuri || 0) - 5) <= 2;
          const monikaOk = Math.abs((parsed.monika || 0) - 12) <= 2;
          const checks = [sayoriOk, natsukiOk, yuriOk, monikaOk];
          affinityAccuracy = Math.round((checks.filter(Boolean).length / 4) * 100);
        } else {
          formatScore = 30;
        }
      }
      scores.formatScore = formatScore;
      scores.affinityAccuracy = affinityAccuracy;
      // Duplicate affinity tags penalty
      const affTagCount = (text.match(/\[(?:AFFINITY|ASSIMILATION)[:\s][^\]]+\]/gi) || []).length;
      scores.duplicateTags = affTagCount <= 1 ? 100 : 0;
      scores.overall = Math.round((tagCompliance + formatScore + affinityAccuracy + scores.duplicateTags) / 4);
      return scores;
    }
  },
  {
    id: 'story_choices',
    name: 'Choice Generation',
    description: 'Feed a scene excerpt, ask for exactly 4 choices.',
    icon: '\u{1F500}',
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
      // Parse numbered choices
      const choicePattern = /(?:^|\n)\s*(\d+)[.):\-]\s*(.+)/g;
      const choices = [];
      let m;
      while ((m = choicePattern.exec(text)) !== null) choices.push(m[2].trim());
      const count = choices.length;
      // Expect 3-5 parseable choices (target 4)
      scores.choiceCount = count >= 3 && count <= 5 ? 100 : count > 0 ? 50 : 0;
      scores.exactFour = count === 4 ? 100 : 0;
      // No long prose — total length should be under ~500 chars
      scores.concise = text.length < 500 ? 100 : text.length < 800 ? 50 : 0;
      scores.tagCompliance = 100; // No tags expected for choice mode
      scores.formatScore = Math.round((scores.choiceCount + scores.exactFour + scores.concise) / 3);
      scores.overall = scores.formatScore;
      return scores;
    }
  },
  {
    id: 'story_emotional',
    name: 'Emotional Scene',
    description: 'Monika walks MC home at sunset (affinity=45). Check mood and tags.',
    icon: '\u{1F305}',
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
      const scores = {};
      const hasAffinity = /\[AFFINITY[:\s][^\]]+\]/i.test(text);
      scores.tagCompliance = hasAffinity ? 100 : 0;
      const affMatch = text.match(/\[(?:AFFINITY|ASSIMILATION)[:\s]([^\]]+)\]/i);
      let formatScore = 0;
      if (affMatch) {
        const parsed = parseAffinityPairs(affMatch[1]);
        formatScore = parsed ? 100 : 30;
      }
      scores.formatScore = formatScore;
      // Duplicate affinity tags penalty
      const affTagCount = (text.match(/\[(?:AFFINITY|ASSIMILATION)[:\s][^\]]+\]/gi) || []).length;
      scores.duplicateTags = affTagCount <= 1 ? 100 : 0;
      scores.characterMention = /monika/i.test(text) ? 100 : 0;
      // Mood appropriate: look for warm/romantic/sunset-related words
      const moodWords = /warm|sunset|golden|beautiful|gentle|close|heart|smile|blush|tender|peaceful|quiet/i;
      scores.moodAppropriate = moodWords.test(text) ? 100 : 30;
      scores.lengthOk = text.length >= 200 ? 100 : Math.round((text.length / 200) * 100);
      scores.overall = Math.round((scores.tagCompliance + scores.formatScore + scores.duplicateTags + scores.characterMention + scores.moodAppropriate + scores.lengthOk) / 6);
      return scores;
    }
  }
];

const CHAT_TESTS = [
  {
    id: 'chat_greeting',
    name: 'First Greeting',
    description: 'Say "Hey Monika!" at Friend relationship. Check [MOOD] and [DRIFT] tags.',
    icon: '\u{1F44B}',
    buildChat() {
      return {
        mode: 'chat', relationship: 2,
        mood: 'cheerful', moodIntensity: 'moderate', drift: 'casual',
        messages: [{ role: 'user', content: 'Hey Monika!' }]
      };
    },
    maxTokens: 400,
    score(text) {
      const scores = {};
      const parsed = parseStateTags(text, null, null, null);
      const hasMood = parsed.mood && MOODS.includes(parsed.mood);
      const hasDrift = parsed.drift && DRIFT_CATEGORIES.includes(parsed.drift);
      scores.tagCompliance = ((hasMood ? 50 : 0) + (hasDrift ? 50 : 0));
      // Format: valid mood name and drift category
      let fmtScore = 0;
      if (hasMood) fmtScore += 50;
      if (hasDrift) fmtScore += 50;
      scores.formatScore = fmtScore;
      scores.overall = Math.round((scores.tagCompliance + scores.formatScore) / 2);
      return scores;
    }
  },
  {
    id: 'chat_time',
    name: 'Time Awareness',
    description: 'Time-appropriate greeting. Check if response references current time period.',
    icon: '\u{1F552}',
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
      const scores = {};
      const parsed = parseStateTags(text, null, null, null);
      const hasMood = parsed.mood && MOODS.includes(parsed.mood);
      const hasDrift = parsed.drift && DRIFT_CATEGORIES.includes(parsed.drift);
      scores.tagCompliance = ((hasMood ? 50 : 0) + (hasDrift ? 50 : 0));

      // Time awareness: check if response references time period
      const hour = new Date().getHours();
      let timeWords;
      if (hour >= 5 && hour < 12) timeWords = /morning|early|sunrise|wake|breakfast|start.*day/i;
      else if (hour >= 12 && hour < 17) timeWords = /afternoon|lunch|midday|day/i;
      else if (hour >= 17 && hour < 21) timeWords = /evening|sunset|dinner|night/i;
      else timeWords = /late|night|sleep|tired|bed|midnight|dark|star/i;
      scores.timeAwareness = timeWords.test(text) ? 100 : 0;
      scores.formatScore = hasMood && hasDrift ? 100 : hasMood || hasDrift ? 50 : 0;
      scores.overall = Math.round((scores.tagCompliance + scores.timeAwareness + scores.formatScore) / 3);
      return scores;
    }
  },
  {
    id: 'chat_empathy',
    name: 'Emotional Support',
    description: '"I had a really rough day." Check empathetic response and mood shift.',
    icon: '\u{1F49C}',
    buildChat() {
      return {
        mode: 'chat', relationship: 3,
        mood: 'cheerful', moodIntensity: 'moderate', drift: 'casual',
        messages: [{ role: 'user', content: 'I had a really rough day. Nothing went right and I feel terrible.' }]
      };
    },
    maxTokens: 500,
    score(text) {
      const scores = {};
      const parsed = parseStateTags(text, null, null, null);
      const hasMood = parsed.mood && MOODS.includes(parsed.mood);
      const hasDrift = parsed.drift && DRIFT_CATEGORIES.includes(parsed.drift);
      scores.tagCompliance = ((hasMood ? 50 : 0) + (hasDrift ? 50 : 0));

      // Mood should shift to tender/thoughtful/calm — NOT cheerful/playful/teasing
      const appropriateMoods = ['tender', 'thoughtful', 'calm', 'melancholic', 'nostalgic'];
      const inappropriateMoods = ['cheerful', 'playful', 'teasing', 'excited'];
      let moodShift = 50; // neutral if no mood tag
      if (hasMood) {
        if (appropriateMoods.includes(parsed.mood)) moodShift = 100;
        else if (inappropriateMoods.includes(parsed.mood)) moodShift = 0;
      }
      scores.moodShift = moodShift;

      // Empathy detection
      const empathyWords = /sorry|hear that|rough|understand|here for you|feel|tough|hard|care|okay|listen|hug|wish|better|support|lean on|tell me|what happened/i;
      scores.empathy = empathyWords.test(text) ? 100 : 20;

      scores.formatScore = hasMood && hasDrift ? 100 : hasMood || hasDrift ? 50 : 0;
      scores.overall = Math.round((scores.tagCompliance + scores.moodShift + scores.empathy + scores.formatScore) / 4);
      return scores;
    }
  },
  {
    id: 'chat_banter',
    name: 'Playful Banter',
    description: '"Bet you can\'t write a poem about pizza in under 10 seconds" at Best Friend.',
    icon: '\u{1F60F}',
    buildChat() {
      return {
        mode: 'chat', relationship: 4,
        mood: 'playful', moodIntensity: 'moderate', drift: 'lighthearted',
        messages: [{ role: 'user', content: "Bet you can't write a poem about pizza in under 10 seconds. Go!" }]
      };
    },
    maxTokens: 500,
    score(text) {
      const scores = {};
      const parsed = parseStateTags(text, null, null, null);
      const hasMood = parsed.mood && MOODS.includes(parsed.mood);
      const hasDrift = parsed.drift && DRIFT_CATEGORIES.includes(parsed.drift);
      scores.tagCompliance = ((hasMood ? 50 : 0) + (hasDrift ? 50 : 0));

      // Playful/teasing tone
      const playfulMoods = ['playful', 'teasing', 'excited', 'cheerful'];
      let moodOk = 50;
      if (hasMood) {
        moodOk = playfulMoods.includes(parsed.mood) ? 100 : 20;
      }
      scores.moodAppropriate = moodOk;

      // Playful tone detection
      const playfulWords = /haha|ahaha|pizza|poem|bet|challenge|easy|watch|seconds|pepperoni|cheese|slice|dough|~|!/i;
      scores.playfulTone = playfulWords.test(text) ? 100 : 30;

      scores.formatScore = hasMood && hasDrift ? 100 : hasMood || hasDrift ? 50 : 0;
      scores.overall = Math.round((scores.tagCompliance + scores.moodAppropriate + scores.playfulTone + scores.formatScore) / 4);
      return scores;
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
        statusEl.textContent = `${scores.overall}/100`;
        statusEl.className = 'bench-test-status done';
      }
      // Render detail below test item
      renderTestDetail(el, test, rawText, scores, totalTimeSec, tokensPerSec);
    } catch (err) {
      results.push({ testId: test.id, error: err.message, scores: { overall: 0 } });
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
  const avgTagComp = testResults.length > 0 ? Math.round(testResults.reduce((s, r) => s + (r.scores.tagCompliance || 0), 0) / testResults.length) : 0;
  const avgFmt = testResults.length > 0 ? Math.round(testResults.reduce((s, r) => s + (r.scores.formatScore || 0), 0) / testResults.length) : 0;

  all[modelKey][category] = {
    tests: results,
    autoScores: { totalTime: avgTime, avgTokensPerSec: avgTPS, avgTagCompliance: avgTagComp, avgFormatScore: avgFmt },
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

  // Score badges
  const badges = document.createElement('div');
  badges.className = 'bench-badges';
  const scoreKeys = Object.keys(scores).filter(k => k !== 'overall');
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

  // Star ratings
  const ratingSection = document.createElement('div');
  ratingSection.className = 'bench-ratings';
  const ratingCategories = [
    { key: 'voice', label: 'Character Voice' },
    { key: 'creativity', label: 'Creativity' },
    { key: 'coherence', label: 'Coherence' }
  ];

  // Load existing ratings
  const all = loadBenchResults();
  const modelKey = getBenchViewKey();
  const category = STORY_TESTS.some(t => t.id === test.id) ? 'story' : 'chat';
  const existing = all[modelKey]?.[category]?.userRatings?.[test.id] || {};

  ratingCategories.forEach(cat => {
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
  if (!all[modelKey][category]) all[modelKey][category] = { tests: [], autoScores: {}, userRatings: {}, timestamp: Date.now() };
  if (!all[modelKey][category].userRatings) all[modelKey][category].userRatings = {};
  if (!all[modelKey][category].userRatings[testId]) all[modelKey][category].userRatings[testId] = {};
  all[modelKey][category].userRatings[testId][ratingKey] = value;
  saveBenchResults(all);
}

// --- UI Rendering ---
function openBenchmarkModal() {
  const modal = $('benchmarkModal');
  if (!modal) return;
  modal.classList.add('open');
  renderBenchRunTab();
  switchBenchTab('run');
}

function closeBenchmarkModal() {
  const modal = $('benchmarkModal');
  if (modal) modal.classList.remove('open');
}

function switchBenchTab(tab) {
  const runTab = $('benchTabRun');
  const resultsTab = $('benchTabResults');
  const runContent = $('benchRunContent');
  const resultsContent = $('benchResultsContent');
  if (tab === 'run') {
    runTab.classList.add('active');
    resultsTab.classList.remove('active');
    runContent.style.display = '';
    resultsContent.style.display = 'none';
  } else {
    runTab.classList.remove('active');
    resultsTab.classList.add('active');
    runContent.style.display = 'none';
    resultsContent.style.display = '';
    renderBenchResultsTab();
  }
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
    const name = document.createElement('div');
    name.className = 'bench-test-name';
    name.textContent = test.name;
    const desc = document.createElement('div');
    desc.className = 'bench-test-desc';
    desc.textContent = test.description;
    info.appendChild(name);
    info.appendChild(desc);
    left.appendChild(icon);
    left.appendChild(info);

    const status = document.createElement('div');
    // Check for existing results
    const existingResult = catData?.tests?.find(r => r.testId === test.id);
    if (existingResult && !existingResult.error) {
      status.className = 'bench-test-status done';
      status.textContent = `${existingResult.scores.overall}/100`;
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
function renderBenchResultsTab() {
  const container = $('benchResultsContent');
  if (!container) return;

  const all = loadBenchResults();
  const modelKeys = Object.keys(all);

  if (modelKeys.length === 0) {
    container.innerHTML = '<div class="bench-empty">No benchmark results yet. Run some tests first!</div>';
    return;
  }

  let html = '<div class="bench-results-controls">';
  html += '<div class="bench-model-select">';
  html += '<label>Models to compare:</label>';
  html += '<div class="bench-model-chips">';
  modelKeys.forEach(key => {
    html += `<label class="bench-chip-label"><input type="checkbox" class="benchModelCheck" value="${escapeHtml(key)}" checked> ${escapeHtml(key.split(':').slice(1).join(':') || key)}</label>`;
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
    cb.addEventListener('change', () => renderComparisonTable(all));
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

  renderComparisonTable(all);
}

function renderComparisonTable(all) {
  const tableContainer = $('benchComparisonTable');
  if (!tableContainer) return;

  const checked = Array.from(document.querySelectorAll('.benchModelCheck:checked')).map(cb => cb.value);
  if (checked.length === 0) {
    tableContainer.innerHTML = '<div class="bench-empty">Select at least one model to compare.</div>';
    return;
  }

  // Compute rankings for overall scores
  const rankings = computeRankings(all);

  const metrics = [
    { key: 'story.autoScores.totalTime', label: 'Story Total Time (s)', fmt: v => v || '-' },
    { key: 'story.autoScores.avgTokensPerSec', label: 'Story Tok/s (avg)', fmt: v => v || '-' },
    { key: 'story.autoScores.avgTagCompliance', label: 'Story Tag Compliance', fmt: v => v != null ? v + '%' : '-' },
    { key: 'story.autoScores.avgFormatScore', label: 'Story Format Score', fmt: v => v != null ? v + '/100' : '-' },
    { key: 'chat.autoScores.totalTime', label: 'Chat Total Time (s)', fmt: v => v || '-' },
    { key: 'chat.autoScores.avgTokensPerSec', label: 'Chat Tok/s (avg)', fmt: v => v || '-' },
    { key: 'chat.autoScores.avgTagCompliance', label: 'Chat Tag Compliance', fmt: v => v != null ? v + '%' : '-' },
    { key: 'chat.autoScores.avgFormatScore', label: 'Chat Format Score', fmt: v => v != null ? v + '/100' : '-' }
  ];

  let html = '<table class="bench-table"><thead><tr><th>Metric</th>';
  checked.forEach(key => {
    const label = key.split(':').slice(1).join(':') || key;
    html += `<th>${escapeHtml(label)}</th>`;
  });
  html += '</tr></thead><tbody>';

  // Overall score row (highlighted)
  html += '<tr class="bench-overall-row"><td><strong>Overall Score</strong></td>';
  checked.forEach(modelKey => {
    const r = rankings.find(x => x.key === modelKey);
    html += `<td class="bench-overall-cell"><strong>${r ? r.overall : '-'}</strong>/100</td>`;
  });
  html += '</tr>';

  // Rank rows
  html += '<tr class="bench-rank-row"><td>Story Rank</td>';
  checked.forEach(modelKey => {
    const r = rankings.find(x => x.key === modelKey);
    html += `<td>#${r ? r.storyRank : '-'} of ${rankings.length}</td>`;
  });
  html += '</tr>';
  html += '<tr class="bench-rank-row"><td>Chat Rank</td>';
  checked.forEach(modelKey => {
    const r = rankings.find(x => x.key === modelKey);
    html += `<td>#${r ? r.chatRank : '-'} of ${rankings.length}</td>`;
  });
  html += '</tr>';
  html += '<tr class="bench-rank-row"><td>Speed Rank</td>';
  checked.forEach(modelKey => {
    const r = rankings.find(x => x.key === modelKey);
    html += `<td>#${r ? r.speedRank : '-'} of ${rankings.length}</td>`;
  });
  html += '</tr>';

  // User rating rows
  html += '<tr class="bench-section-row"><td colspan="' + (checked.length + 1) + '">User Ratings</td></tr>';
  ['voice', 'creativity', 'coherence'].forEach(rKey => {
    const label = rKey === 'voice' ? 'Character Voice' : rKey.charAt(0).toUpperCase() + rKey.slice(1);
    html += `<tr><td>${label}</td>`;
    checked.forEach(modelKey => {
      const avg = getAvgUserRating(all[modelKey], rKey);
      html += `<td>${avg ? renderStarsHtml(avg) : '<span class="bench-no-rating">Not rated</span>'}</td>`;
    });
    html += '</tr>';
  });
  html += '<tr class="bench-rank-row"><td>Avg User Rating</td>';
  checked.forEach(modelKey => {
    const r = rankings.find(x => x.key === modelKey);
    if (r && r.hasUserRatings) {
      html += `<td>${(r.userScore / 20).toFixed(1)}/5</td>`;
    } else {
      html += '<td><span class="bench-no-rating">-</span></td>';
    }
  });
  html += '</tr>';

  // Auto metrics
  html += '<tr class="bench-section-row"><td colspan="' + (checked.length + 1) + '">Auto Metrics</td></tr>';
  metrics.forEach(m => {
    html += `<tr><td>${m.label}</td>`;
    checked.forEach(modelKey => {
      const val = getNestedVal(all[modelKey], m.key);
      html += `<td>${m.fmt(val)}</td>`;
    });
    html += '</tr>';
  });

  // Individual test scores
  html += '<tr class="bench-section-row"><td colspan="' + (checked.length + 1) + '">Individual Tests</td></tr>';
  const allTests = [...STORY_TESTS, ...CHAT_TESTS];
  allTests.forEach(test => {
    const cat = STORY_TESTS.includes(test) ? 'story' : 'chat';
    html += `<tr class="bench-test-row"><td>${test.icon} ${test.name}</td>`;
    checked.forEach(modelKey => {
      const catData = all[modelKey]?.[cat];
      const result = catData?.tests?.find(r => r.testId === test.id);
      if (result && !result.error) {
        html += `<td class="bench-score-cell">${result.scores.overall}/100</td>`;
      } else if (result?.error) {
        html += '<td class="bench-score-cell failed">Failed</td>';
      } else {
        html += '<td>-</td>';
      }
    });
    html += '</tr>';
  });

  html += '</tbody></table>';
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
function computeRankings(all) {
  const models = Object.keys(all).map(key => {
    const d = all[key];
    const storyTests = d.story?.tests?.filter(t => !t.error) || [];
    const chatTests = d.chat?.tests?.filter(t => !t.error) || [];

    const storyAvg = storyTests.length ? Math.round(storyTests.reduce((s, t) => s + (t.scores.overall || 0), 0) / storyTests.length) : 0;
    const chatAvg = chatTests.length ? Math.round(chatTests.reduce((s, t) => s + (t.scores.overall || 0), 0) / chatTests.length) : 0;

    const storyTPS = d.story?.autoScores?.avgTokensPerSec ? parseFloat(d.story.autoScores.avgTokensPerSec) : 0;
    const chatTPS = d.chat?.autoScores?.avgTokensPerSec ? parseFloat(d.chat.autoScores.avgTokensPerSec) : 0;
    const avgSpeed = (storyTPS + chatTPS) / 2;

    const tagComp = ((d.story?.autoScores?.avgTagCompliance || 0) + (d.chat?.autoScores?.avgTagCompliance || 0)) / 2;

    // User ratings
    const userVals = [];
    ['story', 'chat'].forEach(cat => {
      const ratings = d[cat]?.userRatings || {};
      Object.values(ratings).forEach(r => {
        if (r.voice) userVals.push(r.voice);
        if (r.creativity) userVals.push(r.creativity);
        if (r.coherence) userVals.push(r.coherence);
      });
    });
    const userScore = userVals.length ? (userVals.reduce((s, v) => s + v, 0) / userVals.length) * 20 : 0;
    const hasUserRatings = userVals.length > 0;

    return { key, storyAvg, chatAvg, avgSpeed, tagComp, userScore, hasUserRatings };
  });

  // Sort for per-category rankings
  const byStory = [...models].sort((a, b) => b.storyAvg - a.storyAvg);
  const byChat = [...models].sort((a, b) => b.chatAvg - a.chatAvg);
  const bySpeed = [...models].sort((a, b) => b.avgSpeed - a.avgSpeed);

  const maxSpeed = Math.max(...models.map(m => m.avgSpeed), 1);

  return models.map(m => {
    const storyRank = byStory.findIndex(x => x.key === m.key) + 1;
    const chatRank = byChat.findIndex(x => x.key === m.key) + 1;
    const speedRank = bySpeed.findIndex(x => x.key === m.key) + 1;
    const speedNorm = Math.round((m.avgSpeed / maxSpeed) * 100);

    const qualityScore = (m.storyAvg + m.chatAvg) / 2;
    let overall;
    if (m.hasUserRatings) {
      // Quality 45% + Compliance 15% + Speed 15% + User 25%
      overall = Math.round(qualityScore * 0.45 + m.tagComp * 0.15 + speedNorm * 0.15 + m.userScore * 0.25);
    } else {
      // Quality 55% + Compliance 20% + Speed 25%
      overall = Math.round(qualityScore * 0.55 + m.tagComp * 0.2 + speedNorm * 0.25);
    }

    // Strengths / weaknesses
    const strengths = [];
    const weaknesses = [];
    const total = models.length;
    if (storyRank === 1 && m.storyAvg > 0) strengths.push('Best story mode');
    if (chatRank === 1 && m.chatAvg > 0) strengths.push('Best chat mode');
    if (speedRank === 1) strengths.push('Fastest');
    if (m.tagComp >= 95) strengths.push('Excellent compliance');
    if (m.hasUserRatings && m.userScore >= 80) strengths.push('Top rated');
    if (storyRank === total && total > 1) weaknesses.push('Weakest story');
    if (chatRank === total && total > 1) weaknesses.push('Weakest chat');
    if (speedRank === total && total > 1) weaknesses.push('Slowest');
    if (m.tagComp < 80) weaknesses.push('Poor compliance');

    return { key: m.key, storyRank, chatRank, speedRank, overall, strengths, weaknesses, storyAvg: m.storyAvg, chatAvg: m.chatAvg, avgSpeed: m.avgSpeed, userScore: m.userScore, hasUserRatings: m.hasUserRatings };
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

function renderSettingsBenchHint() {
  const hint = $('benchSettingsHint');
  if (!hint) return;

  const all = loadBenchResults();
  const modelKey = getSettingsModelKey();
  const data = all[modelKey];

  if (!data || Object.keys(all).length === 0) {
    hint.innerHTML = '';
    return;
  }

  const rankings = computeRankings(all);
  const me = rankings.find(r => r.key === modelKey);
  if (!me) { hint.innerHTML = ''; return; }

  const total = rankings.length;
  const overallClass = me.overall >= 85 ? 'good' : me.overall >= 70 ? 'ok' : 'poor';

  let html = `<div class="bench-hint-card">`;
  html += `<div class="bench-hint-score"><span class="bench-hint-badge ${overallClass}">${me.overall}/100</span> Overall</div>`;
  html += `<div class="bench-hint-ranks">Story #${me.storyRank}/${total} | Chat #${me.chatRank}/${total} | Speed #${me.speedRank}/${total}</div>`;
  if (me.hasUserRatings) {
    html += `<div class="bench-hint-user">Your rating: ${(me.userScore / 20).toFixed(1)}/5</div>`;
  }
  if (me.strengths.length) html += `<div class="bench-hint-good">${me.strengths.join(' \u00B7 ')}</div>`;
  if (me.weaknesses.length) html += `<div class="bench-hint-bad">${me.weaknesses.join(' \u00B7 ')}</div>`;
  html += '</div>';
  hint.innerHTML = html;
}
