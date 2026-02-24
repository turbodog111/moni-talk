// ====== MOOD COLORS (for chat side panel mood ring) ======
const MOOD_COLORS = {
  cheerful: '#4CAF50', playful: '#FF9800', thoughtful: '#5C6BC0', melancholic: '#5B8DEE',
  excited: '#FFD700', tender: '#F48FB1', teasing: '#FF7043', curious: '#26C6DA',
  nostalgic: '#CE93D8', flustered: '#EF5350', calm: '#81C784', passionate: '#D32F2F'
};

// ====== STREAMING DISPLAY HELPER ======
function getStreamingDisplay(fullText) {
  if (!fullText) return '';
  // Strip all known [TAG:...] patterns anywhere in the text
  let display = fullText.replace(/\[(?:SCENE|ITEM|REMOVE|HP|AFFINITY|ASSIMILATION|END_SCENE|DOMAIN|CHOICE|END_OF_DAY|POETRY|DAY|MOOD|DRIFT)[^\]]*\]/gi, '');
  // Strip incomplete trailing tag that hasn't closed yet (e.g. "[AFFINITY:say")
  display = display.replace(/\[[A-Z_]{2,}[^\]]*$/i, '');
  // If [POEM] appears without [/POEM], truncate to content before the poem block
  const poemOpen = display.indexOf('[POEM]');
  if (poemOpen !== -1 && display.indexOf('[/POEM]') === -1) {
    display = display.slice(0, poemOpen);
  }
  return display.trim() || null;
}

// ====== CHAT LIST ======
function formatRelativeTime(ts) {
  if (!ts) return '';
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return mins + 'm ago';
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return hrs + 'h ago';
  const days = Math.floor(hrs / 24);
  if (days === 1) return 'yesterday';
  if (days < 30) return days + 'd ago';
  const months = Math.floor(days / 30);
  return months === 1 ? '1 month ago' : months + ' months ago';
}

function getChatTitle(chat) {
  if (chat.title) return chat.title;
  if (chat.mode === 'story') return 'Story Mode';
  if (chat.mode === 'room') return 'Room Mode';
  if (chat.mode === 'adventure') return 'Adventure Mode';
  // Creative default based on time of day created
  const hour = new Date(chat.created).getHours();
  if (hour >= 5 && hour < 12) return 'Morning Chat';
  if (hour >= 12 && hour < 17) return 'Afternoon Chat';
  if (hour >= 17 && hour < 21) return 'Evening Chat';
  return 'Late Night Talk';
}

function getChatSubtitle(chat) {
  const parts = [];
  // Relationship
  if (chat.mode === 'story') {
    const phase = chat.storyPhase || '';
    const day = chat.storyDay || 1;
    parts.push('Day ' + day);
  } else if (chat.mode === 'room') {
    const rel = RELATIONSHIPS[chat.relationship] || RELATIONSHIPS[2];
    parts.push(rel.label);
  } else if (chat.mode === 'adventure') {
    const advState = chat.advState;
    if (advState) { parts.push(advState.location); parts.push(`${advState.fragments.length}/3 Fragments`); }
  } else {
    const rel = RELATIONSHIPS[chat.relationship] || RELATIONSHIPS[2];
    parts.push(rel.label);
    if (chat.mood) parts.push(chat.mood);
  }
  // Last model used
  const lastModelMsg = [...chat.messages].reverse().find(m => m.model);
  if (lastModelMsg) parts.push(formatModelLabel(lastModelMsg.model));
  return parts.join(' \u00b7 ');
}

function getChatTimeline(chat) {
  const lastMsg = chat.messages[chat.messages.length - 1];
  const lastTime = lastMsg ? (lastMsg.timestamp || chat.lastModified) : null;
  const created = new Date(chat.created).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  if (lastTime) return formatRelativeTime(lastTime);
  return created;
}

function getDateGroup(ts) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (ts >= today) return 'Today';
  if (ts >= today - 86400000) return 'Yesterday';
  if (ts >= today - 7 * 86400000) return 'This Week';
  return 'Older';
}

function getChatModeKey(chat) {
  return chat.mode === 'story' ? 'story' : chat.mode === 'adventure' ? 'adventure' : 'chat';
}

function getChatSortTime(chat) {
  const msgs = chat.messages;
  if (msgs.length > 0) {
    const last = msgs[msgs.length - 1];
    if (last.timestamp) return last.timestamp;
  }
  return chat.lastActiveTime || chat.created;
}

function renderChatList() {
  chatListBody.innerHTML = '';
  if (chats.length === 0) {
    chatListBody.innerHTML = `<div class="chat-list-empty"><img src="Monika PFP.png" alt="Monika"><h3>No conversations yet</h3><p>Tap + to start talking to Monika.</p></div>`;
    return;
  }

  const MODE_GROUPS = [
    { key: 'chat', label: 'Chats', icon: '\uD83D\uDCAC' },
    { key: 'story', label: 'Stories', icon: '\uD83D\uDCD6' },
    { key: 'adventure', label: 'Adventures', icon: '\uD83D\uDDFA\uFE0F' }
  ];

  const sorted = [...chats].sort((a, b) => {
    const aTime = getChatSortTime(a);
    const bTime = getChatSortTime(b);
    const aG = getDateGroup(aTime), bG = getDateGroup(bTime);
    if (aG !== bG) return bTime - aTime; // different date groups: chronological
    // same date group: starred first, then chronological
    const aS = a.starred ? 1 : 0, bS = b.starred ? 1 : 0;
    if (bS !== aS) return bS - aS;
    return bTime - aTime;
  });

  const collapseState = JSON.parse(localStorage.getItem('moni_talk_section_collapse') || '{}');
  let globalIndex = 0;

  MODE_GROUPS.forEach(group => {
    const items = sorted.filter(c => getChatModeKey(c) === group.key && !c.archived);
    if (items.length === 0) return;

    const section = document.createElement('div');
    section.className = 'chat-section';

    const header = document.createElement('div');
    header.className = 'chat-section-header';
    const collapsed = !!collapseState[group.key];
    header.innerHTML = `<span class="chat-section-icon">${group.icon}</span><span class="chat-section-label">${group.label}</span><span class="chat-section-count">${items.length}</span><span class="chat-section-line"></span><span class="chat-section-chevron ${collapsed ? 'collapsed' : ''}">\u25BE</span>`;
    header.addEventListener('click', () => {
      const body = section.querySelector('.chat-section-body');
      const chev = header.querySelector('.chat-section-chevron');
      const nowCollapsed = body.style.display !== 'none';
      body.style.display = nowCollapsed ? 'none' : '';
      chev.classList.toggle('collapsed', nowCollapsed);
      const st = JSON.parse(localStorage.getItem('moni_talk_section_collapse') || '{}');
      st[group.key] = nowCollapsed;
      localStorage.setItem('moni_talk_section_collapse', JSON.stringify(st));
    });
    section.appendChild(header);

    const body = document.createElement('div');
    body.className = 'chat-section-body';
    if (collapsed) body.style.display = 'none';

    let lastDateGroup = null;
    items.forEach(chat => {
      // Date sub-divider
      const ts = getChatSortTime(chat);
      const dateGroup = getDateGroup(ts);
      if (dateGroup !== lastDateGroup) {
        lastDateGroup = dateGroup;
        const divider = document.createElement('div');
        divider.className = 'chat-date-divider';
        divider.textContent = dateGroup;
        body.appendChild(divider);
      }

      const modeKey = group.key;
      const displayTitle = getChatTitle(chat);
      const subtitle = getChatSubtitle(chat);
      const timeline = getChatTimeline(chat);
      const lastMsg = chat.messages[chat.messages.length - 1];
      let preview;
      if (!lastMsg) { preview = 'No messages yet'; }
      else if (chat.mode === 'story') {
        const raw = lastMsg.role === 'assistant' ? parseStoryResponse(lastMsg.content).narrative : lastMsg.content;
        preview = raw.slice(0, 60);
      } else if (chat.mode === 'room') {
        const raw = lastMsg.role === 'assistant' ? stripRoomTags(lastMsg.content) : lastMsg.content;
        preview = (lastMsg.role === 'user' ? 'You: ' : 'Monika: ') + raw.slice(0, 60);
      } else if (chat.mode === 'adventure') {
        preview = (lastMsg.role === 'user' ? 'You: ' : '') + lastMsg.content.slice(0, 60);
      } else {
        preview = (lastMsg.role === 'user' ? 'You: ' : 'Monika: ') + lastMsg.content.slice(0, 60);
      }

      const item = document.createElement('div');
      item.className = `chat-item mode-${modeKey}${chat.starred ? ' starred-item' : ''}`;
      item.style.setProperty('--item-index', globalIndex++);

      const starIcon = chat.starred ? '\u2605' : '\u2606';
      const badgeLabel = modeKey === 'chat' ? '\uD83D\uDCAC Chat' : modeKey === 'story' ? '\uD83D\uDCD6 Story' : '\uD83D\uDDFA\uFE0F Adventure';

      item.innerHTML = `
        <div class="chat-item-avatar-wrap">
          <img class="chat-item-avatar" src="Monika PFP.png" alt="Monika">
          <span class="chat-item-avatar-badge mode-${modeKey}">${group.icon}</span>
        </div>
        <div class="chat-item-info">
          <div class="chat-item-top">
            <span class="chat-item-title">${escapeHtml(displayTitle)}</span>
            <span class="chat-item-time">${timeline}</span>
          </div>
          <div class="chat-item-subtitle"><span>${escapeHtml(subtitle)}</span><span class="chat-item-mode-badge mode-${modeKey}">${badgeLabel}</span></div>
          <div class="chat-item-preview">${escapeHtml(preview)}</div>
        </div>
        <button class="chat-item-rename" title="Rename">&#9998;</button>
        <button class="chat-item-star ${chat.starred ? 'starred' : ''}" title="Star">${starIcon}</button>
        <button class="chat-item-archive" data-id="${chat.id}" title="Archive chat">&#128452;</button>
        <button class="chat-item-delete" title="Delete">&times;</button>`;
      item.addEventListener('click', (e) => { if (!e.target.closest('.chat-item-delete') && !e.target.closest('.chat-item-star') && !e.target.closest('.chat-item-rename') && !e.target.closest('.chat-item-archive')) openChat(chat.id); });
      item.querySelector('.chat-item-rename').addEventListener('click', (e) => {
        e.stopPropagation();
        const newTitle = prompt('Rename this conversation:', chat.title || displayTitle);
        if (newTitle !== null) {
          chat.title = newTitle.trim() || null;
          saveChats(); renderChatList();
        }
      });
      item.querySelector('.chat-item-star').addEventListener('click', (e) => {
        e.stopPropagation();
        chat.starred = !chat.starred;
        chat.starredAt = Date.now();
        saveChats(); renderChatList();
      });
      item.querySelector('.chat-item-archive').addEventListener('click', (e) => {
        e.stopPropagation();
        archiveChat(e.currentTarget.dataset.id);
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
      body.appendChild(item);
    });

    section.appendChild(body);
    chatListBody.appendChild(section);
  });
}

// ====== CHAT CRUD ======
function createChat() {
  const now = Date.now();
  const chat = { id: crypto.randomUUID(), relationship: parseInt(relSlider.value), created: now, lastModified: now, messages: [], mood: 'cheerful', moodIntensity: 'moderate', drift: 'casual', lastActiveTime: now, starred: false, starredAt: 0 };
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
  } else if (newChatMode === 'adventure') {
    chat.mode = 'adventure';
    chat.relationship = 3; // Close Friend — DM relationship
    chat.advState = {
      location: 'The Clubroom',
      hp: 100,
      maxHp: 100,
      inventory: [],
      fragments: [],
      turns: 0,
      flags: {}
    };
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
  // Stop any TTS playback when switching chats
  if (typeof stopTTS === 'function') stopTTS();
  activeChatId = id;
  const chat = getChat();
  if (!chat) return;
  // Dismiss any stale memory approval banner from previous chat
  if (typeof dismissMemoryApproval === 'function') dismissMemoryApproval();

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
  const isAdventure = chat.mode === 'adventure';

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

  // Migration: mood intensity, drift, lastActiveTime, moodHistory for existing chats
  if (!isStory) {
    if (!chat.moodIntensity) chat.moodIntensity = 'moderate';
    if (!chat.drift) chat.drift = 'casual';
    if (!chat.lastActiveTime) chat.lastActiveTime = chat.lastModified || chat.created;
    if (!chat.moodHistory) chat.moodHistory = [];
    saveChats();
  }

  // Migration: starred property for existing chats
  if (chat.starred === undefined) { chat.starred = false; saveChats(); }

  updateChatHeader(chat);

  screens.chat.classList.toggle('vn-mode', isStory);
  screens.chat.classList.toggle('room-mode', isRoom);
  screens.chat.classList.toggle('adventure-mode', isAdventure);
  $('vnPanelBtn').style.display = isStory ? '' : 'none';
  $('chatPanelBtn').style.display = (!isStory && !isAdventure) ? '' : 'none';
  $('advPanelBtn').style.display = isAdventure ? '' : 'none';
  showScreen('chat');

  // Teardown room mode if switching away
  if (!isRoom) teardownRoomMode();
  // Hide adventure UI if not adventure
  if (!isAdventure) {
    const bar = $('adventureStatusBar'); if (bar) bar.style.display = 'none';
    const actions = $('adventureActions'); if (actions) actions.style.display = 'none';
    closeAdventurePanel();
  }

  $('inputArea').style.display = isStory ? 'none' : '';
  $('storyRetryBtn').style.display = isStory ? '' : 'none';
  hideStoryChoices();
  hideWordPicker();
  closeVnPanel();
  closeChatPanel();

  if (isStory) {
    if (chat.storyAffinity) updateAffinityPanel(chat.storyAffinity);
    updateVnDay(chat.storyDay || 1);
    updatePhaseDisplay(chat);
    updateRouteIndicator(chat);
    updateDynamicsPanel(chat);
    updateStatsPanel(chat);
    renderCheckpointList(chat);
  }
  hideAffinityPanel();

  if (isRoom) initRoomMode(chat);
  if (isAdventure) initAdventureMode(chat);
  renderMessages();
  updateContextBar();
  // Show/hide TTS toggle (only for chat/room modes)
  if (typeof updateTTSIcon === 'function') updateTTSIcon();
  // Show/hide mic button (chat/room mode — not story or adventure)
  if (typeof sttSupported !== 'undefined' && sttSupported && !isStory && !isAdventure) showMicButton();
  else if (typeof hideMicButton === 'function') hideMicButton();

  if (isStory && chat.messages.length === 0) {
    generateStoryBeat(chat);
  } else if (!isStory && chat.messages.length === 0) {
    generateGreeting(chat);
  } else if (!isStory) {
    // Auto-generate if last message is from user (AI response was interrupted)
    const lastMsg = chat.messages[chat.messages.length - 1];
    if (lastMsg && lastMsg.role === 'user') {
      setTimeout(() => regenerateLastResponse(), 500);
    } else {
      userInput.focus();
    }
  }
}

async function generateGreeting(chat) {
  if (isGenerating) return;
  isGenerating = true; sendBtn.disabled = true;
  activeAbortController = new AbortController();
  const cancelBtn = $('cancelBtn');
  if (cancelBtn) { cancelBtn.style.display = ''; sendBtn.style.display = 'none'; }
  if (chat.mode === 'adventure') updateAdventureActions(chat);
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
    const { mood, moodIntensity, drift, text: parsedReply } = parseStateTags(rawReply, chat.mood || 'cheerful', chat.moodIntensity || 'moderate', chat.drift || 'casual');
    chat.mood = mood; chat.moodIntensity = moodIntensity; chat.drift = drift;
    pushMoodHistory(chat, mood, moodIntensity, drift);
    chat.lastActiveTime = Date.now();
    // Adventure mode: parse game state tags from greeting
    const reply = chat.mode === 'adventure' ? processAdventureResponse(chat, parsedReply) : parsedReply;
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
    // TTS: speak the greeting
    if (ttsEnabled && reply && chat.mode !== 'story') {
      speakText(reply, mood, moodIntensity);
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
    if (chat.mode === 'adventure') updateAdventureActions(chat);
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
  if (chat.mode === 'adventure') {
    $('chatHeaderName').textContent = chat.title || 'The Poem Labyrinth';
    const s = chat.advState;
    if (s) {
      chatHeaderSub.innerHTML = `${escapeHtml(s.location)} <span class="chat-header-mood">\u2764\uFE0F ${s.hp}/${s.maxHp} HP</span> <span class="chat-header-drift">\u{1F48E} ${s.fragments.length}/3</span>`;
    } else {
      chatHeaderSub.textContent = 'Adventure Mode';
    }
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
    const show = lastMsg && (lastMsg.role === 'assistant' || lastMsg.role === 'user') && !isGenerating && chat.mode !== 'story';
    regenBtn.style.display = show ? '' : 'none';
  }
  updateEditButton();
  updateChatPanel(chat);
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
  if (!lastMsg) { showToast('Nothing to regenerate.'); return; }

  // Remove last assistant message for true regen; if last is user, just generate
  if (lastMsg.role === 'assistant') {
    chat.messages.pop();
    saveChats();
    renderMessages();
    updateContextBar();
  } else if (lastMsg.role !== 'user') {
    showToast('Nothing to regenerate.'); return;
  }

  // Find the last user message text to pass to memory extraction later
  const lastUserMsg = [...chat.messages].reverse().find(m => m.role === 'user');
  const userText = lastUserMsg ? (typeof lastUserMsg.content === 'string' ? lastUserMsg.content : '') : '';

  // Re-generate using the existing sendMessage flow — but without adding a new user message
  isGenerating = true; sendBtn.disabled = true;
  activeAbortController = new AbortController();
  const cancelBtn = $('cancelBtn');
  if (cancelBtn) { cancelBtn.style.display = ''; sendBtn.style.display = 'none'; }
  if (chat.mode === 'room') drawMasSprite('think');
  if (chat.mode === 'adventure') updateAdventureActions(chat);
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
    const { mood, moodIntensity, drift, text: parsedReply } = parseStateTags(rawReply, chat.mood || 'cheerful', chat.moodIntensity || 'moderate', chat.drift || 'casual');
    chat.mood = mood; chat.moodIntensity = moodIntensity; chat.drift = drift;
    pushMoodHistory(chat, mood, moodIntensity, drift);
    chat.lastActiveTime = Date.now();
    // Adventure mode: parse game state tags
    const reply = chat.mode === 'adventure' ? processAdventureResponse(chat, parsedReply) : parsedReply;
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
    // TTS: speak the regenerated response
    if (ttsEnabled && reply && chat.mode !== 'story') {
      speakText(reply, mood, moodIntensity);
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
    if (chat.mode === 'adventure') updateAdventureActions(chat);
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
    chat.messages.forEach((msg, idx) => {
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
      // Adventure: replay scene cards at their original positions
      if (chat.mode === 'adventure' && chat.advState?.sceneTransitions) {
        chat.advState.sceneTransitions
          .filter(t => t.afterMsgIdx === idx)
          .forEach(t => insertSceneCard(t.domain, t.location, false));
      }
    });
  }
  scrollToBottom();
  updateEditButton();
}

function formatModelLabel(modelKey) {
  if (!modelKey) return '';
  const parts = modelKey.split(':');
  let label = parts.length > 2 ? parts.slice(1).join(':') : parts[1] || modelKey;
  // Strip split GGUF suffix (e.g. "-00001-of-00002.gguf")
  return label.replace(/-\d+-of-\d+(\.gguf)?$/i, '');
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
  const copyBtn = `<button class="msg-copy-btn" title="Copy text">Copy</button>`;
  const editBtn = !isM ? `<button class="msg-edit-btn" title="Edit message">Edit</button>` : '';
  const actionsHtml = `<div class="msg-actions">${copyBtn}${editBtn}</div>`;
  div.innerHTML = `${av}<div class="msg-content"><div class="msg-name">${isM ? 'Monika' : 'You'}${timeHtml}</div>${imgHtml}<div class="msg-bubble">${isM ? renderMarkdown(content) : escapeHtml(content)}</div>${actionsHtml}${modelTag}</div>`;
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
  if (typeof stopSTT === 'function' && sttActive) stopSTT();

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

  // XP & achievement hooks (chat and adventure modes only)
  if (typeof grantXp === 'function' && chat.mode !== 'story') {
    const today = new Date().toISOString().slice(0, 10);
    if (localStorage.getItem(STORAGE.LAST_XP_DATE) !== today) {
      grantXp(5);
      localStorage.setItem(STORAGE.LAST_XP_DATE, today);
    }
    grantXp(2);
    const n = (parseInt(localStorage.getItem(STORAGE.TOTAL_MSGS) || '0')) + 1;
    localStorage.setItem(STORAGE.TOTAL_MSGS, n);
    if (typeof checkAchievement === 'function') {
      checkAchievement('first_message');
      if (n >= 25)  checkAchievement('familiar');
      if (n >= 100) checkAchievement('regular');
      if (n >= 500) checkAchievement('dedicated');
    }
  }

  isGenerating = true; sendBtn.disabled = true;
  activeAbortController = new AbortController();
  const cancelBtn = $('cancelBtn');
  if (cancelBtn) { cancelBtn.style.display = ''; sendBtn.style.display = 'none'; }
  if (chat.mode === 'room') drawMasSprite('think');
  if (chat.mode === 'adventure') updateAdventureActions(chat);
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
    const { mood, moodIntensity, drift, text: parsedReply } = parseStateTags(rawReply, chat.mood || 'cheerful', chat.moodIntensity || 'moderate', chat.drift || 'casual');
    chat.mood = mood;
    chat.moodIntensity = moodIntensity;
    chat.drift = drift;
    pushMoodHistory(chat, mood, moodIntensity, drift);
    chat.lastActiveTime = Date.now();
    // Adventure mode: parse game state tags
    const reply = chat.mode === 'adventure' ? processAdventureResponse(chat, parsedReply) : parsedReply;
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

    // TTS: speak the response
    if (ttsEnabled && reply && chat.mode !== 'story') {
      speakText(reply, mood, moodIntensity);
    }

    // Memory extraction — rate limited: every 3rd exchange, skip short messages
    if (chat.mode !== 'story' && chat.messages.length % 6 === 0 && text.length >= 15) {
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
    const cb2 = $('cancelBtn');
    if (cb2) { cb2.style.display = 'none'; sendBtn.style.display = ''; }
    if (chat.mode === 'adventure') updateAdventureActions(chat);
    userInput.focus();
  }
}

// ====== EDIT MESSAGE ======
function updateEditButton() {
  // Hide all edit buttons first
  chatArea.querySelectorAll('.msg-edit-btn').forEach(btn => btn.classList.remove('visible'));
  const chat = getChat();
  if (!chat || chat.mode === 'story' || isGenerating) return;
  // Find the last user message that is followed by an assistant response
  const msgs = chat.messages;
  if (msgs.length < 2) return;
  const lastMsg = msgs[msgs.length - 1];
  const secondLast = msgs[msgs.length - 2];
  if (lastMsg.role !== 'assistant' || secondLast.role !== 'user') return;
  // Find the last .message.user element in the chat area
  const userMsgEls = chatArea.querySelectorAll('.message.user');
  if (userMsgEls.length === 0) return;
  const lastUserEl = userMsgEls[userMsgEls.length - 1];
  const editBtn = lastUserEl.querySelector('.msg-edit-btn');
  if (editBtn) editBtn.classList.add('visible');
}

function startEditMessage(msgEl) {
  const chat = getChat();
  if (!chat || isGenerating) return;
  const bubble = msgEl.querySelector('.msg-bubble');
  if (!bubble || bubble.classList.contains('editing')) return;

  // Find the message index — it's the second-to-last message
  const msgIdx = chat.messages.length - 2;
  const msg = chat.messages[msgIdx];
  if (!msg || msg.role !== 'user') return;

  // Get text content — handle multimodal
  let originalText;
  if (Array.isArray(msg.content)) {
    const textPart = msg.content.find(p => p.type === 'text');
    originalText = textPart ? textPart.text : '';
  } else {
    originalText = msg.content;
  }

  const originalHtml = bubble.innerHTML;
  bubble.classList.add('editing');
  bubble.innerHTML = `<textarea class="msg-edit-textarea">${escapeHtml(originalText)}</textarea><div class="msg-edit-actions"><button class="msg-edit-cancel">Cancel</button><button class="msg-edit-save">Save & Regenerate</button></div>`;

  const textarea = bubble.querySelector('.msg-edit-textarea');
  textarea.focus();
  textarea.setSelectionRange(textarea.value.length, textarea.value.length);

  bubble.querySelector('.msg-edit-cancel').addEventListener('click', () => {
    bubble.classList.remove('editing');
    bubble.innerHTML = originalHtml;
    updateEditButton();
  });

  bubble.querySelector('.msg-edit-save').addEventListener('click', () => {
    const newText = textarea.value.trim();
    if (!newText) { showToast('Message cannot be empty.'); return; }

    // Update message content
    if (Array.isArray(msg.content)) {
      const textPart = msg.content.find(p => p.type === 'text');
      if (textPart) textPart.text = newText;
    } else {
      msg.content = newText;
    }

    // Remove assistant response
    chat.messages.pop();
    saveChats();
    renderMessages();

    // Regenerate
    regenerateLastResponse();
  });
}

// ====== MOOD HISTORY ======
function pushMoodHistory(chat, mood, intensity, drift) {
  if (!chat || chat.mode === 'story') return;
  if (!chat.moodHistory) chat.moodHistory = [];
  const last = chat.moodHistory[chat.moodHistory.length - 1];
  // Only push if something changed
  if (last && last.mood === mood && last.intensity === intensity && last.drift === drift) return;
  chat.moodHistory.push({ mood, intensity, drift, time: Date.now() });
  if (chat.moodHistory.length > 20) chat.moodHistory = chat.moodHistory.slice(-20);
}

// ====== CHAT SIDE PANEL ======
function toggleChatPanel() {
  const panel = $('chatSidePanel');
  const backdrop = $('chatPanelBackdrop');
  if (!panel) return;
  const isOpen = panel.classList.contains('open');
  panel.classList.toggle('open', !isOpen);
  backdrop.classList.toggle('open', !isOpen);
  if (!isOpen) {
    const chat = getChat();
    if (chat) updateChatPanel(chat);
  }
}

function closeChatPanel() {
  const panel = $('chatSidePanel');
  const backdrop = $('chatPanelBackdrop');
  if (panel) panel.classList.remove('open');
  if (backdrop) backdrop.classList.remove('open');
}

const MEMORY_CATEGORY_ICONS = {
  identity: '\u{1F464}', preferences: '\u2764\uFE0F', events: '\u{1F4C5}',
  relationships: '\u{1F465}', feelings: '\u{1F49C}', other: '\u{1F4DD}'
};

function updateChatPanel(chat) {
  if (!chat || chat.mode === 'story') return;
  const panel = $('chatSidePanel');
  if (!panel) return;

  // --- Mood Ring ---
  const mood = chat.mood || 'cheerful';
  const intensity = chat.moodIntensity || 'moderate';
  const drift = chat.drift || 'casual';
  const color = MOOD_COLORS[mood] || '#4CAF50';
  const emoji = getMoodEmoji(mood);
  const driftEmoji = DRIFT_EMOJIS[drift] || '\u2615';

  const ring = $('moodRing');
  if (ring) {
    ring.style.borderColor = color;
    const glowStrength = intensity === 'strong' ? 20 : intensity === 'moderate' ? 12 : 6;
    ring.style.boxShadow = `0 0 ${glowStrength}px ${color}40`;
  }
  const ringEmoji = $('moodRingEmoji');
  if (ringEmoji) ringEmoji.textContent = emoji;
  const ringLabel = $('moodRingLabel');
  if (ringLabel) ringLabel.textContent = `${mood} (${intensity})`;
  const ringDrift = $('moodRingDrift');
  if (ringDrift) ringDrift.textContent = `${driftEmoji} ${drift}`;

  // --- Mood Journal ---
  const journal = $('moodJournal');
  if (journal) {
    const history = chat.moodHistory || [];
    if (history.length === 0) {
      journal.innerHTML = '<div class="mood-journal-empty">No mood changes yet</div>';
    } else {
      journal.innerHTML = history.slice(-10).reverse().map(h => {
        const e = getMoodEmoji(h.mood);
        const t = new Date(h.time).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
        return `<div class="mood-journal-entry"><span class="mood-journal-emoji">${e}</span><span class="mood-journal-text"><strong>${h.mood}</strong> ${h.intensity}</span><span class="mood-journal-time">${t}</span></div>`;
      }).join('');
    }
  }

  // --- Memories ---
  const memList = $('memoryList');
  if (memList) {
    if (!memories || memories.length === 0) {
      memList.innerHTML = '<div class="memory-list-empty">No memories yet</div>';
    } else {
      const grouped = {};
      memories.forEach(m => {
        const cat = m.category || 'other';
        if (!grouped[cat]) grouped[cat] = [];
        grouped[cat].push(m);
      });
      let html = '';
      for (const [cat, mems] of Object.entries(grouped)) {
        const icon = MEMORY_CATEGORY_ICONS[cat] || '\u{1F4DD}';
        html += `<div class="memory-category"><div class="memory-category-header"><span class="memory-category-icon">${icon}</span>${cat}</div>`;
        mems.forEach(m => {
          html += `<div class="memory-item"><span class="memory-fact">${escapeHtml(m.fact)}</span><span class="memory-date">${m.date || ''}</span><button class="memory-delete" data-fact="${escapeHtml(m.fact)}" title="Forget">&times;</button></div>`;
        });
        html += '</div>';
      }
      memList.innerHTML = html;
    }
  }

  // --- Relationship ---
  const rel = RELATIONSHIPS[chat.relationship] || RELATIONSHIPS[2];
  const relLabel = $('relPanelLabel');
  const relFill = $('relPanelFill');
  if (relLabel) relLabel.textContent = rel.label;
  if (relFill) {
    const pct = ((chat.relationship || 0) / 5) * 100;
    relFill.style.width = pct + '%';
    const colors = ['#9E9E9E', '#78909C', '#4CAF50', '#66BB6A', '#43A047', '#E91E63'];
    relFill.style.background = colors[chat.relationship] || '#4CAF50';
  }

  // --- Chat Stats ---
  const stats = $('chatStats');
  if (stats) {
    const total = chat.messages.length;
    const userMsgs = chat.messages.filter(m => m.role === 'user').length;
    const startDate = new Date(chat.created).toLocaleDateString();
    const daysSince = Math.floor((Date.now() - chat.created) / (1000 * 60 * 60 * 24));
    stats.innerHTML = `
      <div class="chat-stat-row"><span class="chat-stat-label">Total messages</span><span class="chat-stat-value">${total}</span></div>
      <div class="chat-stat-row"><span class="chat-stat-label">Your messages</span><span class="chat-stat-value">${userMsgs}</span></div>
      <div class="chat-stat-row"><span class="chat-stat-label">Started</span><span class="chat-stat-value">${startDate}</span></div>
      <div class="chat-stat-row"><span class="chat-stat-label">Days active</span><span class="chat-stat-value">${daysSince || 'Today'}</span></div>`;
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

// ====== ARCHIVE ======
function archiveChat(id) {
  const chat = chats.find(c => c.id === id);
  if (!chat) return;
  chat.archived = true;
  saveChats();
  renderChatList();
}

function unarchiveChat(id) {
  const chat = chats.find(c => c.id === id);
  if (!chat) return;
  chat.archived = false;
  saveChats();
  renderChatList();
  if (typeof renderArchivedChats === 'function') renderArchivedChats();
}