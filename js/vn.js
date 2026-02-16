function updateAffinityPanel(affinity) {
  if (!affinity) return;
  for (const [girl, val] of Object.entries(affinity)) {
    const cap = girl.charAt(0).toUpperCase() + girl.slice(1);
    // Update VN side panel
    const vnFill = $('vnAffinity' + cap);
    const vnVal = $('vnAffinity' + cap + 'Val');
    if (vnFill) vnFill.style.width = val + '%';
    if (vnVal) vnVal.textContent = val;
  }
}

function hideAffinityPanel() { $('affinityPanel').classList.remove('visible'); }

// ====== VN PANEL ======
function updateVnDay(day) {
  const el = $('vnDayNumber');
  if (el) el.textContent = day;
}

function updatePhaseDisplay(chat) {
  if (!chat || !chat.storyPhase) return;
  const phase = STORY_PHASES[chat.storyPhase];
  if (!phase) return;
  const label = $('vnSceneLabel');
  if (label) label.textContent = phase.label;
  // Also update header
  updateChatHeader(chat);
}

function updateVnSprites(narrative) {
  const names = ['sayori', 'natsuki', 'yuri', 'monika'];
  const lower = narrative.toLowerCase();
  names.forEach(name => {
    const sprite = $('sprite' + name.charAt(0).toUpperCase() + name.slice(1));
    if (sprite) sprite.classList.toggle('active', lower.includes(name));
  });
}

function toggleVnPanel() {
  const panel = $('vnSidePanel');
  const backdrop = $('vnPanelBackdrop');
  const isOpen = panel.classList.contains('open');
  panel.classList.toggle('open', !isOpen);
  backdrop.classList.toggle('open', !isOpen);
}

function closeVnPanel() {
  $('vnSidePanel').classList.remove('open');
  $('vnPanelBackdrop').classList.remove('open');
}

function initVnTicks() {
  const girls = ['Sayori', 'Natsuki', 'Yuri', 'Monika'];
  const milestones = [25, 50, 75];
  girls.forEach(girl => {
    const container = $('vnTicks' + girl);
    if (!container) return;
    milestones.forEach(m => {
      const tick = document.createElement('div');
      tick.className = 'vn-affinity-tick';
      tick.style.left = m + '%';
      container.appendChild(tick);
      const label = document.createElement('div');
      label.className = 'vn-affinity-milestone';
      label.style.left = m + '%';
      label.textContent = m;
      container.appendChild(label);
    });
  });
}

// ====== ROUTE INDICATOR ======
function updateRouteIndicator(chat) {
  const el = $('routeIndicator');
  if (!el) return;

  if (!chat || chat.mode !== 'story') {
    el.style.display = 'none';
    return;
  }

  const day = chat.storyDay || 1;
  const aff = chat.storyAffinity || {};
  // Only show after Day 1
  if (day < 2) {
    el.style.display = 'none';
    return;
  }

  const girls = AFFINITY_GIRL_NAMES.map(g => ({ name: g, val: aff[g] || 0 })).sort((a, b) => b.val - a.val);
  const leader = girls[0];
  const second = girls[1];

  // Only show if leader has 5+ point lead
  if (leader.val - second.val < 5) {
    el.style.display = 'none';
    return;
  }

  const colors = { sayori: '#FF91A4', natsuki: '#FF69B4', yuri: '#9370DB', monika: '#3CB371' };
  const capName = leader.name.charAt(0).toUpperCase() + leader.name.slice(1);

  el.style.display = '';
  el.innerHTML = `<span class="route-dot" style="background:${colors[leader.name]};box-shadow:0 0 8px ${colors[leader.name]}"></span>${capName}'s Route`;
  el.style.borderColor = colors[leader.name] + '66';
}

// ====== JOURNAL SYSTEM ======
async function showEndOfDay(chat) {
  // Auto-save checkpoint before journal
  createCheckpoint(chat, true);
  const dayNum = chat.storyDay || 1;
  $('journalDayNum').textContent = dayNum;
  $('journalEntries').innerHTML = '<div style="text-align:center;color:rgba(255,255,255,0.4);padding:40px;font-style:italic;">The girls are writing in their diaries...</div>';
  $('journalOverlay').classList.add('open');
  try {
    const entries = await generateJournals(chat);
    renderJournalEntries(entries);
  } catch (err) {
    console.error('Journal generation failed:', err);
    $('journalEntries').innerHTML = '<div style="text-align:center;color:rgba(255,255,255,0.4);padding:40px;">Journal entries unavailable.</div>';
  }
}

async function generateJournals(chat) {
  const dayNum = chat.storyDay || 1;
  const mcName = chat.mcName || 'MC';
  const todayMsgs = chat.messages.slice(-20);
  const summary = todayMsgs.map(m => {
    if (m.role === 'assistant') return parseStoryResponse(m.content).narrative.slice(0, 400);
    return 'Player chose: ' + m.content.slice(0, 80);
  }).join('\n');
  const aff = chat.storyAffinity || {};
  const journalPrompt = `You are writing private diary/journal entries for each of the 4 Doki Doki Literature Club girls after Day ${dayNum} of the Literature Club.

Based on today's events, write each girl's HONEST private thoughts. These should be raw, personal, and unfiltered — showing how they truly feel about ${mcName} and the day's events. Feelings and attraction should be MORE APPARENT here than in their public behavior. A girl with low affinity may barely mention ${mcName}; a girl with high affinity may be thinking about him constantly.

IMPORTANT: Refer to the player ONLY as "${mcName}" — never "MC", never a shortened version of their name, always exactly "${mcName}".
Reference SPECIFIC events, conversations, and moments from the day — not vague generic feelings. What exactly happened that stuck with them?

Today's events:
${summary}

Current affinity levels (0-100): Sayori=${aff.sayori||15}, Natsuki=${aff.natsuki||1}, Yuri=${aff.yuri||1}, Monika=${aff.monika||10}

CHARACTER WRITING STYLES:
- Sayori: Casual, bubbly, uses "~" and "!!", emotionally honest but tries to stay positive
- Natsuki: Tsundere even in private — deflects feelings with "it's not like I care" but her real emotions slip through
- Yuri: Eloquent, introspective, uses metaphors, overthinks interactions
- Monika: Self-aware, perceptive, reflects on the day with clarity and warmth

Write in this EXACT format (4-6 sentences each):
[JOURNAL:Sayori]
(entry)
[JOURNAL:Natsuki]
(entry)
[JOURNAL:Yuri]
(entry)
[JOURNAL:Monika]
(entry)`;

  const msgs = [
    { role: 'system', content: journalPrompt },
    { role: 'user', content: 'Write the journal entries for today.' }
  ];
  const raw = await callAI(msgs, 1200);
  return parseJournals(raw);
}

function parseJournals(text) {
  const entries = {};
  const regex = /\[JOURNAL:(\w+)\]\s*([\s\S]*?)(?=\[JOURNAL:|\s*$)/gi;
  let match;
  while ((match = regex.exec(text)) !== null) {
    entries[match[1].toLowerCase()] = match[2].trim();
  }
  return entries;
}

function renderJournalEntries(entries) {
  const container = $('journalEntries');
  container.innerHTML = '';
  const order = ['sayori', 'monika', 'natsuki', 'yuri'];
  const names = { sayori: "Sayori's Diary", monika: "Monika's Journal", natsuki: "Natsuki's Notes", yuri: "Yuri's Diary" };
  const images = { sayori: 'Sayori PFP.png', monika: 'Monika PFP.png', natsuki: 'Natsuki PFP.png', yuri: 'Yuri PFP.png' };
  order.forEach(girl => {
    const text = entries[girl] || 'Nothing to write today...';
    const div = document.createElement('div');
    div.className = `journal-entry ${girl}`;
    div.innerHTML = `
      <div class="journal-entry-header">
        <img class="journal-portrait" src="${images[girl]}" alt="${girl}">
        <span class="journal-name">${names[girl]}</span>
      </div>
      <div class="journal-text">${escapeHtml(text)}</div>`;
    container.appendChild(div);
  });
}

function closeJournal() {
  $('journalOverlay').classList.remove('open');
  const chat = getChat();
  if (!chat) return;
  chat.storyDay = (chat.storyDay || 1) + 1;
  initPhaseForDay(chat);
  chat.lastChoices = null; // Clear stale choices from previous day
  // Push a user turn so the model has something to respond to on the new day
  chat.messages.push({ role: 'user', content: '[Continue]' });
  updateChatHeader(chat);
  updateVnDay(chat.storyDay);
  updatePhaseDisplay(chat);
  saveChats();
  generateStoryBeat(chat);
}