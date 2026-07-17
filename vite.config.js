import { defineConfig, loadEnv } from 'vite';
import solidPlugin from 'vite-plugin-solid';
import backendExtractorPlugin from './vite-plugin-backend-extractor.js';

export default defineConfig(({ mode }) => {
  // Expose .env to process.env for the extractor
  Object.assign(process.env, loadEnv(mode, process.cwd(), ''));

  return {
    plugins: [backendExtractorPlugin(), solidPlugin()],
    server: {
      watch: {
        usePolling: true,
        interval: 100,
      },
    },
    // @sqlite.org/sqlite-wasm ships its own WASM/worker glue that Vite's
    // dependency pre-bundler mishandles — exclude it per the package's docs.
    optimizeDeps: {
      exclude: ['@sqlite.org/sqlite-wasm'],
    },
  };
});
