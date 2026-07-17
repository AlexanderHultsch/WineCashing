# Wine Caching als dynamische App im PiMultiServiceServer-Konstrukt.
# Node 22 LTS (Support bis ~2027) auf Alpine, arm64-tauglich für den Pi.
# Node 22 liefert node:sqlite und node:crypto eingebaut -> keine nativen
# Abhängigkeiten, sauberer arm64-Build ohne Compiler.
FROM node:22-alpine

# su-exec: im Entrypoint kurz als root das Datenverzeichnis übereignen,
# dann als unprivilegierter "node"-Nutzer weiterlaufen.
RUN apk add --no-cache su-exec

WORKDIR /app
ENV NODE_ENV=production
ENV WINE_DB_PATH=/data/wine.sqlite

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
