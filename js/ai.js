// ====== MOOD PARSING ======
function parseMood(raw, fallback) {
  const match = raw.match(/^\[MOOD:(\w+)\]\s*/i);
  if (match) {
    const mood = match[1].toLowerCase();
    const text = raw.slice(match[0].length).trim();
    return { mood: MOODS.includes(mood) ? mood : fallback, text: text || raw };
  }
  return { mood: fallback, text: raw };
}

// ====== BUILD MESSAGES ======
function buildMessages(chat) {
  if (chat.mode === 'story') {
    const day = chat.storyDay || 1;
    const mcName = chat.mcName || 'MC';
    const context = `\n\n=== CURRENT STATE ===\nDay: ${day}\nMC's name: ${mcName}`;
    const msgs = [
      { role: 'system', content: STORY_PROMPT + context },
      ...chat.messages.map(m => ({ role: m.role, content: m.content }))
    ];
    if (chat.messages.length === 0) msgs.push({ role: 'user', content: `Begin the story. My name is ${mcName}. Sayori is dragging me to the Literature Club after school. I have no idea what to expect — she's been pestering me about this for weeks and I finally caved.` });
    return msgs;
  }
  const rel = RELATIONSHIPS[chat.relationship] || RELATIONSHIPS[2];
  let sys = BASE_PROMPT + '\n\n' + rel.prompt + buildProfilePrompt();
  if (chat.mood) sys += `\n\nYour current mood is: ${chat.mood}. Let it evolve naturally.`;
  return [
    { role: 'system', content: sys },
    ...chat.messages.map(m => ({ role: m.role, content: m.content }))
  ];
}

// ====== API: OPENROUTER ======
async function callOpenRouter(chat) {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}`, 'HTTP-Referer': window.location.href, 'X-Title': 'Moni-Talk' },
    body: JSON.stringify({ model: selectedModel, messages: buildMessages(chat), max_tokens: chat.mode === 'story' ? 800 : 300, temperature: chat.mode === 'story' ? 0.9 : 0.85 })
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) throw new Error('Invalid API key. Get a free one at openrouter.ai.');
    if (res.status === 429) throw new Error('Rate limited. Switch to Puter for unlimited use.');
    if (res.status === 402) throw new Error('Out of credits. Switch to Puter for free.');
    throw new Error(data?.error?.message || `OpenRouter error (${res.status})`);
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content?.trim() || 'Hmm, I lost my train of thought...';
}

// ====== API: PUTER ======
function extractPuterText(r) {
  if (typeof r === 'string') return r;
  const c = r?.message?.content;
  if (typeof c === 'string') return c;
  if (c && typeof c === 'object') {
    if (typeof c.text === 'string') return c.text;
    if (Array.isArray(c)) return c.map(b => typeof b === 'string' ? b : b?.text || '').join('');
  }
  if (typeof r?.text === 'string') return r.text;
  if (typeof r?.content === 'string') return r.content;
  if (Array.isArray(r)) return extractPuterText(r[0]);
  return '';
}

async function callPuter(chat) {
  try {
    const r = await puter.ai.chat(buildMessages(chat), { model: puterModel, stream: false });
    return extractPuterText(r).trim() || 'Hmm, I lost my train of thought...';
  } catch (err) {
    if (err?.message?.includes('auth') || err?.message?.includes('login'))
      throw new Error('Puter needs you to sign in. Allow the popup and try again.');
    throw new Error(err?.message || 'Puter request failed.');
  }
}

// ====== RAW AI CALL (for journals etc.) ======
async function callAI(messages, maxTokens = 600) {
  if (provider === 'puter') {
    try {
      const r = await puter.ai.chat(messages, { model: puterModel, stream: false });
      return extractPuterText(r).trim() || '';
    } catch (err) {
      throw new Error(err?.message || 'Puter request failed.');
    }
  }
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}`, 'HTTP-Referer': window.location.href, 'X-Title': 'Moni-Talk' },
    body: JSON.stringify({ model: selectedModel, messages, max_tokens: maxTokens, temperature: 0.9 })
  });
  if (!res.ok) throw new Error('API error');
  const data = await res.json();
  return data.choices?.[0]?.message?.content?.trim() || '';
}