# ---- Stage 1: build the React client ----
FROM node:26-bookworm-slim AS client
WORKDIR /app/client
COPY client/package*.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

# ---- Stage 2: runtime (Express serves API + built client) ----
FROM node:26-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app/server

# Install only production deps (sharp pulls its prebuilt linux binary here).
COPY server/package*.json ./
RUN npm ci --omit=dev

# App source + the built client from stage 1.
COPY server/ ./
COPY --from=client /app/client/dist /app/client/dist

# Persistent data (SQLite + uploads) lives on a mounted volume at /data.
ENV DATA_DIR=/data/db
ENV UPLOADS_DIR=/data/uploads
ENV PORT=4000
EXPOSE 4000

CMD ["node", "src/index.js"]
