# ─── Build stage ──────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# openssl is required by Prisma's query engine at generate-time
RUN apk add --no-cache openssl

COPY package*.json ./
COPY prisma ./prisma/
RUN npm ci

COPY tsconfig.json ./
COPY src ./src/

RUN npx prisma generate
RUN npm run build

# ─── Production stage ─────────────────────────────────────────────────────────
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV TZ=Africa/Casablanca

# openssl  — Prisma query engine + `prisma db push` link against libssl at runtime
# dumb-init — correct PID 1 signal handling
# tzdata    — Africa/Casablanca timezone data
RUN apk add --no-cache openssl dumb-init tzdata

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY prisma ./prisma/

# Create non-root user
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001
RUN mkdir -p /app/logs /app/config && chown -R nodejs:nodejs /app

USER nodejs

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/server.js"]
