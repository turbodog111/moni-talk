# Arbor Fine-Tuning Setup

Step-by-step guide for training a new Arbor model from a curated `.jsonl` file.
Everything runs on the DGX Spark unless noted. See README.md for project overview,
dataset structure, and model history.

---

## Prerequisites

- SSH:          ssh xturbo@spark-0af9
- LLaMA-Factory:  ~/LLaMA-Factory/
- Python venv:    ~/arbor-env/  (has transformers + llamafactory)
- Base model:     ~/models/Qwen3-14B/  (non-instruct, thinking unified)
- Training data:  C:\Users\joshu\arbor-training\runs\<version>\training-NNN.jsonl  (Windows)
- Dataset dir:    ~/LLaMA-Factory/data/  (Spark)

---

## Step 1 — Transfer training file to Spark

From Windows PowerShell or WSL:

```bash
scp "C:/Users/joshu/arbor-training/runs/v0.2/training-358.jsonl" \
    xturbo@spark-0af9:~/LLaMA-Factory/data/arbor-v02-training.jsonl
```

Verify on Spark:
```bash
wc -l ~/LLaMA-Factory/data/arbor-v02-training.jsonl
# should print 358
```

---

## Step 2 — Register the dataset

On the Spark, edit `~/LLaMA-Factory/data/dataset_info.json` and add:

```json
"arbor_v02": {
  "file_name": "arbor-v02-training.jsonl",
  "formatting": "sharegpt",
  "columns": {
    "messages": "conversations",
    "role_tag": "from",
    "content_tag": "value",
    "user_tag": "human",
    "assistant_tag": "gpt",
    "system_tag": "system"
  }
}
```

The file uses standard ShareGPT format (conversations array with from/value fields).

---

## Step 3 — Start the WebUI

SSH with port-forward, then start LLaMA-Factory:

```bash
# From your local machine
ssh -L 7860:localhost:7860 xturbo@spark-0af9

# On Spark
cd ~/LLaMA-Factory
source ~/arbor-env/bin/activate
llamafactory-cli webui
```

Open http://localhost:7860 in your browser.

---

## Step 4 — Configure training in the WebUI

Navigate to the Train tab.

### Model settings

- Model name:          Qwen3-14B
- Model path:          /home/xturbo/models/Qwen3-14B
- Finetuning method:   LoRA
- Enable thinking:     UNCHECKED  <-- critical, always uncheck this

### Dataset

- Dataset:         arbor_v02
- Max samples:     (leave blank — use all 358)
- Cutoff length:   2048

### LoRA configuration

- LoRA rank:            32
- LoRA alpha:           64
- LoRA dropout:         0.05
- LoRA target modules:  (default — all attention layers)

### Training hyperparameters

- Epochs:                 5
- Learning rate:          5e-5
- Batch size per device:  2
- Gradient accumulation:  4  (effective batch size = 8)
- LR scheduler:           cosine
- Warmup ratio:           0.1
- Precision:              bf16
- Flash attention:        enabled

### Output

- Output dir:   saves/Qwen3-14B-Thinking/lora/arbor-v02-run1
- Save steps:   100

Click Start. Target: loss settling below ~0.8 by epoch 3.

---

## Step 5 — Monitor training

In a separate terminal:

```bash
ssh xturbo@spark-0af9

# Watch GPU utilization
watch -n 2 nvidia-smi

# Tail the trainer log
tail -f ~/LLaMA-Factory/saves/Qwen3-14B-Thinking/lora/arbor-v02-run1/trainer_log.jsonl
```

358 pairs x 5 epochs on a single DGX Spark GPU: roughly 20–40 minutes.

---

## Step 6 — Merge adapter into full model

Use the Export tab in the WebUI:

- Model name:    Qwen3-14B
- Model path:    /home/xturbo/models/Qwen3-14B
- Adapter path:  saves/Qwen3-14B-Thinking/lora/arbor-v02-run1
- Export dir:    /home/xturbo/models/Arbor-0.2/
- Export size:   2  (shards)

Click Export.

If the WebUI export hangs, use the CLI instead:

```bash
source ~/arbor-env/bin/activate
cd ~/LLaMA-Factory
llamafactory-cli export \
  --model_name_or_path ~/models/Qwen3-14B \
  --adapter_name_or_path saves/Qwen3-14B-Thinking/lora/arbor-v02-run1 \
  --template qwen3 \
  --finetuning_type lora \
  --export_dir ~/models/Arbor-0.2 \
  --export_size 2
```

---

## Step 7 — Convert to GGUF (Q8_0)

```bash
source ~/arbor-env/bin/activate   # needs transformers — system python lacks it

python ~/llama.cpp/convert_hf_to_gguf.py ~/models/Arbor-0.2/ \
  --outfile ~/models/Arbor-0.2-Q8_0.gguf \
  --outtype q8_0
```

Expected output size: ~15 GB. Verify:

```bash
ls -lh ~/models/Arbor-0.2-Q8_0.gguf
```

---

## Step 8 — Swap the server

```bash
tmux kill-session -t arbor

tmux new-session -d -s arbor \
  '~/llama.cpp/build/bin/llama-server \
    -m ~/models/Arbor-0.2-Q8_0.gguf \
    --no-mmap -ngl 999 -fa on --jinja \
    -c 8192 --host 0.0.0.0 --port 8080'
```

Test:
```bash
curl http://spark-0af9:8080/v1/models
# should show Arbor-0.2-Q8_0.gguf
```

---

## Step 9 — Update moni-talk

In js/config.js, update KNOWN_MODELS:
- Arbor-0.1.1-Q8_0.gguf  ->  best: false
- Arbor-0.2-Q8_0.gguf    ->  best: true, update status / released / trainingPairs

Update MEMORY.md:
- Bump moni-talk version after release
- Update Arbor model notes

---

## Key paths (Spark)

```
~/models/Qwen3-14B/              base model
~/models/Arbor-0.2/              merged HF model (post-export)
~/models/Arbor-0.2-Q8_0.gguf    inference model
~/LLaMA-Factory/                 training framework
~/LLaMA-Factory/data/            dataset files + dataset_info.json
~/LLaMA-Factory/saves/           LoRA adapter checkpoints
~/arbor-env/                     Python venv
~/llama.cpp/build/bin/           llama-server binary
```

---

## Gotchas

- **Enable thinking must always be unchecked** before training any Qwen3 model
  in LLaMA-Factory. Leaving it on corrupts the fine-tune with thinking tokens.

- **Always activate ~/arbor-env/ before convert_hf_to_gguf.py.** System Python
  on the Spark does not have transformers installed.

- **If the WebUI export hangs**, use the CLI export command in Step 6.

- **Tailscale serve on Spark persists across reboots.** No need to re-run after
  restart (unlike WSL2, which loses serve config on shutdown).

- **Batch size OOM?** Drop batch size to 1 and raise gradient accumulation to 8.
  Effective batch size stays the same.

- **Multi-model server** (~--models-dir~) will auto-detect Arbor-0.2-Q8_0.gguf
  once it lands in ~/models/. If running single-model mode (tmux arbor session),
  restart the session pointing at the new file.
