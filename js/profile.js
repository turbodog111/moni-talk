// ====== PROFILE DASHBOARD ======

function loadProfile() {
  $('profileName').value = profile.name || '';
  $('profileAbout').value = profile.about || '';
  $('profileInterests').value = profile.interests || '';
  $('profileValues').value = profile.values || '';

  // Hero name
  const heroName = $('profileHeroName');
  if (heroName) heroName.textContent = profile.name || 'Your Profile';

  renderSpecialDates();
  renderProfileMemories();
  renderProfileStats();
}

function saveProfile() {
  profile = {
    ...profile,
    name: $('profileName').value.trim(),
    about: $('profileAbout').value.trim(),
    interests: $('profileInterests').value.trim(),
    values: $('profileValues').value.trim(),
    lastModified: Date.now()
  };
  localStorage.setItem(STORAGE.PROFILE, JSON.stringify(profile));
  queueSync();
  showScreen('chatList');
  showToast('Profile saved! Monika will remember.', 'success');
}

function buildProfilePrompt() {
  const parts = [];
  if (profile.name) parts.push(`Their name is ${profile.name}.`);
  if (profile.about) parts.push(`About them: ${profile.about}`);
  if (profile.interests) parts.push(`Their interests: ${profile.interests}`);
  if (profile.values) parts.push(`What they value: ${profile.values}`);

  // Inject special dates with countdown
  const dates = profile.specialDates || [];
  if (dates.length > 0) {
    const dateParts = dates.slice(0, 20).map(d => {
      const days = getDaysUntil(d.date);
      let proximity = '';
      if (days === 0) proximity = ' (TODAY!)';
      else if (days === 1) proximity = ' (TOMORROW!)';
      else if (days <= 7) proximity = ` (in ${days} days!)`;
      else if (days <= 30) proximity = ` (in ${days} days)`;
      return `- ${d.label}: ${formatDateReadable(d.date)}${proximity}`;
    });
    parts.push(`Their special dates:\n${dateParts.join('\n')}`);
  }

  if (parts.length === 0) return '';
  return '\n\nABOUT THE PERSON YOU\'RE TALKING TO:\n' + parts.join('\n') + '\n- Use this info naturally in conversation \u2014 don\'t dump it all at once or make it obvious you were "briefed". Just know them.\n- If a special date is today or very soon, you may naturally bring it up or wish them well.';
}

// ====== SPECIAL DATES ======
function renderSpecialDates() {
  const list = $('specialDatesList');
  if (!list) return;
  const dates = profile.specialDates || [];
  if (dates.length === 0) {
    list.innerHTML = '<div class="special-dates-empty">No special dates yet.</div>';
    return;
  }

  // Sort by next occurrence
  const sorted = [...dates].sort((a, b) => getDaysUntil(a.date) - getDaysUntil(b.date));
  list.innerHTML = sorted.map(d => {
    const days = getDaysUntil(d.date);
    let countdownText, countdownClass = '';
    if (days === 0) { countdownText = 'Today!'; countdownClass = ' today'; }
    else if (days === 1) countdownText = 'Tomorrow';
    else countdownText = `${days} days`;

    return `<div class="special-date-item">
      <span class="special-date-label">${escapeHtml(d.label)}</span>
      <span class="special-date-countdown${countdownClass}">${countdownText}</span>
      <span class="special-date-date">${formatDateShort(d.date)}</span>
      <button class="special-date-delete" data-id="${d.id}" title="Remove">&times;</button>
    </div>`;
  }).join('');
}

function addSpecialDate() {
  const labelInput = $('specialDateLabel');
  const dateInput = $('specialDateValue');
  const label = labelInput.value.trim();
  const date = dateInput.value;
  if (!label || !date) {
    showToast('Enter both a label and date.', 'error');
    return;
  }
  if (!profile.specialDates) profile.specialDates = [];
  if (profile.specialDates.length >= 20) {
    showToast('Maximum 20 special dates.', 'error');
    return;
  }
  profile.specialDates.push({
    label,
    date,
    id: crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2)
  });
  localStorage.setItem(STORAGE.PROFILE, JSON.stringify(profile));
  queueSync();
  labelInput.value = '';
  dateInput.value = '';
  renderSpecialDates();
  showToast('Date added!', 'success');
}

function deleteSpecialDate(id) {
  if (!profile.specialDates) return;
  profile.specialDates = profile.specialDates.filter(d => d.id !== id);
  localStorage.setItem(STORAGE.PROFILE, JSON.stringify(profile));
  queueSync();
  renderSpecialDates();
  showToast('Date removed.', 'success');
}

// ====== DATE HELPERS ======
function getDaysUntil(dateStr) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const [y, m, d] = dateStr.split('-').map(Number);
  // Next occurrence this year or next
  let next = new Date(today.getFullYear(), m - 1, d);
  if (next < today) next = new Date(today.getFullYear() + 1, m - 1, d);
  return Math.round((next - today) / (1000 * 60 * 60 * 24));
}

function formatDateShort(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${months[m - 1]} ${d}`;
}

function formatDateReadable(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  return `${months[m - 1]} ${d}`;
}

// ====== PROFILE MEMORIES ======
const PROFILE_MEMORY_ICONS = {
  identity: '\u{1F464}', preferences: '\u2764\uFE0F', events: '\u{1F4C5}',
  relationships: '\u{1F465}', feelings: '\u{1F49C}', other: '\u{1F4DD}'
};

function renderProfileMemories() {
  const list = $('profileMemoryList');
  const badge = $('memoryCount');
  if (!list) return;
  if (badge) badge.textContent = memories.length;

  if (!memories || memories.length === 0) {
    list.innerHTML = '<div class="profile-memory-empty">No memories yet. Monika learns about you as you chat.</div>';
    return;
  }

  const grouped = {};
  memories.forEach(m => {
    const cat = m.category || 'other';
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(m);
  });

  // Category order
  const order = ['identity', 'relationships', 'preferences', 'events', 'feelings', 'other'];
  let html = '';
  for (const cat of order) {
    const mems = grouped[cat];
    if (!mems) continue;
    const icon = PROFILE_MEMORY_ICONS[cat] || '\u{1F4DD}';
    const catLabel = capitalize(cat);
    html += `<div class="memory-category"><div class="memory-category-header"><span class="memory-category-icon">${icon}</span>${catLabel}</div>`;
    mems.forEach(m => {
      html += `<div class="memory-item"><span class="memory-fact">${escapeHtml(m.fact)}</span><span class="memory-date">${m.date || ''}</span><button class="memory-delete" data-fact="${escapeHtml(m.fact)}" title="Forget">&times;</button></div>`;
    });
    html += '</div>';
  }
  list.innerHTML = html;
}

// ====== PROFILE STATS ======
function renderProfileStats() {
  const grid = $('profileStatsGrid');
  if (!grid) return;

  const totalConversations = chats.length;
  let totalMessages = 0;
  let userMessages = 0;
  let longestChat = 0;
  const modeCounts = {};
  let earliestDate = Date.now();

  chats.forEach(c => {
    const msgCount = c.messages ? c.messages.length : 0;
    totalMessages += msgCount;
    if (c.messages) userMessages += c.messages.filter(m => m.role === 'user').length;
    if (msgCount > longestChat) longestChat = msgCount;
    const mode = c.mode || 'chat';
    modeCounts[mode] = (modeCounts[mode] || 0) + 1;
    if (c.created && c.created < earliestDate) earliestDate = c.created;
  });

  // Favorite mode
  let favMode = 'Chat';
  if (Object.keys(modeCounts).length > 0) {
    const top = Object.entries(modeCounts).sort((a, b) => b[1] - a[1])[0];
    favMode = capitalize(top[0]);
  }

  // Days together
  const daysTogether = totalConversations > 0
    ? Math.max(1, Math.floor((Date.now() - earliestDate) / (1000 * 60 * 60 * 24)))
    : 0;

  const memoryCount = memories ? memories.length : 0;
  const dateCount = profile.specialDates ? profile.specialDates.length : 0;

  const tiles = [
    { value: totalConversations, label: 'Conversations' },
    { value: totalMessages, label: 'Total Messages' },
    { value: userMessages, label: 'Your Messages' },
    { value: favMode, label: 'Favorite Mode' },
    { value: longestChat, label: 'Longest Chat' },
    { value: daysTogether || '\u2014', label: 'Days Together' },
    { value: memoryCount, label: 'Memories' },
    { value: dateCount, label: 'Special Dates' },
  ];

  grid.innerHTML = tiles.map(t =>
    `<div class="profile-stat-tile"><div class="profile-stat-value">${t.value}</div><div class="profile-stat-label">${t.label}</div></div>`
  ).join('');
}

// ====== UTILS ======
function capitalize(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
}

// ====== RELATIONSHIP SLIDER ======
function updateRelDisplay() {
  const v = parseInt(relSlider.value);
  relLabel.textContent = RELATIONSHIPS[v].label;
  relDesc.textContent = RELATIONSHIPS[v].desc;
}
