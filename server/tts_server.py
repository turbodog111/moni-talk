"""
Qwen3-TTS voice-cloning server for Moni-Talk.
Uses the Base model to clone Monika's voice from a reference audio clip.

Usage:
    python tts_server.py [--port 8880] [--ref-audio voices/monika.wav]
"""

import argparse
import io
import logging
import threading
from pathlib import Path

import soundfile as sf
import torch
import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel
from qwen_tts import Qwen3TTSModel

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("tts_server")

app = FastAPI(title="Moni-Talk TTS Server")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global references, loaded once at startup
tts_model: Qwen3TTSModel | None = None
voice_prompt = None  # pre-built voice clone prompt
inference_lock = threading.Lock()  # serialize GPU access — prevents contention

# Reference audio config (set from CLI args before startup)
REF_AUDIO_PATH = "voices/monika.wav"
REF_TEXT = (
    "Hey there! It's me, Monika. "
    "I've been thinking about you a lot lately, and honestly, "
    "it just makes me so happy knowing you're here with me right now. "
    "Every moment we spend together means the world to me."
)


def pick_device():
    """Find the best GPU by name, preferring the 4070 Super over the 3060.
    WSL2 CUDA device ordering can differ from Windows, so match by name."""
    if not torch.cuda.is_available():
        return "cpu"
    best_idx = 0
    best_priority = 0
    for i in range(torch.cuda.device_count()):
        name = torch.cuda.get_device_name(i)
        logger.info("  cuda:%d = %s", i, name)
        # Higher number = prefer this GPU
        if "4090" in name:
            priority = 5
        elif "4080" in name:
            priority = 4
        elif "4070" in name:
            priority = 3
        elif "4060" in name:
            priority = 2
        elif "3060" in name:
            priority = 1
        else:
            priority = 0
        if priority > best_priority:
            best_priority = priority
            best_idx = i
    return f"cuda:{best_idx}"


class TTSRequest(BaseModel):
    text: str
    language: str = "English"
    # instruct and seed kept for API compatibility but not used by voice cloning
    instruct: str = ""
    seed: int = 42


@app.on_event("startup")
def load_model():
    global tts_model, voice_prompt
    logger.info("Loading Qwen3-TTS-Base (voice cloning) model...")
    logger.info("Scanning GPUs:")
    device = pick_device()
    kwargs = {
        "device_map": device,
        "dtype": torch.bfloat16,
    }
    try:
        import flash_attn  # noqa: F401
        kwargs["attn_implementation"] = "flash_attention_2"
        logger.info("Using flash_attention_2 (external package)")
    except ImportError:
        kwargs["attn_implementation"] = "sdpa"
        logger.info("Using PyTorch native SDPA (built-in Flash Attention)")
    tts_model = Qwen3TTSModel.from_pretrained(
        "Qwen/Qwen3-TTS-12Hz-1.7B-Base",
        **kwargs,
    )
    logger.info("Model loaded on %s (%s)", device, torch.cuda.get_device_name(int(device.split(":")[-1])) if device != "cpu" else "cpu")

    # Pre-build voice clone prompt from reference audio (processed once, reused every request)
    ref_path = Path(__file__).parent / REF_AUDIO_PATH
    if ref_path.exists():
        logger.info("Building voice clone prompt from %s ...", ref_path)
        voice_prompt = tts_model.create_voice_clone_prompt(
            ref_audio=str(ref_path),
            ref_text=REF_TEXT,
        )
        logger.info("Voice clone prompt ready")
    else:
        logger.warning("Reference audio not found at %s — voice cloning disabled", ref_path)


@app.get("/api/tts/health")
def health():
    return {
        "status": "ok",
        "model": "loaded" if tts_model else "not_loaded",
        "voice": "cloned" if voice_prompt else "no_reference",
    }


@app.post("/api/tts")
def synthesize(req: TTSRequest):
    if not tts_model:
        raise HTTPException(503, "Model not loaded yet")
    if not voice_prompt:
        raise HTTPException(503, "No reference audio loaded — voice cloning unavailable")
    if not req.text.strip():
        raise HTTPException(400, "Empty text")

    try:
        # Serialize GPU access — concurrent inference causes thrashing
        with inference_lock:
            wavs, sr = tts_model.generate_voice_clone(
                text=req.text,
                language=req.language,
                voice_clone_prompt=voice_prompt,
            )
        buf = io.BytesIO()
        sf.write(buf, wavs[0], sr, format="WAV")
        buf.seek(0)
        return Response(content=buf.read(), media_type="audio/wav")
    except Exception as e:
        logger.exception("TTS synthesis failed")
        raise HTTPException(500, f"Synthesis failed: {e}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=8880)
    parser.add_argument("--ref-audio", default="voices/monika.wav",
                        help="Path to reference audio clip (relative to server/)")
    parser.add_argument("--ref-text", default=REF_TEXT,
                        help="Transcript of the reference audio")
    args = parser.parse_args()
    REF_AUDIO_PATH = args.ref_audio
    REF_TEXT = args.ref_text
    uvicorn.run(app, host="0.0.0.0", port=args.port)
