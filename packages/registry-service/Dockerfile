FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY packages/core/package.json packages/core/package.json
COPY packages/registry-service/package.json packages/registry-service/package.json
RUN pnpm install --frozen-lockfile
COPY packages/core packages/core
COPY packages/registry-service packages/registry-service
RUN pnpm --filter @harness-kit/core build && pnpm --filter @harness-kit/registry-service build

FROM node:22-alpine
RUN corepack enable
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages/core ./packages/core
COPY --from=build /app/packages/registry-service ./packages/registry-service
WORKDIR /app/packages/registry-service
ENV NODE_ENV=production
EXPOSE 4810
CMD ["node", "dist/server.js"]
