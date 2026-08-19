FROM node:20-alpine
ARG APP_VERSION=dev
ARG GIT_SHA=unknown

LABEL org.opencontainers.image.title="FreiKI"
LABEL org.opencontainers.image.version="${APP_VERSION}"
LABEL org.opencontainers.image.revision="${GIT_SHA}"
LABEL org.opencontainers.image.source="https://github.com/FStefan1960/FreiKI"

ENV APP_VERSION="${APP_VERSION}"
ENV GIT_SHA="${GIT_SHA}"

WORKDIR /app

RUN apk add --no-cache \
    tesseract-ocr \
    tesseract-ocr-data-deu \
    poppler-utils \
    ffmpeg \
    imagemagick \
    python3 \
    py3-pip \
    py3-lxml \
    py3-pillow

# python-pptx für den PPTX-Vorlagen-Export (siehe scripts/build_pptx_from_template.py) -
# lxml/Pillow kommen als vorkompilierte Alpine-Pakete (apk, oben), --no-deps verhindert,
# dass pip sie zusätzlich aus dem Quellcode für musl nachbaut (kein gcc/musl-dev im Image).
RUN pip install --no-cache-dir --break-system-packages --no-deps \
    python-pptx==1.0.2 XlsxWriter typing-extensions

COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY . .
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD node -e "fetch('http://localhost:3000/api/health/live').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
