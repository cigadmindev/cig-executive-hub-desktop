import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  plugins: [react()],
  base: '/',
  resolve: {
    // Every Firebase write goes through src/readOnly, which refuses while an
    // admin is viewing the Hub as someone else. Exact matches only, so the
    // wrappers themselves can still reach the real packages (@firebase/...).
    alias: [
      { find: /^firebase\/firestore$/, replacement: here('./src/readOnly/firestore.js') },
      { find: /^firebase\/functions$/, replacement: here('./src/readOnly/functions.js') },
      { find: /^firebase\/storage$/, replacement: here('./src/readOnly/storage.js') },
    ],
  },
  server: {
    port: 5173,
  },
});
