FROM node:24-alpine AS client-build

WORKDIR /app/client
COPY client/package*.json ./
RUN npm ci --include=dev
COPY client/ ./
RUN npm run build

FROM node:24-alpine AS server-dependencies

WORKDIR /app/server
COPY server/package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

FROM node:24-alpine AS runtime

ENV NODE_ENV=production \
    PORT=3001 \
    DATA_DIR=/app/server/data

WORKDIR /app/server
COPY server/ ./
COPY --from=server-dependencies /app/server/node_modules ./node_modules
COPY --from=client-build /app/server/public ./public
RUN sed -i 's/\r$//' start.sh && chmod +x start.sh && mkdir -p data

EXPOSE 3001
CMD ["/bin/sh", "/app/server/start.sh"]
