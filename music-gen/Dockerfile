FROM pytorch/pytorch:2.6.0-cuda12.4-cudnn9-runtime

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends git libsndfile1 && rm -rf /var/lib/apt/lists/*

# AceStepPipeline ist noch nicht in einem PyPI-Release von diffusers (Stand 0.39.0) enthalten,
# daher Installation von einem getesteten Commit statt eines offenen git+https-Trackings
# (analog zu image-gen/Dockerfile fuer ZImagePipeline).
RUN pip install --no-cache-dir \
    "diffusers @ git+https://github.com/huggingface/diffusers.git@9f6fc2c13610ead670cbac6dbf974b2a24a9e69b" \
    transformers accelerate safetensors sentencepiece fastapi uvicorn soundfile

COPY server.py gpu_lock.py /app/

CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8003"]
