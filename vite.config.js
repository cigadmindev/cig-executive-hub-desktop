import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Electron loads from file:// and needs relative paths; the web needs
  // absolute ones, or a reload on a deep link asks for the app's code inside
  // that address and gets the page back instead. ELECTRON=1 is set by the
  // desktop build.
  base: process.env.ELECTRON ? './' : '/',
  server: {
    port: 5173,
  },
});
