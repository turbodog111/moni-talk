# Moni-Talk Setup & Reference Guide

## Quick Start (After Restart)

### 1. Start llama-server on the DGX Spark

SSH into the Spark and start llama-server in **router mode** (auto-discovers all GGUF files, switch models without restarting):

```bash
ssh xturbo@spark-0af9.local

~/llama.cpp/build/bin/llama-server \
    --no-mmap \
    -ngl 999 \
    -fa on \
    --jinja \
    --host 0.0.0.0 \
    --port 8080 \
    --ctx-size 32768 \
    --models-dir ~/models \
    --models-max 1
```

Or to load a single specific model instead:

```bash
~/llama.cpp/build/bin/llama-server \
    --no-mmap -ngl 999 -fa on --jinja \
    --host 0.0.0.0 --port 8080 --ctx-size 32768 \
    -m ~/models/Qwen3-32B-Q8_0.gguf
```

Confirm it's responding:

```bash
curl http://localhost:8080/v1/models
```

**Endpoint (local):** `http://spark-0af9:8080`
**Models directory:** `~/models/` (GGUF format)
**Build location:** `~/llama.cpp/`

#### Key flags

| Flag | Purpose |
|------|---------|
| `--no-mmap` | Faster model loading on Spark |
| `-ngl 999` | Offload all layers to GPU |
| `-fa on` | Flash Attention — reduces memory, improves speed |
| `--jinja` | Chat template support |
| `--ctx-size 32768` | Context window size |
| `--models-dir PATH` | Auto-discover all GGUF files in directory (router mode) |
| `--models-max N` | Max models loaded simultaneously (use 1 for large models) |

#### Available models

| Model | Quant | Size | Speed (est.) |
|-------|-------|------|-------------|
| Qwen3-32B | Q8_0 | ~34 GB | ~7 t/s |
| Gemma 3 27B | Q8_0 | ~27 GB | ~8 t/s |
| Mistral Small 3.1 24B | Q8_0 | ~25 GB | ~10 t/s |

#### Downloading new models

Run these on the Spark via SSH. Models download directly to the Spark's storage.

```bash
# Generic format
wget -O ~/models/<filename>.gguf "https://huggingface.co/<user>/<repo>/resolve/main/<filename>.gguf"

# Gemma 3 27B Q8
wget -O ~/models/gemma-3-27b-it-Q8_0.gguf \
  "https://huggingface.co/bartowski/google_gemma-3-27b-it-GGUF/resolve/main/google_gemma-3-27b-it-Q8_0.gguf"

# Mistral Small 3.1 24B Q8
wget -O ~/models/Mistral-Small-3.1-24B-Instruct-Q8_0.gguf \
  "https://huggingface.co/bartowski/Mistral-Small-3.1-24B-Instruct-2503-GGUF/resolve/main/Mistral-Small-3.1-24B-Instruct-2503-Q8_0.gguf"

# Qwen2.5-72B Q4_K_M (larger, slower, richer writing)
wget -O ~/models/qwen2.5-72b-instruct-q4_k_m.gguf \
  "https://huggingface.co/Qwen/Qwen2.5-72B-Instruct-GGUF/resolve/main/qwen2.5-72b-instruct-q4_k_m.gguf"

# Llama 3.3 70B Q4_K_M
wget -O ~/models/Llama-3.3-70B-Instruct-Q4_K_M.gguf \
  "https://huggingface.co/bartowski/Llama-3.3-70B-Instruct-GGUF/resolve/main/Llama-3.3-70B-Instruct-Q4_K_M.gguf"
```

#### Rebuilding llama.cpp (after updates)

```bash
cd ~/llama.cpp
git pull
cmake -B build \
    -DCMAKE_BUILD_TYPE=Release \
    -DGGML_CUDA=ON \
    -DGGML_CUDA_F16=ON \
    -DCMAKE_CUDA_ARCHITECTURES=121 \
    -DLLAMA_CURL=ON \
    -DLLAMA_OPENSSL=ON
cmake --build build --config Release -j 20
```

---

### 2. Start Tailscale on the DGX Spark (Remote Access)

Tailscale proxies the llama-server over HTTPS so it can be reached from GitHub Pages (which requires HTTPS).

```bash
tailscale serve --bg http://localhost:8080
```

**Important:** After every Spark restart, the Tailscale serve config is lost. You must re-run this command.

Verify:

```bash
tailscale serve status
```

**Tailscale HTTPS URL:** Use this as the llama.cpp endpoint in Moni-Talk settings.

---

### 3. Start the TTS Server (Voice — runs on PC in WSL2)

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

**Endpoint:** `http://localhost:8880`
**Reference voice:** `server/voices/monika.wav`

---

### 4. Open Moni-Talk

**URL:** https://turbodog111.github.io/moni-talk/

Or open the local file directly:

```
C:\Users\joshu\moni-talk\index.html
```

In the app settings:
- **Provider** is set to llama.cpp
- **llama.cpp endpoint** is your Spark's Tailscale HTTPS URL (for remote/GitHub Pages) or `http://spark-0af9:8080` (for local use)
- **Model** dropdown shows all GGUF files discovered by the server — select which model to use (switching models unloads the current one and loads the new one)
- **TTS endpoint** is `http://localhost:8880`

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| llama-server won't start | Check CUDA: `nvidia-smi`. Verify model file exists in `~/models/` |
| "Could not connect" in settings | Is llama-server running? Check `curl http://localhost:8080/v1/models` on the Spark |
| CORS error in browser console | llama-server enables CORS automatically for all origins — verify the server is running and reachable |
| Mixed content error from GitHub Pages | Use the Tailscale HTTPS URL, not plain HTTP |
| Tailscale serve not working | Re-run `tailscale serve --bg http://localhost:8080` after Spark restart |
| ERR_CERTIFICATE_TRANSPARENCY_REQUIRED | New Tailscale certs need time for CT log propagation (~hours to a day). Try incognito mode or Firefox |
| Model switching is slow | First request to a new model takes time to load into VRAM. Subsequent requests are fast |
| TTS server crashes on startup | Make sure GPU drivers are loaded in WSL2. Check CUDA: `nvidia-smi` |
| `sudo` commands hang in Claude Code | Run sudo commands in a real terminal instead |

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
│   ├── ai.js               AI provider dispatch (llama.cpp, Ollama, Puter)
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
| **llama.cpp** | llama-server on DGX Spark or local GPU | Best performance. OpenAI-compatible API. Router mode for multi-model switching. |
| **Ollama** | Local WSL2 service | Free, unlimited, private. Convenient model management. |
| **Puter** | Built-in (no key needed) | Free tier via puter.js. Claude Sonnet, GPT-4o Mini, etc. |

---

## Key Technical Details

- **State persistence:** LocalStorage (`moni_talk_chats_v2`, `moni_talk_profile`, etc.)
- **Cloud sync:** Puter.js KV store (optional sign-in)
- **CORS:** llama-server enables CORS automatically (reflects Origin header) — no flag needed
- **Streaming:** All providers support streaming responses (SSE for llama.cpp, NDJSON for Ollama)
- **Think-tag filtering:** Strips `<think>...</think>` blocks from models like Qwen3 in real-time
- **State tags:** AI responses start with `[MOOD:word:intensity] [DRIFT:category]` tags (parsed and stripped before display)
- **Adventure tags:** `[SCENE:location] [HP:number] [ITEM:name] [REMOVE:name]` parsed for game state
- **Sprite engine:** Room mode composites 10+ PNG layers onto a canvas (MAS-style expression system)
- **TTS voices:** 6 voice profiles with mood-aware speech instructions. Voice cloning from reference audio.
