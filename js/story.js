// ====== STORY MODE ======
function setNewChatMode(mode) {
  newChatMode = mode;
  $('modeChatBtn').classList.toggle('active', mode === 'chat');
  $('modeStoryBtn').classList.toggle('active', mode === 'story');
  $('chatModeOptions').style.display = mode === 'chat' ? '' : 'none';
  $('storyModeOptions').style.display = mode === 'story' ? '' : 'none';
  $('newChatTitle').textContent = mode === 'story' ? 'Doki Doki Literature Club' : 'Talk to Monika';
  $('newChatSubtitle').textContent = mode === 'story' ? 'Your story begins now.' : 'How well do you two know each other?';
  $('startChatBtn').textContent = mode === 'story' ? 'Begin Story' : 'Start Chatting';
}

function resetNewChatScreen() {
  setNewChatMode('chat');
  relSlider.value = 2;
  updateRelDisplay();
  $('mcNameInput').value = profile.name || '';
}

// ====== PHASE HELPERS ======
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

  let instruction = phase.instruction;

  // Dynamic wrap_up instruction based on highest affinity
  if (!instruction && phaseKey === 'wrap_up') {
    const aff = chat.storyAffinity || {};
    const girls = ['sayori', 'natsuki', 'yuri', 'monika'];
    const highest = girls.reduce((a, b) => (aff[a] || 0) >= (aff[b] || 0) ? a : b);
    const name = highest.charAt(0).toUpperCase() + highest.slice(1);
    const isSayori = highest === 'sayori';
    instruction = `Scene: Monika announces the meeting is over for today. MC walks home with ${name}${isSayori ? ' (they always walk together as neighbors)' : ' (she offered to walk together)'}. A nice bonding moment on the walk. End your response with [END_OF_DAY] on its own line.`;
  }

  if (!instruction) return '';
  return `=== CURRENT SCENE: ${phase.label} ===\n${instruction}`;
}

// Ensure phase is valid for the current day; re-init if stale or missing
function ensurePhase(chat) {
  if (!chat.storyPhase) {
    initPhaseForDay(chat);
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
async function generateStoryChoices(narrative, phase) {
  // Trim narrative to last ~500 chars for context
  const excerpt = narrative.length > 500 ? '...' + narrative.slice(-500) : narrative;
  const phaseLabel = phase ? phase.label : 'Scene';
  const prompt = `You are a choice generator for a Doki Doki Literature Club visual novel. Given the scene below, write exactly 3 choices for what the main character (MC) could do next.

Rules:
- Each choice should be specific and interesting, not generic
- Each choice should ideally involve a different character (Sayori, Natsuki, Yuri, or Monika)
- Keep each choice to one sentence (under 80 characters)
- Format: one choice per line, numbered 1. 2. 3.
- Output ONLY the 3 numbered choices, nothing else

Scene (${phaseLabel}):
"""
${excerpt}
"""

Choices:`;

  try {
    const result = await callAI([
      { role: 'user', content: prompt }
    ], 150);
    const lines = result.split('\n').map(l => l.trim()).filter(Boolean);
    const choices = [];
    for (const line of lines) {
      const m = line.match(/^\d[.):\-]\s*(.+)/);
      if (m && m[1].length > 5) choices.push(m[1].trim());
    }
    if (choices.length >= 2 && choices.length <= 4) return choices;
  } catch (e) {
    // Silent fail — fall back to static choices
  }
  return null; // Signal to use fallback
}

// Try AI choice generation in the background; swap in if successful before user clicks
function tryAIChoices(narrative, phase, chat) {
  // Race the AI call against a 12-second timeout
  const timeout = new Promise(resolve => setTimeout(() => resolve(null), 12000));
  Promise.race([generateStoryChoices(narrative, phase), timeout]).then(aiChoices => {
    if (aiChoices && aiChoices.length >= 2) {
      // Only swap if the inline choices are still showing (user hasn't clicked yet)
      const existing = chatArea.querySelector('.story-choices-inline');
      if (existing && !isGenerating) {
        chat.lastChoices = aiChoices;
        saveChats();
        renderStoryChoices(aiChoices);
      }
    }
  }).catch(() => {}); // Silent fail — keep static choices
}

// ====== UI HELPERS ======
function insertStoryNarrative(text, animate = true) {
  const div = document.createElement('div');
  div.className = 'message narrator';
  if (!animate) div.style.animation = 'none';
  div.innerHTML = `<div class="msg-content"><div class="msg-bubble">${renderMarkdown(text)}</div></div>`;
  chatArea.insertBefore(div, typingIndicator);
}

function renderStoryChoices(choices) {
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
  scrollToBottom();
}

function hideStoryChoices() {
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

  // "Begin next day" from replay — advance day only if closeJournal didn't already run
  if (choice === 'Begin next day') {
    const lastMsg = chat.messages[chat.messages.length - 1];
    const isStillWrapUp = chat.storyPhase === 'wrap_up' || chat.storyPhase === 'd1_wrap_up';
    if (isStillWrapUp && lastMsg?.role === 'assistant' && /\[END_OF_DAY\]/i.test(lastMsg.content)) {
      chat.storyDay = (chat.storyDay || 1) + 1;
      initPhaseForDay(chat);
      updateChatHeader(chat);
      updateVnDay(chat.storyDay);
      updatePhaseDisplay(chat);
      saveChats();
    }
    await generateStoryBeat(chat);
    return;
  }

  // Don't push "Continue" as a visible user message — just nudge the story forward
  if (choice === 'Continue') {
    chat.messages.push({ role: 'user', content: '[Continue]' });
    saveChats();
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

// ====== GENERATE STORY BEAT (phase-aware, streaming) ======
async function generateStoryBeat(chat) {
  if (isGenerating) return;
  if (provider === 'openrouter' && !apiKey) { openSettings(); showToast('Enter your OpenRouter API key first.'); return; }
  if (provider === 'gemini' && !geminiKey) { openSettings(); showToast('Enter your Gemini API key first.'); return; }

  // Ensure phase is initialized and valid
  ensurePhase(chat);

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

    // Day is JS-authoritative — ignore model's day tag, use our tracked day
    updateChatHeader(chat);
    updateVnDay(chat.storyDay || 1);

    // Affinity fallback — merge with existing, never lose values
    const prev = chat.storyAffinity || { sayori: 15, natsuki: 1, yuri: 1, monika: 10 };
    if (affinity) {
      chat.storyAffinity = {
        sayori: affinity.sayori ?? prev.sayori,
        natsuki: affinity.natsuki ?? prev.natsuki,
        yuri: affinity.yuri ?? prev.yuri,
        monika: affinity.monika ?? prev.monika
      };
    } else {
      chat.storyAffinity = prev;
    }
    updateAffinityPanel(chat.storyAffinity);

    chat.messages.push({ role: 'assistant', content: rawReply });
    updateVnSprites(narrative);
    scrollToBottom();
    updateContextBar();

    // Increment beat counter
    chat.storyBeatInPhase = (chat.storyBeatInPhase || 0) + 1;
    const phase = STORY_PHASES[chat.storyPhase];
    const isWrapPhase = chat.storyPhase === 'wrap_up' || chat.storyPhase === 'd1_wrap_up';

    // 1. Handle end of day — ONLY honor [END_OF_DAY] during wrap-up phases
    if ((isEndOfDay && isWrapPhase) || (phase && phase.forceEndOfDay && chat.storyBeatInPhase >= phase.maxBeats)) {
      saveChats();
      await showEndOfDay(chat);
      return;
    }

    // 2. Handle poetry tag — ONLY during poem_sharing phase
    if (hasPoetry && (phase && phase.triggerPoetry)) {
      saveChats();
      showWordPicker();
      return;
    }

    // 3. Check if we've hit maxBeats — advance to next phase
    if (phase && chat.storyBeatInPhase >= phase.maxBeats) {
      advancePhase(chat);
      updatePhaseDisplay(chat);
      const nextPhase = STORY_PHASES[chat.storyPhase];
      if (nextPhase && !nextPhase.noChoices && nextPhase.choices) {
        chat.lastChoices = nextPhase.choices;
        saveChats();
        renderStoryChoices(nextPhase.choices);
        tryAIChoices(narrative, nextPhase, chat);
      } else {
        chat.lastChoices = null;
        saveChats();
        renderStoryChoices(['Continue']);
      }
      scrollToBottom();
      return;
    }

    // 4. noChoices enforcement — show Continue
    if (phase && phase.noChoices) {
      chat.lastChoices = null;
      saveChats();
      renderStoryChoices(['Continue']);
      scrollToBottom();
      return;
    }

    // 5. Normal: show static choices instantly, try AI enhancement in background
    const staticChoices = (phase && phase.choices) || ['Continue'];
    chat.lastChoices = staticChoices;
    saveChats();
    renderStoryChoices(staticChoices);
    scrollToBottom();
    updatePhaseDisplay(chat);
    if (phase && phase.choices) {
      tryAIChoices(narrative, phase, chat);
    }

  } catch (err) {
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
