FROM node:22-slim AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci

COPY . .
RUN npx vite build

FROM node:22-slim AS runner

WORKDIR /app
COPY package*.json ./
RUN npm ci

COPY --from=builder /app/dist ./dist
COPY server ./server
COPY shared ./shared
COPY types.ts ./types.ts

ENV NODE_ENV=production
ENV USE_VERTEX_AI=true
ENV PORT=8080

EXPOSE 8080
CMD ["npx", "tsx", "server/index.ts"]
