# --- Build the Angular bundle ---------------------------------------------
FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
# `prebuild` runs generate-env; the baked values are only fallbacks since the
# runtime config.js (written on container start) overrides them.
RUN npm run build

# --- Serve via nginx with runtime env injection ---------------------------
FROM nginx:alpine

# Listen port defaults to 80, overridable via the PORT env var (e.g. from
# compose). nginx's entrypoint renders templates/*.template with envsubst into
# conf.d/ at startup, substituting ${PORT}.
ENV PORT=80
COPY nginx.conf /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist/japan-trip-planner/browser /usr/share/nginx/html

# Writes /usr/share/nginx/html/config.js from env vars before nginx starts.
# nginx's official entrypoint runs executable *.sh files in this directory.
COPY docker-entrypoint.sh /docker-entrypoint.d/40-trip-planner-config.sh
RUN chmod +x /docker-entrypoint.d/40-trip-planner-config.sh

EXPOSE 80
