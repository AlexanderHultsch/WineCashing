# Wine Caching als dynamische App im PiMultiServiceServer-Konstrukt.
# Node 24 auf Alpine (wie apps/app-example der Infrastruktur), arm64-tauglich
# für den Pi 4. node:sqlite und node:crypto sind eingebaut -> keine nativen
# Abhängigkeiten, sauberer arm64-Build ohne Compiler.
FROM node:24-alpine

# su-exec: im Entrypoint kurz als root das Datenverzeichnis übereignen,
# dann als unprivilegierter "node"-Nutzer weiterlaufen.
RUN apk add --no-cache su-exec

WORKDIR /app
ENV NODE_ENV=production
ENV DB_PATH=/data/winecashing.db

# Erst Manifeste (Layer-Cache), dann nur Produktionsabhängigkeiten (express).
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Anwendungscode (Tests, e2e, docs bleiben via .dockerignore außen vor).
COPY app.js server.js ./
COPY routes ./routes
COPY middleware ./middleware
COPY lib ./lib
COPY db ./db
COPY public ./public
COPY scripts ./scripts

COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

EXPOSE 3000
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "server.js"]
