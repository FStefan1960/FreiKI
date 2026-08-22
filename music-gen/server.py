import base64
import os
import threading
from io import BytesIO

import soundfile as sf
import torch
from diffusers import AceStepPipeline
from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel

from gpu_lock import GpuLockTimeout, gpu_file_lock, gpu_lock_is_held

# SFT nur fuer Gesang (CFG + mehr Steps). Instrumental laedt optional den Turbo-
# Checkpoint (MUSIC_GEN_INST_MODEL) und bleibt damit schnell und speicherschonend.
VOCAL_MODEL = os.getenv("MUSIC_GEN_MODEL", "ACE-Step/acestep-v15-xl-turbo-diffusers")
INST_MODEL  = (os.getenv("MUSIC_GEN_INST_MODEL") or "").strip() or VOCAL_MODEL
API_KEY     = os.getenv("MUSIC_GEN_API_KEY", "")

# Offloading haelt den VRAM-Bedarf klein, auf Kosten der Generierungsdauer durch
# CPU<->GPU-Transfers - bewusst, weil sich die GPU vLLM und Image-Gen teilt.
_pipes = {}
_pipes_lock = threading.Lock()


def get_pipe(model_name):
    with _pipes_lock:
        existing = _pipes.get(model_name)
    if existing is not None:
        return existing
    loaded = AceStepPipeline.from_pretrained(model_name, torch_dtype=torch.bfloat16)
    loaded.enable_model_cpu_offload()
    with _pipes_lock:
        if model_name not in _pipes:
            _pipes[model_name] = loaded
            print(f"Musik-Modell geladen: {model_name}")
        return _pipes[model_name]


get_pipe(VOCAL_MODEL)
if INST_MODEL != VOCAL_MODEL:
    threading.Thread(target=lambda: get_pipe(INST_MODEL), daemon=True).start()

# Serialisiert GPU-Generierungen: FastAPI fuehrt "def"-Routen in einem Thread-Pool aus,
# ohne Lock wuerden gleichzeitige Anfragen parallele Forward-Passes auf derselben GPU
# ausloesen und den Speicherbedarf ueber den eingeplanten Puffer treiben (OOM-Risiko).
# Gleiches Muster wie image-gen/server.py.
generation_lock = threading.Lock()

app = FastAPI()

class GenerateRequest(BaseModel):
    prompt: str
    model: str = VOCAL_MODEL  # von der App mitgeschickt, hier ungenutzt (Auswahl unten)
    lyrics: str = "[inst]"  # "[inst]" = reine Instrumentalmusik, sonst [verse]/[chorus]/...-strukturierter Text
    # ISO-639-1-Code, MUSS zur Sprache von "lyrics" passen. Diese Pipeline laedt nur die
    # DiT-Haelfte von ACE-Step (kein LM-Planner), daher fuehrt Leerlassen/"unknown" NICHT
    # zur dokumentierten automatischen Spracherkennung, sondern zu falscher Aussprache bei
    # nicht-englischen Texten (beobachtet bei deutschem Gesang ohne diesen Parameter).
    vocal_language: str = "en"
    duration: float = float(os.getenv("MUSIC_GEN_DURATION", "30"))
    steps: int = int(os.getenv("MUSIC_GEN_STEPS", "8"))
    vocal_steps: int = int(os.getenv("MUSIC_GEN_VOCAL_STEPS", "32"))
    # Nur fuer nicht-distillierte Checkpoints (base/sft) relevant - Turbo ignoriert
    # guidance_scale>1.0 laut diffusers-Doku mit einer Warnung, daher gefahrlos immer setzbar.
    guidance_scale: float = float(os.getenv("MUSIC_GEN_GUIDANCE", "7.0"))

# Response im selben {"data": [{"b64_json": ...}]}-Format wie image-gen/server.py, damit
# der Node-Backend-Code (MediaGenChatMode.js) dasselbe Aufruf-/Auspack-Muster nutzen kann.
@app.post("/generate")
def generate(req: GenerateRequest, authorization: str = Header(default="")):
    if API_KEY and authorization != f"Bearer {API_KEY}":
        raise HTTPException(status_code=401, detail="Unauthorized")
    if not req.prompt.strip():
        raise HTTPException(status_code=400, detail="prompt fehlt")

    duration = max(10.0, min(req.duration, 180.0))
    lyrics = req.lyrics.strip() or "[inst]"
    instrumental = lyrics == "[inst]"

    # Instrumental: Turbo + wenige Steps, kein CFG. Gesang: SFT + mehr Steps + CFG
    # (Turbo ignoriert Lyrics bei 8 Steps fast komplett, siehe ACE-Step#391).
    if instrumental:
        model_name = INST_MODEL
        steps = req.steps
        guidance = 1.0
    else:
        model_name = VOCAL_MODEL
        steps = max(req.steps, req.vocal_steps)
        guidance = req.guidance_scale

    pipe = get_pipe(model_name)
    try:
        with gpu_file_lock():
            with generation_lock:
                audio = pipe(
                    prompt=req.prompt.strip(),
                    lyrics=lyrics,
                    vocal_language=req.vocal_language.strip() or "en",
                    audio_duration=duration,
                    num_inference_steps=steps,
                    guidance_scale=guidance,
                ).audios
    except GpuLockTimeout as e:
        raise HTTPException(status_code=503, detail=str(e))

    buf = BytesIO()
    sf.write(buf, audio[0].T.cpu().float().numpy(), pipe.sample_rate, format="WAV")
    b64 = base64.b64encode(buf.getvalue()).decode("ascii")
    return {"data": [{"b64_json": b64}]}

@app.get("/health")
def health():
    return {"status": "ok"}

@app.get("/gpu-lock")
def gpu_lock_status():
    generating = generation_lock.locked()
    return {"busy": generating or gpu_lock_is_held(), "generating": generating}
