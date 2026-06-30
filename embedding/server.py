import os
from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel
from sentence_transformers import SentenceTransformer
from typing import Union

MODEL_NAME = os.getenv("EMBED_MODEL", "BAAI/bge-m3")
API_KEY    = os.getenv("EMBED_API_KEY", "")
HF_HOME    = os.getenv("HF_HOME", "/root/.cache/huggingface")

model = SentenceTransformer(MODEL_NAME, cache_folder=HF_HOME)

app = FastAPI()

class EmbedRequest(BaseModel):
    input: Union[str, list]
    model: str = MODEL_NAME

@app.post("/v1/embeddings")
def embed(req: EmbedRequest, authorization: str = Header(default="")):
    if API_KEY and authorization != f"Bearer {API_KEY}":
        raise HTTPException(status_code=401, detail="Unauthorized")
    texts = [req.input] if isinstance(req.input, str) else req.input
    vecs = model.encode(texts, normalize_embeddings=True).tolist()
    return {
        "object": "list",
        "data": [{"object": "embedding", "index": i, "embedding": v} for i, v in enumerate(vecs)],
        "model": req.model,
    }

@app.get("/health")
def health():
    return {"status": "ok"}
