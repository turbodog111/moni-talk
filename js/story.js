// ====== STORY MODE ======
function setNewChatMode(mode) {
  newChatMode = mode;
  $('modeChatBtn').classList.toggle('active', mode === 'chat');
  $('modeStoryBtn').classList.toggle('active', mode === 'story');
  $('modeRoomBtn').classList.toggle('active', mode === 'room');
  $('chatModeOptions').style.display = mode === 'chat' ? '' : 'none';
  $('storyModeOptions').style.display = mode === 'story' ? '' : 'none';
  $('roomModeOptions').style.display = mode === 'room' ? '' : 'none';

  if (mode === 'story') {
    $('newChatTitle').textContent = 'Doki Doki Literature Club';
    $('newChatSubtitle').textContent = 'Your story begins now.';
    $('startChatBtn').textContent = 'Begin Story';
  } else if (mode === 'room') {
    $('newChatTitle').textContent = "Monika's Room";
    $('newChatSubtitle').textContent = 'Just the two of you.';
    $('startChatBtn').textContent = 'Enter Room';
    // Sync room relationship slider
    const roomSlider = $('roomRelSlider');
    if (roomSlider) {
      roomSlider.value = relSlider.value;
      updateRoomRelDisplay();
    }
  } else {
    $('newChatTitle').textContent = 'Talk to Monika';
    $('newChatSubtitle').textContent = 'How well do you two know each other?';
    $('startChatBtn').textContent = 'Start Chatting';
  }
}

function updateRoomRelDisplay() {
  const roomSlider = $('roomRelSlider');
  const roomLabel = $('roomRelLabel');
  const roomDesc = $('roomRelDesc');
  if (!roomSlider || !roomLabel || !roomDesc) return;
  const rel = RELATIONSHIPS[parseInt(roomSlider.value)] || RELATIONSHIPS[2];
  roomLabel.textContent = rel.label;
  roomDesc.textContent = rel.desc;
}

function resetNewChatScreen() {
  setNewChatMode('chat');
  relSlider.value = 2;
  updateRelDisplay();
  $('mcNameInput').value = profile.name || '';
  const roomSlider = $('roomRelSlider');
  if (roomSlider) { roomSlider.value = 2; updateRoomRelDisplay(); }
}

// ====== PHASE HELPERS ======
function isEndOfDayPhase(p) {
  return p === 'wrap_up' || p === 'd1_wrap_up' || p === 'walk_home';
}

function initPhaseForDay(chat) {
  const day = chat.storyDay || 1;
  const seq = getPhaseSequence(day);
  chat.storyPhase = seq[0];
  chat.storyBeatInPhase = 0;
}

function advancePhase(chat) {
  const day = chat.storyDay || 1;
  const seq = getPhaseSequence(day);
  const idx = seq.indexOf(chat.storyPhase);
  if (idx >= 0 && idx < seq.length - 1) {
    chat.storyPhase = seq[idx + 1];
    chat.storyBeatInPhase = 0;
    return true;
  }
  return false;
}

function buildPhaseInstruction(chat) {
  const phaseKey = chat.storyPhase;
  const phase = STORY_PHASES[phaseKey];
  if (!phase) return '';
  const day = chat.storyDay || 1;

  let instruction = phase.instruction;

  // Dynamic free_time instruction based on affinity
  if (!instruction && phaseKey === 'free_time') {
    const aff = chat.storyAffinity || {};
    const girls = ['sayori', 'natsuki', 'yuri', 'monika'];
    const sorted = girls.map(g => ({ name: g, val: aff[g] || 0 })).sort((a, b) => b.val - a.val);
    const highest = sorted[0];
    const second = sorted[1];
    const capName = n => n.charAt(0).toUpperCase() + n.slice(1);

    let freeTimeHint = `Day ${day} — Scene: Free time in the club! MC can choose who to spend time with. This is the key bonding phase — meaningful one-on-one conversation happens here.`;

    if (highest.val > 30) {
      freeTimeHint += ` ${capName(highest.name)} actively seeks MC out — she finds an excuse to be near him or starts a conversation.`;
    }
    if (second.val > 30 && highest.val > 30 && highest.val - second.val <= 5) {
      freeTimeHint += ` ${capName(highest.name)} and ${capName(second.name)} are both competing for MC's attention — write a subtle tension/jealousy moment between them.`;
    }
    const lowGirls = sorted.filter(g => g.val < 15);
    if (lowGirls.length > 0) {
      const lowNames = lowGirls.map(g => capName(g.name)).join(' and ');
      freeTimeHint += ` ${lowNames} ${lowGirls.length === 1 ? 'stays' : 'stay'} in the background doing ${lowGirls.length === 1 ? 'her' : 'their'} own thing — not ignoring MC, just not seeking him out.`;
    }
    freeTimeHint += ' Do NOT include any tags like [END_OF_DAY], [POETRY], or [CHOICE] in your response.';
    instruction = freeTimeHint;
  }

  // Dynamic wrap_up instruction (legacy — for old saves still on wrap_up)
  if (!instruction && phaseKey === 'wrap_up') {
    const aff = chat.storyAffinity || {};
    const girls = ['sayori', 'natsuki', 'yuri', 'monika'];
    const highest = girls.reduce((a, b) => (aff[a] || 0) >= (aff[b] || 0) ? a : b);
    const name = highest.charAt(0).toUpperCase() + highest.slice(1);
    const isSayori = highest === 'sayori';
    instruction = `Scene: Monika announces the meeting is over for today. MC walks home with ${name}${isSayori ? ' (they always walk together as neighbors)' : ' (she offered to walk together)'}. A nice bonding moment on the walk. End your response with [END_OF_DAY] on its own line.`;
  }

  // Dynamic walk_home instruction — parse companion from last user message
  if (!instruction && phaseKey === 'walk_home') {
    let companion = 'Sayori';
    const lastUserMsg = [...chat.messages].reverse().find(m => m.role === 'user');
    if (lastUserMsg && typeof lastUserMsg.content === 'string') {
      const match = lastUserMsg.content.match(/^Walk home with (\w+)/i);
      if (match) companion = match[1];
    }
    const isSayori = companion.toLowerCase() === 'sayori';
    instruction = `Day ${day} — Scene: MC walks home with ${companion}${isSayori ? ' (they always walk together as neighbors)' : ''}. Write a meaningful bonding scene between MC and ${companion}. Show their personality and deepen their connection. End your response with [END_OF_DAY] on its own line.`;
  }

  if (!instruction) return '';

  // Replace {{DAY}} tokens
  if (instruction) instruction = instruction.replace(/\{\{DAY\}\}/g, String(day));

  // Build scene header with day awareness
  let header = `=== CURRENT SCENE: ${phase.label} (Day ${day}) ===\nThis is DAY ${day} of the story.`;
  if (day > 1) {
    header += ` MC has been in the club for ${day - 1} day(s). He knows all the girls. Do NOT write first-meeting scenes.`;
  }
  header += `\nYou MUST write this scene as described below. The user's previous choice affects tone and affinity only — it does NOT override this scene.`;

  return `${header}\n\n${instruction}`;
}

// Build walk-home choices sorted by affinity with flavor text
function buildWalkHomeChoices(chat) {
  const aff = chat.storyAffinity || {};
  const girls = ['sayori', 'natsuki', 'yuri', 'monika'];
  const capName = n => n.charAt(0).toUpperCase() + n.slice(1);
  const sorted = girls.map(g => ({ name: g, val: aff[g] || 0 })).sort((a, b) => b.val - a.val);

  return sorted.map(g => {
    const name = capName(g.name);
    if (g.val >= 40) {
      const flavor = {
        sayori: "she's already bouncing toward you",
        natsuki: "she's lingering by the door, pretending not to wait",
        yuri: "she pauses at the door, hoping you'll join her",
        monika: "she catches your eye with a warm smile"
      };
      return `Walk home with ${name} — ${flavor[g.name]}`;
    } else if (g.val >= 20) {
      const flavor = {
        sayori: "she waves at you with her usual grin",
        natsuki: "she glances your way before heading out",
        yuri: "she's gathering her things slowly near you",
        monika: "she's organizing her notes at the front desk"
      };
      return `Walk home with ${name} — ${flavor[g.name]}`;
    } else {
      const flavor = {
        sayori: "your neighbor — might as well walk together",
        natsuki: "you could try catching up with her",
        yuri: "she's quietly heading out alone",
        monika: "she's still wrapping up club duties"
      };
      return `Walk home with ${name} — ${flavor[g.name]}`;
    }
  });
}

// Ensure phase is valid for the current day; re-init if stale or missing
function ensurePhase(chat) {
  if (!chat.storyPhase) {
    initPhaseForDay(chat);
    return;
  }
  // Migration: old saves on wrap_up for day 2+ → meeting_end
  if (chat.storyPhase === 'wrap_up' && (chat.storyDay || 1) > 1) {
    console.log('[STORY-MIGRATION] Migrating wrap_up → meeting_end for day', chat.storyDay);
    chat.storyPhase = 'meeting_end';
    chat.storyBeatInPhase = 0;
    saveChats();
    return;
  }
  const seq = getPhaseSequence(chat.storyDay || 1);
  if (!seq.includes(chat.storyPhase)) {
    initPhaseForDay(chat);
  }
}

// ====== PARSING ======
const AFFINITY_NAMES = /(?:Sayori|Natsuki|Yuri|Monika)/i;
const BARE_AFFINITY_RE = /(?:^|\n)\s*(?:(?:Sayori|Natsuki|Yuri|Monika)\s*[:=]\s*-?\d+[\s,]*){2,}\s*$/i;

function parseAffinityPairs(str) {
  const affinity = {};
  str.split(/[,;\n]+/).forEach(pair => {
    const m = pair.match(/(Sayori|Natsuki|Yuri|Monika)\s*[:=]\s*(-?\d+)/i);
    if (m) affinity[m[1].trim().toLowerCase()] = Math.min(100, Math.max(0, parseInt(m[2]) || 0));
  });
  return Object.keys(affinity).length >= 2 ? affinity : null;
}

function parseStoryResponse(text) {
  const hasPoetry = /\[POETRY\]/i.test(text);
  const isEndOfDay = /\[END_OF_DAY\]/i.test(text);

  // Try tagged format first: [AFFINITY:Sayori=X,...] or [ASSIMILATION:...] (common model typo)
  let affinity = null;
  const taggedMatch = text.match(/\[(?:AFFINITY|ASSIMILATION)[:\s]([^\]]+)\]/i);
  if (taggedMatch) {
    affinity = parseAffinityPairs(taggedMatch[1]);
  }
  // Fallback: bare "Sayori=2, Natsuki=1, ..." at end of text
  if (!affinity) {
    const bareMatch = text.match(BARE_AFFINITY_RE);
    if (bareMatch) {
      affinity = parseAffinityPairs(bareMatch[0]);
    }
  }

  const narrative = text
    .replace(/\[DAY:\d+\]\s*/g, '')
    .replace(/\[POETRY\]\s*/gi, '')
    .replace(/\[END_OF_DAY\]\s*/gi, '')
    .replace(/\[(?:AFFINITY|ASSIMILATION)[:\s][^\]]*\]\s*/gi, '')
    .replace(/\[CHOICE[_ ]?\d?\]\s*.+/gi, '')
    // Strip bare affinity lines (Name=X, Name=X pattern at end)
    .replace(/(?:^|\n)\s*(?:(?:Sayori|Natsuki|Yuri|Monika)\s*[:=]\s*-?\d+[\s,]*){2,}\s*$/gi, '')
    .trim();
  return { narrative, hasPoetry, isEndOfDay, affinity };
}

// ====== AI CHOICE GENERATION ======
async function generateStoryChoices(narrative, phase, chat) {
  // Use the full latest narrative — this is the scene the choices respond to
  const excerpt = narrative.length > 1200 ? '...' + narrative.slice(-1200) : narrative;
  const phaseLabel = phase ? phase.label : 'Scene';
  const name = chat.mcName || 'MC';
  const day = chat.storyDay || 1;
  const aff = chat.storyAffinity || {};

  // Build affinity context
  function tierLabel(val) {
    if (val >= 51) return 'romantic interest';
    if (val >= 31) return 'friends';
    if (val >= 16) return 'warming up';
    return 'stranger';
  }
  const affinityCtx = ['sayori', 'natsuki', 'yuri', 'monika'].map(g => {
    const val = aff[g] || 0;
    return `${g.charAt(0).toUpperCase() + g.slice(1)}: ${val} (${tierLabel(val)})`;
  }).join(', ');

  // Build scene hint from phase instruction
  let sceneHint = '';
  if (phase && phase.instruction) {
    sceneHint = phase.instruction.replace(/\{\{DAY\}\}/g, String(day));
  } else if (phase) {
    sceneHint = phase.label;
  }

  const prompt = `Given this scene from a Doki Doki Literature Club visual novel (Day ${day}), write exactly 4 choices for what the player character (${name}) could do or say NEXT. The choices must directly respond to what just happened in the scene — reference specific dialogue, actions, or moments from the text.

Relationships — ${name}'s current affinity with each girl:
${affinityCtx}
Choices should reflect these relationships. A girl ${name} is close to warrants warmer/bolder options. A stranger warrants cautious/curious options.

${sceneHint ? `Upcoming scene context: ${sceneHint}\nChoices should naturally lead into this next scene when possible.` : ''}
Rules:
- Choices must be grounded in the scene above. If a character just said or did something, choices should react to THAT.
- Each choice: one sentence, under 80 characters.
- Write in IMPERATIVE or SECOND PERSON ("Tell Sayori...", "Ask about...", "Compliment her..."). Do NOT use first person ("I").
- ${name} IS the player character — NEVER refer to ${name} in third person. The player IS ${name}.
- Vary the tone: mix bold, cautious, funny, and sincere options.
- Format: numbered 1. 2. 3. 4. — output ONLY the 4 choices, nothing else.

Scene (${phaseLabel}):
"""
${excerpt}
"""

Choices:`;

  try {
    const result = await callAI([
      { role: 'user', content: prompt }
    ], 200);
    const lines = result.split('\n').map(l => l.trim()).filter(Boolean);
    const choices = [];
    for (const line of lines) {
      const m = line.match(/^\d[.):\-]\s*(.+)/);
      if (m && m[1].length > 5) choices.push(m[1].trim());
    }
    if (choices.length >= 3 && choices.length <= 5) return choices.slice(0, 4);
  } catch (e) {
    // Silent fail — fall back to static choices
  }
  return null; // Signal to use fallback
}

// Try AI choice generation in the background; swap in if successful before user clicks
function tryAIChoices(narrative, phase, chat) {
  // Show generating indicator on the choices
  const choicesEl = chatArea.querySelector('.story-choices-inline');
  if (choicesEl) {
    const ind = document.createElement('div');
    ind.className = 'choices-generating';
    ind.id = 'choicesGeneratingIndicator';
    ind.innerHTML = '<span class="choices-gen-dots"><span></span><span></span><span></span></span> Generating smarter choices\u2026';
    choicesEl.prepend(ind);
  }

  // 90 seconds — slow local models (3-6 tok/s) need 30-60s for 200 tokens
  const timeout = new Promise(resolve => setTimeout(() => resolve(null), 90000));
  Promise.race([generateStoryChoices(narrative, phase, chat), timeout]).then(aiChoices => {
    const ind = $('choicesGeneratingIndicator');
    if (ind) ind.remove();

    if (aiChoices && aiChoices.length >= 2) {
      // Only swap if the inline choices are still showing (user hasn't clicked yet)
      const existing = chatArea.querySelector('.story-choices-inline');
      if (existing && !isGenerating) {
        chat.lastChoices = aiChoices;
        saveChats();
        renderStoryChoices(aiChoices);
      }
    }
  }).catch(() => {
    const ind = $('choicesGeneratingIndicator');
    if (ind) ind.remove();
  });
}

// ====== UI HELPERS ======
function insertStoryNarrative(text, animate = true, model = null) {
  const div = document.createElement('div');
  div.className = 'message narrator';
  if (!animate) div.style.animation = 'none';
  const modelTag = model ? `<div class="msg-model">${escapeHtml(formatModelLabel(model))}</div>` : '';
  div.innerHTML = `<div class="msg-content"><div class="msg-bubble">${renderMarkdown(text)}</div>${modelTag}</div>`;
  chatArea.insertBefore(div, typingIndicator);
}

function renderStoryChoices(choices) {
  console.log('[STORY] renderStoryChoices called with:', choices);
  // Remove any existing inline choice container
  const existing = chatArea.querySelector('.story-choices-inline');
  if (existing) existing.remove();
  // Also hide the old external container just in case
  $('storyChoices').style.display = 'none';

  const container = document.createElement('div');
  container.className = 'story-choices-inline';
  choices.forEach(choice => {
    const btn = document.createElement('button');
    btn.className = 'story-choice-btn';
    btn.textContent = choice;
    btn.addEventListener('click', () => selectStoryChoice(choice));
    container.appendChild(btn);
  });
  chatArea.insertBefore(container, typingIndicator);
  // Force reflow then log flat values (no expandable Object)
  const h = container.offsetHeight;
  const rect = container.getBoundingClientRect();
  const aRect = chatArea.getBoundingClientRect();
  console.log('[STORY] choices inserted — height:', h, 'top:', rect.top, 'bottom:', rect.bottom,
    'chatArea bottom:', aRect.bottom, 'scroll:', chatArea.scrollTop, '/', chatArea.scrollHeight, 'client:', chatArea.clientHeight);
  // Scroll the choices into view directly (belt-and-suspenders with scrollToBottom)
  container.scrollIntoView({ block: 'end', behavior: 'smooth' });
  scrollToBottom();
  // Delayed verification — is the element still visible after 2 seconds?
  setTimeout(() => {
    const el = chatArea.querySelector('.story-choices-inline');
    if (el) {
      const r = el.getBoundingClientRect();
      const a = chatArea.getBoundingClientRect();
      const s = getComputedStyle(el);
      console.log('[STORY] 2s check — IN DOM, display:', s.display, 'visibility:', s.visibility,
        'opacity:', s.opacity, 'height:', el.offsetHeight, 'rect:', Math.round(r.top), '-', Math.round(r.bottom),
        'chatArea:', Math.round(a.top), '-', Math.round(a.bottom), 'scroll:', chatArea.scrollTop, '/', chatArea.scrollHeight);
    } else {
      console.log('[STORY] 2s check — GONE from DOM!');
    }
  }, 2000);
}

function hideStoryChoices() {
  console.log('[STORY] hideStoryChoices called', new Error().stack?.split('\n')[2]?.trim());
  const existing = chatArea.querySelector('.story-choices-inline');
  if (existing) existing.remove();
  $('storyChoices').style.display = 'none';
}

function showWordPicker() {
  selectedWords = [];
  wordMap = {};
  const grid = $('wordGrid');
  grid.innerHTML = '';
  const allWords = [];
  for (const [girl, words] of Object.entries(POEM_WORDS)) {
    const shuffled = [...words].sort(() => Math.random() - 0.5).slice(0, 5);
    shuffled.forEach(w => { allWords.push(w); wordMap[w] = girl; });
  }
  allWords.sort(() => Math.random() - 0.5);
  allWords.forEach(word => {
    const chip = document.createElement('button');
    chip.className = 'word-chip';
    chip.textContent = word;
    chip.addEventListener('click', () => toggleWord(word, chip));
    grid.appendChild(chip);
  });
  $('wordCount').textContent = '0/5';
  $('wordSubmitBtn').disabled = true;
  $('wordPicker').style.display = '';
  hideStoryChoices();
}

function hideWordPicker() {
  $('wordPicker').style.display = 'none';
  selectedWords = [];
}

function toggleWord(word, chip) {
  if (selectedWords.includes(word)) {
    selectedWords = selectedWords.filter(w => w !== word);
    chip.classList.remove('selected');
  } else if (selectedWords.length < 5) {
    selectedWords.push(word);
    chip.classList.add('selected');
  }
  $('wordCount').textContent = `${selectedWords.length}/5`;
  $('wordSubmitBtn').disabled = selectedWords.length !== 5;
}

async function submitPoem() {
  if (selectedWords.length !== 5) return;
  const chat = getChat();
  if (!chat || isGenerating) return;
  const counts = { sayori: 0, natsuki: 0, yuri: 0, monika: 0 };
  selectedWords.forEach(w => { if (wordMap[w]) counts[wordMap[w]]++; });
  const topGirl = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
  const topName = topGirl.charAt(0).toUpperCase() + topGirl.slice(1);
  const message = `[Poem words: ${selectedWords.join(', ')}] My poem resonates most with ${topName}'s style.`;
  hideWordPicker();
  chat.messages.push({ role: 'user', content: message });
  // After poem submission, advance to poem_reactions phase
  if (chat.storyPhase === 'poem_sharing') {
    advancePhase(chat);
  }
  saveChats();
  insertMessageEl('user', `Wrote a poem with: ${selectedWords.join(', ')}`);
  scrollToBottom();
  updateContextBar();
  await generateStoryBeat(chat);
}

async function selectStoryChoice(choice) {
  const chat = getChat();
  if (!chat || isGenerating) return;
  hideStoryChoices();

  // Retry doesn't push a message
  if (choice === 'Retry') {
    await generateStoryBeat(chat);
    return;
  }

  // "End of day — read diaries" — user is ready to see the journal overlay
  if (choice === 'End of day — read diaries') {
    await showEndOfDay(chat);
    return;
  }

  // "Walk home with X" — player chose a companion
  if (choice.startsWith('Walk home with ')) {
    chat.messages.push({ role: 'user', content: choice });
    saveChats();
    insertMessageEl('user', choice);
    scrollToBottom();
    // Advance meeting_end → walk_home
    advancePhase(chat);
    updatePhaseDisplay(chat);
    updateContextBar();
    await generateStoryBeat(chat);
    return;
  }

  // "Begin next day" from replay — advance day only if closeJournal didn't already run
  if (choice === 'Begin next day') {
    const lastMsg = chat.messages[chat.messages.length - 1];
    const isStillWrapUp = isEndOfDayPhase(chat.storyPhase);
    if (isStillWrapUp && lastMsg?.role === 'assistant' && /\[END_OF_DAY\]/i.test(lastMsg.content)) {
      chat.storyDay = (chat.storyDay || 1) + 1;
      initPhaseForDay(chat);
      chat.lastChoices = null;
      updateChatHeader(chat);
      updateVnDay(chat.storyDay);
      updatePhaseDisplay(chat);
    }
    // Push a user turn so the model has something to respond to on the new day
    chat.messages.push({ role: 'user', content: '[Continue]' });
    saveChats();
    await generateStoryBeat(chat);
    return;
  }

  // Don't push "Continue" as a visible user message — just nudge the story forward
  if (choice === 'Continue') {
    const lastMsg = chat.messages[chat.messages.length - 1];
    // Avoid duplicate [Continue] messages (e.g., after failed day transition + reload)
    if (!(lastMsg?.role === 'user' && lastMsg?.content === '[Continue]')) {
      chat.messages.push({ role: 'user', content: '[Continue]' });
      saveChats();
    }
  } else {
    chat.messages.push({ role: 'user', content: choice });
    saveChats();
    insertMessageEl('user', choice);
    scrollToBottom();
  }
  updateContextBar();
  await generateStoryBeat(chat);
}

// ====== LIVE TAG STRIPPING (for streaming display) ======
function liveStripTags(text) {
  return text
    .replace(/\[DAY:\d+\]\s*/g, '')
    .replace(/\[(?:AFFINITY|ASSIMILATION)[:\s][^\]]*\]\s*/gi, '')
    .replace(/\[CHOICE[_ ]?\d?\]\s*.+/gi, '')
    .replace(/\[END_OF_DAY\]\s*/gi, '')
    .replace(/\[POETRY\]\s*/gi, '')
    // Strip bare affinity lines during streaming
    .replace(/(?:^|\n)\s*(?:(?:Sayori|Natsuki|Yuri|Monika)\s*[:=]\s*-?\d+[\s,]*){2,}\s*$/gi, '')
    .trim();
}

// ====== DAY TRANSITION RECOVERY ======
function validateDayTransition(chat) {
  const phase = STORY_PHASES[chat.storyPhase];
  const isWrapPhase = isEndOfDayPhase(chat.storyPhase);
  const seq = getPhaseSequence(chat.storyDay || 1);

  // Recovery: phase is wrap-up but storyDay was already incremented (partial closeJournal)
  // Detect: wrap phase doesn't belong to current day's sequence
  if (isWrapPhase && !seq.includes(chat.storyPhase)) {
    console.log('[STORY-RECOVERY] Phase is wrap-up but not in current day sequence — re-initializing phase for day', chat.storyDay);
    initPhaseForDay(chat);
    saveChats();
  }

  // Recovery: storyBeatInPhase unreasonably high (> maxBeats + 2)
  if (phase && chat.storyBeatInPhase > phase.maxBeats + 2) {
    console.log('[STORY-RECOVERY] storyBeatInPhase', chat.storyBeatInPhase, 'exceeds maxBeats', phase.maxBeats, '+ 2 — resetting to 0');
    chat.storyBeatInPhase = 0;
    saveChats();
  }

  // Recovery: stale "Begin next day" in lastChoices from old code
  if (chat.lastChoices && chat.lastChoices.includes('Begin next day')) {
    console.log('[STORY-RECOVERY] Converting stale "Begin next day" choice to "End of day — read diaries"');
    chat.lastChoices = chat.lastChoices.map(c => c === 'Begin next day' ? 'End of day — read diaries' : c);
    saveChats();
  }
}

// ====== GENERATE STORY BEAT (phase-aware, streaming) ======
async function generateStoryBeat(chat) {
  console.log('[STORY] generateStoryBeat called', { phase: chat.storyPhase, beat: chat.storyBeatInPhase, isGenerating, msgCount: chat.messages.length });
  if (isGenerating) { console.log('[STORY] BLOCKED — isGenerating is true, returning early'); return; }
  if (provider === 'openrouter' && !apiKey) { openSettings(); showToast('Enter your OpenRouter API key first.'); return; }
  if (provider === 'gemini' && !geminiKey) { openSettings(); showToast('Enter your Gemini API key first.'); return; }

  // Ensure phase is initialized and valid
  ensurePhase(chat);
  validateDayTransition(chat);

  isGenerating = true;
  typingIndicator.classList.add('visible');
  scrollToBottom();
  updatePhaseDisplay(chat);

  let streamDiv = null;
  let streamBubble = null;

  try {
    let fullText = '';
    let updatePending = false;

    await callProviderStreaming(chat, (chunk) => {
      // On first chunk, swap typing indicator for live narrative element
      if (!streamDiv) {
        typingIndicator.classList.remove('visible');
        streamDiv = document.createElement('div');
        streamDiv.className = 'message narrator';
        streamDiv.innerHTML = '<div class="msg-content"><div class="msg-bubble"></div></div>';
        chatArea.insertBefore(streamDiv, typingIndicator);
        streamBubble = streamDiv.querySelector('.msg-bubble');
      }
      fullText += chunk;
      // Throttle DOM updates to animation frames
      if (!updatePending) {
        updatePending = true;
        requestAnimationFrame(() => {
          const liveText = liveStripTags(fullText);
          if (liveText && streamBubble) streamBubble.innerHTML = renderMarkdown(liveText);
          scrollToBottom();
          updatePending = false;
        });
      }
    });

    const rawReply = fullText.trim();

    // Guard: empty response
    if (!rawReply) {
      if (streamDiv) streamDiv.remove();
      throw new Error('Got an empty response from the model. Try again.');
    }

    const { narrative, hasPoetry, isEndOfDay, affinity } = parseStoryResponse(rawReply);
    console.log('[STORY] parsed response', { narrativeLen: narrative.length, hasPoetry, isEndOfDay, hasAffinity: !!affinity });

    // Guard: garbled response — too short or degenerated word salad
    if (narrative.length < 20) {
      if (streamDiv) streamDiv.remove();
      throw new Error('Model returned a garbled response. Try again.');
    }
    // Detect degeneration: if any single sentence (split by period) is over 500 chars,
    // the model likely fell into a word-association loop
    const sentences = narrative.split(/[.!?]+/);
    const hasDegeneration = sentences.some(s => s.trim().length > 500);
    if (hasDegeneration) {
      if (streamDiv) streamDiv.remove();
      throw new Error('Model output degenerated into nonsense. Try again or switch to a different model.');
    }

    // Final clean render (replaces streamed text with properly parsed narrative)
    typingIndicator.classList.remove('visible');
    if (streamBubble) streamBubble.innerHTML = renderMarkdown(narrative);

    // Append model attribution tag
    if (streamDiv) {
      const modelKey = getCurrentModelKey();
      if (modelKey) {
        const modelTag = document.createElement('div');
        modelTag.className = 'msg-model';
        modelTag.textContent = formatModelLabel(modelKey);
        const msgContent = streamDiv.querySelector('.msg-content');
        if (msgContent) msgContent.appendChild(modelTag);
      }
    }

    // Day is JS-authoritative — ignore model's day tag, use our tracked day
    updateChatHeader(chat);
    updateVnDay(chat.storyDay || 1);

    // Affinity fallback — merge with existing, never lose values
    // Rule-based filter: only accept affinity changes for characters actually present in the scene
    const prev = { ...(chat.storyAffinity || { sayori: 15, natsuki: 1, yuri: 1, monika: 10 }) };
    if (affinity) {
      const sceneLower = narrative.toLowerCase();
      chat.storyAffinity = {
        sayori: (sceneLower.includes('sayori') && affinity.sayori != null) ? affinity.sayori : prev.sayori,
        natsuki: (sceneLower.includes('natsuki') && affinity.natsuki != null) ? affinity.natsuki : prev.natsuki,
        yuri: (sceneLower.includes('yuri') && affinity.yuri != null) ? affinity.yuri : prev.yuri,
        monika: (sceneLower.includes('monika') && affinity.monika != null) ? affinity.monika : prev.monika
      };
    } else {
      chat.storyAffinity = prev;
    }
    // Detect milestone crossings and fire toasts
    detectMilestones(chat, prev, chat.storyAffinity);
    updateAffinityPanel(chat.storyAffinity);
    updateRouteIndicator(chat);

    chat.messages.push({ role: 'assistant', content: rawReply, model: getCurrentModelKey() });
    updateVnSprites(narrative);
    scrollToBottom();
    updateContextBar();

    // Increment beat counter
    chat.storyBeatInPhase = (chat.storyBeatInPhase || 0) + 1;
    const phase = STORY_PHASES[chat.storyPhase];
    const isWrapPhase = isEndOfDayPhase(chat.storyPhase);

    // 1. Handle end of day — ONLY honor [END_OF_DAY] during wrap-up/walk_home phases
    if ((isEndOfDay && isWrapPhase) || (phase && phase.forceEndOfDay && chat.storyBeatInPhase >= phase.maxBeats)) {
      console.log('[STORY] → path 1: end of day (showing diary choice)');
      chat.lastChoices = ['End of day — read diaries'];
      saveChats();
      renderStoryChoices(['End of day — read diaries']);
      scrollToBottom();
      return;
    }

    // 2. Handle poetry tag — ONLY during poem_sharing phase
    if (hasPoetry && (phase && phase.triggerPoetry)) {
      console.log('[STORY] → path 2: poetry trigger');
      saveChats();
      showWordPicker();
      return;
    }

    // 3. Check if we've hit maxBeats — advance to next phase
    if (phase && chat.storyBeatInPhase >= phase.maxBeats) {
      // Special case: meeting_end → show walk-home choices instead of advancing
      if (chat.storyPhase === 'meeting_end') {
        console.log('[STORY] → path 3-meeting: showing walk-home choices');
        const walkChoices = buildWalkHomeChoices(chat);
        chat.lastChoices = walkChoices;
        saveChats();
        renderStoryChoices(walkChoices);
        scrollToBottom();
        return;
      }
      advancePhase(chat);
      updatePhaseDisplay(chat);
      const nextPhase = STORY_PHASES[chat.storyPhase];
      if (nextPhase && !nextPhase.noChoices && nextPhase.choices) {
        console.log('[STORY] → path 3a: maxBeats, advancing with next phase choices', nextPhase.choices);
        chat.lastChoices = nextPhase.choices;
        saveChats();
        renderStoryChoices(nextPhase.choices);
        tryAIChoices(narrative, nextPhase, chat);
      } else {
        console.log('[STORY] → path 3b: maxBeats, advancing with Continue');
        chat.lastChoices = null;
        saveChats();
        renderStoryChoices(['Continue']);
      }
      scrollToBottom();
      return;
    }

    // 4. noChoices enforcement — show Continue
    if (phase && phase.noChoices) {
      console.log('[STORY] → path 4: noChoices phase, showing Continue');
      chat.lastChoices = null;
      saveChats();
      renderStoryChoices(['Continue']);
      scrollToBottom();
      return;
    }

    // 5. Normal: show static choices instantly, try AI enhancement in background
    const staticChoices = (phase && phase.choices) || ['Continue'];
    console.log('[STORY] → path 5: normal choices', staticChoices);
    chat.lastChoices = staticChoices;
    saveChats();
    renderStoryChoices(staticChoices);
    scrollToBottom();
    updatePhaseDisplay(chat);
    if (phase && phase.choices) {
      tryAIChoices(narrative, phase, chat);
    }

  } catch (err) {
    console.error('[STORY] error in generateStoryBeat:', err);
    if (streamDiv) streamDiv.remove();
    typingIndicator.classList.remove('visible');
    showToast(err.message || 'Something went wrong.');
    renderStoryChoices(['Retry']);
    scrollToBottom();
  } finally {
    isGenerating = false;
  }
}

// Failsafe: user can always force-continue if stuck
function forceStoryRetry() {
  const chat = getChat();
  if (!chat || chat.mode !== 'story') return;
  if (isGenerating) {
    isGenerating = false;
    typingIndicator.classList.remove('visible');
  }
  hideStoryChoices();
  hideWordPicker();
  generateStoryBeat(chat);
}

// ====== MILESTONE DETECTION ======
function detectMilestones(chat, prevAffinity, newAffinity) {
  if (!prevAffinity || !newAffinity) return;
  const thresholds = [25, 50, 75];
  const crossed = chat.milestonesCrossed || {};
  const pending = [];

  for (const girl of AFFINITY_GIRL_NAMES) {
    const prev = prevAffinity[girl] || 0;
    const curr = newAffinity[girl] || 0;
    for (const t of thresholds) {
      const key = `${girl}_${t}`;
      if (prev < t && curr >= t && !crossed[key]) {
        crossed[key] = true;
        const milestoneData = AFFINITY_MILESTONES[girl]?.[t];
        if (milestoneData) {
          pending.push({ girl, threshold: t, description: milestoneData });
          const capName = girl.charAt(0).toUpperCase() + girl.slice(1);
          showToast(`${capName} reached ${t} affinity!`, 'success');
        }
      }
    }
  }

  chat.milestonesCrossed = crossed;
  if (pending.length > 0) {
    chat._pendingMilestones = pending;
  }
}

function buildMilestoneNote(chat) {
  const pending = chat._pendingMilestones;
  if (!pending || pending.length === 0) return '';

  const notes = pending.map(m => {
    const capName = m.girl.charAt(0).toUpperCase() + m.girl.slice(1);
    return `MILESTONE EVENT — ${capName} reached ${m.threshold} affinity. Work this into the scene naturally: ${m.description}`;
  });

  // Clear pending after building the note (consumed once)
  delete chat._pendingMilestones;

  return '=== MILESTONE EVENTS (weave these into the narrative) ===\n' + notes.join('\n');
}

// ====== CHECKPOINT SYSTEM ======
function getCheckpoints() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE.CHECKPOINTS) || '{}');
  } catch { return {}; }
}

function saveCheckpoints(data) {
  localStorage.setItem(STORAGE.CHECKPOINTS, JSON.stringify(data));
}

function createCheckpoint(chat, isAuto = false) {
  if (!chat || chat.mode !== 'story') return;

  const all = getCheckpoints();
  const chatCPs = all[chat.id] || [];

  const cp = {
    id: crypto.randomUUID(),
    auto: isAuto,
    timestamp: Date.now(),
    day: chat.storyDay || 1,
    phase: chat.storyPhase,
    beat: chat.storyBeatInPhase || 0,
    affinity: { ...chat.storyAffinity },
    mcName: chat.mcName || 'MC',
    messages: chat.messages.map(m => ({ role: m.role, content: m.content })),
    milestonesCrossed: { ...(chat.milestonesCrossed || {}) }
  };

  chatCPs.push(cp);

  // Enforce limits: 5 auto + 5 manual per chat
  const autos = chatCPs.filter(c => c.auto);
  const manuals = chatCPs.filter(c => !c.auto);
  while (autos.length > 5) autos.shift();
  while (manuals.length > 5) manuals.shift();

  all[chat.id] = [...autos, ...manuals].sort((a, b) => a.timestamp - b.timestamp);
  saveCheckpoints(all);
  return cp;
}

function loadCheckpoint(chat, cpId) {
  if (!chat) return false;
  const all = getCheckpoints();
  const chatCPs = all[chat.id] || [];
  const cp = chatCPs.find(c => c.id === cpId);
  if (!cp) return false;

  chat.storyDay = cp.day;
  chat.storyPhase = cp.phase;
  chat.storyBeatInPhase = cp.beat;
  chat.storyAffinity = { ...cp.affinity };
  chat.mcName = cp.mcName;
  chat.messages = cp.messages.map(m => ({ role: m.role, content: m.content }));
  chat.milestonesCrossed = { ...(cp.milestonesCrossed || {}) };
  chat.lastChoices = null;

  saveChats();
  return true;
}

function deleteCheckpoint(chatId, cpId) {
  const all = getCheckpoints();
  const chatCPs = all[chatId] || [];
  all[chatId] = chatCPs.filter(c => c.id !== cpId);
  saveCheckpoints(all);
}

function renderCheckpointList(chat) {
  const container = $('checkpointList');
  if (!container || !chat) return;
  const all = getCheckpoints();
  const chatCPs = (all[chat.id] || []).sort((a, b) => b.timestamp - a.timestamp);

  if (chatCPs.length === 0) {
    container.innerHTML = '<div class="cp-empty">No checkpoints yet</div>';
    return;
  }

  const girlColors = { sayori: '#FF91A4', natsuki: '#FF69B4', yuri: '#9370DB', monika: '#3CB371' };

  container.innerHTML = chatCPs.map(cp => {
    const time = new Date(cp.timestamp);
    const timeStr = time.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    const dots = AFFINITY_GIRL_NAMES.map(g => {
      const val = cp.affinity[g] || 0;
      return `<span class="cp-dot" style="background:${girlColors[g]};opacity:${0.3 + (val / 100) * 0.7}" title="${g.charAt(0).toUpperCase() + g.slice(1)}: ${val}"></span>`;
    }).join('');

    return `<div class="cp-item" data-cpid="${cp.id}">
      <div class="cp-info">
        <div class="cp-label">${cp.auto ? 'Auto' : 'Manual'} — Day ${cp.day}</div>
        <div class="cp-time">${timeStr}</div>
        <div class="cp-dots">${dots}</div>
      </div>
      <div class="cp-actions">
        <button class="cp-load-btn" title="Load checkpoint">&#9654;</button>
        <button class="cp-delete-btn" title="Delete checkpoint">&times;</button>
      </div>
    </div>`;
  }).join('');

  // Bind events
  container.querySelectorAll('.cp-load-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const cpId = btn.closest('.cp-item').dataset.cpid;
      if (!confirm('Load this checkpoint? Your current progress will be lost unless you save first.')) return;
      if (loadCheckpoint(chat, cpId)) {
        closeVnPanel();
        updateChatHeader(chat);
        updateVnDay(chat.storyDay);
        updatePhaseDisplay(chat);
        updateAffinityPanel(chat.storyAffinity);
        updateRouteIndicator(chat);
        renderMessages();
        updateContextBar();
        showToast('Checkpoint loaded!', 'success');
      }
    });
  });

  container.querySelectorAll('.cp-delete-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const cpId = btn.closest('.cp-item').dataset.cpid;
      if (!confirm('Delete this checkpoint?')) return;
      deleteCheckpoint(chat.id, cpId);
      renderCheckpointList(chat);
      showToast('Checkpoint deleted.');
    });
  });
}
