# Moni-Talk Setup & Reference Guide

## Quick Start (After Restart)

You need **3 SSH terminals** to the Spark, plus Ollama in WSL2. Here's exactly what runs in each:

| Terminal | Name | Port | What it does |
|----------|------|------|-------------|
| **1** | Main llama-server | 8080 | Chat/story AI — serves all your GGUF models |
| **2** | Orpheus llama-server | 5006 | TTS token generation — runs the Orpheus speech model |
| **3** | Orpheus-FastAPI | 5005 | TTS API wrapper — converts tokens to audio, serves `/v1/audio/speech` |
| **4** | Ollama (WSL2) | 11434 | Alternative AI provider (runs in WSL2, not on Spark) |

### Terminal 1: Main llama-server (port 8080)

Open a terminal and SSH into the Spark. This serves all your chat/story models in router mode:

```bash
ssh xturbo@spark-0af9

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

Wait for: `router server is listening on http://0.0.0.0:8080`

**Endpoint (local):** `http://spark-0af9:8080`
**Endpoint (Tailscale):** `https://spark-0af9.tail3b3470.ts.net`
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

**Split GGUFs:** Models larger than ~50 GB often come as split files (e.g. `-00001-of-00002.gguf`, `-00002-of-00002.gguf`). Place both parts in `~/models/`. The app's model selector automatically hides continuation parts and shows one clean entry. When loaded, llama-server reads all parts automatically.

#### Available models

| Model | Quant | Size | Speed (est.) |
|-------|-------|------|-------------|
| GPT-OSS 120B | Q4_K_M | ~63 GB (split) | ~3 t/s |
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

# GPT-OSS 120B Q4_K_M (split GGUF — 2 files, ~63 GB total)
cd ~/models && \
wget "https://huggingface.co/bartowski/openai_gpt-oss-120b-GGUF/resolve/main/openai_gpt-oss-120b-Q4_K_M/openai_gpt-oss-120b-Q4_K_M-00001-of-00002.gguf" && \
wget "https://huggingface.co/bartowski/openai_gpt-oss-120b-GGUF/resolve/main/openai_gpt-oss-120b-Q4_K_M/openai_gpt-oss-120b-Q4_K_M-00002-of-00002.gguf"

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

### Terminal 2: Orpheus llama-server (port 5006)

Open a **second** terminal and SSH into the Spark. This runs the TTS speech model:

```bash
ssh xturbo@spark-0af9

~/llama.cpp/build/bin/llama-server \
    -m ~/models/Orpheus-3b-FT-Q8_0.gguf \
    --port 5006 \
    --host 0.0.0.0 \
    -ngl 999 \
    --no-mmap \
    -fa on \
    --ctx-size 8192 \
    --n-predict 8192
```

Wait for: `server is listening on http://0.0.0.0:5006`

### Terminal 3: Orpheus-FastAPI (port 5005)

Open a **third** terminal and SSH into the Spark. This wraps the llama-server output into audio:

```bash
ssh xturbo@spark-0af9

cd ~/Orpheus-FastAPI
source venv/bin/activate
python app.py
```

Wait for: `Application startup complete.`

### Tailscale (HTTPS access for GitHub Pages)

After starting Terminals 1-3, set up Tailscale serve routes. You can run this from **any** Spark terminal (or a 4th one):

```bash
ssh xturbo@spark-0af9

tailscale serve --bg /tts http://localhost:5005
tailscale serve --bg http://localhost:8080
```

Verify both routes are active:

```bash
tailscale serve status
```

You should see:
```
https://spark-0af9.tail3b3470.ts.net (tailnet only)
|-- /    proxy http://localhost:8080
|-- /tts proxy http://localhost:5005
```

**Important:** After every Spark restart, the Tailscale serve config is lost. Re-run both `tailscale serve` commands.

### Verify everything works

From any terminal on the Spark:

```bash
# Test main llama-server
curl http://localhost:8080/v1/models

# Test TTS (generates a WAV file)
curl -X POST http://localhost:5005/v1/audio/speech \
  -H "Content-Type: application/json" \
  -d '{"model":"orpheus","input":"Hey, it is me, Monika!","voice":"tara","response_format":"wav"}' \
  --output test.wav
```

---

### TTS First-Time Setup (already done — reference only)

<details>
<summary>Click to expand first-time setup instructions</summary>

```bash
ssh xturbo@spark-0af9

# Download the Orpheus GGUF model (~4 GB)
wget -O ~/models/Orpheus-3b-FT-Q8_0.gguf \
  "https://huggingface.co/lex-au/Orpheus-3b-FT-Q8_0.gguf/resolve/main/Orpheus-3b-FT-Q8_0.gguf"

# Clone Orpheus-FastAPI
cd ~
git clone https://github.com/Lex-au/Orpheus-FastAPI.git
cd Orpheus-FastAPI

# Set up Python virtual environment
python3 -m venv venv
source venv/bin/activate

# Install PyTorch with Blackwell/sm_121 GPU support
# (standard PyTorch does NOT support the Spark's GB10 GPU)
wget -O /tmp/torch-blackwell.whl \
  "https://github.com/cypheritai/pytorch-blackwell/releases/download/v2.11.0-blackwell/torch-2.11.0a0+git00ab8be-cp312-cp312-linux_aarch64.whl"
pip install /tmp/torch-blackwell.whl

# Install remaining dependencies
sudo apt install -y libportaudio2 portaudio19-dev libopenblas0
pip install -r requirements.txt
mkdir -p outputs static

# Add CORS middleware to app.py (required for GitHub Pages access)
# Insert after the `app = FastAPI(...)` block:
#   from fastapi.middleware.cors import CORSMiddleware
#   app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

# Force SNAC decoder to use CUDA (edit tts_engine/speechpipe.py)
# Change: snac_device = "cuda" if torch.cuda.is_available() else ...
# (This works because the Blackwell PyTorch wheel supports sm_121)

# Create .env config
cat > .env << 'ENVEOF'
ORPHEUS_API_URL=http://127.0.0.1:5006/v1/completions
ORPHEUS_API_TIMEOUT=120
ORPHEUS_MAX_TOKENS=8192
ORPHEUS_TEMPERATURE=0.6
ORPHEUS_TOP_P=0.9
ORPHEUS_SAMPLE_RATE=24000
ORPHEUS_MODEL_NAME=Orpheus-3b-FT-Q8_0.gguf
ORPHEUS_PORT=5005
ORPHEUS_HOST=0.0.0.0
ENVEOF
```

</details>

**TTS Endpoint (local):** `http://spark-0af9:5005`
**TTS Endpoint (Tailscale):** `https://spark-0af9.tail3b3470.ts.net/tts`
**Voices:** tara, leah, jess, mia, zoe (female), leo, dan, zac (male)
**Emotion tags:** `<laugh>` `<chuckle>` `<sigh>` `<gasp>` `<groan>` `<yawn>` — insert inline in text
**Virtual environment:** `~/Orpheus-FastAPI/venv/` (PyTorch 2.11.0a0 with CUDA 13.0 / sm_121)

---

### 4. Open Moni-Talk

**URL:** https://turbodog111.github.io/moni-talk/

Or open the local file directly:

```
C:\Users\joshu\moni-talk\index.html
```

In the app settings:
- **Provider:** llama.cpp
- **llama.cpp endpoint:** `https://spark-0af9.tail3b3470.ts.net` (Tailscale, for GitHub Pages) or `http://spark-0af9:8080` (local network)
- **Model:** dropdown shows all GGUF files — select which to use (switching unloads current and loads new)
- **TTS endpoint:** `https://spark-0af9.tail3b3470.ts.net/tts` (Tailscale, for GitHub Pages) or `http://spark-0af9:5005` (local network)

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| llama-server won't start | Check CUDA: `nvidia-smi`. Verify model file exists in `~/models/` |
| "Could not connect" in settings | Is llama-server running? Check `curl http://localhost:8080/v1/models` on the Spark |
| CORS error in browser console | Usually means a server isn't running. Check all 3 terminals are up. The 502 Bad Gateway from Tailscale lacks CORS headers, which the browser reports as a CORS error |
| Mixed content error from GitHub Pages | Use the Tailscale HTTPS URLs, not plain HTTP |
| Tailscale serve not working | Re-run both `tailscale serve` commands after Spark restart (see Tailscale section above) |
| ERR_CERTIFICATE_TRANSPARENCY_REQUIRED | New Tailscale certs need time for CT log propagation (~hours to a day). Try incognito mode or Firefox |
| Model switching is slow | First request to a new model takes time to load into VRAM. Subsequent requests are fast |
| TTS: no audio / empty WAV | Check Terminal 2 (Orpheus llama-server on 5006) is running. Orpheus-FastAPI needs it for token generation |
| TTS: "Connection error to API at 127.0.0.1:5006" | Terminal 2 is down. Restart the Orpheus llama-server |
| TTS: "Address already in use" on port 5005 | Another Orpheus-FastAPI instance is still running. Kill it: `pkill -f "python app.py"` then restart |
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
│   ├── tts.js              Text-to-speech: Orpheus voices, emotion tags, playback
│   ├── sync.js             Cloud sync via Puter.js KV store
│   ├── settings.js         Settings modal: providers, API keys, models
│   └── benchmark.js        Model benchmarking suite with comparison tables
│
├── server/
│   ├── tts_server.py       Legacy TTS server (Qwen3-TTS, replaced by Orpheus on Spark)
│   ├── generate_reference.py  Legacy reference voice generator
│   ├── requirements.txt    Legacy Python deps
│   ├── start.sh            Legacy WSL2 startup script
│   └── voices/
│       └── monika.wav      Legacy reference voice
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

**Game mechanics:** HP system (100 max), inventory, 3 collectible Heart Fragments (one per domain). Death = auto-respawn at hub with full HP but lose non-essential items (fragments and keys are kept).

**Domain tracking:** Each domain's status is tracked (entered, fragment collected). When entering a new domain, a toast notification fires. Monika's Void auto-unlocks when all 3 fragments are collected.

**Combat action bar:** Quick-action buttons always visible in adventure mode: Attack, Defend, Use Item, Flee, Return to Hub. Item button shows usable item count and opens an item picker for multi-item inventories. Hub button is disabled when already at the Clubroom. All buttons disable during AI generation.

**State tags:** `[SCENE:location] [HP:number] [ITEM:name] [REMOVE:name]` — parsed and stripped from display.

**Status bar:** Domain-themed breadcrumb trail (Hub > Domain > Location), HP bar (color-coded with damage/heal flash animations), item count, fragment progress (X/3). Border color changes per domain.

**Side panel:** Domain map (shows all 4 domains with visited/completed/locked status, highlights current domain), heart fragment checklist, full inventory, detailed stats (HP, location, domain, turns, domains explored, fragments, deaths), checkpoint system (save/load), guide.

**Checkpoint system:** Manual save (floppy disk icon in panel header) + auto-save every 10 turns. Up to 5 auto + 5 manual per adventure. Each checkpoint stores full advState and messages. Shared storage key with story checkpoints.

**Death handling:** When HP reaches 0, the client auto-handles respawn: restores HP, teleports to Clubroom, removes non-essential items (keeps fragments/keys), increments death counter, updates UI.

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
- **TTS voices:** Orpheus TTS with 8 voices (5 female, 3 male). Emotion tags (`<laugh>`, `<sigh>`, etc.) injected based on mood.
