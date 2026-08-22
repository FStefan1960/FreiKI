FROM pytorch/pytorch:2.6.0-cuda12.4-cudnn9-runtime

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends git && rm -rf /var/lib/apt/lists/*

# ZImagePipeline ist noch nicht in einem PyPI-Release von diffusers (Stand 0.39.0) enthalten,
# daher Installation von einem getesteten Commit statt eines offenen git+https-Trackings.
RUN pip install --no-cache-dir \
    "diffusers @ git+https://github.com/huggingface/diffusers.git@4b8e466bfda053b25ac3e13444fcd5e7e706f3cb" \
    transformers accelerate safetensors sentencepiece fastapi uvicorn pillow

COPY server.py gpu_lock.py /app/

CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8002"]
