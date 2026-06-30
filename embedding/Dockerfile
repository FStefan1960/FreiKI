FROM python:3.11-slim

RUN pip install --no-cache-dir sentence-transformers fastapi uvicorn

COPY server.py /app/server.py

WORKDIR /app
CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8001"]
