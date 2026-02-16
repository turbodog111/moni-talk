// ====== PERSISTENT MEMORY SYSTEM ======
const MAX_MEMORIES = 50;

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

async function extractMemories(userMsg, aiReply) {
  try {
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
    if (!Array.isArray(newFacts) || newFacts.length === 0) return;

    const validCategories = ['identity', 'preferences', 'events', 'relationships', 'feelings', 'other'];
    const validated = newFacts.filter(f =>
      f && typeof f.fact === 'string' && f.fact.length > 0 &&
      validCategories.includes(f.category)
    ).map(f => ({
      fact: f.fact.slice(0, 200),
      category: f.category,
      date: new Date().toISOString().split('T')[0]
    }));

    if (validated.length === 0) return;

    const merged = mergeNewMemories(memories, validated);
    saveMemories(merged);
  } catch (err) {
    // Silent failure — memory extraction is non-critical
    console.debug('Memory extraction skipped:', err.message);
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
