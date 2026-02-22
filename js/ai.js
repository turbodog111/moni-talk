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
  // Force en-US + hour12:true so the model always receives "3:02 PM" not "15:02" or ambiguous "3:02"
  const hour = now.getHours();
  const timeStr = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
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

// ====== MESSAGE SANITIZER ======
// Ensures strict role alternation (system, user, assistant, user, assistant, ...)
// Required by Gemma 3 and other models with strict Jinja chat templates.
// - Keeps the first system message as-is
// - Converts mid-conversation system messages to user messages
// - Merges consecutive same-role messages
function sanitizeMessages(msgs) {
  if (msgs.length === 0) return msgs;
  const result = [];
  let i = 0;
  // Keep first system message
  if (msgs[0].role === 'system') {
    result.push({ role: 'system', content: msgs[0].content });
    i = 1;
  }
  // Convert mid-conversation system messages to user role
  for (; i < msgs.length; i++) {
    const m = msgs[i];
    const content = typeof m.content === 'string' ? m.content : m.content;
    if (m.role === 'system') {
      result.push({ role: 'user', content: `[System: ${content}]` });
    } else {
      result.push({ role: m.role, content });
    }
  }
  // Merge consecutive same-role messages
  const merged = [result[0]];
  for (let j = 1; j < result.length; j++) {
    const prev = merged[merged.length - 1];
    const cur = result[j];
    if (prev.role === cur.role && typeof prev.content === 'string' && typeof cur.content === 'string') {
      prev.content += '\n\n' + cur.content;
    } else {
      merged.push(cur);
    }
  }
  // Ensure first non-system message is 'user' (required by Gemma 3 and others).
  // If conversation starts with assistant (e.g. Monika's greeting), prepend a user turn.
  const firstNonSys = merged.findIndex(m => m.role !== 'system');
  if (firstNonSys !== -1 && merged[firstNonSys].role === 'assistant') {
    merged.splice(firstNonSys, 0, { role: 'user', content: '[Start]' });
  }
  return merged;
}

// ====== BUILD MESSAGES ======
// Condensed character reminder injected when conversation is long
const CHARACTER_REMINDER = `[Character quick-ref: Sayori=coral pink hair+red bow, sky blue eyes, bubbly/cheerful childhood friend. Natsuki=pink bob+ribbon clips, fuchsia eyes, tsundere with sharp tongue. Yuri=long dark purple hair, soft violet eyes, shy bookworm. Monika=chestnut ponytail+white bow, emerald green eyes, confident club president. Write their dialogue in-character.]`;

const STORY_MSG_LIMIT = 30; // Keep last 30 messages to protect system prompt from being pushed out
const CHAT_MSG_LIMIT = 50;  // Keep last 50 messages for chat/room mode API calls (UI keeps all)

function buildMessages(chat) {
  if (chat.mode === 'story') {
    const day = chat.storyDay || 1;
    const mcName = chat.mcName || 'MC';
    const aff = chat.storyAffinity || { sayori: 15, natsuki: 1, yuri: 1, monika: 10 };
    const phaseInstruction = buildPhaseInstruction(chat);

    const milestoneNote = buildMilestoneNote(chat);
    let dayContinuity = '';
    if (day > 1) {
      dayContinuity = `\n\n=== DAY CONTINUITY (CRITICAL) ===\nThis is DAY ${day}. MC has been a club member for ${day - 1} day(s). He knows Sayori, Natsuki, Yuri, and Monika. Do NOT write first-meeting introductions. Girls behave per their affinity tiers.`;
      const y = chat.storyYesterday;
      if (y && y.day === day - 1) {
        const parts = [];
        if (y.freeTimeWith) parts.push(`spent free time with ${y.freeTimeWith}`);
        if (y.walkHomeWith) parts.push(`walked home with ${y.walkHomeWith}`);
        if (parts.length) {
          dayContinuity += `\nYESTERDAY: MC ${parts.join(' and ')}.`;
          dayContinuity += `\nCharacters may reference this naturally — a brief callback, not heavy recap. The girl MC spent time with might be slightly warmer today; others might have noticed.`;
        }
      }
    }
    // Keep phase instruction out of the main system prompt — it goes at the END
    const systemPrompt = STORY_PROMPT_BASE
      + `\n\n${AFFINITY_BEHAVIOR_TIERS}`
      + (milestoneNote ? `\n\n${milestoneNote}` : '')
      + dayContinuity
      + `\n\n=== CURRENT STATE ===\nDay: ${day}\nMC's name: ${mcName}\n${buildAffinityDirective(aff, chat)}`;

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
      msgs.splice(-2, 0, { role: 'system', content: CHARACTER_REMINDER });
    }

    if (chat.messages.length === 0) {
      msgs.push({ role: 'user', content: `Begin the story. My name is ${mcName}.` });
    }

    // Inject phase instruction as the FINAL system message — right before generation.
    // This is the most influential position in the context window for small models
    // that tend to follow recent context over distant system prompts.
    if (phaseInstruction) {
      const beat = chat.storyBeatInPhase || 0;
      if (beat > 0) {
        // Continuation beat — scene was already narrated, model must advance, not rewrite
        msgs.push({ role: 'system', content: `=== CONTINUE THE SCENE ===\nThe scene is already in progress — you wrote the previous part above. The player has responded with their choice. Now write what happens NEXT in this same scene. Pick up exactly where you left off.\n\nDo NOT rewrite, repeat, or summarize the previous scene. Do NOT re-describe the setting or re-introduce characters. Write only NEW content that follows from the player's action.\n\nScene context for reference (already narrated — do NOT repeat): ${phaseInstruction}\n\nREMINDER: Continue forward. New dialogue, new actions, new developments only.` });
      } else {
        msgs.push({ role: 'system', content: `=== CURRENT SCENE ===\n${phaseInstruction}\n\nREMINDER: Write ONLY this scene. Do NOT skip ahead to later parts of the day. Do NOT summarize the whole day. Stay in this moment.` });
      }
    }

    return sanitizeMessages(msgs);
  }
  // Adventure mode: use ADVENTURE_PROMPT with game state
  if (chat.mode === 'adventure') {
    const s = chat.advState || { location: 'The Clubroom', hp: 100, maxHp: 100, inventory: [], fragments: [], turns: 0 };
    let sys = ADVENTURE_PROMPT;
    sys += `\n\n=== CURRENT GAME STATE ===`;
    sys += `\nLocation: ${s.location}`;
    sys += `\nHP: ${s.hp}/${s.maxHp}`;
    sys += `\nInventory: ${s.inventory.length > 0 ? s.inventory.join(', ') : 'Empty'}`;
    sys += `\nFragments collected: ${s.fragments.length}/3${s.fragments.length > 0 ? ' (' + s.fragments.join(', ') + ')' : ''}`;
    sys += `\nTurns played: ${s.turns}`;

    let recentMessages = chat.messages;
    if (recentMessages.length > CHAT_MSG_LIMIT) {
      recentMessages = recentMessages.slice(-CHAT_MSG_LIMIT);
    }
    const msgs = recentMessages.map(m => ({ role: m.role, content: m.content }));
    return sanitizeMessages([{ role: 'system', content: sys }, ...msgs]);
  }

  const rel = RELATIONSHIPS[chat.relationship] || RELATIONSHIPS[2];
  let sys = BASE_PROMPT + '\n\n' + rel.prompt + buildProfilePrompt() + buildMemoryPrompt(chat);

  const mood = chat.mood || 'cheerful';
  const intensity = chat.moodIntensity || 'moderate';
  const drift = chat.drift || 'casual';
  const timeCtx = buildTimeContext(chat);

  sys += `\n\n=== CURRENT STATE ===\nMood: ${mood} (${intensity})\nDrift: ${drift}`;
  if (timeCtx) sys += `\n${timeCtx}`;
  sys += `\nLet your mood and drift evolve naturally from here.`;

  // Trim to last N messages for API — all remain visible in UI
  let recentChatMessages = chat.messages;
  if (recentChatMessages.length > CHAT_MSG_LIMIT) {
    recentChatMessages = recentChatMessages.slice(-CHAT_MSG_LIMIT);
  }

  // Strip legacy expression tags from old room mode messages
  // Handle multimodal messages (content arrays with images)
  const supportsVision = ['puter'].includes(provider);
  const msgs = recentChatMessages.map(m => {
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

  return sanitizeMessages([
    { role: 'system', content: sys },
    ...msgs
  ]);
}

// ====== NON-STREAMING PROVIDER DISPATCH (used by callAI for journals) ======
async function callProvider(chat) {
  let result;
  if (provider === 'llamacpp') result = await callLlamaCpp(chat);
  else if (provider === 'ollama') result = await callOllama(chat);
  else result = await callPuter(chat);
  return stripThinkTags(result);
}

// ====== STREAMING PROVIDER DISPATCH ======
async function callProviderStreaming(chat, onChunk, signal) {
  const filter = createThinkFilter(onChunk);
  let result;
  if (provider === 'llamacpp') result = await streamLlamaCpp(chat, c => filter.chunk(c), signal);
  else if (provider === 'ollama') result = await streamOllama(chat, c => filter.chunk(c), signal);
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

// ====== API: LLAMA.CPP (OpenAI-compatible, non-streaming) ======
async function callLlamaCpp(chat) {
  const isStory = chat.mode === 'story';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), isStory ? 300000 : 180000);
  try {
    const res = await fetch(`${llamacppEndpoint}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        ...(llamacppModel ? { model: llamacppModel } : {}),
        messages: buildMessages(chat),
        max_tokens: isStory ? 2048 : 1000,
        temperature: isStory ? 0.8 : 0.75,
        top_p: 0.92,
        repeat_penalty: 1.18
      })
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data?.error?.message || `llama.cpp error (${res.status})`);
    }
    const data = await res.json();
    return data.choices?.[0]?.message?.content?.trim() || '';
  } catch (err) {
    if (err.name === 'AbortError') throw new Error('llama.cpp request timed out.');
    throw new Error(err?.message || 'Cannot reach llama-server. Is it running?');
  } finally {
    clearTimeout(timer);
  }
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
          num_predict: isStory ? 2048 : 1000,
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
async function streamOllama(chat, onChunk, externalSignal) {
  const isStory = chat.mode === 'story';
  const timeout = isStory ? 300000 : 180000; // 5 min story, 3 min chat
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  // Forward external abort signal (e.g. cancel button) to our controller
  if (externalSignal) externalSignal.addEventListener('abort', () => controller.abort(), { once: true });

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
          num_predict: isStory ? 2048 : 1000,
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
async function streamSSE(url, headers, body, onChunk, signal) {
  const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify({ ...body, stream: true }), signal });
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

async function streamLlamaCpp(chat, onChunk, signal) {
  const isStory = chat.mode === 'story';
  return await streamSSE(
    `${llamacppEndpoint}/v1/chat/completions`,
    { 'Content-Type': 'application/json' },
    { ...(llamacppModel ? { model: llamacppModel } : {}), messages: buildMessages(chat), max_tokens: isStory ? 2048 : 1000, temperature: isStory ? 0.8 : 0.75, top_p: 0.92, repeat_penalty: 1.18, chat_template_kwargs: { enable_thinking: false } },
    onChunk, signal
  );
}

// ====== FETCH OLLAMA MODELS ======
async function fetchOllamaModels() {
  try {
    // Use /api/tags for rich metadata (family, parameter size, quantization)
    const res = await fetch(`${ollamaEndpoint}/api/tags`);
    if (!res.ok) return [];
    const data = await res.json();
    const models = (data.models || []).map(m => {
      const d = m.details || {};
      const family = prettifyFamily(d.family || m.name.split(':')[0]);
      const size = d.parameter_size || '';
      const quant = d.quantization_level || '';
      const sizeGB = m.size ? (m.size / 1e9).toFixed(1) + ' GB' : '';
      let label = family;
      if (size) label += ` ${size}`;
      if (quant) label += ` (${quant})`;
      return { id: m.name, label, family, size, quant, sizeGB, rawSize: parseFloat(size) || 0 };
    });
    // Sort by family, then largest first
    models.sort((a, b) => {
      if (a.family !== b.family) return a.family.localeCompare(b.family);
      return b.rawSize - a.rawSize;
    });
    return models;
  } catch {
    // Fallback to /v1/models if /api/tags fails
    try {
      const res = await fetch(`${ollamaEndpoint}/v1/models`);
      if (!res.ok) return [];
      const data = await res.json();
      return (data.data || []).map(m => ({ id: m.id, label: m.id, family: '', size: '', quant: '', sizeGB: '' }));
    } catch { return []; }
  }
}

function prettifyFamily(raw) {
  const map = {
    'llama': 'Llama', 'llama2': 'Llama 2', 'llama3': 'Llama 3', 'llama3.1': 'Llama 3.1', 'llama3.2': 'Llama 3.2', 'llama3.3': 'Llama 3.3',
    'gemma': 'Gemma', 'gemma2': 'Gemma 2', 'gemma3': 'Gemma 3',
    'qwen': 'Qwen', 'qwen2': 'Qwen 2', 'qwen2.5': 'Qwen 2.5', 'qwq': 'QwQ',
    'mistral': 'Mistral', 'mixtral': 'Mixtral',
    'phi': 'Phi', 'phi3': 'Phi 3', 'phi4': 'Phi 4',
    'deepseek': 'DeepSeek', 'deepseek-r1': 'DeepSeek R1', 'deepseek-v2': 'DeepSeek V2',
    'command-r': 'Command R', 'command-r-plus': 'Command R+',
    'codellama': 'Code Llama', 'starcoder': 'StarCoder', 'codegemma': 'CodeGemma',
    'nomic-embed-text': 'Nomic Embed', 'mxbai-embed-large': 'MxBai Embed',
    'yi': 'Yi', 'solar': 'Solar', 'internlm2': 'InternLM 2',
  };
  const lower = raw.toLowerCase().replace(/[-_]/g, '');
  // Try exact match first, then partial
  if (map[raw.toLowerCase()]) return map[raw.toLowerCase()];
  for (const [k, v] of Object.entries(map)) {
    if (lower === k.replace(/[-_. ]/g, '')) return v;
  }
  // Capitalize first letter of each word
  return raw.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

// ====== FETCH LLAMA.CPP MODELS ======
async function fetchLlamaCppModels() {
  try {
    const res = await fetch(`${llamacppEndpoint}/v1/models`);
    if (!res.ok) return [];
    const data = await res.json();
    const ids = (data.data || []).map(m => m.id).filter(Boolean);
    // Filter out split GGUF continuation parts (e.g. -00002-of-00003.gguf)
    // Only keep part 1 (which auto-loads the rest) and non-split models
    return ids.filter(id => {
      const splitMatch = id.match(/-(\d+)-of-(\d+)(\.gguf)?$/i);
      return !splitMatch || parseInt(splitMatch[1]) === 1;
    });
  } catch {}
  return [];
}

// ====== RAW AI CALL (for journals etc. — non-streaming) ======
async function callAI(messages, maxTokens = 1000, options = {}) {
  let raw;
  if (provider === 'puter') {
    try {
      const r = await puter.ai.chat(messages, { model: puterModel, stream: false });
      raw = extractPuterText(r).trim() || '';
    } catch (err) {
      throw new Error(err?.message || 'Puter request failed.');
    }
  } else if (provider === 'llamacpp') {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 300000);
    try {
      const res = await fetch(`${llamacppEndpoint}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({ ...(llamacppModel ? { model: llamacppModel } : {}), messages, max_tokens: maxTokens, temperature: 0.85, chat_template_kwargs: { enable_thinking: false } })
      });
      if (!res.ok) throw new Error('llama.cpp error');
      const data = await res.json();
      raw = data.choices?.[0]?.message?.content?.trim() || '';
    } catch (err) {
      if (err.name === 'AbortError') throw new Error('llama.cpp request timed out.');
      throw new Error(err?.message || 'Cannot reach llama-server.');
    } finally {
      clearTimeout(timer);
    }
  } else if (provider === 'ollama') {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 300000);
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
          ...(options.think === false ? { think: false } : {}),
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
    // Puter fallback
    try {
      const r = await puter.ai.chat(messages, { model: puterModel, stream: false });
      raw = extractPuterText(r).trim() || '';
    } catch (err) {
      throw new Error(err?.message || 'Puter request failed.');
    }
  }
  return stripThinkTags(raw);
}
