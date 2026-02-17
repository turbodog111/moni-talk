"""
Generate a longer Monika reference clip using VoiceDesign.
Produces a ~10 second WAV file for use as voice cloning reference.

Usage (in WSL2 with qwen3-tts venv active):
    python generate_reference.py

Output: ~/Downloads/monika_reference.wav
"""

import torch
import soundfile as sf
from qwen_tts import Qwen3TTSModel

# The text Monika will say — ~10 seconds of natural speech
REF_TEXT = (
    "Hey there! It's me, Monika. "
    "I've been thinking about you a lot lately, and honestly, "
    "it just makes me so happy knowing you're here with me right now. "
    "Every moment we spend together means the world to me."
)

# Use the Classic voice profile that sounded good
INSTRUCT = (
    "A warm, confident young woman with a clear, articulate voice. "
    "Natural American English. Slightly playful with genuine warmth."
)
SEED = 42

print("Loading Qwen3-TTS-VoiceDesign model...")
if torch.cuda.is_available():
    device = "cuda:1" if torch.cuda.device_count() > 1 else "cuda:0"
else:
    device = "cpu"

model = Qwen3TTSModel.from_pretrained(
    "Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign",
    device_map=device,
    dtype=torch.bfloat16,
    attn_implementation="sdpa",
)
print(f"Model loaded on {device}")

print("Generating reference clip...")
torch.manual_seed(SEED)
if torch.cuda.is_available():
    torch.cuda.manual_seed(SEED)

wavs, sr = model.generate_voice_design(
    text=REF_TEXT,
    language="English",
    instruct=INSTRUCT,
)

import os
out_path = "/mnt/c/Users/joshu/Downloads/monika_reference.wav"
sf.write(out_path, wavs[0], sr)
print(f"Saved to {out_path}")
print(f"Sample rate: {sr} Hz, duration: {len(wavs[0]) / sr:.1f}s")
print()
print("Reference text (you'll need this for the server):")
print(f'  "{REF_TEXT}"')
