// ====== STREAMING DISPLAY HELPER ======
function getStreamingDisplay(fullText) {
  // If text starts with '[', check all leading bracket tags are complete
  let i = 0;
  while (i < fullText.length && fullText[i] === '[') {
    const close = fullText.indexOf(']', i);
    if (close === -1) return null; // Incomplete tag — hold display
    i = close + 1;
    // Skip whitespace between tags
    while (i < fullText.length && /\s/.test(fullText[i])) i++;
  }
  // Strip all leading [TAG...] sequences generically
  let display = fullText.replace(/^(\[[^\]]*\]\s*)+/, '');
  // If [POEM] appears without [/POEM], truncate to content before the poem block
  const poemOpen = display.indexOf('[POEM]');
  if (poemOpen !== -1 && display.indexOf('[/POEM]') === -1) {
    display = display.slice(0, poemOpen);
  }
  return display;
}

// ====== CHAT LIST ======
function renderChatList() {
  chatListBody.innerHTML = '';
  if (chats.length === 0) {
    chatListBody.innerHTML = `<div class="chat-list-empty"><img src="Monika PFP.png" alt="Monika"><h3>No conversations yet</h3><p>Tap + to start talking to Monika.</p></div>`;
    return;
  }
  [...chats].sort((a, b) => {
    const aStarred = a.starred ? 1 : 0;
    const bStarred = b.starred ? 1 : 0;
    if (bStarred !== aStarred) return bStarred - aStarred;
    return (b.lastModified || b.created) - (a.lastModified || a.created);
  }).forEach(chat => {
    const rel = chat.mode === 'story' ? { label: 'Story Mode' } : chat.mode === 'room' ? { label: 'Room Mode' } : (RELATIONSHIPS[chat.relationship] || RELATIONSHIPS[2]);
    const defaultTitle = chat.mode === 'story' ? 'Story Mode' : chat.mode === 'room' ? 'Room Mode' : `${rel.label} Monika`;
    const displayTitle = chat.title || defaultTitle;
    const lastMsg = chat.messages[chat.messages.length - 1];
    let preview;
    if (!lastMsg) { preview = 'No messages yet'; }
    else if (chat.mode === 'story') {
      const raw = lastMsg.role === 'assistant' ? parseStoryResponse(lastMsg.content).narrative : lastMsg.content;
      preview = raw.slice(0, 60);
    } else if (chat.mode === 'room') {
      const raw = lastMsg.role === 'assistant' ? stripRoomTags(lastMsg.content) : lastMsg.content;
      preview = (lastMsg.role === 'user' ? 'You: ' : 'Monika: ') + raw.slice(0, 60);
    } else { preview = (lastMsg.role === 'user' ? 'You: ' : 'Monika: ') + lastMsg.content.slice(0, 60); }
    const moodText = chat.mood && chat.mode !== 'story' ? ` \u2022 ${chat.mood}` : '';

    const item = document.createElement('div');
    item.className = 'chat-item';
    const starIcon = chat.starred ? '\u2605' : '\u2606';
    item.innerHTML = `
      <img class="chat-item-avatar" src="Monika PFP.png" alt="Monika">
      <div class="chat-item-info">
        <div class="chat-item-top">
          <span class="chat-item-rel">${escapeHtml(displayTitle)}${moodText}</span>
          <span class="chat-item-date">${new Date(chat.created).toLocaleDateString()}</span>
        </div>
        <div class="chat-item-preview">${escapeHtml(preview)}</div>
      </div>
      <button class="chat-item-rename" title="Rename">&#9998;</button>
      <button class="chat-item-star ${chat.starred ? 'starred' : ''}" title="Star">${starIcon}</button>
      <button class="chat-item-delete" title="Delete">&times;</button>`;
    item.addEventListener('click', (e) => { if (!e.target.closest('.chat-item-delete') && !e.target.closest('.chat-item-star') && !e.target.closest('.chat-item-rename')) openChat(chat.id); });
    item.querySelector('.chat-item-rename').addEventListener('click', (e) => {
      e.stopPropagation();
      const newTitle = prompt('Rename this conversation:', chat.title || defaultTitle);
      if (newTitle !== null) {
        chat.title = newTitle.trim() || null; // null clears back to default
        saveChats(); renderChatList();
      }
    });
    item.querySelector('.chat-item-star').addEventListener('click', (e) => {
      e.stopPropagation();
      chat.starred = !chat.starred;
      saveChats(); renderChatList();
    });
    item.querySelector('.chat-item-delete').addEventListener('click', async (e) => {
      e.stopPropagation();
      if (confirm('Delete this conversation?')) {
        const delId = chat.id;
        chats = chats.filter(c => c.id !== delId);
        deletedChatIds.add(delId);
        localStorage.setItem('moni_talk_deleted_ids', JSON.stringify([...deletedChatIds]));
        saveChats(); renderChatList();
        await deleteCloudChat(delId);
      }
    });
    chatListBody.appendChild(item);
  });
}

// ====== CHAT CRUD ======
function createChat() {
  const now = Date.now();
  const chat = { id: crypto.randomUUID(), relationship: parseInt(relSlider.value), created: now, lastModified: now, messages: [], mood: 'cheerful', moodIntensity: 'moderate', drift: 'casual', lastActiveTime: now, starred: false };
  if (newChatMode === 'story') {
    chat.mode = 'story';
    chat.mcName = $('mcNameInput').value.trim() || 'MC';
    chat.storyDay = 1;
    chat.storyPhase = 'd1_before_club';
    chat.storyBeatInPhase = 0;
    chat.storyAffinity = { sayori: 15, natsuki: 1, yuri: 1, monika: 10 };
    chat.milestonesCrossed = {};
  } else if (newChatMode === 'room') {
    chat.mode = 'room';
    const roomSlider = $('roomRelSlider');
    chat.relationship = roomSlider ? parseInt(roomSlider.value) : parseInt(relSlider.value);
    chat.lastExpression = 'happy';
  }
  chats.push(chat); saveChats(); openChat(chat.id);
}

function openChat(id) {
  // Abort any active streaming generation before switching chats
  if (activeAbortController) {
    activeAbortController.abort();
    activeAbortController = null;
  }
  isGenerating = false;
  activeChatId = id;
  const chat = getChat();
  if (!chat) return;

  // Track daily conversation count for context awareness
  const now = new Date();
  const todayKey = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
  const lastVisit = localStorage.getItem('moni_talk_last_visit') || '';
  if (lastVisit !== todayKey) {
    localStorage.setItem('moni_talk_last_visit', todayKey);
    localStorage.setItem('moni_talk_daily_count', '1');
  } else {
    const count = parseInt(localStorage.getItem('moni_talk_daily_count') || '0') + 1;
    localStorage.setItem('moni_talk_daily_count', String(count));
  }

  const isStory = chat.mode === 'story';
  const isRoom = chat.mode === 'room';

  // Migration for legacy story chats without phase fields
  if (isStory && !chat.storyPhase) {
    if (!chat.storyDay) chat.storyDay = 1;
    if (!chat.storyAffinity) chat.storyAffinity = { sayori: 15, natsuki: 1, yuri: 1, monika: 10 };
    initPhaseForDay(chat);
    saveChats();
  }

  // Migration: milestonesCrossed — retroactively mark passed thresholds
  if (isStory && !chat.milestonesCrossed) {
    const crossed = {};
    const aff = chat.storyAffinity || {};
    for (const girl of AFFINITY_GIRL_NAMES) {
      for (const t of [25, 50, 75]) {
        if ((aff[girl] || 0) >= t) crossed[`${girl}_${t}`] = true;
      }
    }
    chat.milestonesCrossed = crossed;
    saveChats();
  }

  // Migration: mood intensity, drift, lastActiveTime for existing chats
  if (!isStory) {
    if (!chat.moodIntensity) chat.moodIntensity = 'moderate';
    if (!chat.drift) chat.drift = 'casual';
    if (!chat.lastActiveTime) chat.lastActiveTime = chat.lastModified || chat.created;
    saveChats();
  }

  // Migration: starred property for existing chats
  if (chat.starred === undefined) { chat.starred = false; saveChats(); }

  updateChatHeader(chat);

  screens.chat.classList.toggle('vn-mode', isStory);
  screens.chat.classList.toggle('room-mode', isRoom);
  $('vnPanelBtn').style.display = isStory ? '' : 'none';
  showScreen('chat');

  // Teardown room mode if switching away
  if (!isRoom) teardownRoomMode();

  $('inputArea').style.display = isStory ? 'none' : '';
  $('storyRetryBtn').style.display = isStory ? '' : 'none';
  hideStoryChoices();
  hideWordPicker();
  closeVnPanel();

  if (isStory) {
    if (chat.storyAffinity) updateAffinityPanel(chat.storyAffinity);
    updateVnDay(chat.storyDay || 1);
    updatePhaseDisplay(chat);
    updateRouteIndicator(chat);
    updateDynamicsPanel(chat);
    renderCheckpointList(chat);
  }
  hideAffinityPanel();

  if (isRoom) initRoomMode(chat);
  renderMessages();
  updateContextBar();

  if (isStory && chat.messages.length === 0) {
    generateStoryBeat(chat);
  } else if (!isStory && chat.messages.length === 0) {
    generateGreeting(chat);
  } else if (!isStory) {
    userInput.focus();
  }
}

async function generateGreeting(chat) {
  if (isGenerating) return;
  isGenerating = true; sendBtn.disabled = true;
  activeAbortController = new AbortController();
  const cancelBtn = $('cancelBtn');
  if (cancelBtn) { cancelBtn.style.display = ''; sendBtn.style.display = 'none'; }
  typingIndicator.classList.add('visible'); scrollToBottom();

  // Build a greeting-specific prompt using the existing system prompt + a trigger message
  const rel = RELATIONSHIPS[chat.relationship] || RELATIONSHIPS[2];
  let sys = BASE_PROMPT + '\n\n' + rel.prompt + buildProfilePrompt() + buildMemoryPrompt();
  sys += '\n\nIf the conversation is brand new, greet the person warmly according to your relationship level. Keep it natural and short (1-3 sentences).';

  const greetChat = { ...chat, messages: [{ role: 'user', content: '[NEW_CONVERSATION]' }] };

  let msgBubble = null;
  try {
    let fullText = '';
    let updatePending = false;
    await callProviderStreaming(greetChat, (chunk) => {
      if (!msgBubble) {
        typingIndicator.classList.remove('visible');
        const div = document.createElement('div');
        div.className = 'message monika';
        div.innerHTML = '<img class="msg-avatar" src="Monika PFP.png" alt="Monika"><div class="msg-content"><div class="msg-name">Monika</div><div class="msg-bubble"></div></div>';
        chatArea.insertBefore(div, typingIndicator);
        msgBubble = div.querySelector('.msg-bubble');
      }
      fullText += chunk;
      if (!updatePending) {
        updatePending = true;
        requestAnimationFrame(() => {
          const display = getStreamingDisplay(fullText);
          if (display === null) { updatePending = false; return; }
          if (msgBubble) msgBubble.innerHTML = renderMarkdown(display);
          scrollToBottom();
          updatePending = false;
        });
      }
    }, activeAbortController.signal);

    typingIndicator.classList.remove('visible');
    const rawReply = fullText.trim();
    const { mood, moodIntensity, drift, text: reply } = parseStateTags(rawReply, chat.mood || 'cheerful', chat.moodIntensity || 'moderate', chat.drift || 'casual');
    chat.mood = mood; chat.moodIntensity = moodIntensity; chat.drift = drift;
    chat.lastActiveTime = Date.now();
    chat.messages.push({ role: 'assistant', content: reply, timestamp: Date.now(), model: getCurrentModelKey() });
    saveChats();
    if (msgBubble) msgBubble.innerHTML = renderMarkdown(reply);
    if (msgBubble) {
      const modelKey = getCurrentModelKey();
      if (modelKey) {
        const modelTag = document.createElement('div');
        modelTag.className = 'msg-model';
        modelTag.textContent = formatModelLabel(modelKey);
        const mc = msgBubble.closest('.msg-content');
        if (mc) mc.appendChild(modelTag);
      }
    }
    updateChatHeader(chat); scrollToBottom(); updateContextBar();
    if (chat.mode === 'room') {
      updateRoomExpression(reply, mood, moodIntensity).then(expr => { chat.lastExpression = expr; saveChats(); });
    }
  } catch (err) {
    typingIndicator.classList.remove('visible');
    if (err.name === 'AbortError') {
      if (msgBubble) { const m = msgBubble.closest('.message'); if (m) m.remove(); }
    } else {
      showToast(err.message || 'Greeting failed.');
    }
    if (chat.mode === 'room') drawMasSprite(chat.lastExpression || 'happy');
  } finally {
    isGenerating = false; sendBtn.disabled = false;
    activeAbortController = null;
    const cb = $('cancelBtn');
    if (cb) { cb.style.display = 'none'; sendBtn.style.display = ''; }
    userInput.focus();
  }
}

function getChat() { return chats.find(c => c.id === activeChatId) || null; }

function updateChatHeader(chat) {
  if (chat.mode === 'story') {
    $('chatHeaderName').textContent = chat.title || 'Literature Club';
    const phase = STORY_PHASES[chat.storyPhase];
    const phaseLabel = phase ? ` \u2014 ${phase.label}` : '';
    chatHeaderSub.textContent = `Day ${chat.storyDay || 1}${phaseLabel}`;
    return;
  }
  if (chat.mode === 'room') {
    $('chatHeaderName').textContent = chat.title || 'Monika';
    const rel = RELATIONSHIPS[chat.relationship] || RELATIONSHIPS[2];
    const moodEmoji = getMoodEmoji(chat.mood || 'cheerful');
    const drift = chat.drift || 'casual';
    const driftEmoji = DRIFT_EMOJIS[drift] || '\u2615';
    chatHeaderSub.innerHTML = `${rel.label} <span class="chat-header-mood">${moodEmoji} ${chat.mood || 'cheerful'}</span> <span class="chat-header-drift">${driftEmoji} ${drift}</span>`;
    return;
  }
  $('chatHeaderName').textContent = chat.title || 'Monika';
  const rel = RELATIONSHIPS[chat.relationship] || RELATIONSHIPS[2];
  const moodEmoji = getMoodEmoji(chat.mood || 'cheerful');
  const drift = chat.drift || 'casual';
  const driftEmoji = DRIFT_EMOJIS[drift] || '\u2615';
  chatHeaderSub.innerHTML = `${rel.label} <span class="chat-header-mood">${moodEmoji} ${chat.mood || 'cheerful'}</span> <span class="chat-header-drift">${driftEmoji} ${drift}</span>`;
}

function getMoodEmoji(mood) {
  const map = { cheerful:'\u{1F60A}', playful:'\u{1F60F}', thoughtful:'\u{1F914}', melancholic:'\u{1F940}', excited:'\u2728', tender:'\u{1F49A}', teasing:'\u{1F61C}', curious:'\u{1F440}', nostalgic:'\u{1F338}', flustered:'\u{1F633}', calm:'\u2601\uFE0F', passionate:'\u{1F4AB}' };
  return map[mood] || '\u{1F49A}';
}

// ====== CONTEXT BAR ======
function updateContextBar() {
  const chat = getChat();
  if (!chat) return;
  const count = chat.messages.length;
  const pct = Math.min(100, (count / MAX_CONTEXT_MSGS) * 100);
  contextLabel.textContent = `${count} message${count !== 1 ? 's' : ''}`;
  contextFill.style.width = pct + '%';
  contextFill.style.background = pct > 80 ? '#e67e22' : pct > 60 ? '#f1c40f' : 'var(--green-mid)';
  // Show/hide regenerate button
  const regenBtn = $('regenBtn');
  if (regenBtn) {
    const lastMsg = chat.messages[chat.messages.length - 1];
    const show = lastMsg && lastMsg.role === 'assistant' && !isGenerating && chat.mode !== 'story';
    regenBtn.style.display = show ? '' : 'none';
  }
}

async function trimContext() {
  const chat = getChat();
  if (!chat || chat.messages.length <= 10) { showToast('Not enough messages to trim.'); return; }
  const removeCount = Math.floor(chat.messages.length * 0.4);
  if (!confirm(`Remove the ${removeCount} oldest messages to free up context? A summary will be preserved.`)) return;

  const removedMessages = chat.messages.slice(0, removeCount);

  // Try to summarize removed messages before trimming
  try {
    showToast('Summarizing...');
    const convo = removedMessages.map(m => `${m.role === 'user' ? 'User' : 'Monika'}: ${typeof m.content === 'string' ? m.content : '(media)'}`).join('\n');
    const summaryMessages = [
      { role: 'system', content: 'Summarize the key facts, topics, and emotional moments from this conversation in 3-5 bullet points. Be concise.' },
      { role: 'user', content: convo }
    ];
    const summary = await callAI(summaryMessages, 300);
    chat.messages = chat.messages.slice(removeCount);
    // Prepend summary as a system-level context note
    chat.messages.unshift({ role: 'system', content: `[CONVERSATION SUMMARY: ${summary}]` });
  } catch {
    // Summarization failed — fall back to raw trim
    chat.messages = chat.messages.slice(removeCount);
    showToast('Summary failed — trimmed without summary.', 'warning');
  }

  saveChats(); renderMessages(); updateContextBar();
  showToast(`Trimmed ${removeCount} messages with summary.`, 'success');
}

async function regenerateLastResponse() {
  const chat = getChat();
  if (!chat || isGenerating) return;
  const lastMsg = chat.messages[chat.messages.length - 1];
  if (!lastMsg || lastMsg.role !== 'assistant') { showToast('Nothing to regenerate.'); return; }

  // Remove last assistant message
  chat.messages.pop();
  saveChats();
  renderMessages();
  updateContextBar();

  // Find the last user message text to pass to memory extraction later
  const lastUserMsg = [...chat.messages].reverse().find(m => m.role === 'user');
  const userText = lastUserMsg ? (typeof lastUserMsg.content === 'string' ? lastUserMsg.content : '') : '';

  // Re-generate using the existing sendMessage flow — but without adding a new user message
  isGenerating = true; sendBtn.disabled = true;
  activeAbortController = new AbortController();
  const cancelBtn = $('cancelBtn');
  if (cancelBtn) { cancelBtn.style.display = ''; sendBtn.style.display = 'none'; }
  if (chat.mode === 'room') drawMasSprite('think');
  typingIndicator.classList.add('visible'); scrollToBottom();

  let msgBubble = null;
  try {
    let fullText = '';
    let updatePending = false;
    await callProviderStreaming(chat, (chunk) => {
      if (!msgBubble) {
        typingIndicator.classList.remove('visible');
        const div = document.createElement('div');
        div.className = 'message monika';
        div.innerHTML = '<img class="msg-avatar" src="Monika PFP.png" alt="Monika"><div class="msg-content"><div class="msg-name">Monika</div><div class="msg-bubble"></div></div>';
        chatArea.insertBefore(div, typingIndicator);
        msgBubble = div.querySelector('.msg-bubble');
      }
      fullText += chunk;
      if (!updatePending) {
        updatePending = true;
        requestAnimationFrame(() => {
          const display = getStreamingDisplay(fullText);
          if (display === null) { updatePending = false; return; }
          if (msgBubble) msgBubble.innerHTML = renderMarkdown(display);
          scrollToBottom();
          updatePending = false;
        });
      }
    }, activeAbortController.signal);

    typingIndicator.classList.remove('visible');
    const rawReply = fullText.trim();
    const { mood, moodIntensity, drift, text: reply } = parseStateTags(rawReply, chat.mood || 'cheerful', chat.moodIntensity || 'moderate', chat.drift || 'casual');
    chat.mood = mood; chat.moodIntensity = moodIntensity; chat.drift = drift;
    chat.lastActiveTime = Date.now();
    chat.messages.push({ role: 'assistant', content: reply, timestamp: Date.now(), model: getCurrentModelKey() });
    saveChats();
    if (msgBubble) msgBubble.innerHTML = renderMarkdown(reply);
    if (msgBubble) {
      const modelKey = getCurrentModelKey();
      if (modelKey) {
        const modelTag = document.createElement('div');
        modelTag.className = 'msg-model';
        modelTag.textContent = formatModelLabel(modelKey);
        const mc = msgBubble.closest('.msg-content');
        if (mc) mc.appendChild(modelTag);
      }
    }
    updateChatHeader(chat); scrollToBottom(); updateContextBar();
    if (chat.mode === 'room') {
      updateRoomExpression(reply, mood, moodIntensity).then(expr => { chat.lastExpression = expr; saveChats(); });
    }
  } catch (err) {
    typingIndicator.classList.remove('visible');
    if (err.name === 'AbortError') {
      if (msgBubble) { const m = msgBubble.closest('.message'); if (m) m.remove(); }
      showToast('Regeneration cancelled.');
    } else {
      showToast(err.message || 'Regeneration failed.');
    }
    if (chat.mode === 'room') drawMasSprite(chat.lastExpression || 'happy');
  } finally {
    isGenerating = false; sendBtn.disabled = false;
    activeAbortController = null;
    const cb = $('cancelBtn');
    if (cb) { cb.style.display = 'none'; sendBtn.style.display = ''; }
    userInput.focus();
  }
}

// ====== RENDER MESSAGES ======
function renderMessages() {
  chatArea.querySelectorAll('.message, .story-choices-inline, .story-day-separator, .chat-date-separator').forEach(el => el.remove());
  const chat = getChat();
  if (!chat) return;
  hideStoryChoices();

  if (chat.mode === 'story') {
    hideWordPicker();
    let lastAffinity = null;
    chat.messages.forEach(msg => {
      if (msg.role === 'assistant') {
        const parsed = parseStoryResponse(msg.content);
        if (parsed.affinity) lastAffinity = parsed.affinity;
        insertStoryNarrative(parsed.narrative, false, msg.model || null);
      } else {
        // Hide [Continue] system messages from display
        if (msg.content === '[Continue]') return;
        // Day break — show visual separator instead of the raw message
        const dayBreakMatch = msg.content.match(/^\[DAY_BREAK:(\d+)\]/);
        if (dayBreakMatch) {
          const dayDiv = document.createElement('div');
          dayDiv.className = 'story-day-separator';
          dayDiv.innerHTML = `<span>Day ${dayBreakMatch[1]}</span>`;
          chatArea.insertBefore(dayDiv, typingIndicator);
          return;
        }
        const display = msg.content.startsWith('[Poem words:')
          ? msg.content.replace(/\[Poem words: ([^\]]+)\].*/, 'Wrote a poem with: $1')
          : msg.content;
        insertMessageEl('user', display, false);
      }
    });
    if (lastAffinity) { chat.storyAffinity = lastAffinity; updateAffinityPanel(lastAffinity); }
    // Update sprites for last narrative
    const lastAssistant = [...chat.messages].reverse().find(m => m.role === 'assistant');
    if (lastAssistant) updateVnSprites(parseStoryResponse(lastAssistant.content).narrative);
    // ALWAYS show buttons so the user is never stuck
    const last = chat.messages[chat.messages.length - 1];
    if (last?.role === 'assistant') {
      const parsed = parseStoryResponse(last.content);
      const curPhase = STORY_PHASES[chat.storyPhase];
      // Phase-aware: only honor END_OF_DAY in wrap/walk_home phases, POETRY in poem_sharing
      if (parsed.isEndOfDay && isEndOfDayPhase(chat.storyPhase)) {
        renderStoryChoices(['End of day — read diaries']);
      } else if (parsed.hasPoetry && curPhase && curPhase.triggerPoetry) {
        showWordPicker();
      } else {
        const phase = STORY_PHASES[chat.storyPhase];
        if (phase && phase.noChoices) {
          renderStoryChoices(['Continue']);
        } else if (chat.lastChoices && chat.lastChoices.length >= 2) {
          renderStoryChoices(chat.lastChoices);
        } else if (chat.storyBeatInPhase === 0 && chat.messages.length > 1) {
          renderStoryChoices(['Continue']);
        } else if (phase && phase.choices) {
          renderStoryChoices(phase.choices);
        } else {
          renderStoryChoices(['Continue']);
        }
      }
    } else if (last?.role === 'user') {
      // User made a choice but response never came (app closed, error, etc.)
      // Show Continue to resume generation
      renderStoryChoices(['Continue']);
    } else if (chat.messages.length === 0) {
      // Brand new story — openChat handles this, but safety net
      renderStoryChoices(['Continue']);
    }
  } else {
    let lastDateStr = null;
    chat.messages.forEach(msg => {
      // Date separator between messages from different days
      if (msg.timestamp) {
        const d = new Date(msg.timestamp);
        const dateStr = d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
        if (dateStr !== lastDateStr) {
          lastDateStr = dateStr;
          const sep = document.createElement('div');
          sep.className = 'chat-date-separator';
          sep.innerHTML = `<span>${dateStr}</span>`;
          chatArea.insertBefore(sep, typingIndicator);
        }
      }
      let content = msg.content;
      let imageUrl = null;
      // Handle multimodal messages (content arrays with images)
      if (Array.isArray(content)) {
        const imgPart = content.find(p => p.type === 'image_url');
        const textPart = content.find(p => p.type === 'text');
        imageUrl = imgPart?.image_url?.url || null;
        content = textPart?.text || '';
      }
      // Strip legacy expression tags from old room mode messages
      if (chat.mode === 'room' && msg.role === 'assistant') content = stripRoomTags(content);
      insertMessageEl(msg.role, content, false, imageUrl, msg.model || null, msg.timestamp || null);
    });
  }
  scrollToBottom();
}

function formatModelLabel(modelKey) {
  if (!modelKey) return '';
  const parts = modelKey.split(':');
  return parts.length > 2 ? parts.slice(1).join(':') : parts[1] || modelKey;
}

function insertMessageEl(role, content, animate = true, imageUrl = null, model = null, timestamp = null) {
  const isM = role === 'assistant';
  const div = document.createElement('div');
  div.className = `message ${isM ? 'monika' : 'user'}`;
  if (!animate) div.style.animation = 'none';
  const userInitial = (profile.name ? profile.name.charAt(0).toUpperCase() : '?');
  const av = isM ? `<img class="msg-avatar" src="Monika PFP.png" alt="Monika">` : `<div class="msg-avatar-letter">${userInitial}</div>`;
  const imgHtml = imageUrl ? `<img class="msg-image" src="${imageUrl}" alt="Shared image">` : '';
  const modelTag = isM && model ? `<div class="msg-model">${escapeHtml(formatModelLabel(model))}</div>` : '';
  const timeHtml = timestamp ? `<span class="msg-time">${new Date(timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>` : '';
  const copyBtn = `<button class="msg-copy-btn" title="Copy text">&#128203;</button>`;
  div.innerHTML = `${av}<div class="msg-content"><div class="msg-name">${isM ? 'Monika' : 'You'}${timeHtml}</div>${imgHtml}<div class="msg-bubble">${isM ? renderMarkdown(content) : escapeHtml(content)}</div>${copyBtn}${modelTag}</div>`;
  div.dataset.text = content;
  chatArea.insertBefore(div, typingIndicator);
}

function scrollToBottom() { requestAnimationFrame(() => { chatArea.scrollTop = chatArea.scrollHeight; }); }

// ====== IMAGE HANDLING ======
function handleImageAttach(file) {
  if (!file || !file.type.startsWith('image/')) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      // Compress to 512px wide, JPEG 60%
      const canvas = document.createElement('canvas');
      const maxW = 512;
      const scale = Math.min(1, maxW / img.width);
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      pendingImage = canvas.toDataURL('image/jpeg', 0.6);
      showImagePreview(pendingImage);
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

function removeAttachedImage() {
  pendingImage = null;
  const preview = $('imagePreview');
  if (preview) preview.style.display = 'none';
}

function showImagePreview(dataUrl) {
  let preview = $('imagePreview');
  if (!preview) return;
  preview.innerHTML = `<img src="${dataUrl}" alt="Attached"><button class="image-preview-remove" title="Remove">&times;</button>`;
  preview.style.display = 'flex';
  preview.querySelector('.image-preview-remove').addEventListener('click', removeAttachedImage);
}

// ====== SEND ======
async function sendMessage() {
  const chat = getChat();
  const text = userInput.value.trim();
  if (!text && !pendingImage) return;
  if (isGenerating) return;
  if (!chat) return;
  if (provider === 'openrouter' && !apiKey) { openSettings(); showToast('Enter your OpenRouter API key first.'); return; }
  if (provider === 'gemini' && !geminiKey) { openSettings(); showToast('Enter your Gemini API key first.'); return; }

  const attachedImage = pendingImage;
  removeAttachedImage();

  // Build message content — multimodal if image attached
  let msgContent;
  if (attachedImage) {
    msgContent = [];
    msgContent.push({ type: 'image_url', image_url: { url: attachedImage } });
    if (text) msgContent.push({ type: 'text', text: text });
    else msgContent.push({ type: 'text', text: '(shared an image)' });
  } else {
    msgContent = text;
  }

  chat.messages.push({ role: 'user', content: msgContent, timestamp: Date.now() });
  saveChats(); insertMessageEl('user', text || '(shared an image)', false, attachedImage);
  userInput.value = ''; userInput.style.height = 'auto';
  scrollToBottom(); updateContextBar();

  isGenerating = true; sendBtn.disabled = true;
  activeAbortController = new AbortController();
  const cancelBtn = $('cancelBtn');
  if (cancelBtn) { cancelBtn.style.display = ''; sendBtn.style.display = 'none'; }
  if (chat.mode === 'room') drawMasSprite('think');
  typingIndicator.classList.add('visible'); scrollToBottom();

  let msgBubble = null;
  try {
    let fullText = '';
    let updatePending = false;

    await callProviderStreaming(chat, (chunk) => {
      if (!msgBubble) {
        typingIndicator.classList.remove('visible');
        const div = document.createElement('div');
        div.className = 'message monika';
        div.innerHTML = '<img class="msg-avatar" src="Monika PFP.png" alt="Monika"><div class="msg-content"><div class="msg-name">Monika</div><div class="msg-bubble"></div></div>';
        chatArea.insertBefore(div, typingIndicator);
        msgBubble = div.querySelector('.msg-bubble');
      }
      fullText += chunk;
      if (!updatePending) {
        updatePending = true;
        requestAnimationFrame(() => {
          const display = getStreamingDisplay(fullText);
          if (display === null) { updatePending = false; return; }
          if (msgBubble) msgBubble.innerHTML = renderMarkdown(display);
          scrollToBottom();
          updatePending = false;
        });
      }
    }, activeAbortController.signal);

    typingIndicator.classList.remove('visible');
    const rawReply = fullText.trim();
    const { mood, moodIntensity, drift, text: reply } = parseStateTags(rawReply, chat.mood || 'cheerful', chat.moodIntensity || 'moderate', chat.drift || 'casual');
    chat.mood = mood;
    chat.moodIntensity = moodIntensity;
    chat.drift = drift;
    chat.lastActiveTime = Date.now();
    chat.messages.push({ role: 'assistant', content: reply, timestamp: Date.now(), model: getCurrentModelKey() });
    saveChats();
    if (msgBubble) msgBubble.innerHTML = renderMarkdown(reply);

    // Append model attribution tag
    if (msgBubble) {
      const modelKey = getCurrentModelKey();
      if (modelKey) {
        const modelTag = document.createElement('div');
        modelTag.className = 'msg-model';
        modelTag.textContent = formatModelLabel(modelKey);
        const msgContent = msgBubble.closest('.msg-content');
        if (msgContent) msgContent.appendChild(modelTag);
      }
    }

    updateChatHeader(chat);
    scrollToBottom(); updateContextBar();

    // Room mode: update sprite expression asynchronously
    if (chat.mode === 'room') {
      updateRoomExpression(reply, mood, moodIntensity).then(expr => {
        chat.lastExpression = expr;
        saveChats();
      });
    }

    // Memory extraction — rate limited: every 5th user+assistant pair, skip short messages
    if (chat.mode !== 'story' && chat.messages.length % 10 === 0 && text.length >= 15) {
      extractMemories(text, reply).catch(() => {});
    }
  } catch (err) {
    typingIndicator.classList.remove('visible');
    // Handle user-initiated cancel (abort)
    if (err.name === 'AbortError') {
      if (msgBubble) {
        // Remove the partial message element
        const partialMsg = msgBubble.closest('.message');
        if (partialMsg) partialMsg.remove();
      }
      showToast('Generation cancelled.');
    } else {
      showToast(err.message || 'Something went wrong.');
    }
    if (chat.mode === 'room') drawMasSprite(chat.lastExpression || 'happy');
  } finally {
    isGenerating = false; sendBtn.disabled = false;
    activeAbortController = null;
    const cancelBtn = $('cancelBtn');
    if (cancelBtn) { cancelBtn.style.display = 'none'; sendBtn.style.display = ''; }
    userInput.focus();
  }
}

// ====== STORAGE ======
function saveChats() {
  const chat = getChat();
  if (chat) chat.lastModified = Date.now();
  localStorage.setItem(STORAGE.CHATS, JSON.stringify(chats));
  queueSync();
}
function saveChatsLocal() { localStorage.setItem(STORAGE.CHATS, JSON.stringify(chats)); }