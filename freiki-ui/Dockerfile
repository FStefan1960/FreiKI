FROM node:20-alpine
WORKDIR /app

RUN apk add --no-cache \
    tesseract-ocr \
    tesseract-ocr-data-deu \
    poppler-utils \
    ghostscript \
    ffmpeg \
    imagemagick

COPY package.json .
RUN npm install
COPY . .
EXPOSE 3000
CMD ["node", "server.js"]
