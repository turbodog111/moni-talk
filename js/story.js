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

function parseStoryResponse(text) {
  const choices = [];
  const choiceRegex = /\[CHOICE_\d\]\s*(.+)/g;
  let match;
  while ((match = choiceRegex.exec(text)) !== null) {
    choices.push(match[1].trim());
  }
  const dayMatch = text.match(/\[DAY:(\d+)\]/);
  const day = dayMatch ? parseInt(dayMatch[1]) : null;
  const hasPoetry = /\[POETRY\]/i.test(text);
  const isEndOfDay = /\[END_OF_DAY\]/i.test(text);
  const affinityMatch = text.match(/\[AFFINITY:([^\]]+)\]/);
  let affinity = null;
  if (affinityMatch) {
    affinity = {};
    affinityMatch[1].split(',').forEach(pair => {
      const [name, val] = pair.split('=');
      if (name && val) affinity[name.trim().toLowerCase()] = Math.min(100, Math.max(0, parseInt(val) || 0));
    });
  }
  const narrative = text
    .replace(/\[DAY:\d+\]\s*/g, '')
    .replace(/\[POETRY\]\s*/gi, '')
    .replace(/\[END_OF_DAY\]\s*/gi, '')
    .replace(/\[AFFINITY:[^\]]+\]\s*/g, '')
    .replace(/\[CHOICE_\d\]\s*.+/g, '')
    .trim();
  return { narrative, choices, day, hasPoetry, isEndOfDay, affinity };
}

function insertStoryNarrative(text, animate = true) {
  const div = document.createElement('div');
  div.className = 'message narrator';
  if (!animate) div.style.animation = 'none';
  div.innerHTML = `<div class="msg-content"><div class="msg-bubble">${renderMarkdown(text)}</div></div>`;
  chatArea.insertBefore(div, typingIndicator);
}

function renderStoryChoices(choices) {
  const container = $('storyChoices');
  container.innerHTML = '';
  choices.forEach(choice => {
    const btn = document.createElement('button');
    btn.className = 'story-choice-btn';
    btn.textContent = choice;
    btn.addEventListener('click', () => selectStoryChoice(choice));
    container.appendChild(btn);
  });
  container.style.display = '';
}

function hideStoryChoices() {
  const el = $('storyChoices');
  el.innerHTML = '';
  el.style.display = 'none';
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
  if (chat.mode === 'story') {
    chat.storyTime = (chat.storyTime || 930) + 10;
    updateChatHeader(chat);
    updateVnTime(chat.storyTime);
  }
  chat.messages.push({ role: 'user', content: message });
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
  if (chat.mode === 'story') {
    chat.storyTime = (chat.storyTime || 930) + 10;
    updateChatHeader(chat);
    updateVnTime(chat.storyTime);
  }
  chat.messages.push({ role: 'user', content: choice });
  saveChats();
  insertMessageEl('user', choice);
  scrollToBottom();
  updateContextBar();
  await generateStoryBeat(chat);
}

// ====== JS-ENFORCED DAY TRANSITIONS ======
function getWalkHomeChoices(affinity) {
  const choices = ['Walk home with Sayori'];
  const candidates = [
    { name: 'Monika', key: 'monika' },
    { name: 'Natsuki', key: 'natsuki' },
    { name: 'Yuri', key: 'yuri' }
  ];
  // Only offer non-Sayori girls if affinity >= 25 (Friendly level)
  const eligible = candidates
    .filter(g => (affinity[g.key] || 0) >= 25)
    .sort((a, b) => (affinity[b.key] || 0) - (affinity[a.key] || 0));
  if (eligible.length > 0) {
    choices.push(`Walk home with ${eligible[0].name}`);
  }
  choices.push('Walk home alone');
  return choices;
}

function forceMeetingEnd(chat) {
  const affinity = chat.storyAffinity || {};
  const narrative = `Monika claps her hands together with a bright smile. "Okay everyone, that's all for today! Great work \u2014 I'll see you all tomorrow!" The other club members begin gathering their things as the late afternoon light stretches across the classroom. Another day at the Literature Club comes to a close.`;

  // Build a synthetic assistant message so this persists in history
  const walkChoices = getWalkHomeChoices(affinity);
  const choiceTags = walkChoices.map((c, i) => `[CHOICE_${i + 1}] ${c}`).join('\n');
  const affinityStr = `Sayori=${affinity.sayori || 15},Natsuki=${affinity.natsuki || 1},Yuri=${affinity.yuri || 1},Monika=${affinity.monika || 10}`;
  const fakeResponse = `[DAY:${chat.storyDay || 1}]\n${narrative}\n${choiceTags}\n[AFFINITY:${affinityStr}]`;

  chat.messages.push({ role: 'assistant', content: fakeResponse });
  chat.storyPhase = 'walk_home';
  saveChats();

  insertStoryNarrative(narrative);
  updateVnSprites(narrative);
  renderStoryChoices(walkChoices);
  scrollToBottom();
  updateContextBar();
}

// ====== GENERATE STORY BEAT ======
async function generateStoryBeat(chat) {
  if (isGenerating) return;
  if (provider === 'openrouter' && !apiKey) { openSettings(); showToast('Enter your OpenRouter API key first.'); return; }
  isGenerating = true;
  typingIndicator.classList.add('visible');
  scrollToBottom();
  try {
    const rawReply = provider === 'puter' ? await callPuter(chat) : await callOpenRouter(chat);
    const { narrative, choices, day, hasPoetry, isEndOfDay, affinity } = parseStoryResponse(rawReply);
    if (day) { chat.storyDay = day; updateChatHeader(chat); updateVnDay(day); }
    if (affinity) { chat.storyAffinity = affinity; updateAffinityPanel(affinity); }
    chat.messages.push({ role: 'assistant', content: rawReply });
    saveChats();
    typingIndicator.classList.remove('visible');
    insertStoryNarrative(narrative);
    updateVnSprites(narrative);
    scrollToBottom();
    updateContextBar();

    const phase = chat.storyPhase || 'club';

    if (phase === 'walk_home') {
      // Walk-home scene done — trigger end of day
      chat.storyPhase = 'journal_pending';
      saveChats();
      await showEndOfDay(chat);
    } else if (phase === 'club' && (chat.storyTime || 930) >= 990) {
      // 4:30 PM — JS forces the meeting to end
      forceMeetingEnd(chat);
    } else if (isEndOfDay) {
      // Fallback: AI ended the day on its own
      await showEndOfDay(chat);
    } else if (hasPoetry) {
      showWordPicker();
    } else if (choices.length > 0) {
      renderStoryChoices(choices);
      scrollToBottom();
    } else {
      renderStoryChoices(['Continue']);
      scrollToBottom();
    }
  } catch (err) {
    typingIndicator.classList.remove('visible');
    showToast(err.message || 'Something went wrong.');
  } finally {
    isGenerating = false;
  }
}