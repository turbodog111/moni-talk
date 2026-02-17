"""
Qwen3-TTS-VoiceDesign server for Moni-Talk.
Wraps the model in a FastAPI server with CORS support.

Usage:
    python tts_server.py [--port 8880]
"""

import argparse
import io
import logging

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

# Global model reference, loaded once at startup
tts_model: Qwen3TTSModel | None = None


class TTSRequest(BaseModel):
    text: str
    language: str = "English"
    instruct: str = ""
    seed: int = 42


@app.on_event("startup")
def load_model():
    global tts_model
    logger.info("Loading Qwen3-TTS-VoiceDesign model...")
    # Pick the best available GPU (prefer cuda:1 = 4070 Super if present)
    if torch.cuda.is_available():
        device = "cuda:1" if torch.cuda.device_count() > 1 else "cuda:0"
    else:
        device = "cpu"
    kwargs = {
        "device_map": device,
        "dtype": torch.bfloat16,
    }
    # Use PyTorch native SDPA (includes Flash Attention kernel) — no extra package needed
    # Falls back gracefully if not supported
    try:
        import flash_attn  # noqa: F401
        kwargs["attn_implementation"] = "flash_attention_2"
        logger.info("Using flash_attention_2 (external package)")
    except ImportError:
        kwargs["attn_implementation"] = "sdpa"
        logger.info("Using PyTorch native SDPA (built-in Flash Attention)")
    tts_model = Qwen3TTSModel.from_pretrained(
        "Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign",
        **kwargs,
    )
    logger.info("Model loaded on %s", device)


@app.get("/api/tts/health")
def health():
    return {"status": "ok", "model": "loaded" if tts_model else "not_loaded"}


@app.post("/api/tts")
def synthesize(req: TTSRequest):
    if not tts_model:
        raise HTTPException(503, "Model not loaded yet")
    if not req.text.strip():
        raise HTTPException(400, "Empty text")

    try:
        # Set seed so the voice sounds consistent across sentences
        torch.manual_seed(req.seed)
        if torch.cuda.is_available():
            torch.cuda.manual_seed(req.seed)
        wavs, sr = tts_model.generate_voice_design(
            text=req.text,
            language=req.language,
            instruct=req.instruct or "A warm, friendly young woman speaking naturally.",
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
    args = parser.parse_args()
    uvicorn.run(app, host="0.0.0.0", port=args.port)
