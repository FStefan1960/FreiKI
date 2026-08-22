import base64
import os
import threading
from io import BytesIO

import torch
from diffusers import ZImagePipeline
from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel

from gpu_lock import GpuLockTimeout, gpu_file_lock, gpu_lock_is_held, wait_for_vllm_idle

MODEL_NAME = os.getenv("IMAGE_GEN_MODEL", "Tongyi-MAI/Z-Image-Turbo")
API_KEY    = os.getenv("IMAGE_GEN_API_KEY", "")

# Die rechtlich vorgeschriebene KI-Kennzeichnung (Art. 50 EU AI Act) wird NICHT hier
# eingefuegt, sondern zentral in FreiKI-uis ChatService.js (handleImageGenMode), damit
# FreiKI/KorKI/FrankKI unabhaengig von der Bildquelle (dieser lokale Server oder DeepInfra)
# denselben, verlaesslichen Weg nutzen.

# CPU-Offload statt dauerhaft .to("cuda"): im Leerlauf bleibt VRAM fuer vLLM frei,
# die Gewichte wandern erst zur Erzeugung auf die GPU (wie music-gen).
pipe = ZImagePipeline.from_pretrained(
    MODEL_NAME, torch_dtype=torch.bfloat16, low_cpu_mem_usage=True
)
pipe.enable_model_cpu_offload()

# Serialisiert GPU-Generierungen: FastAPI fuehrt "def"-Routen in einem Thread-Pool aus,
# ohne Lock wuerden gleichzeitige Anfragen parallele Forward-Passes auf derselben GPU
# ausloesen und den Speicherbedarf ueber den eingeplanten Puffer treiben (OOM-Risiko).
generation_lock = threading.Lock()

app = FastAPI()

class GenerateRequest(BaseModel):
    prompt: str
    model: str = MODEL_NAME  # von der App mitgeschickt, hier ungenutzt (nur ein Modell geladen)
    steps: int = int(os.getenv("IMAGE_GEN_STEPS", "9"))
    guidance_scale: float = float(os.getenv("IMAGE_GEN_GUIDANCE", "0.0"))

# Response im selben Format wie DeepInfras OpenAI-kompatible Images-API
# (https://api.deepinfra.com/v1/openai/images/generations), damit FreiKI/KorKI/FrankKI
# denselben ChatService-Code nutzen koennen, egal ob lokal (KorKI-GPU) oder per DeepInfra
# (FreiKI/FrankKI) generiert wird.
@app.post("/generate")
def generate(req: GenerateRequest, authorization: str = Header(default="")):
    if API_KEY and authorization != f"Bearer {API_KEY}":
        raise HTTPException(status_code=401, detail="Unauthorized")
    if not req.prompt.strip():
        raise HTTPException(status_code=400, detail="prompt fehlt")

    # Zuerst Dateisperre (Warteschlange hinter Musik), dann Prozess-Lock: /gpu-lock
    # liefert generating=true erst, wenn diese Instanz wirklich an der Reihe ist.
    try:
        with gpu_file_lock():
            with generation_lock:
                wait_for_vllm_idle()
                image = pipe(
                    prompt=req.prompt.strip(),
                    num_inference_steps=req.steps,
                    guidance_scale=req.guidance_scale,
                ).images[0]
    except GpuLockTimeout as e:
        raise HTTPException(status_code=503, detail=str(e))

    buf = BytesIO()
    image.save(buf, format="PNG")
    b64 = base64.b64encode(buf.getvalue()).decode("ascii")
    return {"data": [{"b64_json": b64}]}

@app.get("/health")
def health():
    return {"status": "ok"}

@app.get("/gpu-lock")
def gpu_lock_status():
    # generating = dieser Prozess erzeugt (oder wartet auf vLLM hinter der Sperre).
    # busy = irgendwer haelt die gemeinsame Dateisperre oder wir erzeugen.
    generating = generation_lock.locked()
    return {"busy": generating or gpu_lock_is_held(), "generating": generating}
