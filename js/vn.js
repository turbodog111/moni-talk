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
  const labelEl = $('vnDayLabel');
  if (labelEl) {
    const event = STORY_EVENTS[day];
    labelEl.textContent = event ? event.name : 'School Day';
  }
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

// Build a summary of today's key choices before advancing the day
function buildYesterdaySummary(chat) {
  const day = chat.storyDay || 1;
  const aff = chat.storyAffinity || {};
  let freeTimeWith = null;
  let walkHomeWith = null;

  // Scan messages backwards until we hit a previous DAY_BREAK marker
  for (let i = chat.messages.length - 1; i >= 0; i--) {
    const m = chat.messages[i];
    if (m.role === 'user' && typeof m.content === 'string') {
      if (/^\[DAY_BREAK:/.test(m.content)) break; // hit previous day boundary
      if (!freeTimeWith) {
        const ft = m.content.match(/^Spend time with (\w+)/i);
        if (ft) freeTimeWith = ft[1];
      }
      if (!walkHomeWith) {
        const wh = m.content.match(/^Walk home with (\w+)/i);
        if (wh) walkHomeWith = wh[1];
      }
    }
  }

  return {
    day: day,
    freeTimeWith: freeTimeWith || null,
    walkHomeWith: walkHomeWith || null,
    affinitySnapshot: { ...aff }
  };
}

function closeJournal() {
  $('journalOverlay').classList.remove('open');
  const chat = getChat();
  if (!chat) return;
  chat.storyYesterday = buildYesterdaySummary(chat);
  chat.storyDay = (chat.storyDay || 1) + 1;
  initPhaseForDay(chat);
  chat.lastChoices = null; // Clear stale choices from previous day
  // Show event toast if this day has a special event
  const event = STORY_EVENTS[chat.storyDay];
  if (event) showToast(event.toast, 'success');
  // Build yesterday hint for the day-break message
  const y = chat.storyYesterday;
  let yesterdayHint = '';
  if (y) {
    const parts = [];
    if (y.freeTimeWith) parts.push(`spent free time with ${y.freeTimeWith}`);
    if (y.walkHomeWith) parts.push(`walked home with ${y.walkHomeWith}`);
    if (parts.length) yesterdayHint = ` Yesterday, MC ${parts.join(' and ')}.`;
  }
  // Push a clear day-break message so the model knows a new day has started
  chat.messages.push({ role: 'user', content: `[DAY_BREAK:${chat.storyDay}] A new day begins. It is now Day ${chat.storyDay}. The previous day is over — start a fresh morning scene.${yesterdayHint}` });
  updateChatHeader(chat);
  updateVnDay(chat.storyDay);
  updatePhaseDisplay(chat);
  updateDynamicsPanel(chat);
  updateStatsPanel(chat);
  saveChats();
  generateStoryBeat(chat);
}

// ====== STATS PANEL ======
function updateStatsPanel(chat) {
  const section = $('statsSection');
  const list = $('vnStatsList');
  if (!section || !list) return;

  if (!chat || chat.mode !== 'story') {
    section.style.display = 'none';
    return;
  }

  const stats = computeStoryStats(chat);
  section.style.display = '';

  const capName = n => n.charAt(0).toUpperCase() + n.slice(1);
  const girls = ['sayori', 'natsuki', 'yuri', 'monika'];
  const colors = { sayori: '#FF91A4', natsuki: '#FF69B4', yuri: '#9370DB', monika: '#3CB371' };

  // Total time spent for bar scaling
  const totalFT = girls.reduce((s, g) => s + stats.freeTime[g], 0) || 1;
  const totalWH = girls.reduce((s, g) => s + stats.walkHome[g], 0) || 1;

  let html = `
    <div class="vn-stat-row"><span class="vn-stat-label">Days</span><span class="vn-stat-value">${stats.days}</span></div>
    <div class="vn-stat-row"><span class="vn-stat-label">Poems</span><span class="vn-stat-value">${stats.poems}</span></div>
    <div class="vn-stat-row"><span class="vn-stat-label">Milestones</span><span class="vn-stat-value">${stats.milestones}</span></div>`;

  // Free time breakdown
  if (totalFT > 0) {
    html += '<div class="vn-stat-section">Free Time With</div>';
    girls.forEach(g => {
      const count = stats.freeTime[g];
      if (count > 0) {
        const pct = Math.round((count / totalFT) * 100);
        html += `<div class="vn-stat-bar-row"><span class="vn-stat-bar-label">${capName(g)}</span><div class="vn-stat-bar-track"><div class="vn-stat-bar-fill" style="width:${pct}%;background:${colors[g]}"></div></div><span class="vn-stat-bar-count">${count}</span></div>`;
      }
    });
  }

  // Walk home breakdown
  if (totalWH > 0) {
    html += '<div class="vn-stat-section">Walked Home With</div>';
    girls.forEach(g => {
      const count = stats.walkHome[g];
      if (count > 0) {
        const pct = Math.round((count / totalWH) * 100);
        html += `<div class="vn-stat-bar-row"><span class="vn-stat-bar-label">${capName(g)}</span><div class="vn-stat-bar-track"><div class="vn-stat-bar-fill" style="width:${pct}%;background:${colors[g]}"></div></div><span class="vn-stat-bar-count">${count}</span></div>`;
      }
    });
  }

  list.innerHTML = html;
}

// ====== DYNAMICS PANEL ======
function updateDynamicsPanel(chat) {
  const section = $('dynamicsSection');
  const list = $('vnDynamicsList');
  if (!section || !list) return;

  if (!chat || chat.mode !== 'story') {
    section.style.display = 'none';
    return;
  }

  const day = chat.storyDay || 1;
  const aff = chat.storyAffinity || {};
  const y = chat.storyYesterday;
  const snap = y ? y.affinitySnapshot : null;

  // Hide before Day 2
  if (day < 2) {
    section.style.display = 'none';
    return;
  }

  const colors = { sayori: '#FF91A4', natsuki: '#FF69B4', yuri: '#9370DB', monika: '#3CB371' };
  const capName = n => n.charAt(0).toUpperCase() + n.slice(1);
  const items = [];

  const sorted = AFFINITY_GIRL_NAMES
    .map(g => ({ name: capName(g), key: g, val: aff[g] || 0 }))
    .sort((a, b) => b.val - a.val);
  const leader = sorted[0];
  const second = sorted[1];

  // Active Rivalry
  if (leader.val >= 25 && second.val >= 25 && leader.val - second.val <= 8) {
    items.push({
      icon: '\u2694\uFE0F',
      text: `${leader.name} & ${second.name} — Competing for MC's attention`,
      gradient: `linear-gradient(90deg, ${colors[leader.key]}33, ${colors[second.key]}33)`,
      border: colors[leader.key]
    });
  }

  // Jealousy
  if (snap) {
    for (const e of sorted) {
      if (e.val < 40) break;
      for (const other of sorted) {
        if (other.key === e.key) continue;
        const prevVal = snap[other.key] || 0;
        if (other.val - prevVal >= 5 && other.val >= 16) {
          items.push({
            icon: '\uD83D\uDC40',
            text: `${e.name} notices MC getting closer to ${other.name}`,
            gradient: `linear-gradient(90deg, ${colors[e.key]}33, ${colors[other.key]}22)`,
            border: colors[e.key]
          });
          break;
        }
      }
      break;
    }
  }

  // Tier labels for girls >= 16
  function tierDesc(val) {
    if (val >= 76) return 'Deep feelings for MC';
    if (val >= 51) return 'Romantic feelings for MC';
    if (val >= 31) return 'Close friends with MC';
    if (val >= 16) return 'Warming up to MC';
    return null;
  }

  for (const e of sorted) {
    const desc = tierDesc(e.val);
    if (!desc) continue;
    const icon = e.val >= 51 ? '\u2764\uFE0F' : e.val >= 31 ? '\uD83D\uDC9B' : '\u2728';
    items.push({
      icon: icon,
      text: `${e.name} — ${desc}`,
      gradient: `linear-gradient(90deg, ${colors[e.key]}22, transparent)`,
      border: colors[e.key]
    });
  }

  if (items.length === 0) {
    section.style.display = 'none';
    return;
  }

  section.style.display = '';
  list.innerHTML = items.map(item =>
    `<div class="vn-dynamics-item" style="border-left-color:${item.border};background:${item.gradient};">` +
    `<span class="vn-dynamics-icon">${item.icon}</span> ${item.text}</div>`
  ).join('');
}