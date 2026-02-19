// ====== STORY MODE ======
function setNewChatMode(mode) {
  newChatMode = mode;
  $('modeChatBtn').classList.toggle('active', mode === 'chat');
  $('modeStoryBtn').classList.toggle('active', mode === 'story');
  $('modeAdventureBtn').classList.toggle('active', mode === 'adventure');
  $('chatModeOptions').style.display = mode === 'chat' ? '' : 'none';
  $('storyModeOptions').style.display = mode === 'story' ? '' : 'none';
  $('adventureModeOptions').style.display = mode === 'adventure' ? '' : 'none';

  if (mode === 'story') {
    $('newChatTitle').textContent = 'Doki Doki Literature Club';
    $('newChatSubtitle').textContent = 'Your story begins now.';
    $('startChatBtn').textContent = 'Begin Story';
  } else if (mode === 'adventure') {
    $('newChatTitle').textContent = 'The Poem Labyrinth';
    $('newChatSubtitle').textContent = 'A world woven from poems and dreams.';
    $('startChatBtn').textContent = 'Start Adventure';
  } else {
    $('newChatTitle').textContent = 'Talk to Monika';
    $('newChatSubtitle').textContent = 'How well do you two know each other?';
    $('startChatBtn').textContent = 'Start Chatting';
  }
}

function updateRoomRelDisplay() {
  const roomSlider = $('roomRelSlider');
  const roomLabel = $('roomRelLabel');
  const roomDesc = $('roomRelDesc');
  if (!roomSlider || !roomLabel || !roomDesc) return;
  const rel = RELATIONSHIPS[parseInt(roomSlider.value)] || RELATIONSHIPS[2];
  roomLabel.textContent = rel.label;
  roomDesc.textContent = rel.desc;
}

function resetNewChatScreen() {
  setNewChatMode('chat');
  relSlider.value = 2;
  updateRelDisplay();
  $('mcNameInput').value = profile.name || '';
}

// ====== PHASE HELPERS ======
function isEndOfDayPhase(p) {
  return p === 'wrap_up' || p === 'd1_wrap_up' || p === 'walk_home';
}

function initPhaseForDay(chat) {
  const day = chat.storyDay || 1;
  const seq = getPhaseSequence(day);
  chat.storyPhase = seq[0];
  chat.storyBeatInPhase = 0;
}

function advancePhase(chat) {
  const day = chat.storyDay || 1;
  const seq = getPhaseSequence(day);
  const idx = seq.indexOf(chat.storyPhase);
  if (idx >= 0 && idx < seq.length - 1) {
    chat.storyPhase = seq[idx + 1];
    chat.storyBeatInPhase = 0;
    return true;
  }
  return false;
}

function buildPhaseInstruction(chat) {
  const phaseKey = chat.storyPhase;
  const phase = STORY_PHASES[phaseKey];
  if (!phase) return '';
  const day = chat.storyDay || 1;

  let instruction = phase.instruction;

  // Dynamic free_time instruction — focused on chosen companion
  if (!instruction && phaseKey === 'free_time') {
    const aff = chat.storyAffinity || {};
    const girls = ['sayori', 'natsuki', 'yuri', 'monika'];
    const capName = n => n.charAt(0).toUpperCase() + n.slice(1);

    // Search all user messages for the companion choice (may not be the most recent on beat 1+)
    let companionMatch = null;
    for (let i = chat.messages.length - 1; i >= 0; i--) {
      const m = chat.messages[i];
      if (m.role === 'user' && typeof m.content === 'string') {
        const match = m.content.match(/^Spend time with (\w+)/i);
        if (match) { companionMatch = match; break; }
      }
    }

    if (companionMatch) {
      const companion = companionMatch[1];
      const bgActivities = {
        sayori: 'doodling in her notebook',
        natsuki: 'reading manga in the closet',
        yuri: 'reading by the window',
        monika: 'writing at the front desk'
      };
      const others = girls
        .filter(g => capName(g) !== companion)
        .map(g => `${capName(g)} is ${bgActivities[g]}`)
        .join('. ');

      instruction = `Day ${day} — Scene: Free time in the club. MC spends one-on-one time with ${companion}. Write a focused bonding scene between MC and ${companion}. Show their personality in this private moment — what they talk about, how they interact, the small details that make this feel real. The other girls are nearby doing their own things: ${others}. Do NOT include any tags like [END_OF_DAY], [POETRY], or [CHOICE] in your response.`;
    } else {
      // Pre-choice fallback (shouldn't normally reach AI since choices are shown first)
      instruction = `Day ${day} — Scene: Free time in the club! The girls are settling into their own activities. Do NOT include any tags like [END_OF_DAY], [POETRY], or [CHOICE] in your response.`;
    }
  }

  // Dynamic morning instruction — high-affinity girls may join the walk
  if (!instruction && phaseKey === 'morning') {
    const aff = chat.storyAffinity || {};
    const capName = n => n.charAt(0).toUpperCase() + n.slice(1);
    const y = chat.storyYesterday;

    // Find girls other than Sayori with affinity >= 40
    const qualifiers = ['natsuki', 'yuri', 'monika']
      .filter(g => (aff[g] || 0) >= 40)
      .sort((a, b) => (aff[b] || 0) - (aff[a] || 0));

    // Prefer yesterday's walk-home companion if she qualifies
    if (y && y.walkHomeWith && qualifiers.length > 0) {
      const walkGirl = y.walkHomeWith.toLowerCase();
      if (qualifiers.includes(walkGirl) && qualifiers[0] !== walkGirl) {
        // Move her to front
        const idx = qualifiers.indexOf(walkGirl);
        qualifiers.splice(idx, 1);
        qualifiers.unshift(walkGirl);
      }
    }

    // Build yesterday callback hint
    let yesterdayHint = '';
    if (y) {
      const parts = [];
      if (y.freeTimeWith) parts.push(`spent free time with ${y.freeTimeWith}`);
      if (y.walkHomeWith) parts.push(`walked home with ${y.walkHomeWith}`);
      if (parts.length) yesterdayHint = ` Yesterday, MC ${parts.join(' and ')}. A brief natural callback to yesterday is welcome — not a recap, just a small reference.`;
    }

    // Encounter descriptions per girl
    const encounters = {
      monika: `${capName('monika')} is walking the same route this morning — she falls into step alongside MC with a smile`,
      yuri: `${capName('yuri')} is standing at the crossroads with a book, and looks up surprised when she sees MC`,
      natsuki: `${capName('natsuki')} is coming out of the convenience store with a bag of snacks when she spots MC`
    };

    if (qualifiers.length > 0) {
      const mainGirl = qualifiers[0];
      let encounterText = `${encounters[mainGirl]}.`;
      if (qualifiers.length > 1) {
        const secondGirl = qualifiers[1];
        encounterText += ` Then ${encounters[secondGirl]}.`;
      }

      instruction = `Day ${day} — Scene: Morning walk to school. MC walks with Sayori (their daily neighbor routine). ${encounterText} Write a brief, charming morning scene. Show the dynamic between the girls and MC — Sayori is comfortable and familiar, while ${capName(mainGirl)} being here is a newer development that reflects their growing bond.${yesterdayHint} Keep it short and natural. Do NOT include any tags like [END_OF_DAY], [POETRY], or [CHOICE] in your response.`;
    } else {
      // Standard Sayori-only morning
      instruction = `Day ${day} — Scene: Morning walk to school. MC walks with Sayori (their daily neighbor routine). Brief morning interaction — maybe she overslept, maybe they chat about the day ahead.${yesterdayHint} Keep it short and charming. Do NOT include any tags like [END_OF_DAY], [POETRY], or [CHOICE] in your response.`;
    }
  }

  // Dynamic wrap_up instruction (legacy — for old saves still on wrap_up)
  if (!instruction && phaseKey === 'wrap_up') {
    const aff = chat.storyAffinity || {};
    const girls = ['sayori', 'natsuki', 'yuri', 'monika'];
    const highest = girls.reduce((a, b) => (aff[a] || 0) >= (aff[b] || 0) ? a : b);
    const name = highest.charAt(0).toUpperCase() + highest.slice(1);
    const isSayori = highest === 'sayori';
    instruction = `Scene: Monika announces the meeting is over for today. MC walks home with ${name}${isSayori ? ' (they always walk together as neighbors)' : ' (she offered to walk together)'}. A nice bonding moment on the walk. End your response with [END_OF_DAY] on its own line.`;
  }

  // Dynamic walk_home instruction — 2-beat atmospheric scene
  if (!instruction && phaseKey === 'walk_home') {
    let companion = 'Sayori';
    // Search all user messages for the walk-home choice (it may not be the most recent one on beat 1+)
    for (let i = chat.messages.length - 1; i >= 0; i--) {
      const m = chat.messages[i];
      if (m.role === 'user' && typeof m.content === 'string') {
        const match = m.content.match(/^Walk home with (\w+)/i);
        if (match) { companion = match[1]; break; }
      }
    }
    const isSayori = companion.toLowerCase() === 'sayori';
    const beat = chat.storyBeatInPhase || 0;

    if (beat === 0) {
      instruction = `Day ${day} — Scene: MC walks home with ${companion}${isSayori ? ' (they always walk together as neighbors)' : ''}.

This is the most special scene of the day — write it with rich sensory detail and emotional depth.

Set the scene: golden evening light, the school shrinking behind them, the rhythm of their footsteps on the sidewalk. Describe the world around them — the sky, the air, small details that make this moment feel alive.

${companion} is different in this private setting — more relaxed, more real. Show how their personality comes through when it's just the two of them.

Open a conversation that feels natural to the moment. Let them settle into each other's company.

Do NOT include [END_OF_DAY]. Do NOT rush to a conclusion — this walk has just begun. Do NOT include any tags like [POETRY] or [CHOICE] in your response.`;
    } else {
      instruction = `Day ${day} — Scene: MC continues walking home with ${companion}${isSayori ? ' (neighbors)' : ''}.

Deepen the moment. The conversation has found its groove — let it go somewhere meaningful. Maybe a shared laugh, a quiet confession, a comfortable silence that says more than words.

Rich sensory detail: the light is changing, the world is settling into evening. Small details anchor the scene — a breeze, distant sounds, the way ${companion} looks in this light.

Bring the walk to a warm, memorable close. This should feel like the moment the player remembers from today.

End your response with [END_OF_DAY] on its own line.`;
    }
  }

  if (!instruction) return '';

  // Replace {{DAY}} tokens
  if (instruction) instruction = instruction.replace(/\{\{DAY\}\}/g, String(day));

  // Append phase-specific rivalry hint if active
  const rivalryHint = buildPhaseRivalryHint(chat, phaseKey);
  if (rivalryHint) instruction += '\n\n' + rivalryHint;

  // Build scene header with day awareness
  let header = `=== CURRENT SCENE: ${phase.label} (Day ${day}) ===\nThis is DAY ${day} of the story.`;
  if (day > 1) {
    header += ` MC has been in the club for ${day - 1} day(s). He knows all the girls. Do NOT write first-meeting scenes.`;
  }
  header += `\nYou MUST write this scene as described below. The user's previous choice affects tone and affinity only — it does NOT override this scene.`;

  return `${header}\n\n${instruction}`;
}

// Phase-specific rivalry hint — only fires when active rivalry exists
function buildPhaseRivalryHint(chat, phaseKey) {
  const aff = chat.storyAffinity || {};
  const sorted = AFFINITY_GIRL_NAMES
    .map(g => ({ name: g.charAt(0).toUpperCase() + g.slice(1), key: g, val: aff[g] || 0 }))
    .sort((a, b) => b.val - a.val);
  const leader = sorted[0];
  const second = sorted[1];

  // Only fire for active rivalry: both >= 25, gap <= 8
  if (!(leader.val >= 25 && second.val >= 25 && leader.val - second.val <= 8)) return '';

  const hints = {
    club_activity: `RIVALRY NOTE: ${leader.name} and ${second.name} subtly compete during the activity — trying to impress MC or outshine each other.`,
    free_time: `RIVALRY NOTE: The girl MC didn't choose (${leader.name} or ${second.name}) may react with mild disappointment or a pointed comment.`,
    meeting_end: `RIVALRY NOTE: As the meeting ends, there's subtle tension about who MC will walk home with — ${leader.name} and ${second.name} are both aware of the stakes.`
  };

  return hints[phaseKey] || '';
}

// Build walk-home choices sorted by affinity with activity-grounded flavor text
function buildWalkHomeChoices(chat) {
  const aff = chat.storyAffinity || {};
  const girls = ['sayori', 'natsuki', 'yuri', 'monika'];
  const capName = n => n.charAt(0).toUpperCase() + n.slice(1);
  const sorted = girls.map(g => ({ name: g, val: aff[g] || 0 })).sort((a, b) => b.val - a.val);

  const activities = {
    sayori: "she's stuffing her notebook into her bag haphazardly",
    natsuki: "she's carefully stacking her manga back into the closet",
    yuri: "she's sliding a bookmark into her novel and gathering her things",
    monika: "she's organizing the club papers into a neat folder"
  };

  return sorted.map(g => {
    const name = capName(g.name);
    const activity = activities[g.name];
    if (g.val >= 40) {
      const warmth = {
        sayori: "she's already at your side, ready to go",
        natsuki: "she lingers by the door, pretending she's not waiting for you",
        yuri: "she pauses at the door and looks back at you hopefully",
        monika: "she catches your eye and tilts her head toward the door"
      };
      return `Walk home with ${name} — ${warmth[g.name]}`;
    } else if (g.val >= 20) {
      return `Walk home with ${name} — ${activity}`;
    } else {
      const distant = {
        sayori: "your neighbor — she's heading out anyway",
        natsuki: "she's already halfway out the door",
        yuri: "she's quietly slipping out on her own",
        monika: "she's still busy with club duties"
      };
      return `Walk home with ${name} — ${distant[g.name]}`;
    }
  });
}

// Build free-time choices sorted by affinity with activity-grounded flavor text
function buildFreeTimeChoices(chat) {
  const aff = chat.storyAffinity || {};
  const girls = ['sayori', 'natsuki', 'yuri', 'monika'];
  const capName = n => n.charAt(0).toUpperCase() + n.slice(1);
  const sorted = girls.map(g => ({ name: g, val: aff[g] || 0 })).sort((a, b) => b.val - a.val);

  const activities = {
    sayori: "she's doodling hearts in her notebook and humming to herself",
    natsuki: "she's arranging her manga collection in the closet",
    yuri: "she's curled up by the window, deep in a thick novel",
    monika: "she's writing something in her journal at the front desk"
  };

  return sorted.map(g => {
    const name = capName(g.name);
    const activity = activities[g.name];
    if (g.val >= 40) {
      // High: she notices MC and brightens — active invitation vibe
      const warmth = {
        sayori: "she spots you and lights up, waving you over",
        natsuki: "she glances up and quickly makes room beside her",
        yuri: "she looks up and her face brightens when she sees you",
        monika: "she notices you and closes her journal with a smile"
      };
      return `Spend time with ${name} — ${warmth[g.name]}`;
    } else if (g.val >= 20) {
      // Mid: approachable — neutral/friendly vibe
      return `Spend time with ${name} — ${activity}`;
    } else {
      // Low: absorbed in her thing — MC would need to initiate
      const absorbed = {
        sayori: "she seems lost in her own little world",
        natsuki: "she hasn't looked up from what she's doing",
        yuri: "she's completely absorbed in her book",
        monika: "she's focused intently on her writing"
      };
      return `Spend time with ${name} — ${absorbed[g.name]}`;
    }
  });
}

// Ensure phase is valid for the current day; re-init if stale or missing
function ensurePhase(chat) {
  if (!chat.storyPhase) {
    initPhaseForDay(chat);
    return;
  }
  // Migration: old saves on wrap_up for day 2+ → meeting_end
  if (chat.storyPhase === 'wrap_up' && (chat.storyDay || 1) > 1) {
    console.log('[STORY-MIGRATION] Migrating wrap_up → meeting_end for day', chat.storyDay);
    chat.storyPhase = 'meeting_end';
    chat.storyBeatInPhase = 0;
    saveChats();
    return;
  }
  const seq = getPhaseSequence(chat.storyDay || 1);
  if (!seq.includes(chat.storyPhase)) {
    initPhaseForDay(chat);
  }
}

// ====== PARSING ======
const AFFINITY_NAMES = /(?:Sayori|Natsuki|Yuri|Monika)/i;
const BARE_AFFINITY_RE = /(?:^|\n)\s*(?:(?:Sayori|Natsuki|Yuri|Monika)\s*[:=]\s*-?\d+[\s,]*){2,}\s*$/i;

function parseAffinityPairs(str) {
  const affinity = {};
  str.split(/[,;\n]+/).forEach(pair => {
    const m = pair.match(/(Sayori|Natsuki|Yuri|Monika)\s*[:=]\s*(-?\d+)/i);
    if (m) affinity[m[1].trim().toLowerCase()] = Math.min(100, Math.max(0, parseInt(m[2]) || 0));
  });
  return Object.keys(affinity).length >= 2 ? affinity : null;
}

function parseStoryResponse(text) {
  const hasPoetry = /\[POETRY\]/i.test(text);
  const isEndOfDay = /\[END_OF_DAY\]/i.test(text);

  // Try tagged format first: [AFFINITY:Sayori=X,...] or [ASSIMILATION:...] (common model typo)
  let affinity = null;
  const taggedMatch = text.match(/\[(?:AFFINITY|ASSIMILATION)[:\s]([^\]]+)\]/i);
  if (taggedMatch) {
    affinity = parseAffinityPairs(taggedMatch[1]);
  }
  // Fallback: bare "Sayori=2, Natsuki=1, ..." at end of text
  if (!affinity) {
    const bareMatch = text.match(BARE_AFFINITY_RE);
    if (bareMatch) {
      affinity = parseAffinityPairs(bareMatch[0]);
    }
  }

  const narrative = text
    .replace(/\[DAY:\d+\]\s*/g, '')
    .replace(/\[POETRY\]\s*/gi, '')
    .replace(/\[END_OF_DAY\]\s*/gi, '')
    .replace(/\[(?:AFFINITY|ASSIMILATION)[:\s][^\]]*\]\s*/gi, '')
    .replace(/\[CHOICE[_ ]?\d?\]\s*.+/gi, '')
    // Strip bare affinity lines (Name=X, Name=X pattern at end)
    .replace(/(?:^|\n)\s*(?:(?:Sayori|Natsuki|Yuri|Monika)\s*[:=]\s*-?\d+[\s,]*){2,}\s*$/gi, '')
    .trim();
  return { narrative, hasPoetry, isEndOfDay, affinity };
}

// ====== AI CHOICE GENERATION ======
async function generateStoryChoices(narrative, phase, chat, staticChoices) {
  // Use the full latest narrative — this is the scene the choices respond to
  const excerpt = narrative.length > 2000 ? '...' + narrative.slice(-2000) : narrative;
  const phaseLabel = phase ? phase.label : 'Scene';
  const name = chat.mcName || 'MC';
  const day = chat.storyDay || 1;
  const aff = chat.storyAffinity || {};

  // Build affinity context
  function tierLabel(val) {
    if (val >= 51) return 'romantic interest';
    if (val >= 31) return 'friends';
    if (val >= 16) return 'warming up';
    return 'stranger';
  }
  const affinityCtx = ['sayori', 'natsuki', 'yuri', 'monika'].map(g => {
    const val = aff[g] || 0;
    return `${g.charAt(0).toUpperCase() + g.slice(1)}: ${val} (${tierLabel(val)})`;
  }).join(', ');

  // Build scene hint from phase instruction
  let sceneHint = '';
  if (phase && phase.instruction) {
    sceneHint = phase.instruction.replace(/\{\{DAY\}\}/g, String(day));
  } else if (phase) {
    sceneHint = phase.label;
  }

  const prompt = `Given this scene from a Doki Doki Literature Club visual novel (Day ${day}), write exactly 4 choices for what the player character (${name}) could do or say NEXT. The choices must directly respond to what just happened in the scene — reference specific dialogue, actions, or moments from the text.

Relationships — ${name}'s current affinity with each girl:
${affinityCtx}
Choices should reflect these relationships. A girl ${name} is close to warrants warmer/bolder options. A stranger warrants cautious/curious options.

${sceneHint ? `Upcoming scene context: ${sceneHint}\nChoices should naturally lead into this next scene when possible.` : ''}
Rules:
- Choices must be grounded in the scene above. If a character just said or did something, choices should react to THAT.
- Reference specific character names, dialogue, or actions from the scene text.
- Each choice: one sentence, under 80 characters. Each choice should hint at a consequence or emotional direction — use an em-dash with a brief flavor note.
- Write in IMPERATIVE or SECOND PERSON ("Tell Sayori...", "Ask about...", "Compliment her..."). Do NOT use first person ("I").
- ${name} IS the player character — NEVER refer to ${name} in third person. The player IS ${name}.
- Vary the tone: mix bold, cautious, funny, and sincere options.
- Format: numbered list (1. 2. 3. 4.) — output ONLY the choices, no preamble or commentary.
${staticChoices && staticChoices.length > 0 ? `
Here are the default generic choices for this phase. You MUST write NEW choices that are MORE SPECIFIC to the actual scene content above. Do NOT repeat or rephrase these defaults:
${staticChoices.join('\n')}` : ''}

Scene (${phaseLabel}):
"""
${excerpt}
"""

Choices:`;

  try {
    const result = await callAI([
      { role: 'user', content: prompt }
    ], 1200);
    if (!result || !result.trim()) {
      console.warn('[STORY] AI returned empty result (thinking model may have used all tokens on <think> block)');
      return null;
    }
    const lines = result.split('\n').map(l => l.trim()).filter(Boolean);

    // Cascading parser — try numbered, then bullets, then bare lines
    let choices = parseNumberedChoices(lines);
    if (choices.length < 3) choices = parseBulletChoices(lines);
    if (choices.length < 3) choices = parseBareLineChoices(lines);

    if (choices.length >= 3 && choices.length <= 5) return choices.slice(0, 4);
    console.warn('[STORY] AI choices could not be parsed. Raw:\n' + result);
  } catch (e) {
    console.warn('[STORY] AI choice generation error:', e?.message || e);
  }
  return null; // Signal to use fallback
}

function parseNumberedChoices(lines) {
  const choices = [];
  for (const line of lines) {
    // Handle: 1. / 1) / 1: / 1- and bold variants like **1.** or **1)**
    const m = line.match(/^(?:\*\*)?(\d+)[.):\-](?:\*\*)?\s*(.+)/);
    if (m && m[2].trim().length >= 5) choices.push(m[2].trim().replace(/^["']|["']$/g, ''));
  }
  return choices;
}

function parseBulletChoices(lines) {
  const choices = [];
  for (const line of lines) {
    const m = line.match(/^[-*•]\s+(.+)/);
    if (m && m[1].trim().length >= 5) choices.push(m[1].trim().replace(/^["']|["']$/g, ''));
  }
  return choices;
}

function parseBareLineChoices(lines) {
  // Only use if exactly 3-5 non-empty lines of reasonable length
  const candidates = lines.filter(l => l.length >= 5 && l.length <= 120);
  if (candidates.length >= 3 && candidates.length <= 5) {
    return candidates.map(l => l.replace(/^["']|["']$/g, '').replace(/^\d+\.\s*/, ''));
  }
  return [];
}

// Try AI choice generation in the background; swap in if successful before user clicks
function tryAIChoices(narrative, phase, chat, staticChoices) {
  // Show generating indicator on the choices
  const choicesEl = chatArea.querySelector('.story-choices-inline');
  if (choicesEl) {
    const ind = document.createElement('div');
    ind.className = 'choices-generating';
    ind.id = 'choicesGeneratingIndicator';
    ind.innerHTML = '<span class="choices-gen-dots"><span></span><span></span><span></span></span> Generating smarter choices\u2026';
    choicesEl.prepend(ind);
  }

  // 90 seconds — slow local models (3-6 tok/s) need 30-60s for 400 tokens
  const timeout = new Promise(resolve => setTimeout(() => resolve(null), 90000));
  Promise.race([generateStoryChoices(narrative, phase, chat, staticChoices), timeout]).then(aiChoices => {
    const ind = $('choicesGeneratingIndicator');
    if (aiChoices && aiChoices.length >= 2) {
      if (ind) ind.remove();
      // Only swap if the inline choices are still showing (user hasn't clicked yet)
      const existing = chatArea.querySelector('.story-choices-inline');
      if (existing && !isGenerating) {
        chat.lastChoices = aiChoices;
        saveChats();
        renderStoryChoices(aiChoices);
      }
    } else {
      // AI succeeded but parsing failed — show brief hint before removing indicator
      if (ind) {
        ind.textContent = 'Using default choices';
        setTimeout(() => ind.remove(), 1500);
      }
    }
  }).catch((err) => {
    console.warn('[STORY] AI choice generation failed:', err?.message || err);
    const ind = $('choicesGeneratingIndicator');
    if (ind) {
      ind.textContent = 'Using default choices';
      setTimeout(() => ind.remove(), 1500);
    }
  });
}

// ====== UI HELPERS ======
function insertStoryNarrative(text, animate = true, model = null) {
  const div = document.createElement('div');
  div.className = 'message narrator';
  if (!animate) div.style.animation = 'none';
  const modelTag = model ? `<div class="msg-model">${escapeHtml(formatModelLabel(model))}</div>` : '';
  div.innerHTML = `<div class="msg-content"><div class="msg-bubble">${renderMarkdown(text)}</div>${modelTag}</div>`;
  chatArea.insertBefore(div, typingIndicator);
}

function renderStoryChoices(choices) {
  console.log('[STORY] renderStoryChoices called with:', choices);
  // Remove any existing inline choice container
  const existing = chatArea.querySelector('.story-choices-inline');
  if (existing) existing.remove();
  // Also hide the old external container just in case
  $('storyChoices').style.display = 'none';

  const container = document.createElement('div');
  container.className = 'story-choices-inline';
  choices.forEach(choice => {
    const btn = document.createElement('button');
    btn.className = 'story-choice-btn';
    btn.textContent = choice;
    btn.addEventListener('click', () => selectStoryChoice(choice));
    container.appendChild(btn);
  });
  chatArea.insertBefore(container, typingIndicator);
  // Force reflow then log flat values (no expandable Object)
  const h = container.offsetHeight;
  const rect = container.getBoundingClientRect();
  const aRect = chatArea.getBoundingClientRect();
  console.log('[STORY] choices inserted — height:', h, 'top:', rect.top, 'bottom:', rect.bottom,
    'chatArea bottom:', aRect.bottom, 'scroll:', chatArea.scrollTop, '/', chatArea.scrollHeight, 'client:', chatArea.clientHeight);
  // Scroll the choices into view directly (belt-and-suspenders with scrollToBottom)
  container.scrollIntoView({ block: 'end', behavior: 'smooth' });
  scrollToBottom();
  // Delayed verification — is the element still visible after 2 seconds?
  setTimeout(() => {
    const el = chatArea.querySelector('.story-choices-inline');
    if (el) {
      const r = el.getBoundingClientRect();
      const a = chatArea.getBoundingClientRect();
      const s = getComputedStyle(el);
      console.log('[STORY] 2s check — IN DOM, display:', s.display, 'visibility:', s.visibility,
        'opacity:', s.opacity, 'height:', el.offsetHeight, 'rect:', Math.round(r.top), '-', Math.round(r.bottom),
        'chatArea:', Math.round(a.top), '-', Math.round(a.bottom), 'scroll:', chatArea.scrollTop, '/', chatArea.scrollHeight);
    } else {
      console.log('[STORY] 2s check — GONE from DOM!');
    }
  }, 2000);
}

function hideStoryChoices() {
  console.log('[STORY] hideStoryChoices called', new Error().stack?.split('\n')[2]?.trim());
  const existing = chatArea.querySelector('.story-choices-inline');
  if (existing) existing.remove();
  $('storyChoices').style.display = 'none';
}

function showWordPicker() {
  selectedWords = [];
  wordMap = {};
  const grid = $('wordGrid');
  grid.innerHTML = '';
  const allWords = [];
  for (const [girl, words] of Object.entries(POEM_WORDS)) {
    const shuffled = [...words].sort(() => Math.random() - 0.5).slice(0, 5);
    shuffled.forEach(w => { allWords.push(w); wordMap[w] = girl; });
  }
  allWords.sort(() => Math.random() - 0.5);
  allWords.forEach(word => {
    const chip = document.createElement('button');
    chip.className = 'word-chip';
    chip.textContent = word;
    chip.addEventListener('click', () => toggleWord(word, chip));
    grid.appendChild(chip);
  });
  $('wordCount').textContent = '0/5';
  $('wordSubmitBtn').disabled = true;
  $('wordPicker').style.display = '';
  hideStoryChoices();
}

function hideWordPicker() {
  $('wordPicker').style.display = 'none';
  selectedWords = [];
}

function toggleWord(word, chip) {
  if (selectedWords.includes(word)) {
    selectedWords = selectedWords.filter(w => w !== word);
    chip.classList.remove('selected');
  } else if (selectedWords.length < 5) {
    selectedWords.push(word);
    chip.classList.add('selected');
  }
  $('wordCount').textContent = `${selectedWords.length}/5`;
  $('wordSubmitBtn').disabled = selectedWords.length !== 5;
}

async function submitPoem() {
  if (selectedWords.length !== 5) return;
  const chat = getChat();
  if (!chat || isGenerating) return;
  const counts = { sayori: 0, natsuki: 0, yuri: 0, monika: 0 };
  selectedWords.forEach(w => { if (wordMap[w]) counts[wordMap[w]]++; });
  const topGirl = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
  const topName = topGirl.charAt(0).toUpperCase() + topGirl.slice(1);
  const message = `[Poem words: ${selectedWords.join(', ')}] My poem resonates most with ${topName}'s style.`;
  hideWordPicker();
  chat.messages.push({ role: 'user', content: message });
  // After poem submission, advance to poem_reactions phase
  if (chat.storyPhase === 'poem_sharing') {
    advancePhase(chat);
  }
  saveChats();
  insertMessageEl('user', `Wrote a poem with: ${selectedWords.join(', ')}`);
  scrollToBottom();
  updateContextBar();
  await generateStoryBeat(chat);
}

async function selectStoryChoice(choice) {
  const chat = getChat();
  if (!chat || isGenerating) return;
  hideStoryChoices();

  // Retry doesn't push a message
  if (choice === 'Retry') {
    await generateStoryBeat(chat);
    return;
  }

  // "End of day — read diaries" — user is ready to see the journal overlay
  if (choice === 'End of day — read diaries') {
    await showEndOfDay(chat);
    return;
  }

  // "Spend time with X" — player chose a free-time companion
  if (choice.startsWith('Spend time with ')) {
    chat.messages.push({ role: 'user', content: choice });
    saveChats();
    insertMessageEl('user', choice);
    scrollToBottom();
    // Do NOT advancePhase — we're already IN free_time
    updateContextBar();
    await generateStoryBeat(chat);
    return;
  }

  // "Walk home with X" — player chose a companion
  if (choice.startsWith('Walk home with ')) {
    chat.messages.push({ role: 'user', content: choice });
    saveChats();
    insertMessageEl('user', choice);
    scrollToBottom();
    // Advance meeting_end → walk_home
    advancePhase(chat);
    updatePhaseDisplay(chat);
    updateContextBar();
    await generateStoryBeat(chat);
    return;
  }

  // "Begin next day" from replay — advance day only if closeJournal didn't already run
  if (choice === 'Begin next day') {
    const lastMsg = chat.messages[chat.messages.length - 1];
    const isStillWrapUp = isEndOfDayPhase(chat.storyPhase);
    if (isStillWrapUp && lastMsg?.role === 'assistant' && /\[END_OF_DAY\]/i.test(lastMsg.content)) {
      if (!chat.storyYesterday) chat.storyYesterday = buildYesterdaySummary(chat);
      chat.storyDay = (chat.storyDay || 1) + 1;
      initPhaseForDay(chat);
      chat.lastChoices = null;
      updateChatHeader(chat);
      updateVnDay(chat.storyDay);
      updatePhaseDisplay(chat);
    }
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
    saveChats();
    await generateStoryBeat(chat);
    return;
  }

  // Don't push "Continue" as a visible user message — just nudge the story forward
  if (choice === 'Continue') {
    const lastMsg = chat.messages[chat.messages.length - 1];
    // Avoid duplicate [Continue] messages (e.g., after failed day transition + reload)
    if (!(lastMsg?.role === 'user' && lastMsg?.content === '[Continue]')) {
      chat.messages.push({ role: 'user', content: '[Continue]' });
      saveChats();
    }
  } else {
    chat.messages.push({ role: 'user', content: choice });
    saveChats();
    insertMessageEl('user', choice);
    scrollToBottom();
  }
  updateContextBar();
  await generateStoryBeat(chat);
}

// ====== LIVE TAG STRIPPING (for streaming display) ======
function liveStripTags(text) {
  return text
    .replace(/\[DAY:\d+\]\s*/g, '')
    .replace(/\[(?:AFFINITY|ASSIMILATION)[:\s][^\]]*\]\s*/gi, '')
    .replace(/\[CHOICE[_ ]?\d?\]\s*.+/gi, '')
    .replace(/\[END_OF_DAY\]\s*/gi, '')
    .replace(/\[POETRY\]\s*/gi, '')
    // Strip bare affinity lines during streaming
    .replace(/(?:^|\n)\s*(?:(?:Sayori|Natsuki|Yuri|Monika)\s*[:=]\s*-?\d+[\s,]*){2,}\s*$/gi, '')
    .trim();
}

// ====== DAY TRANSITION RECOVERY ======
function validateDayTransition(chat) {
  const phase = STORY_PHASES[chat.storyPhase];
  const isWrapPhase = isEndOfDayPhase(chat.storyPhase);
  const seq = getPhaseSequence(chat.storyDay || 1);

  // Recovery: phase is wrap-up but storyDay was already incremented (partial closeJournal)
  // Detect: wrap phase doesn't belong to current day's sequence
  if (isWrapPhase && !seq.includes(chat.storyPhase)) {
    console.log('[STORY-RECOVERY] Phase is wrap-up but not in current day sequence — re-initializing phase for day', chat.storyDay);
    initPhaseForDay(chat);
    saveChats();
  }

  // Recovery: storyBeatInPhase unreasonably high (> maxBeats + 2)
  if (phase && chat.storyBeatInPhase > phase.maxBeats + 2) {
    console.log('[STORY-RECOVERY] storyBeatInPhase', chat.storyBeatInPhase, 'exceeds maxBeats', phase.maxBeats, '+ 2 — resetting to 0');
    chat.storyBeatInPhase = 0;
    saveChats();
  }

  // Recovery: stale "Begin next day" in lastChoices from old code
  if (chat.lastChoices && chat.lastChoices.includes('Begin next day')) {
    console.log('[STORY-RECOVERY] Converting stale "Begin next day" choice to "End of day — read diaries"');
    chat.lastChoices = chat.lastChoices.map(c => c === 'Begin next day' ? 'End of day — read diaries' : c);
    saveChats();
  }
}

// ====== GENERATE STORY BEAT (phase-aware, streaming) ======
async function generateStoryBeat(chat) {
  console.log('[STORY] generateStoryBeat called', { phase: chat.storyPhase, beat: chat.storyBeatInPhase, isGenerating, msgCount: chat.messages.length });
  if (isGenerating) { console.log('[STORY] BLOCKED — isGenerating is true, returning early'); return; }
  if (provider === 'openrouter' && !apiKey) { openSettings(); showToast('Enter your OpenRouter API key first.'); return; }
  if (provider === 'gemini' && !geminiKey) { openSettings(); showToast('Enter your Gemini API key first.'); return; }

  // Ensure phase is initialized and valid
  ensurePhase(chat);
  validateDayTransition(chat);

  isGenerating = true;
  typingIndicator.classList.add('visible');
  scrollToBottom();
  updatePhaseDisplay(chat);

  let streamDiv = null;
  let streamBubble = null;

  try {
    let fullText = '';
    let updatePending = false;

    await callProviderStreaming(chat, (chunk) => {
      // On first chunk, swap typing indicator for live narrative element
      if (!streamDiv) {
        typingIndicator.classList.remove('visible');
        streamDiv = document.createElement('div');
        streamDiv.className = 'message narrator';
        streamDiv.innerHTML = '<div class="msg-content"><div class="msg-bubble"></div></div>';
        chatArea.insertBefore(streamDiv, typingIndicator);
        streamBubble = streamDiv.querySelector('.msg-bubble');
      }
      fullText += chunk;
      // Throttle DOM updates to animation frames
      if (!updatePending) {
        updatePending = true;
        requestAnimationFrame(() => {
          const liveText = liveStripTags(fullText);
          if (liveText && streamBubble) streamBubble.innerHTML = renderMarkdown(liveText);
          scrollToBottom();
          updatePending = false;
        });
      }
    });

    const rawReply = fullText.trim();

    // Guard: empty response
    if (!rawReply) {
      if (streamDiv) streamDiv.remove();
      throw new Error('Got an empty response from the model. Try again.');
    }

    const { narrative, hasPoetry, isEndOfDay, affinity } = parseStoryResponse(rawReply);
    console.log('[STORY] parsed response', { narrativeLen: narrative.length, hasPoetry, isEndOfDay, hasAffinity: !!affinity });

    // Guard: garbled response — too short or degenerated word salad
    if (narrative.length < 20) {
      if (streamDiv) streamDiv.remove();
      throw new Error('Model returned a garbled response. Try again.');
    }
    // Detect degeneration: if any single sentence (split by period) is over 500 chars,
    // the model likely fell into a word-association loop
    const sentences = narrative.split(/[.!?]+/);
    const hasDegeneration = sentences.some(s => s.trim().length > 500);
    if (hasDegeneration) {
      if (streamDiv) streamDiv.remove();
      throw new Error('Model output degenerated into nonsense. Try again or switch to a different model.');
    }

    // Final clean render (replaces streamed text with properly parsed narrative)
    typingIndicator.classList.remove('visible');
    if (streamBubble) streamBubble.innerHTML = renderMarkdown(narrative);

    // Append model attribution tag
    if (streamDiv) {
      const modelKey = getCurrentModelKey();
      if (modelKey) {
        const modelTag = document.createElement('div');
        modelTag.className = 'msg-model';
        modelTag.textContent = formatModelLabel(modelKey);
        const msgContent = streamDiv.querySelector('.msg-content');
        if (msgContent) msgContent.appendChild(modelTag);
      }
    }

    // Day is JS-authoritative — ignore model's day tag, use our tracked day
    updateChatHeader(chat);
    updateVnDay(chat.storyDay || 1);

    // Affinity fallback — merge with existing, never lose values
    // Rule-based filter: only accept affinity changes for characters actually present in the scene
    const prev = { ...(chat.storyAffinity || { sayori: 15, natsuki: 1, yuri: 1, monika: 10 }) };
    if (affinity) {
      const sceneLower = narrative.toLowerCase();
      chat.storyAffinity = {
        sayori: (sceneLower.includes('sayori') && affinity.sayori != null) ? affinity.sayori : prev.sayori,
        natsuki: (sceneLower.includes('natsuki') && affinity.natsuki != null) ? affinity.natsuki : prev.natsuki,
        yuri: (sceneLower.includes('yuri') && affinity.yuri != null) ? affinity.yuri : prev.yuri,
        monika: (sceneLower.includes('monika') && affinity.monika != null) ? affinity.monika : prev.monika
      };
    } else {
      chat.storyAffinity = prev;
    }
    // Detect milestone crossings and fire toasts
    detectMilestones(chat, prev, chat.storyAffinity);
    updateAffinityPanel(chat.storyAffinity);
    updateRouteIndicator(chat);
    updateDynamicsPanel(chat);

    chat.messages.push({ role: 'assistant', content: rawReply, model: getCurrentModelKey() });
    updateVnSprites(narrative);
    scrollToBottom();
    updateContextBar();

    // Increment beat counter
    chat.storyBeatInPhase = (chat.storyBeatInPhase || 0) + 1;
    const phase = STORY_PHASES[chat.storyPhase];
    const isWrapPhase = isEndOfDayPhase(chat.storyPhase);

    // 1. Handle end of day — ONLY honor [END_OF_DAY] during wrap-up/walk_home phases
    if ((isEndOfDay && isWrapPhase) || (phase && phase.forceEndOfDay && chat.storyBeatInPhase >= phase.maxBeats)) {
      console.log('[STORY] → path 1: end of day (showing diary choice)');
      chat.lastChoices = ['End of day — read diaries'];
      saveChats();
      renderStoryChoices(['End of day — read diaries']);
      scrollToBottom();
      return;
    }

    // 2. Handle poetry tag — ONLY during poem_sharing phase
    if (hasPoetry && (phase && phase.triggerPoetry)) {
      console.log('[STORY] → path 2: poetry trigger');
      saveChats();
      showWordPicker();
      return;
    }

    // 3. Check if we've hit maxBeats — advance to next phase
    if (phase && chat.storyBeatInPhase >= phase.maxBeats) {
      // Special case: meeting_end → show walk-home choices instead of advancing
      if (chat.storyPhase === 'meeting_end') {
        console.log('[STORY] → path 3-meeting: showing walk-home choices');
        const walkChoices = buildWalkHomeChoices(chat);
        chat.lastChoices = walkChoices;
        saveChats();
        renderStoryChoices(walkChoices);
        scrollToBottom();
        return;
      }
      advancePhase(chat);
      updatePhaseDisplay(chat);
      // Special case: advancing TO free_time → show companion choices
      if (chat.storyPhase === 'free_time') {
        console.log('[STORY] → path 3-freetime: showing free-time choices');
        const freeChoices = buildFreeTimeChoices(chat);
        chat.lastChoices = freeChoices;
        saveChats();
        renderStoryChoices(freeChoices);
        scrollToBottom();
        return;
      }
      const nextPhase = STORY_PHASES[chat.storyPhase];
      if (nextPhase && !nextPhase.noChoices && nextPhase.choices) {
        console.log('[STORY] → path 3a: maxBeats, advancing with next phase choices', nextPhase.choices);
        chat.lastChoices = nextPhase.choices;
        saveChats();
        renderStoryChoices(nextPhase.choices);
        tryAIChoices(narrative, nextPhase, chat, nextPhase.choices);
      } else {
        console.log('[STORY] → path 3b: maxBeats, advancing with Continue');
        chat.lastChoices = null;
        saveChats();
        renderStoryChoices(['Continue']);
      }
      scrollToBottom();
      return;
    }

    // 4. noChoices enforcement — show Continue
    if (phase && phase.noChoices) {
      console.log('[STORY] → path 4: noChoices phase, showing Continue');
      chat.lastChoices = null;
      saveChats();
      renderStoryChoices(['Continue']);
      scrollToBottom();
      return;
    }

    // 5. Normal: show static choices instantly, try AI enhancement in background
    const staticChoices = (phase && phase.choices) || ['Continue'];
    console.log('[STORY] → path 5: normal choices', staticChoices);
    chat.lastChoices = staticChoices;
    saveChats();
    renderStoryChoices(staticChoices);
    scrollToBottom();
    updatePhaseDisplay(chat);
    if (phase && !phase.noChoices) {
      tryAIChoices(narrative, phase, chat, staticChoices);
    }

  } catch (err) {
    console.error('[STORY] error in generateStoryBeat:', err);
    if (streamDiv) streamDiv.remove();
    typingIndicator.classList.remove('visible');
    showToast(err.message || 'Something went wrong.');
    renderStoryChoices(['Retry']);
    scrollToBottom();
  } finally {
    isGenerating = false;
  }
}

// Failsafe: user can always force-continue if stuck
function forceStoryRetry() {
  const chat = getChat();
  if (!chat || chat.mode !== 'story') return;
  if (isGenerating) {
    isGenerating = false;
    typingIndicator.classList.remove('visible');
  }
  hideStoryChoices();
  hideWordPicker();
  generateStoryBeat(chat);
}

// ====== MILESTONE DETECTION ======
function detectMilestones(chat, prevAffinity, newAffinity) {
  if (!prevAffinity || !newAffinity) return;
  const thresholds = [25, 50, 75];
  const crossed = chat.milestonesCrossed || {};
  const pending = [];

  for (const girl of AFFINITY_GIRL_NAMES) {
    const prev = prevAffinity[girl] || 0;
    const curr = newAffinity[girl] || 0;
    for (const t of thresholds) {
      const key = `${girl}_${t}`;
      if (prev < t && curr >= t && !crossed[key]) {
        crossed[key] = true;
        const milestoneData = AFFINITY_MILESTONES[girl]?.[t];
        if (milestoneData) {
          pending.push({ girl, threshold: t, description: milestoneData });
          const capName = girl.charAt(0).toUpperCase() + girl.slice(1);
          showToast(`${capName} reached ${t} affinity!`, 'success');
        }
      }
    }
  }

  chat.milestonesCrossed = crossed;
  if (pending.length > 0) {
    chat._pendingMilestones = pending;
  }
}

function buildMilestoneNote(chat) {
  const pending = chat._pendingMilestones;
  if (!pending || pending.length === 0) return '';

  const notes = pending.map(m => {
    const capName = m.girl.charAt(0).toUpperCase() + m.girl.slice(1);
    return `MILESTONE EVENT — ${capName} reached ${m.threshold} affinity. Work this into the scene naturally: ${m.description}`;
  });

  // Clear pending after building the note (consumed once)
  delete chat._pendingMilestones;

  return '=== MILESTONE EVENTS (weave these into the narrative) ===\n' + notes.join('\n');
}

// ====== CHECKPOINT SYSTEM ======
function getCheckpoints() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE.CHECKPOINTS) || '{}');
  } catch { return {}; }
}

function saveCheckpoints(data) {
  localStorage.setItem(STORAGE.CHECKPOINTS, JSON.stringify(data));
}

function createCheckpoint(chat, isAuto = false) {
  if (!chat || chat.mode !== 'story') return;

  const all = getCheckpoints();
  const chatCPs = all[chat.id] || [];

  const cp = {
    id: crypto.randomUUID(),
    auto: isAuto,
    timestamp: Date.now(),
    day: chat.storyDay || 1,
    phase: chat.storyPhase,
    beat: chat.storyBeatInPhase || 0,
    affinity: { ...chat.storyAffinity },
    mcName: chat.mcName || 'MC',
    messages: chat.messages.map(m => ({ role: m.role, content: m.content })),
    milestonesCrossed: { ...(chat.milestonesCrossed || {}) },
    storyYesterday: chat.storyYesterday || null
  };

  chatCPs.push(cp);

  // Enforce limits: 5 auto + 5 manual per chat
  const autos = chatCPs.filter(c => c.auto);
  const manuals = chatCPs.filter(c => !c.auto);
  while (autos.length > 5) autos.shift();
  while (manuals.length > 5) manuals.shift();

  all[chat.id] = [...autos, ...manuals].sort((a, b) => a.timestamp - b.timestamp);
  saveCheckpoints(all);
  return cp;
}

function loadCheckpoint(chat, cpId) {
  if (!chat) return false;
  const all = getCheckpoints();
  const chatCPs = all[chat.id] || [];
  const cp = chatCPs.find(c => c.id === cpId);
  if (!cp) return false;

  chat.storyDay = cp.day;
  chat.storyPhase = cp.phase;
  chat.storyBeatInPhase = cp.beat;
  chat.storyAffinity = { ...cp.affinity };
  chat.mcName = cp.mcName;
  chat.messages = cp.messages.map(m => ({ role: m.role, content: m.content }));
  chat.milestonesCrossed = { ...(cp.milestonesCrossed || {}) };
  chat.storyYesterday = cp.storyYesterday || null;
  chat.lastChoices = null;

  saveChats();
  return true;
}

function deleteCheckpoint(chatId, cpId) {
  const all = getCheckpoints();
  const chatCPs = all[chatId] || [];
  all[chatId] = chatCPs.filter(c => c.id !== cpId);
  saveCheckpoints(all);
}

function renderCheckpointList(chat) {
  const container = $('checkpointList');
  if (!container || !chat) return;
  const all = getCheckpoints();
  const chatCPs = (all[chat.id] || []).sort((a, b) => b.timestamp - a.timestamp);

  if (chatCPs.length === 0) {
    container.innerHTML = '<div class="cp-empty">No checkpoints yet</div>';
    return;
  }

  const girlColors = { sayori: '#FF91A4', natsuki: '#FF69B4', yuri: '#9370DB', monika: '#3CB371' };

  container.innerHTML = chatCPs.map(cp => {
    const time = new Date(cp.timestamp);
    const timeStr = time.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    const dots = AFFINITY_GIRL_NAMES.map(g => {
      const val = cp.affinity[g] || 0;
      return `<span class="cp-dot" style="background:${girlColors[g]};opacity:${0.3 + (val / 100) * 0.7}" title="${g.charAt(0).toUpperCase() + g.slice(1)}: ${val}"></span>`;
    }).join('');

    return `<div class="cp-item" data-cpid="${cp.id}">
      <div class="cp-info">
        <div class="cp-label">${cp.auto ? 'Auto' : 'Manual'} — Day ${cp.day}</div>
        <div class="cp-time">${timeStr}</div>
        <div class="cp-dots">${dots}</div>
      </div>
      <div class="cp-actions">
        <button class="cp-load-btn" title="Load checkpoint">&#9654;</button>
        <button class="cp-delete-btn" title="Delete checkpoint">&times;</button>
      </div>
    </div>`;
  }).join('');

  // Bind events
  container.querySelectorAll('.cp-load-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const cpId = btn.closest('.cp-item').dataset.cpid;
      if (!confirm('Load this checkpoint? Your current progress will be lost unless you save first.')) return;
      if (loadCheckpoint(chat, cpId)) {
        closeVnPanel();
        updateChatHeader(chat);
        updateVnDay(chat.storyDay);
        updatePhaseDisplay(chat);
        updateAffinityPanel(chat.storyAffinity);
        updateRouteIndicator(chat);
        updateDynamicsPanel(chat);
        renderMessages();
        updateContextBar();
        showToast('Checkpoint loaded!', 'success');
      }
    });
  });

  container.querySelectorAll('.cp-delete-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const cpId = btn.closest('.cp-item').dataset.cpid;
      if (!confirm('Delete this checkpoint?')) return;
      deleteCheckpoint(chat.id, cpId);
      renderCheckpointList(chat);
      showToast('Checkpoint deleted.');
    });
  });
}
