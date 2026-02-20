# Moni-Talk Setup & Reference Guide

## Quick Start (After PC Restart)

Everything runs in WSL2 Ubuntu. Open a WSL terminal and follow these steps in order.

### 1. Start Ollama (LLM Server)

Ollama is a systemd service, so it should auto-start with WSL. Verify:

```bash
systemctl status ollama
```

If it's not running:

```bash
sudo systemctl start ollama
```

Confirm it's responding:

```bash
curl http://localhost:11434/v1/models
```

You should see a JSON list of your installed models.

**Endpoint:** `http://localhost:11434`
**Config:** `/etc/systemd/system/ollama.service`
**Environment:** `OLLAMA_HOST=0.0.0.0`, `OLLAMA_ORIGINS=*`

---

### 2. Start the TTS Server (Voice)

```bash
cd /mnt/c/Users/joshu/moni-talk/server
bash start.sh
```

Or manually:

```bash
cd /mnt/c/Users/joshu/moni-talk/server
python tts_server.py --port 8880
```

Wait for `"Model loaded"` and `"Uvicorn running on 0.0.0.0:8880"` in the output.

Confirm it's responding:

```bash
curl http://localhost:8880/api/tts/health
```

Should return `{"status":"ok","model":"loaded"}`.

**Endpoint:** `http://localhost:8880`
**Reference voice:** `server/voices/monika.wav`

---

### 3. Start Tailscale (Remote Access)

Tailscale allows you to use Moni-Talk from your iPad/iPhone via the Ollama server.

```bash
tailscale serve --bg http://localhost:11434
```

**Important:** After every WSL restart, the Tailscale serve config is lost. You must re-run this command.

Verify Tailscale is connected:

```bash
tailscale status
```

**Tailscale URL:** `https://xturbo-1.tail3b3470.ts.net`

---

### 4. Open Moni-Talk

The app itself is a static GitHub Pages site. No server needed for the frontend.

**URL:** https://turbodog111.github.io/moni-talk/

Or open the local file directly:

```
C:\Users\joshu\moni-talk\index.html
```

In the app settings, make sure:
- **Provider** is set to Ollama
- **Ollama endpoint** is `http://localhost:11434` (or `http://[::1]:11434` if IPv4 is flaky)
- **TTS endpoint** is `http://localhost:8880`

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Browser can't reach localhost:11434 | Try `http://[::1]:11434` (IPv6) or restart WSL: `wsl --shutdown` then reopen |
| Ollama won't start | Check logs: `journalctl -u ollama -n 50` |
| TTS server crashes on startup | Make sure GPU drivers are loaded. Check CUDA: `nvidia-smi` |
| Tailscale serve not working | Make sure WSL is in NAT mode (default), NOT mirrored networking |
| `sudo` commands hang in Claude Code | Run sudo commands in a real WSL terminal instead |

---

## Repository Structure

```
moni-talk/
├── index.html              Main app (single page, all screens)
├── SETUP.md                This file
│
├── css/
│   ├── base.css            Theme variables, layout, buttons, forms
│   ├── chat.css            Chat bubbles, message actions, status bars, side panels
│   ├── room.css            Room mode canvas and sprite display
│   └── vn.css              Visual novel layout, affinity panel, day/phase display
│
├── js/
│   ├── config.js           Models, relationships, moods, story phases, prompts
│   ├── state.js            Global state variables, DOM refs, screen management
│   ├── app.js              Init, event listeners, theme toggle
│   ├── chat.js             Chat CRUD, message rendering, send/receive, streaming
│   ├── ai.js               AI provider dispatch (OpenRouter, Puter, Ollama, Gemini)
│   ├── story.js            Story mode: phases, days, affinity, poem writing
│   ├── adventure.js        Adventure mode: tag parsing, game state, status bar
│   ├── vn.js               Visual novel sprites, affinity panel, day display
│   ├── room.js             Room mode: MAS-style sprite composition on canvas
│   ├── profile.js          User profile load/save, profile prompt builder
│   ├── memory.js           Persistent memory extraction and retrieval
│   ├── tts.js              Text-to-speech: voice profiles, mood mapping, playback
│   ├── sync.js             Cloud sync via Puter.js KV store
│   ├── settings.js         Settings modal: providers, API keys, models
│   └── benchmark.js        Model benchmarking suite with comparison tables
│
├── server/
│   ├── tts_server.py       FastAPI TTS server (Qwen3-TTS + voice cloning)
│   ├── generate_reference.py  Generate Monika reference voice clip
│   ├── requirements.txt    Python deps: qwen-tts, fastapi, uvicorn, soundfile
│   ├── start.sh            WSL2 startup script
│   └── voices/
│       └── monika.wav      Reference voice for cloning
│
├── sprites/
│   ├── location/           Backgrounds (spaceroom day/night)
│   └── monika/             Layered sprite parts
│       ├── a/              Accessories (ribbon)
│       ├── b/              Body base layers
│       ├── c/              Clothing layers
│       ├── f/              Face parts (eyes, brows, mouth, blush, tears)
│       ├── h/              Hair layers
│       └── t/              Table/chair furniture
│
└── *.png                   Character profile pictures (Monika, Sayori, Natsuki, Yuri)
```

---

## App Modes

### Chat Mode

**Overview:** Free-form conversation with Monika as a texting companion.

**Relationship system:** 6 levels (Stranger → Acquaintance → Friend → Close Friend → Romantic → In Love), each with strict behavioral rules governing tone, boundaries, pet names, vulnerability, and physical language.

**Mood system:** 12 moods (cheerful, playful, thoughtful, melancholic, excited, tender, teasing, curious, nostalgic, flustered, calm, passionate) × 3 intensities (subtle, moderate, strong). Moods shift gradually with momentum rules. Drift categories (deep, lighthearted, personal, creative, casual) steer conversation direction.

**Memory system:** Automatic extraction of user facts from conversation (identity, preferences, events, relationships, feelings). Max 50 memories. Relevance-scored injection into prompts. Cross-chat persistence.

**Time awareness:** Holiday detection, gap-since-last-chat tracking, session length awareness, daily conversation counting.

**Spontaneous poetry:** Monika may write short poems wrapped in `[POEM]...[/POEM]` tags when emotionally moved.

**Side panel:** Mood ring visualization, mood history journal, memories list (with delete), conversation stats.

**Image support:** Paste, drag-drop, or attach images (vision-capable providers only).

**State tags:** Every response starts with `[MOOD:word:intensity] [DRIFT:category]` (parsed and hidden from display).

### Story Mode

**Overview:** Interactive DDLC visual novel — multi-day narrative with branching choices.

**Setting:** Alternate wholesome timeline — no horror, no meta-awareness, no file deletion. All four girls have genuine romance routes.

**Phase system:** Each day progresses through a fixed sequence of phases:
- Day 1: Before Club → Arriving → Introductions → Cupcakes → Settling In → Activity → Wrap Up
- Poem days: Morning → Club Arrival → Poem Sharing → Poem Reactions → Free Time → Meeting End → Walk Home
- Regular days: Morning → Club Arrival → Club Activity → Free Time → Meeting End → Walk Home

**Beat system:** Each phase has `maxBeats` (1-3 AI responses) before automatically advancing. `noChoices` phases show only "Continue."

**Choice system:**
- Static defaults display immediately per phase
- Background AI call generates context-aware replacements (`tryAIChoices`)
- Dynamic companion choices for Free Time ("Spend time with X") and Walk Home ("Walk home with X") — sorted by affinity with tiered flavor text
- Special choices: "Continue", "Retry", "End of day — read diaries", "Begin next day"

**Affinity system:** Per-girl affinity tracking (Sayori, Natsuki, Yuri, Monika). Starting values: Sayori 15 (childhood friend), Monika 10 (classmate), others 1 (stranger). Tiers: stranger (<16), warming up (16-30), friends (31-50), romantic interest (51+). Milestone toasts at thresholds. Only girls present in a scene can gain affinity.

**Rivalry system:** When two girls have affinity ≥25 with a gap ≤8, rivalry hints inject into phase instructions.

**Poem writing:** Word picker mini-game during poem_sharing phases. Words influence which girl resonates with your poem.

**Checkpoints:** Manual save (up to 5) + auto-save (up to 5) per chat. Stores full state: day, phase, beat, affinity, messages, milestones.

**Journal/Diary:** End-of-day overlay showing each girl's diary entry reflecting the day's events. Built via AI call. Yesterday summary carries into next day.

**Visual novel layer:** Character sprites (Monika, Sayori, Natsuki, Yuri PFPs), day/phase display bar, affinity panel, context bar showing message count.

**Day continuity:** Yesterday summary injected into prompts — who MC spent free time with, who he walked home with. Characters naturally reference it.

**Writing style:** Second person present tense, plain prose, natural teenage dialogue. Scene structure instructions keep pacing tight.

### Adventure Mode

**Overview:** Text-based RPG called "The Poem Labyrinth" — Monika acts as Game Master.

**Setting:** Fantasy realm woven from the Literature Club members' poems and personalities. Exists in the space between realities.

**Hub:** The Clubroom — four shimmering portals lead to four domains. Monika sits on her desk as guide.

**Four domains:**
- **Sayori's Sunlit Meadow** — joy masking sorrow, emotional puzzles, Memory Wisps and Thornvine Tanglers
- **Natsuki's Bakehouse Fortress** — cute exterior, brutal interior, combat challenges, Candy Golems and Sugar Knights
- **Yuri's Library of Shadows** — infinite gothic library, knowledge/mystery theme, Ink Wraiths and riddles
- **Monika's Void** — unlocked after collecting all 3 fragments, digital space, final conversation challenge

**Game mechanics:** HP system (100 max), inventory, 3 collectible Heart Fragments (one per domain). Death = respawn at hub with full HP but lose some items.

**State tags:** `[SCENE:location] [HP:number] [ITEM:name] [REMOVE:name]` — parsed and stripped from display.

**Status bar:** Location, HP bar (color-coded), item count, fragment progress (X/3).

**Side panel:** Full inventory list, fragment checklist by domain, detailed stats.

**DM style:** Mix of narration and Monika's meta-commentary ("Oh, you actually went left? Bold choice~"). 2-4 paragraphs per response.

---

## AI Providers

| Provider | Setup | Notes |
|----------|-------|-------|
| **llama.cpp** | llama-server on DGX Spark or local GPU | Best performance. OpenAI-compatible API. Auto-detects loaded model. |
| **Ollama** | Local WSL2 service | Free, unlimited, private. Convenient model management. |
| **Puter** | Built-in (no key needed) | Free tier via puter.js. Claude Sonnet, GPT-4o Mini, etc. |

---

## Key Technical Details

- **State persistence:** LocalStorage (`moni_talk_chats_v2`, `moni_talk_profile`, etc.)
- **Cloud sync:** Puter.js KV store (optional sign-in)
- **Streaming:** All providers support streaming responses (SSE for Gemini/OpenRouter, NDJSON for Ollama)
- **Think-tag filtering:** Strips `<think>...</think>` blocks from models like Qwen3 in real-time
- **State tags:** AI responses start with `[MOOD:word:intensity] [DRIFT:category]` tags (parsed and stripped before display)
- **Adventure tags:** `[SCENE:location] [HP:number] [ITEM:name] [REMOVE:name]` parsed for game state
- **Sprite engine:** Room mode composites 10+ PNG layers onto a canvas (MAS-style expression system)
- **TTS voices:** 6 voice profiles with mood-aware speech instructions. Voice cloning from reference audio.
