// ====== PERSISTENT MEMORY SYSTEM ======
const MAX_MEMORIES = 50;
let _memoryApprovalTimer = null;

const MEMORY_EXTRACTION_PROMPT = `You are a memory extraction system. Analyze this conversation exchange and extract any new personal facts about the user.

Return ONLY a JSON array of objects. Each object has:
- "fact": a concise statement about the user (e.g. "User's name is Joshua")
- "category": one of: identity, preferences, events, relationships, feelings, other

Rules:
- Only extract CLEAR, EXPLICIT facts the user directly stated or strongly implied
- Do NOT extract Monika's opinions or feelings
- Do NOT extract vague or uncertain information
- Do NOT extract conversational filler or temporary states
- Keep facts concise — one sentence max
- If there are no new facts, return an empty array: []

Examples of good extractions:
- "My name is Josh" → {"fact": "User's name is Josh", "category": "identity"}
- "I love rock music" → {"fact": "User loves rock music", "category": "preferences"}
- "My cat died last week" → {"fact": "User's cat recently passed away", "category": "events"}
- "I have a sister named Amy" → {"fact": "User has a sister named Amy", "category": "relationships"}

Return ONLY the JSON array, nothing else.`;

const MEMORY_CATEGORY_ICONS_BANNER = {
  identity: '\uD83D\uDC64', preferences: '\u2764\uFE0F', events: '\uD83D\uDCC5',
  relationships: '\uD83D\uDC65', feelings: '\uD83D\uDC9C', other: '\uD83D\uDCDD'
};

function loadMemories() {
  try {
    const raw = localStorage.getItem('moni_talk_memories');
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveMemories(mems) {
  memories = mems;
  localStorage.setItem('moni_talk_memories', JSON.stringify(mems));
  // Trigger Puter sync if available
  queueSync();
}

function buildMemoryPrompt(chat) {
  if (!memories || memories.length === 0) return '';

  const MAX_INJECTED = 20;
  let scored = memories.map(m => ({ ...m, score: 0 }));

  // Always-relevant categories get a base score boost
  scored.forEach(m => {
    if (m.category === 'identity' || m.category === 'relationships') m.score += 10;
  });

  // Score by relevance to recent messages
  if (chat && chat.messages && chat.messages.length > 0) {
    const recentUserMsgs = chat.messages
      .filter(m => m.role === 'user')
      .slice(-5)
      .map(m => (typeof m.content === 'string' ? m.content : '').toLowerCase())
      .join(' ');
    const words = recentUserMsgs.split(/\s+/).filter(w => w.length > 3);
    scored.forEach(m => {
      const factLower = m.fact.toLowerCase();
      for (const w of words) {
        if (factLower.includes(w)) { m.score += 3; break; }
      }
    });
  }

  // Sort by score desc, then by recency (newest first)
  scored.sort((a, b) => b.score - a.score || (b.date || '').localeCompare(a.date || ''));
  const selected = scored.slice(0, MAX_INJECTED);

  const facts = selected.map(m => `- ${m.fact}`).join('\n');
  return `\n\nTHINGS YOU REMEMBER ABOUT THIS PERSON (from past conversations):\n${facts}\n- Reference these naturally when relevant — don't list them off or make it obvious you're recalling a database. Just know them, the way a real person remembers things about someone they care about.`;
}

// Extract candidate facts without saving — returns validated, deduplicated array
async function extractMemoryCandidates(userMsg, aiReply) {
  const messages = [
    { role: 'system', content: MEMORY_EXTRACTION_PROMPT },
    { role: 'user', content: `User said: "${userMsg}"\n\nMonika replied: "${aiReply}"\n\nExtract any new personal facts about the user.` }
  ];
  const response = await callAI(messages, 300);

  // Parse JSON from response — handle markdown code blocks
  let cleaned = response.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
  }

  const newFacts = JSON.parse(cleaned);
  if (!Array.isArray(newFacts) || newFacts.length === 0) return [];

  const validCategories = ['identity', 'preferences', 'events', 'relationships', 'feelings', 'other'];
  const validated = newFacts.filter(f =>
    f && typeof f.fact === 'string' && f.fact.length > 0 &&
    validCategories.includes(f.category)
  ).map(f => ({
    fact: f.fact.slice(0, 200),
    category: f.category,
    date: new Date().toISOString().split('T')[0]
  }));

  // Deduplicate against existing memories
  return validated.filter(nf => {
    return !memories.some(m =>
      m.fact.toLowerCase().includes(nf.fact.toLowerCase()) ||
      nf.fact.toLowerCase().includes(m.fact.toLowerCase())
    );
  });
}

// Main entry point — extracts candidates, shows approval UI if any found
async function extractMemories(userMsg, aiReply) {
  try {
    const candidates = await extractMemoryCandidates(userMsg, aiReply);
    if (candidates.length === 0) return;
    showMemoryApproval(candidates);
  } catch (err) {
    // Silent failure — memory extraction is non-critical
    console.debug('Memory extraction skipped:', err.message);
  }
}

// Merge approved facts into memory and save
function approveMemories(facts) {
  if (!facts || facts.length === 0) return;
  const merged = mergeNewMemories(memories, facts);
  saveMemories(merged);
  // Refresh chat panel if open
  const chat = typeof getChat === 'function' ? getChat() : null;
  if (chat && typeof updateChatPanel === 'function') updateChatPanel(chat);
}

// ====== MEMORY APPROVAL BANNER UI ======
function showMemoryApproval(candidates) {
  // Dismiss any existing banner first
  dismissMemoryApproval();

  const chatArea = document.getElementById('chatArea');
  if (!chatArea) return;

  const banner = document.createElement('div');
  banner.className = 'memory-approval-banner';
  banner.id = 'memoryApprovalBanner';

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
      <span class="memory-approval-title">\uD83E\uDDE0 Monika noticed some things about you</span>
      <button class="memory-approval-dismiss" title="Dismiss">\u2715</button>
    </div>
    <div class="memory-approval-list">${factsHtml}</div>
    <button class="memory-approval-all">Remember All</button>`;

  // Insert at top of chat area
  chatArea.insertBefore(banner, chatArea.firstChild);

  // Track accepted/rejected state
  const accepted = new Array(candidates.length).fill(null); // null = pending, true = accepted, false = rejected

  // Dismiss button
  banner.querySelector('.memory-approval-dismiss').addEventListener('click', () => {
    dismissMemoryApproval();
  });

  // Accept individual
  banner.querySelectorAll('.memory-approval-accept').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.index);
      accepted[idx] = true;
      const row = banner.querySelector(`.memory-approval-fact[data-index="${idx}"]`);
      if (row) { row.classList.add('accepted'); row.classList.remove('rejected'); }
      // Save this single fact immediately
      approveMemories([candidates[idx]]);
      checkAllResolved();
    });
  });

  // Reject individual
  banner.querySelectorAll('.memory-approval-reject').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.index);
      accepted[idx] = false;
      const row = banner.querySelector(`.memory-approval-fact[data-index="${idx}"]`);
      if (row) { row.classList.add('rejected'); row.classList.remove('accepted'); }
      checkAllResolved();
    });
  });

  // Remember All
  banner.querySelector('.memory-approval-all').addEventListener('click', () => {
    const remaining = candidates.filter((_, i) => accepted[i] !== true && accepted[i] !== false);
    if (remaining.length > 0) approveMemories(remaining);
    dismissMemoryApproval();
  });

  function checkAllResolved() {
    if (accepted.every(a => a !== null)) {
      // All facts resolved — auto-dismiss after short delay
      setTimeout(() => dismissMemoryApproval(), 600);
    }
  }

  // Auto-dismiss after 30 seconds
  _memoryApprovalTimer = setTimeout(() => dismissMemoryApproval(), 30000);
}

function dismissMemoryApproval() {
  if (_memoryApprovalTimer) {
    clearTimeout(_memoryApprovalTimer);
    _memoryApprovalTimer = null;
  }
  const banner = document.getElementById('memoryApprovalBanner');
  if (banner) {
    banner.classList.add('dismissing');
    setTimeout(() => banner.remove(), 300);
  }
}

function mergeNewMemories(existing, newFacts) {
  const merged = [...existing];

  for (const nf of newFacts) {
    // Check for duplicates — simple substring matching
    const isDuplicate = merged.some(m =>
      m.fact.toLowerCase().includes(nf.fact.toLowerCase()) ||
      nf.fact.toLowerCase().includes(m.fact.toLowerCase())
    );
    if (!isDuplicate) {
      merged.push(nf);
    }
  }

  // Cap at MAX_MEMORIES — if over, consolidate
  if (merged.length > MAX_MEMORIES) {
    return consolidateMemories(merged);
  }
  return merged;
}

function consolidateMemories(mems) {
  // Simple consolidation: keep most recent MAX_MEMORIES entries
  // Group by category, keep newest from each category proportionally
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
    // Sort by date descending (newest first), then take top N
    const sorted = byCategory[cat].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    result.push(...sorted.slice(0, perCategory));
  }

  // Fill remaining slots with newest overall
  if (result.length < MAX_MEMORIES) {
    const remaining = mems.filter(m => !result.includes(m))
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    result.push(...remaining.slice(0, MAX_MEMORIES - result.length));
  }

  return result.slice(0, MAX_MEMORIES);
}
