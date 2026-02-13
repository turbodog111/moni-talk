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
// Condensed character reminder injected when conversation is long
const CHARACTER_REMINDER = `[Character quick-ref: Sayori=coral pink hair+red bow, sky blue eyes, bubbly/cheerful childhood friend. Natsuki=pink bob+ribbon clips, fuchsia eyes, tsundere with sharp tongue. Yuri=long dark purple hair, soft violet eyes, shy bookworm. Monika=chestnut ponytail+white bow, emerald green eyes, confident club president. Write their dialogue in-character.]`;

const STORY_MSG_LIMIT = 30; // Keep last 30 messages to protect system prompt from being pushed out

function buildMessages(chat) {
  if (chat.mode === 'story') {
    const day = chat.storyDay || 1;
    const mcName = chat.mcName || 'MC';
    const aff = chat.storyAffinity || { sayori: 15, natsuki: 1, yuri: 1, monika: 10 };
    const phaseInstruction = buildPhaseInstruction(chat);

    const milestoneNote = buildMilestoneNote(chat);
    const systemPrompt = STORY_PROMPT_BASE
      + `\n\n${AFFINITY_BEHAVIOR_TIERS}`
      + (phaseInstruction ? `\n\n${phaseInstruction}` : '')
      + (milestoneNote ? `\n\n${milestoneNote}` : '')
      + `\n\n=== CURRENT STATE ===\nDay: ${day}\nMC's name: ${mcName}\n${buildAffinityDirective(aff)}`;

    // Trim to last N messages to prevent context overflow
    let recentMessages = chat.messages;
    if (recentMessages.length > STORY_MSG_LIMIT) {
      recentMessages = recentMessages.slice(-STORY_MSG_LIMIT);
    }

    const msgs = [
      { role: 'system', content: systemPrompt },
      ...recentMessages.map(m => ({ role: m.role, content: m.content }))
    ];

    // Inject condensed character reminder every ~20 messages to keep model on track
    if (chat.messages.length > 10) {
      // Insert reminder as a system message near the end of history
      msgs.splice(-2, 0, { role: 'system', content: CHARACTER_REMINDER });
    }

    if (chat.messages.length === 0) {
      msgs.push({ role: 'user', content: `Begin the story. My name is ${mcName}.` });
    }
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

// ====== NON-STREAMING PROVIDER DISPATCH (used by callAI for journals) ======
async function callProvider(chat) {
  if (provider === 'gemini') return await callGemini(chat);
  if (provider === 'ollama') return await callOllama(chat);
  if (provider === 'puter') return await callPuter(chat);
  return await callOpenRouter(chat);
}

// ====== STREAMING PROVIDER DISPATCH ======
async function callProviderStreaming(chat, onChunk) {
  if (provider === 'gemini') return await streamGemini(chat, onChunk);
  if (provider === 'ollama') return await streamOllama(chat, onChunk);
  if (provider === 'openrouter') return await streamOpenRouter(chat, onChunk);
  // Puter: no streaming API, fall back to single callback
  const result = await callPuter(chat);
  onChunk(result);
  return result;
}

// ====== API: OPENROUTER (non-streaming, kept for callAI) ======
async function callOpenRouter(chat) {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}`, 'HTTP-Referer': window.location.href, 'X-Title': 'Moni-Talk' },
    body: JSON.stringify({ model: selectedModel, messages: buildMessages(chat), max_tokens: chat.mode === 'story' ? 1500 : 400, temperature: chat.mode === 'story' ? 0.85 : 0.8 })
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) throw new Error('Invalid API key. Get a free one at openrouter.ai.');
    if (res.status === 429) throw new Error('Rate limited. Switch to Ollama for unlimited local use.');
    if (res.status === 402) throw new Error('Out of credits. Switch to Ollama for free.');
    throw new Error(data?.error?.message || `OpenRouter error (${res.status})`);
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content?.trim() || '';
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
    return extractPuterText(r).trim() || '';
  } catch (err) {
    if (err?.message?.includes('auth') || err?.message?.includes('login'))
      throw new Error('Puter needs you to sign in. Allow the popup and try again.');
    throw new Error(err?.message || 'Puter request failed.');
  }
}

// ====== API: GEMINI (non-streaming, kept for callAI) ======
async function callGemini(chat) {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/openai/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${geminiKey}` },
    body: JSON.stringify({
      model: geminiModel,
      messages: buildMessages(chat),
      max_tokens: chat.mode === 'story' ? 2000 : 400,
      temperature: chat.mode === 'story' ? 0.85 : 0.8
    })
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 || res.status === 403) throw new Error('Invalid Gemini API key. Get one at aistudio.google.com.');
    if (res.status === 429) throw new Error('Gemini rate limit hit. Free tier allows 15 req/min, 1500/day. Wait a moment.');
    throw new Error(data?.error?.message || `Gemini error (${res.status})`);
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content?.trim() || '';
}

// ====== API: OLLAMA (non-streaming, kept for callAI) ======
async function callOllama(chat) {
  const isStory = chat.mode === 'story';
  let res;
  try {
    res = await fetch(`${ollamaEndpoint}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: ollamaModel,
        messages: buildMessages(chat),
        stream: false,
        keep_alive: 10,
        options: {
          num_predict: isStory ? 1500 : 500,
          num_ctx: 16384,
          temperature: isStory ? 0.8 : 0.75,
          top_p: 0.92,
          top_k: 60,
          repeat_penalty: 1.18,
          repeat_last_n: 256
        }
      })
    });
  } catch (err) {
    throw new Error('Cannot reach Ollama. Is it running? Check that Ollama is open and OLLAMA_ORIGINS is set.');
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.error?.message || `Ollama error (${res.status})`);
  }
  const data = await res.json();
  return data.message?.content?.trim() || '';
}

// ====== STREAMING: OLLAMA (NDJSON) ======
async function streamOllama(chat, onChunk) {
  const isStory = chat.mode === 'story';
  let res;
  try {
    res = await fetch(`${ollamaEndpoint}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: ollamaModel,
        messages: buildMessages(chat),
        stream: true,
        keep_alive: 10,
        options: {
          num_predict: isStory ? 1500 : 500,
          num_ctx: 16384,
          temperature: isStory ? 0.8 : 0.75,
          top_p: 0.92,
          top_k: 60,
          repeat_penalty: 1.18,
          repeat_last_n: 256
        }
      })
    });
  } catch (err) {
    throw new Error('Cannot reach Ollama. Is it running? Check that Ollama is open and OLLAMA_ORIGINS is set.');
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.error?.message || `Ollama error (${res.status})`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let full = '', buf = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop();
    for (const line of lines) {
      if (!line.trim()) continue;
      try { const j = JSON.parse(line); const c = j.message?.content || ''; if (c) { full += c; onChunk(c); } } catch {}
    }
  }
  if (buf.trim()) {
    try { const j = JSON.parse(buf); const c = j.message?.content || ''; if (c) { full += c; onChunk(c); } } catch {}
  }
  return full.trim() || '';
}

// ====== STREAMING: SSE (shared for Gemini/OpenRouter) ======
async function streamSSE(url, headers, body, onChunk) {
  const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify({ ...body, stream: true }) });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 || res.status === 403) throw new Error('Invalid API key.');
    if (res.status === 429) throw new Error('Rate limited. Wait a moment and try again.');
    throw new Error(data?.error?.message || `API error (${res.status})`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let full = '', buf = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop();
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const payload = line.slice(6).trim();
      if (payload === '[DONE]') continue;
      try { const j = JSON.parse(payload); const c = j.choices?.[0]?.delta?.content || ''; if (c) { full += c; onChunk(c); } } catch {}
    }
  }
  return full.trim() || '';
}

async function streamGemini(chat, onChunk) {
  return await streamSSE(
    'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
    { 'Content-Type': 'application/json', 'Authorization': `Bearer ${geminiKey}` },
    { model: geminiModel, messages: buildMessages(chat), max_tokens: chat.mode === 'story' ? 2000 : 400, temperature: chat.mode === 'story' ? 0.85 : 0.8 },
    onChunk
  );
}

async function streamOpenRouter(chat, onChunk) {
  return await streamSSE(
    'https://openrouter.ai/api/v1/chat/completions',
    { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}`, 'HTTP-Referer': window.location.href, 'X-Title': 'Moni-Talk' },
    { model: selectedModel, messages: buildMessages(chat), max_tokens: chat.mode === 'story' ? 1500 : 400, temperature: chat.mode === 'story' ? 0.85 : 0.8 },
    onChunk
  );
}

// ====== FETCH OLLAMA MODELS ======
async function fetchOllamaModels() {
  try {
    const res = await fetch(`${ollamaEndpoint}/v1/models`);
    if (!res.ok) return [];
    const data = await res.json();
    return (data.data || []).map(m => ({ id: m.id, label: m.id }));
  } catch {
    return [];
  }
}

// ====== RAW AI CALL (for journals etc. — non-streaming) ======
async function callAI(messages, maxTokens = 600) {
  if (provider === 'puter') {
    try {
      const r = await puter.ai.chat(messages, { model: puterModel, stream: false });
      return extractPuterText(r).trim() || '';
    } catch (err) {
      throw new Error(err?.message || 'Puter request failed.');
    }
  }
  if (provider === 'gemini') {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/openai/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${geminiKey}` },
      body: JSON.stringify({ model: geminiModel, messages, max_tokens: maxTokens, temperature: 0.9 })
    });
    if (!res.ok) throw new Error('Gemini API error');
    const data = await res.json();
    return data.choices?.[0]?.message?.content?.trim() || '';
  }
  if (provider === 'ollama') {
    try {
      const res = await fetch(`${ollamaEndpoint}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: ollamaModel,
          messages,
          stream: false,
          keep_alive: 10,
          options: {
            num_predict: maxTokens,
            num_ctx: 16384,
            temperature: 0.85,
            top_p: 0.92,
            top_k: 60,
            repeat_penalty: 1.18,
            repeat_last_n: 256
          }
        })
      });
      if (!res.ok) throw new Error('Ollama error');
      const data = await res.json();
      return data.message?.content?.trim() || '';
    } catch (err) {
      throw new Error(err?.message || 'Ollama request failed. Is it running?');
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
