// ====== PERSISTENT MEMORY SYSTEM ======
const MAX_MEMORIES = 60;
let _memoryApprovalTimer = null;

// ── Deleted-fact blacklist ────────────────────────────────────────────────────
// Stores IDs of memories the user has explicitly deleted or rejected so they
// never get re-extracted and re-added in a later conversation.
function loadDeletedIds() {
  try { return new Set(JSON.parse(localStorage.getItem('moni_talk_memories_deleted') || '[]')); }
  catch { return new Set(); }
}
function saveDeletedIds(set) {
  localStorage.setItem('moni_talk_memories_deleted', JSON.stringify([...set]));
}
function blacklistFact(fact) {
  const set = loadDeletedIds();
  set.add(_factKey(fact));
  saveDeletedIds(set);
}
function isBlacklisted(fact) {
  return loadDeletedIds().has(_factKey(fact));
}
function _factKey(fact) {
  // Normalize: lowercase, collapse whitespace — makes blacklist robust to minor wording drift
  return fact.toLowerCase().replace(/\s+/g, ' ').trim();
}

// ── Stable memory IDs ─────────────────────────────────────────────────────────
function _makeId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

// ── Persistence ───────────────────────────────────────────────────────────────
function loadMemories() {
  try {
    const raw = localStorage.getItem('moni_talk_memories');
    const mems = raw ? JSON.parse(raw) : [];
    // Back-fill IDs on old memories that don't have them
    let changed = false;
    mems.forEach(m => { if (!m.id) { m.id = _makeId(); changed = true; } });
    if (changed) localStorage.setItem('moni_talk_memories', JSON.stringify(mems));
    return mems;
  } catch { return []; }
}

function saveMemories(mems) {
  memories = mems;
  localStorage.setItem('moni_talk_memories', JSON.stringify(mems));
  queueSync();
}

// ── Public delete — adds to blacklist so it never comes back ──────────────────
function deleteMemory(id) {
  const idx = memories.findIndex(m => m.id === id);
  if (idx === -1) return false;
  blacklistFact(memories[idx].fact);
  memories.splice(idx, 1);
  saveMemories(memories);
  return true;
}

// ── Prompt injection ──────────────────────────────────────────────────────────
function buildMemoryPrompt(chat) {
  if (!memories || memories.length === 0) return '';

  const MAX_INJECTED = 25;
  let scored = memories.map(m => ({ ...m, score: 0 }));

  // Identity and relationships are always relevant
  scored.forEach(m => {
    if (m.category === 'identity' || m.category === 'relationships') m.score += 10;
    if (m.category === 'preferences') m.score += 4;
  });

  // Boost facts that overlap with words from the last few user messages
  if (chat && chat.messages && chat.messages.length > 0) {
    const recentText = chat.messages
      .filter(m => m.role === 'user')
      .slice(-6)
      .map(m => (typeof m.content === 'string' ? m.content : '').toLowerCase())
      .join(' ');
    const words = new Set(recentText.split(/\s+/).filter(w => w.length > 3));
    scored.forEach(m => {
      const fl = m.fact.toLowerCase();
      for (const w of words) { if (fl.includes(w)) { m.score += 5; break; } }
    });
  }

  // Sort by score desc, then newest first
  scored.sort((a, b) => b.score - a.score || (b.date || '').localeCompare(a.date || ''));
  const selected = scored.slice(0, MAX_INJECTED);

  const facts = selected.map(m => `- ${m.fact}`).join('\n');
  return `\n\nTHINGS YOU REMEMBER ABOUT THIS PERSON (from past conversations):\n${facts}\n- Reference these naturally when relevant — don't list them off or make it obvious you're recalling a database. Just know them, the way a real person remembers things about someone they care about.`;
}

// ── Extraction ────────────────────────────────────────────────────────────────
const MEMORY_EXTRACTION_PROMPT = `You are a memory extraction system for an AI companion app. Analyze the recent conversation and extract personal facts about the user.

Return ONLY a JSON array. Each element: {"fact": "...", "category": "..."}

Categories: identity | preferences | events | relationships | feelings | other

Rules:
- Extract CLEAR facts the user directly stated or strongly implied about themselves
- Include recent life context: what they're working on, stressed about, excited about, going through
- Include time-relevant facts: "User is preparing for X", "User recently did Y"
- Do NOT extract Monika's opinions, feelings, or anything Monika said
- Do NOT extract vague, uncertain, or purely conversational filler
- Do NOT re-extract facts already listed under EXISTING MEMORIES
- One sentence per fact, max 150 characters
- If nothing new, return []

Good examples:
- "I'm a software developer" → {"fact": "User works as a software developer", "category": "identity"}
- "I've been stressed about my job interview" → {"fact": "User has been stressed about a job interview", "category": "feelings"}
- "My dog's name is Max" → {"fact": "User has a dog named Max", "category": "relationships"}
- "I'm competing in a piano recital next week" → {"fact": "User is preparing for a piano recital", "category": "events"}
- "I hate waking up early" → {"fact": "User dislikes waking up early", "category": "preferences"}

Return ONLY the JSON array, nothing else.`;

async function extractMemoryCandidates(recentMessages) {
  // Build a readable transcript of the last few exchanges
  const transcript = recentMessages
    .map(m => `${m.role === 'user' ? 'User' : 'Monika'}: ${typeof m.content === 'string' ? m.content.slice(0, 400) : ''}`)
    .join('\n');

  const existingFacts = memories.length > 0
    ? `\nEXISTING MEMORIES (do not re-extract these):\n${memories.map(m => `- ${m.fact}`).join('\n')}`
    : '';

  const messages = [
    { role: 'system', content: MEMORY_EXTRACTION_PROMPT },
    { role: 'user', content: `Recent conversation:\n${transcript}${existingFacts}\n\nExtract any new personal facts about the user.` }
  ];

  const response = await callAI(messages, 400);

  let cleaned = response.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
  }

  const newFacts = JSON.parse(cleaned);
  if (!Array.isArray(newFacts) || newFacts.length === 0) return [];

  const validCategories = ['identity', 'preferences', 'events', 'relationships', 'feelings', 'other'];
  const validated = newFacts
    .filter(f => f && typeof f.fact === 'string' && f.fact.trim().length > 0 && validCategories.includes(f.category))
    .map(f => ({
      id: _makeId(),
      fact: f.fact.trim().slice(0, 200),
      category: f.category,
      date: new Date().toISOString().split('T')[0]
    }));

  // Filter out blacklisted (previously deleted/rejected) and duplicates of existing memories
  return validated.filter(nf => {
    if (isBlacklisted(nf.fact)) return false;
    return !memories.some(m =>
      m.fact.toLowerCase().includes(nf.fact.toLowerCase().slice(0, 30)) ||
      nf.fact.toLowerCase().includes(m.fact.toLowerCase().slice(0, 30))
    );
  });
}

// ── Memory toast — shown at top of chat when a memory is saved ────────────────
let _memToastTimer = null;
function showMemoryToast(fact) {
  const chatArea = document.getElementById('chatArea');
  if (!chatArea) return;

  // Remove any existing memory toast
  const existing = document.getElementById('memoryToast');
  if (existing) existing.remove();
  if (_memToastTimer) { clearTimeout(_memToastTimer); _memToastTimer = null; }

  const toast = document.createElement('div');
  toast.id = 'memoryToast';
  toast.className = 'memory-toast';
  // Truncate long facts for display
  const short = fact.length > 60 ? fact.slice(0, 57) + '…' : fact;
  toast.innerHTML = `<span class="memory-toast-icon">\uD83E\uDDE0</span><span>Monika will remember: <em>${escapeHtml(short)}</em></span>`;
  chatArea.insertBefore(toast, chatArea.firstChild);

  // Trigger slide-in on next frame
  requestAnimationFrame(() => toast.classList.add('visible'));

  _memToastTimer = setTimeout(() => {
    toast.classList.remove('visible');
    setTimeout(() => toast.remove(), 400);
  }, 4000);
}

// ── LLM-driven memory write — process [REMEMBER: fact] tags ──────────────────
function processRememberTags(reply) {
  const pattern = /\[REMEMBER:\s*([^\]]+)\]/gi;
  let match;
  const extracted = [];
  while ((match = pattern.exec(reply)) !== null) {
    const fact = match[1].trim();
    if (!fact || isBlacklisted(fact)) continue;
    const isDupe = memories.some(m =>
      m.fact.toLowerCase().includes(fact.toLowerCase().slice(0, 30)) ||
      fact.toLowerCase().includes(m.fact.toLowerCase().slice(0, 30))
    );
    if (!isDupe) extracted.push({ id: _makeId(), fact, category: 'other', date: new Date().toISOString().split('T')[0] });
  }
  if (extracted.length > 0) {
    saveMemories(mergeNewMemories(memories, extracted));
    extracted.forEach(f => showMemoryToast(f.fact));
    const chat = typeof getChat === 'function' ? getChat() : null;
    if (chat && typeof updateChatPanel === 'function') updateChatPanel(chat);
  }
  // Return reply with [REMEMBER:...] tags stripped for display
  return reply.replace(/\[REMEMBER:[^\]]*\]/gi, '').trim();
}

// Main entry point
async function extractMemories(recentMessages) {
  try {
    const candidates = await extractMemoryCandidates(recentMessages);
    if (candidates.length === 0) return;
    showMemoryApproval(candidates);
  } catch (err) {
    console.debug('Memory extraction skipped:', err.message);
  }
}

// Merge approved facts
function approveMemories(facts) {
  if (!facts || facts.length === 0) return;
  const merged = mergeNewMemories(memories, facts);
  saveMemories(merged);
  // Show toast for the first approved fact
  if (facts[0]) showMemoryToast(facts[0].fact);
  const chat = typeof getChat === 'function' ? getChat() : null;
  if (chat && typeof updateChatPanel === 'function') updateChatPanel(chat);
}

// ── Approval Banner UI ────────────────────────────────────────────────────────
const MEMORY_CATEGORY_ICONS_BANNER = {
  identity: '\uD83D\uDC64', preferences: '\u2764\uFE0F', events: '\uD83D\uDCC5',
  relationships: '\uD83D\uDC65', feelings: '\uD83D\uDC9C', other: '\uD83D\uDCDD'
};

function showMemoryApproval(candidates) {
  dismissMemoryApproval();

  const chatArea = document.getElementById('chatArea');
  if (!chatArea) return;

  const banner = document.createElement('div');
  banner.className = 'memory-approval-banner';
  banner.id = 'memoryApprovalBanner';

  const accepted = new Array(candidates.length).fill(null);

  let factsHtml = candidates.map((c, i) => {
    const icon = MEMORY_CATEGORY_ICONS_BANNER[c.category] || '\uD83D\uDCDD';
    return `<div class="memory-approval-fact" data-index="${i}">
      <span class="memory-approval-icon">${icon}</span>
      <span class="memory-approval-text">${escapeHtml(c.fact)}</span>
      <button class="memory-approval-accept" data-index="${i}" title="Remember">\u2713</button>
      <button class="memory-approval-reject" data-index="${i}" title="Forget">\u2715</button>
    </div>`;
  }).join('');

  banner.innerHTML = `
    <div class="memory-approval-header">
      <span class="memory-approval-title">\uD83E\uDDE0 Monika noticed some things</span>
      <button class="memory-approval-dismiss" title="Dismiss">\u2715</button>
    </div>
    <div class="memory-approval-list">${factsHtml}</div>
    <button class="memory-approval-all">Remember All</button>`;

  chatArea.insertBefore(banner, chatArea.firstChild);

  banner.querySelector('.memory-approval-dismiss').addEventListener('click', () => {
    // Dismissing without acting = accept pending items silently
    const pending = candidates.filter((_, i) => accepted[i] === null);
    if (pending.length > 0) approveMemories(pending);
    dismissMemoryApproval();
  });

  banner.querySelectorAll('.memory-approval-accept').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.index);
      if (accepted[idx] !== null) return;
      accepted[idx] = true;
      const row = banner.querySelector(`.memory-approval-fact[data-index="${idx}"]`);
      if (row) { row.classList.add('accepted'); row.classList.remove('rejected'); }
      approveMemories([candidates[idx]]);
      checkAllResolved();
    });
  });

  banner.querySelectorAll('.memory-approval-reject').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.index);
      if (accepted[idx] !== null) return;
      accepted[idx] = false;
      // Blacklist so it never comes back
      blacklistFact(candidates[idx].fact);
      const row = banner.querySelector(`.memory-approval-fact[data-index="${idx}"]`);
      if (row) { row.classList.add('rejected'); row.classList.remove('accepted'); }
      checkAllResolved();
    });
  });

  banner.querySelector('.memory-approval-all').addEventListener('click', () => {
    const remaining = candidates.filter((_, i) => accepted[i] === null);
    if (remaining.length > 0) approveMemories(remaining);
    dismissMemoryApproval();
  });

  function checkAllResolved() {
    if (accepted.every(a => a !== null)) setTimeout(() => dismissMemoryApproval(), 600);
  }

  _memoryApprovalTimer = setTimeout(() => {
    // Auto-save pending on timeout instead of discarding
    const pending = candidates.filter((_, i) => accepted[i] === null);
    if (pending.length > 0) approveMemories(pending);
    dismissMemoryApproval();
  }, 45000);
}

function dismissMemoryApproval() {
  if (_memoryApprovalTimer) { clearTimeout(_memoryApprovalTimer); _memoryApprovalTimer = null; }
  const banner = document.getElementById('memoryApprovalBanner');
  if (banner) { banner.classList.add('dismissing'); setTimeout(() => banner.remove(), 300); }
}

// ── Merge & consolidate ───────────────────────────────────────────────────────
function mergeNewMemories(existing, newFacts) {
  const merged = [...existing];
  for (const nf of newFacts) {
    if (!nf.id) nf.id = _makeId();
    const isDupe = merged.some(m =>
      m.fact.toLowerCase().includes(nf.fact.toLowerCase().slice(0, 30)) ||
      nf.fact.toLowerCase().includes(m.fact.toLowerCase().slice(0, 30))
    );
    if (!isDupe) merged.push(nf);
  }
  return merged.length > MAX_MEMORIES ? consolidateMemories(merged) : merged;
}

function consolidateMemories(mems) {
  const byCategory = {};
  for (const m of mems) {
    const cat = m.category || 'other';
    if (!byCategory[cat]) byCategory[cat] = [];
    byCategory[cat].push(m);
  }

  const result = [];
  const categories = Object.keys(byCategory);
  const perCategory = Math.floor(MAX_MEMORIES / categories.length);

  for (const cat of categories) {
    const sorted = byCategory[cat].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    result.push(...sorted.slice(0, perCategory));
  }

  if (result.length < MAX_MEMORIES) {
    const remaining = mems.filter(m => !result.includes(m))
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    result.push(...remaining.slice(0, MAX_MEMORIES - result.length));
  }

  return result.slice(0, MAX_MEMORIES);
}
