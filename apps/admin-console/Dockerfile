FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/admin-console/package.json apps/admin-console/package.json
RUN pnpm install --frozen-lockfile --filter @harness-kit/admin-console...
COPY apps/admin-console apps/admin-console
RUN pnpm --filter @harness-kit/admin-console build

FROM nginx:1.29-alpine
COPY apps/admin-console/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/admin-console/dist /usr/share/nginx/html
EXPOSE 4174
