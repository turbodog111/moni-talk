// ====== STATE TAG PARSING ======
function parseStateTags(raw, fallbackMood, fallbackIntensity, fallbackDrift) {
  fallbackIntensity = fallbackIntensity || 'moderate';
  fallbackDrift = fallbackDrift || 'casual';

  // Match [MOOD:word:intensity], [MOOD:word (intensity)], [MOOD:word], etc.
  // Tolerates varied AI formatting: parens, spaces, intensity=value, no separators
  const re = /^\[MOOD:\s*(\w+)(?:[:\s]*\(?(?:intensity\s*=\s*)?(\w+)\)?)?[^[\]]*\]\s*(?:\[DRIFT:\s*(\w+)\]\s*)?/i;
  const match = raw.match(re);
  if (match) {
    const mood = match[1].toLowerCase();
    const intensity = match[2] ? match[2].toLowerCase() : fallbackIntensity;
    const drift = match[3] ? match[3].toLowerCase() : fallbackDrift;
    const text = raw.slice(match[0].length).trim();
    return {
      mood: MOODS.includes(mood) ? mood : fallbackMood,
      moodIntensity: MOOD_INTENSITIES.includes(intensity) ? intensity : fallbackIntensity,
      drift: DRIFT_CATEGORIES.includes(drift) ? drift : fallbackDrift,
      text: text || raw
    };
  }
  return { mood: fallbackMood, moodIntensity: fallbackIntensity, drift: fallbackDrift, text: raw };
}

// ====== THINK-TAG STRIPPING ======
// Strips <think>...</think> reasoning blocks from model output (e.g., Qwen3)
function stripThinkTags(text) {
  // Strip complete <think>...</think> blocks
  let cleaned = text.replace(/<think>[\s\S]*?<\/think>\s*/g, '');
  // Strip unclosed <think> block (model ran out of tokens mid-thought)
  cleaned = cleaned.replace(/<think>[\s\S]*$/g, '');
  // Strip orphaned </think> at start (opening tag was truncated/trimmed)
  cleaned = cleaned.replace(/^[\s\S]*?<\/think>\s*/g, '');
  return cleaned.trim();
}

// Streaming filter: suppresses <think> blocks from reaching the UI in real-time
function createThinkFilter(onChunk) {
  let buf = '', inside = false;
  return {
    chunk(text) {
      buf += text;
      while (true) {
        if (inside) {
          const end = buf.indexOf('</think>');
          if (end === -1) return; // still in think block, hold everything
          inside = false;
          buf = buf.slice(end + 8);
        } else {
          // Handle orphaned </think> (stream started mid-thought)
          const orphan = buf.indexOf('</think>');
          const start = buf.indexOf('<think>');
          if (orphan !== -1 && (start === -1 || orphan < start)) {
            buf = buf.slice(orphan + 8);
            continue;
          }
          if (start === -1) break;
          if (start > 0) onChunk(buf.slice(0, start));
          inside = true;
          buf = buf.slice(start + 7);
        }
      }
      // Emit buffered content, holding back potential partial tag
      if (buf.length > 8) {
        onChunk(buf.slice(0, -8));
        buf = buf.slice(-8);
      }
    },
    flush() {
      if (!inside && buf) onChunk(buf);
      buf = '';
      inside = false;
    }
  };
}

// ====== TIME CONTEXT (computed, zero model cost) ======
function buildTimeContext(chat) {
  const now = new Date();
  const lines = [];

  // Day of week
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  lines.push(`It's ${days[now.getDay()]}.`);

  // Descriptive time of day with actual time
  const hour = now.getHours();
  const timeStr = now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (hour >= 5 && hour < 12) lines.push(`It's morning, ${timeStr}.`);
  else if (hour >= 12 && hour < 14) lines.push(`It's early afternoon, ${timeStr}.`);
  else if (hour >= 14 && hour < 17) lines.push(`It's afternoon, ${timeStr}.`);
  else if (hour >= 17 && hour < 21) lines.push(`It's evening, ${timeStr}.`);
  else if (hour >= 21 || hour < 2) lines.push(`It's late evening, ${timeStr}.`);
  else lines.push(`It's late night, ${timeStr}.`);

  // Holiday check
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const holiday = HOLIDAYS[`${mm}-${dd}`];
  if (holiday) lines.push(`Today is ${holiday}.`);

  // Gap since last conversation
  const lastActive = chat.lastActiveTime || chat.lastModified || chat.created;
  const gapMs = now.getTime() - lastActive;
  const gapHours = gapMs / (1000 * 60 * 60);
  const gapDays = Math.floor(gapHours / 24);
  if (gapDays >= 7) lines.push(`It's been about ${gapDays} days since you two last talked — you missed them.`);
  else if (gapDays >= 3) lines.push(`It's been a few days since you two last talked.`);
  else if (gapHours >= 24) lines.push(`It's been about a day since the last conversation.`);
  else if (gapHours >= 6) lines.push(`It's been a while since you last chatted.`);
  // Under 6 hours — say nothing, feels like an active session

  // Conversation count today
  const todayKey = `${now.getFullYear()}-${mm}-${dd}`;
  const lastVisit = localStorage.getItem('moni_talk_last_visit') || '';
  let dailyCount = parseInt(localStorage.getItem('moni_talk_daily_count') || '0');
  if (lastVisit !== todayKey) {
    dailyCount = 1;
    localStorage.setItem('moni_talk_last_visit', todayKey);
    localStorage.setItem('moni_talk_daily_count', '1');
  }
  if (dailyCount > 3) lines.push(`This is conversation #${dailyCount} today — they keep coming back to you.`);

  // Session length
  const msgCount = chat.messages.length;
  if (msgCount >= 30) lines.push('You\'ve been chatting for quite a while — the conversation is deep into its flow.');
  else if (msgCount >= 15) lines.push('You\'ve been chatting a while now — the conversation has a nice rhythm going.');

  return lines.join(' ');
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
  let sys = BASE_PROMPT + '\n\n' + rel.prompt + buildProfilePrompt() + buildMemoryPrompt();

  const mood = chat.mood || 'cheerful';
  const intensity = chat.moodIntensity || 'moderate';
  const drift = chat.drift || 'casual';
  const timeCtx = buildTimeContext(chat);

  sys += `\n\n=== CURRENT STATE ===\nMood: ${mood} (${intensity})\nDrift: ${drift}`;
  if (timeCtx) sys += `\n${timeCtx}`;
  sys += `\nLet your mood and drift evolve naturally from here.`;

  // Strip legacy expression tags from old room mode messages
  // Handle multimodal messages (content arrays with images)
  const supportsVision = ['gemini', 'openrouter', 'puter'].includes(provider);
  const msgs = chat.messages.map(m => {
    let content = m.content;
    // Handle multimodal content arrays
    if (Array.isArray(content)) {
      if (supportsVision) {
        // Pass through as-is for vision-capable providers
        return { role: m.role, content: content };
      } else {
        // Strip images for non-vision providers
        const textPart = content.find(p => p.type === 'text');
        content = (textPart?.text || '') + ' (User shared an image but your model can\'t see it)';
      }
    }
    if (chat.mode === 'room' && m.role === 'assistant' && typeof content === 'string' && /^\[\w+\]\s/m.test(content)) {
      return { role: m.role, content: content.replace(/^\[(\w+)\]\s*/gm, '') };
    }
    return { role: m.role, content: content };
  });

  return [
    { role: 'system', content: sys },
    ...msgs
  ];
}

// ====== NON-STREAMING PROVIDER DISPATCH (used by callAI for journals) ======
async function callProvider(chat) {
  let result;
  if (provider === 'gemini') result = await callGemini(chat);
  else if (provider === 'ollama') result = await callOllama(chat);
  else if (provider === 'puter') result = await callPuter(chat);
  else result = await callOpenRouter(chat);
  return stripThinkTags(result);
}

// ====== STREAMING PROVIDER DISPATCH ======
async function callProviderStreaming(chat, onChunk) {
  const filter = createThinkFilter(onChunk);
  let result;
  if (provider === 'gemini') result = await streamGemini(chat, c => filter.chunk(c));
  else if (provider === 'ollama') result = await streamOllama(chat, c => filter.chunk(c));
  else if (provider === 'openrouter') result = await streamOpenRouter(chat, c => filter.chunk(c));
  else {
    // Puter: no streaming API, fall back to single callback
    result = await callPuter(chat);
    result = stripThinkTags(result);
    onChunk(result);
    return result;
  }
  filter.flush();
  return stripThinkTags(result);
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
  const timeout = isStory ? 300000 : 180000; // 5 min story, 3 min chat
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  let res;
  try {
    res = await fetch(`${ollamaEndpoint}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
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
    if (err.name === 'AbortError') throw new Error('Ollama request timed out. The model may need more time — try a smaller quantization or shorter context.');
    throw new Error('Cannot reach Ollama. Is it running? Check that Ollama is open and OLLAMA_ORIGINS is set.');
  } finally {
    clearTimeout(timer);
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
  const timeout = isStory ? 300000 : 180000; // 5 min story, 3 min chat
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  let res;
  try {
    res = await fetch(`${ollamaEndpoint}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
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
    clearTimeout(timer);
    if (err.name === 'AbortError') throw new Error('Ollama request timed out. The model may need more time — try a smaller quantization or shorter context.');
    throw new Error('Cannot reach Ollama. Is it running? Check that Ollama is open and OLLAMA_ORIGINS is set.');
  }
  // Connection established — clear initial timeout, streaming is alive
  clearTimeout(timer);
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
  let raw;
  if (provider === 'puter') {
    try {
      const r = await puter.ai.chat(messages, { model: puterModel, stream: false });
      raw = extractPuterText(r).trim() || '';
    } catch (err) {
      throw new Error(err?.message || 'Puter request failed.');
    }
  } else if (provider === 'gemini') {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/openai/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${geminiKey}` },
      body: JSON.stringify({ model: geminiModel, messages, max_tokens: maxTokens, temperature: 0.9 })
    });
    if (!res.ok) throw new Error('Gemini API error');
    const data = await res.json();
    raw = data.choices?.[0]?.message?.content?.trim() || '';
  } else if (provider === 'ollama') {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 300000); // 5 min — slow models need time
    try {
      const res = await fetch(`${ollamaEndpoint}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
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
      raw = data.message?.content?.trim() || '';
    } catch (err) {
      if (err.name === 'AbortError') throw new Error('Ollama request timed out.');
      throw new Error(err?.message || 'Ollama request failed. Is it running?');
    } finally {
      clearTimeout(timer);
    }
  } else {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}`, 'HTTP-Referer': window.location.href, 'X-Title': 'Moni-Talk' },
      body: JSON.stringify({ model: selectedModel, messages, max_tokens: maxTokens, temperature: 0.9 })
    });
    if (!res.ok) throw new Error('API error');
    const data = await res.json();
    raw = data.choices?.[0]?.message?.content?.trim() || '';
  }
  return stripThinkTags(raw);
}
