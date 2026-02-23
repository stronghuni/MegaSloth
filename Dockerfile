FROM node:22-alpine AS builder

WORKDIR /app

RUN corepack enable pnpm

COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --frozen-lockfile 2>/dev/null || pnpm install

COPY tsconfig.json drizzle.config.ts ./
COPY src/ src/

RUN pnpm build

FROM node:22-alpine AS runner

WORKDIR /app

RUN corepack enable pnpm

COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --frozen-lockfile --prod 2>/dev/null || pnpm install --prod

COPY --from=builder /app/dist dist/
COPY src/skills/builtin/ src/skills/builtin/

RUN mkdir -p .megasloth/data .megasloth/skills

ENV NODE_ENV=production
ENV HTTP_PORT=13000
ENV WEBHOOK_PORT=3001
ENV WEBSOCKET_PORT=18789

EXPOSE 13000 3001 18789

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -q --spider http://localhost:13000/health || exit 1

CMD ["node", "dist/index.js"]
