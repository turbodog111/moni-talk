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
          <span class="chat-item-rel">${rel.label} Monika${moodText}</span>
          <span class="chat-item-date">${new Date(chat.created).toLocaleDateString()}</span>
        </div>
        <div class="chat-item-preview">${escapeHtml(preview)}</div>
      </div>
      <button class="chat-item-star ${chat.starred ? 'starred' : ''}" title="Star">${starIcon}</button>
      <button class="chat-item-delete" title="Delete">&times;</button>`;
    item.addEventListener('click', (e) => { if (!e.target.closest('.chat-item-delete') && !e.target.closest('.chat-item-star')) openChat(chat.id); });
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
  isGenerating = false;
  activeChatId = id;
  const chat = getChat();
  if (!chat) return;

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
    renderCheckpointList(chat);
  }
  hideAffinityPanel();

  if (isRoom) initRoomMode(chat);
  renderMessages();
  updateContextBar();

  if (isStory && chat.messages.length === 0) {
    generateStoryBeat(chat);
  } else if (!isStory) {
    userInput.focus();
  }
}

function getChat() { return chats.find(c => c.id === activeChatId) || null; }

function updateChatHeader(chat) {
  if (chat.mode === 'story') {
    $('chatHeaderName').textContent = 'Literature Club';
    const phase = STORY_PHASES[chat.storyPhase];
    const phaseLabel = phase ? ` \u2014 ${phase.label}` : '';
    chatHeaderSub.textContent = `Day ${chat.storyDay || 1}${phaseLabel}`;
    return;
  }
  if (chat.mode === 'room') {
    $('chatHeaderName').textContent = 'Monika';
    const rel = RELATIONSHIPS[chat.relationship] || RELATIONSHIPS[2];
    const moodEmoji = getMoodEmoji(chat.mood || 'cheerful');
    const drift = chat.drift || 'casual';
    const driftEmoji = DRIFT_EMOJIS[drift] || '\u2615';
    chatHeaderSub.innerHTML = `${rel.label} <span class="chat-header-mood">${moodEmoji} ${chat.mood || 'cheerful'}</span> <span class="chat-header-drift">${driftEmoji} ${drift}</span>`;
    return;
  }
  $('chatHeaderName').textContent = 'Monika';
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
}

function trimContext() {
  const chat = getChat();
  if (!chat || chat.messages.length <= 10) { showToast('Not enough messages to trim.'); return; }
  const removeCount = Math.floor(chat.messages.length * 0.4);
  if (!confirm(`Remove the ${removeCount} oldest messages to free up context? The conversation will continue naturally.`)) return;
  chat.messages = chat.messages.slice(removeCount);
  saveChats(); renderMessages(); updateContextBar();
  showToast(`Trimmed ${removeCount} messages.`, 'success');
}

// ====== RENDER MESSAGES ======
function renderMessages() {
  chatArea.querySelectorAll('.message, .story-choices-inline').forEach(el => el.remove());
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
        insertStoryNarrative(parsed.narrative, false);
      } else {
        // Hide [Continue] system messages from display
        if (msg.content === '[Continue]') return;
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
      const isWrapPhase = chat.storyPhase === 'wrap_up' || chat.storyPhase === 'd1_wrap_up';
      const curPhase = STORY_PHASES[chat.storyPhase];
      // Phase-aware: only honor END_OF_DAY in wrap phases, POETRY in poem_sharing
      if (parsed.isEndOfDay && isWrapPhase) {
        renderStoryChoices(['Begin next day']);
      } else if (parsed.hasPoetry && curPhase && curPhase.triggerPoetry) {
        showWordPicker();
      } else if (chat.storyBeatInPhase === 0 && chat.messages.length > 1) {
        renderStoryChoices(['Continue']);
      } else {
        const phase = STORY_PHASES[chat.storyPhase];
        if (phase && phase.noChoices) {
          renderStoryChoices(['Continue']);
        } else if (chat.lastChoices && chat.lastChoices.length >= 2) {
          renderStoryChoices(chat.lastChoices);
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
    chat.messages.forEach(msg => {
      let content = msg.content;
      // Strip legacy expression tags from old room mode messages
      if (chat.mode === 'room' && msg.role === 'assistant') content = stripRoomTags(content);
      insertMessageEl(msg.role, content, false);
    });
  }
  scrollToBottom();
}

function insertMessageEl(role, content, animate = true) {
  const isM = role === 'assistant';
  const div = document.createElement('div');
  div.className = `message ${isM ? 'monika' : 'user'}`;
  if (!animate) div.style.animation = 'none';
  const av = isM ? `<img class="msg-avatar" src="Monika PFP.png" alt="Monika">` : `<div class="msg-avatar-letter">Y</div>`;
  div.innerHTML = `${av}<div class="msg-content"><div class="msg-name">${isM ? 'Monika' : 'You'}</div><div class="msg-bubble">${isM ? renderMarkdown(content) : escapeHtml(content)}</div></div>`;
  chatArea.insertBefore(div, typingIndicator);
}

function scrollToBottom() { requestAnimationFrame(() => { chatArea.scrollTop = chatArea.scrollHeight; }); }

// ====== SEND ======
async function sendMessage() {
  const chat = getChat();
  const text = userInput.value.trim();
  if (!text || isGenerating) return;
  if (!chat) return;
  if (provider === 'openrouter' && !apiKey) { openSettings(); showToast('Enter your OpenRouter API key first.'); return; }
  if (provider === 'gemini' && !geminiKey) { openSettings(); showToast('Enter your Gemini API key first.'); return; }

  chat.messages.push({ role: 'user', content: text });
  saveChats(); insertMessageEl('user', text);
  userInput.value = ''; userInput.style.height = 'auto';
  scrollToBottom(); updateContextBar();

  isGenerating = true; sendBtn.disabled = true;
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
          const display = fullText.replace(/^\[MOOD:\s*\w+(?::\s*\w+)?\]\s*(?:\[DRIFT:\s*\w+\]\s*)?/i, '');
          if (msgBubble) msgBubble.innerHTML = renderMarkdown(display);
          scrollToBottom();
          updatePending = false;
        });
      }
    });

    typingIndicator.classList.remove('visible');
    const rawReply = fullText.trim();
    const { mood, moodIntensity, drift, text: reply } = parseStateTags(rawReply, chat.mood || 'cheerful', chat.moodIntensity || 'moderate', chat.drift || 'casual');
    chat.mood = mood;
    chat.moodIntensity = moodIntensity;
    chat.drift = drift;
    chat.lastActiveTime = Date.now();
    chat.messages.push({ role: 'assistant', content: reply });
    saveChats();
    if (msgBubble) msgBubble.innerHTML = renderMarkdown(reply);
    updateChatHeader(chat);
    scrollToBottom(); updateContextBar();

    // Room mode: update sprite expression asynchronously
    if (chat.mode === 'room') {
      updateRoomExpression(reply, mood, moodIntensity).then(expr => {
        chat.lastExpression = expr;
        saveChats();
      });
    }
  } catch (err) {
    typingIndicator.classList.remove('visible');
    showToast(err.message || 'Something went wrong.');
    if (chat.mode === 'room') drawMasSprite(chat.lastExpression || 'happy');
  } finally {
    isGenerating = false; sendBtn.disabled = false; userInput.focus();
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