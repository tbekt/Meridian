# Meridian live-data server (and the built app), for Hugging Face Spaces or any
# Docker host. The website itself can also live on Vercel: vercel.json forwards
# /api/* to this server.
#
#   docker build -t meridian .
#   docker run -p 7860:7860 meridian
FROM node:24-slim

WORKDIR /app

# dependencies first, so code changes don't reinstall them
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# Hugging Face runs containers as user 1000 ("node" in this image); the server
# writes its caches (GeoNames, translation models, posts) to /app/.cache
RUN mkdir -p .cache && chown -R node:node /app
USER node

ENV NODE_ENV=production \
    PORT=7860
EXPOSE 7860

CMD ["node", "server/index.ts"]
