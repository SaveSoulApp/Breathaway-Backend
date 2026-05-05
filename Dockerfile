# ---------------------------
# 1. Build Stage
# ---------------------------
FROM node:20-slim AS builder

# Install pnpm
RUN npm install -g pnpm

WORKDIR /app

# Copy dependency manifests first
COPY package.json pnpm-lock.yaml ./

# Install dependencies (dev + prod)
RUN pnpm install --frozen-lockfile

# Copy Prisma schema first (needed for generate)
COPY prisma ./prisma
RUN pnpm run generate:prod

# Copy the rest of the app source
COPY tsconfig*.json nest-cli.json ./
COPY src ./src

# Build the NestJS app
RUN pnpm build

# ---------------------------
# 2. Production Stage
# ---------------------------
FROM node:20-slim AS runner
RUN npm install -g pnpm

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080

# Copy everything from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/prisma ./prisma

# Start the app
CMD ["node", "dist/main.js"]