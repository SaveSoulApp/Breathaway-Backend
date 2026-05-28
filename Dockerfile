# ---------------------------
# 1. Base Stage
# ---------------------------
FROM node:20-slim AS base
# Suppress npm and pnpm update notices
ENV npm_config_update_notifier=false
# Prisma requires OpenSSL to run its query engine
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
# Pin pnpm version explicitly to avoid corepack update warnings
RUN npm install -g pnpm@9

# ---------------------------
# 2. Builder Stage
# ---------------------------
FROM base AS builder
WORKDIR /app

# Leverage layer caching by copying manifests first
COPY package.json pnpm-lock.yaml ./
COPY prisma ./prisma

# Install all dependencies required for the build
RUN pnpm install --frozen-lockfile

# Generate Prisma Client (writes binaries to node_modules/.prisma)
RUN pnpm dlx prisma generate

# Copy source code and compile
COPY tsconfig*.json nest-cli.json ./
COPY src ./src
RUN pnpm build

# The Optimization: Eject devDependencies.
# Leaves only production dependencies and the generated Prisma Client.
RUN pnpm prune --prod

# ---------------------------
# 3. Runner Stage
# ---------------------------
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080

# Switch to the non-root user
USER node

# Copy only the compiled code and pruned node_modules securely
COPY --chown=node:node --from=builder /app/dist ./dist
COPY --chown=node:node --from=builder /app/node_modules ./node_modules
COPY --chown=node:node package.json ./

EXPOSE 8080

# Start the NestJS application
CMD ["node", "dist/main.js"]