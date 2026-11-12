# Hugging Face Space for the Meridian live-data server.
#
# The Space holds only this file and README.md: it downloads the code from
# GitHub at build time. To deploy a new version, push to GitHub and use
# "Factory rebuild" in the Space's settings.
FROM node:24-slim

WORKDIR /app

# latest code from GitHub (re-downloaded whenever the branch changes)
ADD https://codeload.github.com/tbekt/Meridian/tar.gz/refs/heads/main /tmp/meridian.tar.gz
RUN tar -xzf /tmp/meridian.tar.gz --strip-components=1 -C /app && rm /tmp/meridian.tar.gz

RUN npm ci && npm run build

# Spaces run as user 1000 ("node" in this image); caches go to /app/.cache
RUN mkdir -p .cache && chown -R node:node /app
USER node

ENV NODE_ENV=production \
    PORT=7860
EXPOSE 7860

CMD ["node", "server/index.ts"]
