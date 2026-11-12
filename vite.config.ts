import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { handleApi, shutdown, warmUp } from './server/api.ts';

/** Serves /api/events (live GDELT feed) from the dev and preview servers. */
const liveFeed = (): Plugin => ({
  name: 'live-feed',
  configureServer(server) {
    warmUp();
    // stop this instance's feeds when Vite restarts the server (config or server file changed)
    server.httpServer?.once('close', shutdown);
    server.middlewares.use((req, res, next) => void handleApi(req, res, next));
  },
  configurePreviewServer(server) {
    warmUp();
    server.httpServer?.once('close', shutdown);
    server.middlewares.use((req, res, next) => void handleApi(req, res, next));
  },
});

export default defineConfig({
  plugins: [react(), liveFeed()],
  server: { port: 5180 },
  // MapLibre 6 resolves its web worker relative to its own module URL;
  // pre-bundling moves the module and breaks that path.
  optimizeDeps: { exclude: ['maplibre-gl'] },
});
