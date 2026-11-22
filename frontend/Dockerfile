# syntax=docker/dockerfile:1
FROM node:22-slim AS build
WORKDIR /web
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# The browser calls /api/v1 on this site; Next forwards it to BACKEND_URL (read when the server starts
# for rewrites compiled at build time, so pass the real value as a build arg)
ARG BACKEND_URL=http://backend:8000
ENV BACKEND_URL=$BACKEND_URL NEXT_OUTPUT=standalone NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:22-slim
WORKDIR /web
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
RUN useradd --system --uid 10001 app
COPY --from=build --chown=app /web/.next/standalone ./
COPY --from=build --chown=app /web/.next/static ./.next/static
COPY --from=build --chown=app /web/public ./public
USER app
EXPOSE 3000
CMD ["node", "server.js"]
