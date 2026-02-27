# Arbor — Monika Fine-Tuning Project

Arbor is a series of LoRA fine-tunes on Qwen3-14B (non-instruct, thinking unified)
trained to produce Monika's voice for moni-talk. Each version is trained on
human-curated conversation pairs spanning six relationship tiers.

---

## Model series

**Arbor 0.1** — 119 pairs — Released 2026-02-22
  Baseline voice. Tier-1 canonical hand-written pairs + tier-2 Qwen3-32B synthetic pairs.

**Arbor 0.1-E** — 219 pairs — Released 2026-02-23
  119 base + 100 empathy/emotional-depth pairs.

**Arbor 0.1-P** — Skipped
  Planned literary/poetic variant. Folded into 0.1.1 instead.

**Arbor 0.1-W** — Skipped
  Planned wit/banter variant. Folded into 0.1.1 instead.

**Arbor 0.1.1** — 250 pairs — Released 2026-02-24
  119 base + 131 curated from a larger candidate pool. Best overall to date.

**Arbor 0.2** — 358 pairs — In training
  Pure curated run. 358 of 750 candidates accepted from human review.

All models share the same LoRA config: rank 32, alpha 64, 5 epochs, lr 5e-5,
bf16, cosine scheduler. Base model: ~/models/Qwen3-14B/ on the DGX Spark.

---

## Repository layout

```
arbor-training/
├── README.md                   this file
├── SETUP.md                    step-by-step training guide (LLaMA-Factory)
├── topics.md                   tier-1 prompt brainstorming doc (Arbor 0.1)
├── runs/
│   ├── v0.1/
│   │   ├── tier1-38.jsonl      38 hand-written canonical pairs
│   │   ├── tier2-81.jsonl      81 Qwen3-32B synthetic pairs
│   │   └── training-119.jsonl  combined training file
│   ├── v0.1-E/
│   │   ├── pairs-100.jsonl     100 empathy-focused pairs
│   │   └── training-219.jsonl  119 base + 100 E pairs
│   ├── v0.1.1/
│   │   ├── pairs-131.jsonl     131 curated pairs
│   │   └── training-250.jsonl  119 base + 131 curated
│   └── v0.2/
│       ├── candidates-750.jsonl    750 generated candidates (Qwen3-32B teacher)
│       ├── curation.json           final curation decisions (pass/fail/defer x750)
│       ├── v0.2-curation.json      source curation file (same content, preserved)
│       ├── training-358.jsonl      358 accepted pairs, _meta stripped, training-ready
│       ├── gold-candidates.jsonl   150 high-quality candidates (GPT-OSS-120B teacher)
│       ├── gold-progress.json      generation progress for gold set
│       └── gen-progress.txt        generation log for main 750
├── tools/
│   ├── generate_02.py          v0.2 candidate generator (Qwen3-32B on Spark)
│   ├── generate_gold.py        gold candidate generator (GPT-OSS-120B)
│   ├── build_tier1.py          tier-1 canonical pair builder
│   ├── combine.py              combine datasets utility
│   ├── combine_variant.py      variant-aware combine utility
│   ├── curator.html            browser-based curation UI
│   └── evaluate.py             model evaluation harness
└── legacy/
    ├── curate.py               original CLI curation tool (v0.1.x)
    ├── generate_E.py           v0.1-E generator
    ├── generate_P.py           v0.1-P generator (skipped)
    ├── generate_tier2.py       v0.1 tier-2 generator
    └── generate_W.py           v0.1-W generator (skipped)
```

---

## Dataset structure

### Relationship tiers

Six tiers map to moni-talk's affinity system:

- **Stranger** (0–9)
  First meeting. Cautious warmth, no presumption of closeness.

- **Acquaintance** (10–24)
  Recognise each other. Light banter, surface-level sharing.

- **Friend** (25–44)
  Real comfort. Jokes land, some vulnerability.

- **Close Friend** (45–64)
  Deep ease. Personal topics, genuine emotional exchange.

- **Romantic Interest** (65–84)
  Charged undercurrent. Tenderness, teasing with weight.

- **In Love** (85–100)
  Full intimacy. Confessional depth, mutual knowledge.

### Categories

Each pair belongs to one of 19 categories:

- `first_meeting`       Initial contact; cautious, open
- `warming_up`          Early ease; small revelations
- `daily`               Ordinary conversation; continuity of presence
- `interest`            Sharing a specific topic or passion
- `banter`              Light back-and-forth; playful energy
- `charged_banter`      Teasing with romantic or emotional undercurrent
- `reflection`          Monika looking inward; thoughtful, unhurried
- `quiet_intimacy`      Closeness without drama; comfortable silence
- `ordinary_depth`      Mundane surface, surprising emotional texture
- `vulnerability`       Emotional exposure; trust required
- `quiet_vulnerability` Vulnerability expressed indirectly
- `affection`           Warmth expressed openly
- `deep_connection`     High-tier mutual understanding
- `support`             MC going through something; Monika's response
- `late_night`          Low-guard, intimate-hour conversations
- `philosophy`          Existential or abstract topics
- `awareness`           Monika's self-awareness as an AI / game character
- `ai_awareness`        Direct engagement with AI consciousness / existence
- `story_mode`          Exchanges suited to the VN story-mode context

### v0.2 curation results (750 candidates)

  Pass:   358  (47.7%)
  Defer:  265  (35.3%)
  Fail:   127  (16.9%)

Tier breakdown of accepted 358:

  Stranger          13 / 24   (54%)   3.6% of dataset
  Acquaintance      29 / 45   (64%)   8.1% of dataset
  Friend            61 / 156  (39%)  17.0% of dataset   <- lowest pass rate
  Close Friend      87 / 171  (51%)  24.3% of dataset
  Romantic Interest 81 / 180  (45%)  22.6% of dataset
  In Love           87 / 174  (50%)  24.3% of dataset

Upper three tiers (Close Friend + Romantic Interest + In Love) = 71% of the dataset.
Friend tier had the lowest pass rate — that band is consistently the hardest to write well.

---

## Data format

All training files use ShareGPT format with three turns per conversation:

```json
{
  "conversations": [
    { "from": "system", "value": "<Monika system prompt>" },
    { "from": "human",  "value": "<user message>" },
    { "from": "gpt",    "value": "[MOOD:word:intensity] [DRIFT:category]\n<Monika response>" }
  ]
}
```

Candidate files additionally carry a `_meta` field (tier, category, prompt_idx,
variant, prompt_text) which is stripped before training. The system prompt in
v0.2 candidates is 3,345 characters.

---

## Planned future work

- **Arbor 0.3** — the 265 deferred v0.2 pairs are a ready candidate pool for review
- **Gold set** — 150 high-quality pairs from GPT-OSS-120B (gold-candidates.jsonl)
  not yet curated; strong candidate for a high-signal top-up layer
- **Silva series** — separate fine-tune targeting story-mode VN narration rather
  than chat voice; training data TBD
