FROM node:20-alpine
RUN apk add --no-cache tzdata
WORKDIR /app
COPY package.json ./
COPY index.js ./
CMD ["node", "index.js"]
