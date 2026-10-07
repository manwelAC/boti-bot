FROM node:22-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates chromium git poppler-utils tesseract-ocr libreoffice-writer \
  && rm -rf /var/lib/apt/lists/* \
  && npm install --global playwright@1.56.1

RUN mkdir -p /home/node/.gemini /home/node/.cache \
  && chown -R node:node /home/node/.gemini /home/node/.cache

COPY extract-pdf.mjs /usr/local/bin/botibot-extract-pdf.mjs

ENV HOME=/home/node \
  NODE_PATH=/usr/local/lib/node_modules \
  XDG_CONFIG_HOME=/tmp/config \
  XDG_CACHE_HOME=/tmp/cache \
  PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium

USER node
WORKDIR /workspace/app-ui
